// TEST-201: an account's offline → reconnect sync in a real browser.
//
// The unit tests mock network.js and the client; nothing ran the real
// vendored supabase-js through the browser's own offline/online events. Here a
// small stateful fake of PostgREST (profiles, tasks, sessions, energy) answers
// the real client: the account boots online, the connection drops, a task is
// completed (queued, "N 筆待同步"; the app still tries to send it, and the
// server receives nothing), and the reconnect sends it.
//
// The fake takes its column lists from pwa/db/*.sql: a write with a column the
// database does not have, or an on_conflict on one, gets PostgREST's error.
// It does not check types, NOT NULL, foreign keys or RLS.

import { readFileSync, readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { GUEST_USER, TODAY } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000e2e01';

const TABLES = ['profiles', 'tasks', 'sessions', 'energy'];
const PRIMARY_KEY = { profiles: 'user_id', tasks: 'id', sessions: 'id', energy: 'user_id' };

/** The four tables' columns: CREATE TABLE in pwa/db, plus each ADD COLUMN after it. */
function schemaColumns() {
  const dir = new URL('../../pwa/db/', import.meta.url);
  const columns = Object.fromEntries(TABLES.map(table => [table, new Set()]));
  const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = readFileSync(new URL(name, dir), 'utf8').replace(/--.*$/gm, '');
    for (const [, table, body] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      if (!columns[table]) continue;
      for (const [, column] of body.matchAll(/^\s*(\w+)\s+(?:uuid|text|int|integer|numeric|boolean|date|timestamptz|smallint|char)\b/gim)) {
        columns[table].add(column);
      }
    }
    for (const [, table, body] of sql.matchAll(/ALTER TABLE (?:IF EXISTS )?(?:public\.)?(\w+)([^;]*);/gi)) {
      if (!columns[table]) continue;
      for (const [, column] of body.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi)) columns[table].add(column);
    }
  }
  return columns;
}
const SCHEMA = schemaColumns();
const TASK_ID = '00000000-0000-4000-8000-00000000a001';

const USER = { ...GUEST_USER, id: USER_ID, name: 'Sync Tester', newDayHour: 0 };
const TASK = {
  id: TASK_ID, name: '喝水', category: 'instant', impactType: 'task', taskNature: 'maintenance',
  value: 'B', difficulty: 0.4, resistance: 1, emoji: '💧', dailyXpCap: 100, cooldownMinutes: 0,
  minEffectiveMinutes: 0, isDefault: false, createdAt: TODAY,
};
const ENERGY = { currentEnergy: 90, maxEnergy: 100, lastResetDate: TODAY };

/** The account's rows as the server holds them before the test. */
function serverRows() {
  return {
    profiles: [{
      user_id: USER_ID, name: USER.name, total_xp: 0, streak_days: 0, last_streak_date: null,
      last_weekly_bonus_date: null, morning_state: 'normal', mode: 'normal', is_public: false,
      display_name: null, title_template: 'rpg', custom_title: null, new_day_hour: 0,
      is_pro: false, pro_expires_at: null, avatar_url: null, created_at: '2026-01-01T00:00:00Z',
    }],
    tasks: [{
      id: TASK_ID, user_id: USER_ID, name: TASK.name, category: 'instant', impact_type: 'task',
      task_nature: 'maintenance', value: 'B', difficulty: 0.4, resistance: 1, emoji: '💧',
      daily_xp_cap: 100, cooldown_minutes: 0, min_effective_minutes: 0, is_default: false,
      reason: null, created_at: `${TODAY}T00:00:00Z`,
    }],
    sessions: [],
    energy: [{ user_id: USER_ID, current_energy: 90, max_energy: 100, last_reset_date: TODAY }],
  };
}

