/**
 * hw112d-proof-sweep.test.js — HW-112D (c)
 *
 * After a sync, the real supabase-js client lists the account's proof folder,
 * asks the server which sessions exist (with a confirmed local session as
 * proof the read sees this account's rows), and removes only the old photo no
 * session has. Recent photos and photos of existing sessions stay.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, TODAY, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000d0c00';
const HERE = 'eeeeeeee-eeee-4eee-8eee-000000000001';      // a session on this device and the server
const ELSEWHERE = 'eeeeeeee-eeee-4eee-8eee-000000000002'; // another device's session, on the server
const ORPHAN = 'eeeeeeee-eeee-4eee-8eee-000000000003';    // deleted; its photo stayed
const RECENT = 'eeeeeeee-eeee-4eee-8eee-000000000004';    // no row yet, uploaded 2 days ago
const daysAgo = days => new Date(Date.now() - days * 86_400_000).toISOString();
const COMPLETED_AT = new Date().toISOString();
const session = {
  id: HERE, taskId: INSTANT_TASK.id, taskName: INSTANT_TASK.name, date: TODAY,
  completedAt: COMPLETED_AT, result: 'instant', impactType: 'task', finalXP: 5,
};
const TASK_ROW = {
  id: INSTANT_TASK.id, user_id: USER_ID, name: INSTANT_TASK.name, category: INSTANT_TASK.category,
  impact_type: INSTANT_TASK.impactType, task_nature: INSTANT_TASK.taskNature, value: INSTANT_TASK.value,
  difficulty: INSTANT_TASK.difficulty, resistance: INSTANT_TASK.resistance, emoji: INSTANT_TASK.emoji,
  daily_xp_cap: INSTANT_TASK.dailyXpCap, cooldown_minutes: 0, min_effective_minutes: 0,
  is_default: true, value_confidence: 100, created_at: TODAY,
};
const SESSION_ROW = {
  id: HERE, user_id: USER_ID, task_id: INSTANT_TASK.id, task_name: INSTANT_TASK.name, date: TODAY,
  completed_at: COMPLETED_AT, result: 'instant', impact_type: 'task', final_xp: 5,
};

test('the weekly sweep removes only the old photo no session has', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reads = [];
  const removals = [];
  const onServer = new Set([HERE, ELSEWHERE]);

  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.route(`${SUPABASE_URL}/rest/**`, route => {
    const request = route.request();
    const url = new URL(request.url());
    const ids = url.searchParams.get('id');
    if (request.method() === 'GET' && url.pathname === '/rest/v1/sessions' && ids?.startsWith('in.(')) {
      const asked = ids.slice(4, -1).split(',').map(id => id.replace(/"/g, ''));
      reads.push({ userId: url.searchParams.get('user_id'), select: url.searchParams.get('select'), asked });
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(asked.filter(id => onServer.has(id)).map(id => ({ id }))),
      });
    }
    // Everything else of the sync: a healthy account with the one session.
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    // The account's profile (without it the sync would leave this device with no user).
    if (request.method() === 'GET' && url.pathname === '/rest/v1/profiles') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user_id: USER_ID, name: GUEST_USER.name, total_xp: 0, new_day_hour: 0, created_at: TODAY }),
      });
    }
    if (request.method() === 'GET' && (request.headers().accept ?? '').includes('vnd.pgrst.object')) {
      return route.fulfill({
        status: 406, contentType: 'application/json',
        body: '{"code":"PGRST116","details":"The result contains 0 rows","hint":null,"message":"JSON object requested, multiple (or no) rows returned"}',
      });
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/tasks') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TASK_ROW]) });
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/sessions') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SESSION_ROW]) });
    }
    return route.fulfill({ status: request.method() === 'GET' ? 200 : 201, contentType: 'application/json', body: '[]' });
  });
  await page.route(`${SUPABASE_URL}/storage/**`, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/storage/v1/object/list/proofs') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { name: `${HERE}.jpg`, id: 'o1', created_at: daysAgo(90) },
          { name: `${ELSEWHERE}.jpg`, id: 'o2', created_at: daysAgo(90) },
          { name: `${ORPHAN}.jpg`, id: 'o3', created_at: daysAgo(90) },
          { name: `${RECENT}.jpg`, id: 'o4', created_at: daysAgo(2) },
        ]),
      });
    }
    if (request.method() === 'DELETE') {
      removals.push(request.postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      status: 400, contentType: 'application/json',
      body: '{"statusCode":"404","error":"not_found","message":"Object not found"}',
    });
  });

  await seedStorage(page, [INSTANT_TASK], [session], { ...GUEST_USER, id: USER_ID });
  await page.addInitScript(([key, userId]) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'hw112d@example.test' },
    }));
    localStorage.setItem(`orbit_proofsync_backfilled:${encodeURIComponent(userId)}`, '1');
  }, [SESSION_KEY, USER_ID]);

  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

  await expect.poll(() => removals.length, { timeout: 10_000 }).toBe(1);
  expect(removals[0]).toEqual({ prefixes: [`${USER_ID}/${ORPHAN}.jpg`] });
  expect(reads).toEqual([{ userId: `eq.${USER_ID}`, select: 'id', asked: [HERE, ELSEWHERE, ORPHAN] }]);
  // Recorded once the removal's answer is back (the route sees the request first).
  await expect.poll(() => page.evaluate(id => Number(localStorage.getItem(`orbit_proofsweep_at:${id}`)) > 0, USER_ID))
    .toBe(true);

  // Not again within the week: tests/unit/proofSweep.test.js (a reload here would
  // test this stub account's boot, not the sweep).
});