/** A fake PostgREST over in-memory tables, enough for the app's queries. */
async function fakeSupabase(page) {
  const db = serverRows();
  const log = [];        // requests the server received
  const attempts = [];   // requests sent while offline (they fail)
  const net = { offline: false, fail: false, failSessionWrites: false, sessionWriteDelayMs: 0 };

  const matches = (row, params) => {
    for (const [key, raw] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
      const [op, ...rest] = raw.split('.');
      const value = rest.join('.');
      if (op === 'eq' && String(row[key]) !== value) return false;
      if (op === 'in' && !value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/"/g, '')).includes(String(row[key]))) return false;
      if (op === 'is' && value === 'null' && row[key] !== null && row[key] !== undefined) return false;
    }
    return true;
  };
  const error = (route, status, code, message) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ code, message: `e2e: ${message}` }),
  });

  await page.route(`${SUPABASE_URL}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const line = `${request.method()} ${url.pathname}${url.search}`;
    if (net.offline) {
      attempts.push(line);
      return route.abort('internetdisconnected');
    }
    log.push(line);
    // PostgREST retries only 503 and 520.
    if (net.fail && url.pathname.startsWith('/rest/')) return error(route, 500, 'XX000', 'server down');
    if (url.pathname === '/rest/v1/sessions' && request.method() !== 'GET') {
      if (net.failSessionWrites) return error(route, 500, 'XX000', 'sessions down');
      // A slow upload: it lands after the rest of the reconnect sync.
      if (net.sessionWriteDelayMs) await new Promise(resolve => setTimeout(resolve, net.sessionWriteDelayMs));
    }

    const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (!rest || !(rest[1] in db)) return error(route, 404, 'PGRST205', 'not faked');
    const name = rest[1];
    const table = db[name];
    const params = [...url.searchParams.entries()];
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');
    const prefer = request.headers().prefer || '';
    const reply = (rows, status = 200) => {
      if (single) {
        if (rows.length !== 1) return error(route, 406, 'PGRST116', 'not one row');
        return route.fulfill({ status, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify(rows[0]) });
      }
      const body = prefer.includes('return=representation') || request.method() === 'GET' ? JSON.stringify(rows) : '';
      return route.fulfill({ status: body ? status : 204, contentType: 'application/json', body });
    };
    const unknownColumn = rows => rows.flatMap(row => Object.keys(row)).find(column => !SCHEMA[name].has(column));

    switch (request.method()) {
      case 'GET':
      case 'HEAD':
        return reply(table.filter(row => matches(row, params)));
      case 'POST': {
        const body = request.postDataJSON();
        const rows = Array.isArray(body) ? body : [body];
        const missing = unknownColumn(rows);
        if (missing) return error(route, 400, 'PGRST204', `no '${missing}' column in '${name}'`);
        const conflict = url.searchParams.get('on_conflict') ?? PRIMARY_KEY[name];
        if (!SCHEMA[name].has(conflict)) return error(route, 400, '42703', `no '${conflict}' column in '${name}'`);
        const upsert = prefer.includes('resolution=merge-duplicates');
        const written = [];
        for (const row of rows) {
          const index = table.findIndex(existing => existing[conflict] === row[conflict]);
          if (index >= 0 && !upsert) return error(route, 409, '23505', 'duplicate key');
          if (index >= 0) table[index] = { ...table[index], ...row };
          else table.push({ ...row });
          written.push(index >= 0 ? table[index] : table[table.length - 1]);
        }
        return reply(written, 201);
      }
      case 'PATCH': {
        const patch = request.postDataJSON();
        const missing = unknownColumn([patch]);
        if (missing) return error(route, 400, 'PGRST204', `no '${missing}' column in '${name}'`);
        const rows = table.filter(row => matches(row, params));
        rows.forEach(row => Object.assign(row, patch));
        return reply(rows);
      }
      case 'DELETE': {
        const rows = table.filter(row => matches(row, params));
        rows.forEach(row => table.splice(table.indexOf(row), 1));
        return reply(rows);
      }
      default:
        return route.fulfill({ status: 405, body: '' });
    }
  });
  return { db, log, attempts, net };
}

async function seedAccount(page) {
  await page.addInitScript(({ key, user, task, energy }) => {
    if (localStorage.getItem('yoyo_user')) return;
    localStorage.setItem('yoyo_user', JSON.stringify(user));
    localStorage.setItem('yoyo_tasks', JSON.stringify([task]));
    localStorage.setItem('yoyo_sessions', '[]');
    localStorage.setItem('yoyo_energy', JSON.stringify(energy));
    localStorage.setItem('yoyo_tourDone', '1');
    localStorage.setItem(key, JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: 'test201@example.test' },
    }));
  }, { key: SESSION_KEY, user: USER, task: TASK, energy: ENERGY });
}

const syncBanner = page => page.locator('#sync-banner');
/** The app's own count of writes waiting to sync (the banner's "N 筆待同步"). */
const localPending = page => page.evaluate(
  async ownerId => (await import('/js/storage.js')).getPendingSyncSummary(ownerId).total,
  USER_ID,
);

async function bootOnline(page, server) {
  await seedAccount(page);
  await page.goto('/');
  await expect(page.locator('#main-app')).toBeVisible();
  // The cached-user boot's remote load (all four tables) has run, quietly.
  await expect.poll(() => server.log.filter(line => line.startsWith('GET /rest/v1/energy')).length).toBeGreaterThan(0);
  await expect(syncBanner(page)).toHaveClass('hidden');
}

async function goOffline(page, context, server) {
  server.net.offline = true;
  await context.setOffline(true);
  await expect(syncBanner(page)).toHaveClass('sync-offline');
}

async function goOnline(context, server) {
  server.net.offline = false;
  await context.setOffline(false);
}

/** Completes the task from Home (adds it to the plan, taps the plan card). */
async function completeTask(page) {
  await page.locator(`.task-card[data-task-id="${TASK_ID}"]`).click();
  await page.locator(`#plan-list .plan-card[data-task-id="${TASK_ID}"]`).click();
  await expect(page.locator(`#plan-list .plan-card[data-task-id="${TASK_ID}"] .plan-count-badge`)).toHaveText('1');
}

const localState = page => page.evaluate(() => ({
  sessions: JSON.parse(localStorage.getItem('yoyo_sessions') || '[]'),
  user: JSON.parse(localStorage.getItem('yoyo_user')),
  energy: JSON.parse(localStorage.getItem('yoyo_energy')),
}));

const sessionWrites = server => server.log.filter(line => line.startsWith('POST /rest/v1/sessions'));

/** '✓ 已更新', then gone after its 2 s (and whatever is left of the sync). */
async function expectSynced(page) {
  await expect(syncBanner(page)).toHaveText('✓ 已更新', { timeout: 10_000 });
  await expect(syncBanner(page)).toHaveClass('hidden', { timeout: 10_000 });
}

test.describe('TEST-201 an account offline, then back online', () => {
  test('a task completed offline is queued (the server receives nothing), and the reconnect sends it once', async ({ page, context }) => {
    const server = await fakeSupabase(page);
    await bootOnline(page, server);

    await goOffline(page, context, server);
    await expect(syncBanner(page)).toHaveText('📴 離線中 · 變更先存本機，連線後自動同步');
    server.log.length = 0;
    await completeTask(page);

    // The session, the profile (XP) and Energy wait here.
    await expect(syncBanner(page)).toHaveText('📴 離線中 · 3 筆待同步，連線後自動同步');
    expect(await localPending(page)).toBe(3);
    // The app tried to send them (storage writes do not look at the
    // connection); none got through.
    await expect.poll(() => server.attempts.some(line => line.startsWith('POST /rest/v1/sessions'))).toBe(true);
    expect(server.log).toEqual([]);
    expect(server.db.sessions).toEqual([]);

    // The session's upload is slow: "synced" only once it has landed.
    server.net.sessionWriteDelayMs = 1500;
    await goOnline(context, server);
    await expectSynced(page);
    expect(sessionWrites(server)).toHaveLength(1);                     // sent once, not twice
    expect(server.db.sessions).toHaveLength(1);
    expect(await localPending(page)).toBe(0);

    const local = await localState(page);
    expect(local.sessions).toHaveLength(1);
    expect(server.db.sessions[0]).toMatchObject({
      id: local.sessions[0].id, user_id: USER_ID, task_id: TASK_ID, result: 'instant',
      final_xp: local.sessions[0].finalXP,
    });
    expect(server.db.profiles[0].total_xp).toBe(local.user.totalXP);
    expect(local.user.totalXP).toBeGreaterThan(0);
    expect(server.db.energy[0].current_energy).toBe(local.energy.currentEnergy);
  });

  test('reopened offline (service worker): the queue is still there; a failed reconnect keeps it; the next one sends it once', async ({ page, context }) => {
    test.slow();
    const server = await fakeSupabase(page);
    await bootOnline(page, server);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await goOffline(page, context, server);
    await completeTask(page);
    await expect(syncBanner(page)).toHaveText('📴 離線中 · 3 筆待同步，連線後自動同步');

    await page.reload();                                             // served by the service worker
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(syncBanner(page)).toHaveText('📴 離線中 · 3 筆待同步，連線後自動同步');
    expect((await localState(page)).sessions).toHaveLength(1);

    server.net.fail = true;                                          // the server is down
    await goOnline(context, server);
    await expect(syncBanner(page)).toHaveText('⚠️ 同步暫停，將於下次連線重試 · 3 筆待同步', { timeout: 10_000 });
    expect(server.db.sessions).toEqual([]);

    server.net.fail = false;
    await goOffline(page, context, server);
    server.log.length = 0;
    await goOnline(context, server);
    await expectSynced(page);
    expect(sessionWrites(server)).toHaveLength(1);
    expect(server.db.sessions).toHaveLength(1);
    expect(await localPending(page)).toBe(0);
    expect(server.db.sessions[0]).toMatchObject({ user_id: USER_ID, task_id: TASK_ID });
  });

  test('a reconnect whose load succeeds but whose session upload fails says what is left ("1 筆待同步")', async ({ page, context }) => {
    test.slow();
    const server = await fakeSupabase(page);
    await bootOnline(page, server);
    await goOffline(page, context, server);
    await completeTask(page);
    await expect(syncBanner(page)).toHaveText('📴 離線中 · 3 筆待同步，連線後自動同步');

    server.net.failSessionWrites = true;
    await goOnline(context, server);
    // The profile and Energy went; the session did not.
    await expect(syncBanner(page)).toHaveText('⚠️ 同步暫停，將於下次連線重試 · 1 筆待同步', { timeout: 10_000 });
    expect(server.db.profiles[0].total_xp).toBeGreaterThan(0);
    expect(server.db.sessions).toEqual([]);
    expect(await localPending(page)).toBe(1);

    server.net.failSessionWrites = false;
    await goOffline(page, context, server);
    server.log.length = 0;
    await goOnline(context, server);
    await expectSynced(page);
    expect(sessionWrites(server)).toHaveLength(1);
    expect(server.db.sessions).toHaveLength(1);
    expect(await localPending(page)).toBe(0);
  });
});
