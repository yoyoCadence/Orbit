// @vitest-environment jsdom
/**
 * storage-mapping.test.js — storage.js snake_case ↔ camelCase 映射的
 * characterization tests（handoff Phase 16a）。
 *
 * 目的：在映射表化（Phase 16b）之前，把「現有行為」逐欄位鎖住——
 * 特別是 `||` 與 `??` 的預設值語義差異（例如 focus_sound_enabled:false
 * 必須保持 false、new_day_hour:0 必須保持 0、last_streak_date:null 讀成 ''
 * 但寫回時 '' 變 null）。任何映射重構後這些測試必須原樣通過。
 *
 * 環境：jsdom（需要 localStorage）；supabase 全 mock。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const tableData = vi.hoisted(() => ({}));           // table → rows/row for reads
const captured  = vi.hoisted(() => ({ upserts: {}, inserts: {}, updates: {}, deletes: {}, updateError: null, updateRows: 1, insertErrors: [] }));
// Like Postgres, a uuid column refuses any other id (BUG-150).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notUuid = id => ({ code: '22P02', message: `invalid input syntax for type uuid: "${id}"` });

vi.mock('../../pwa/js/supabase.js', () => {
  function chain(table) {
    const self = {
      select: () => self,
      eq:     () => self,
      // delete().in('id', ids).eq('user_id', …)
      in: (column, values) => {
        (captured.deletes[table] ??= []).push(values);
        const bad = table === 'tasks' ? values.find(id => !UUID.test(id)) : null;
        const result = { error: bad ? notUuid(bad) : null };
        const done = Promise.resolve(result);
        done.eq = () => Promise.resolve(result);
        return done;
      },
      delete: () => self,
      update: (payload) => {
        (captured.updates[table] ??= []).push(payload);
        const result = () => ({
          error: captured.updateError,
          data: captured.updateError ? null : Array.from({ length: captured.updateRows }, () => ({ user_id: 'uid-1' })),
        });
        return {
          eq: () => {
            const done = Promise.resolve(result());
            done.select = () => Promise.resolve(result());
            return done;
          },
        };
      },
      single: () => Promise.resolve({ data: tableData[table] ?? null, error: null }),
      order:  () => Promise.resolve({ data: tableData[table] ?? null, error: null }),
      upsert: (payload, opts) => {
        (captured.upserts[table] ??= []).push({ payload, opts });
        const bad = table === 'tasks' ? [payload].flat().find(row => row?.id && !UUID.test(row.id)) : null;
        return Promise.resolve({ error: bad ? notUuid(bad.id) : null });
      },
      insert: (payload) => {
        (captured.inserts[table] ??= []).push(payload);
        const taskId = table === 'sessions' ? payload?.task_id : null;
        if (taskId && !UUID.test(taskId)) return Promise.resolve({ error: notUuid(taskId) });
        return Promise.resolve({ error: captured.insertErrors.shift() ?? null });
      },
    };
    return self;
  }
  return {
    supabase: {
      from: (table) => chain(table),
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'uid-1' } } } }),
      },
      storage: {
        from: () => ({
          createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'signed-url' }, error: null }),
        }),
      },
    },
  };
});

import { storage, db } from '../../pwa/js/storage.js';

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(tableData)) delete tableData[k];
  captured.upserts = {};
  captured.inserts = {};
  captured.updates = {};
  captured.updateError = null;
  captured.updateRows = 1;
  captured.insertErrors = [];
  captured.deletes = {};
});

// ─── 讀取方向：loadFromRemote → localStorage cache ───────────────────────────

describe('loadFromRemote — profile row → user object', () => {
  it('全欄位 row 逐欄映射（含 https avatar 直接採用不簽名）', async () => {
    tableData.profiles = {
      user_id: 'uid-1', name: '阿橘', avatar_url: 'https://cdn.example.com/a.jpg',
      total_xp: 1234, streak_days: 7, last_streak_date: '2026-07-06',
      last_weekly_bonus_date: '2026-07-06', morning_state: 'good', mode: 'advanced',
      is_public: true, display_name: 'Night Owl',
      title_template: 'kny_dynamic', custom_title: '自訂稱號',
      new_day_hour: 3, created_at: '2026-01-01', is_pro: true,
      pro_expires_at: '2026-12-31T00:00:00Z', trial_started_at: '2026-06-01T00:00:00Z',
      streak_shield_count: 1, streak_shield_reset_month: '2026-07',
      streak_unlock_used: true, focus_default_minutes: 25, focus_sound_enabled: false,
    };
    await db.loadFromRemote('uid-1');
    expect(storage.getUser()).toEqual({
      id: 'uid-1', name: '阿橘', avatar: 'https://cdn.example.com/a.jpg',
      avatarPath: 'https://cdn.example.com/a.jpg',
      totalXP: 1234, streakDays: 7, lastStreakDate: '2026-07-06',
      lastWeeklyBonusDate: '2026-07-06', morningState: 'good', mode: 'advanced',
      isPublic: true, displayName: 'Night Owl',
      titleTemplate: 'kny_dynamic', customTitle: '自訂稱號',
      newDayHour: 3, createdAt: '2026-01-01', isPro: true,
      proExpiresAt: '2026-12-31T00:00:00Z', trialStartedAt: '2026-06-01T00:00:00Z',
      streakShieldCount: 1, streakShieldResetMonth: '2026-07',
      streakUnlockUsed: true, focusDefaultMinutes: 25, focusSoundEnabled: false,
    });
  });

  it('空值 row 的預設值語義（|| 與 ?? 逐欄鎖定；0/false 不得被預設值吃掉）', async () => {
    tableData.profiles = {
      user_id: 'uid-1', name: '極簡', avatar_url: null,
      total_xp: 0, streak_days: 0, last_streak_date: null,
      last_weekly_bonus_date: null, morning_state: null, mode: null,
      is_public: null, display_name: null, title_template: null, custom_title: null,
      new_day_hour: 0, created_at: '2026-01-01', is_pro: null,
      pro_expires_at: null, trial_started_at: null,
      streak_shield_count: 0, streak_shield_reset_month: null,
      streak_unlock_used: null, focus_default_minutes: null, focus_sound_enabled: false,
    };
    await db.loadFromRemote('uid-1');
    expect(storage.getUser()).toEqual({
      id: 'uid-1', name: '極簡', avatar: null, avatarPath: null,
      totalXP: 0, streakDays: 0,
      lastStreakDate: '',            // null → ''（||）
      lastWeeklyBonusDate: '',       // null → ''（||）
      morningState: null,            // 直通
      mode: null,                    // 直通
      isPublic: false,               // null → false（??）
      displayName: null,             // null → null（??）
      titleTemplate: 'rpg',          // null → 'rpg'（||）
      customTitle: '',               // null → ''（||）
      newDayHour: 0,                 // ?? — 0 必須保留
      createdAt: '2026-01-01',
      isPro: false,                  // null → false（??）
      proExpiresAt: null, trialStartedAt: null,
      streakShieldCount: 0,          // ?? — 0 必須保留
      streakShieldResetMonth: '',    // null → ''（||）
      streakUnlockUsed: false,       // null → false（??）
      focusDefaultMinutes: null,
      focusSoundEnabled: false,      // ?? — false 必須保留
    });
  });
});

describe('loadFromRemote — leaderboard opt-out left by v1.41.17 or earlier (PRO-014E2)', () => {
  const PENDING_KEY = 'yoyo_profileSyncPending:uid-1';
  const OPT_OUT_KEY = 'yoyo_leaderboardOptOutPending:uid-1';
  const seedPending = snapshot => localStorage.setItem(PENDING_KEY, JSON.stringify(snapshot));
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it('an unmarked snapshot that turned the leaderboard off is honoured before the pull', async () => {
    seedPending({ ownerId: 'uid-1', value: { id: 'uid-1', name: 'A', isPublic: false } });
    tableData.profiles = { user_id: 'uid-1', name: 'A', is_public: false };
    await db.loadFromRemote('uid-1');
    expect(captured.upserts.profiles[0].payload).not.toHaveProperty('is_public');
    expect(captured.updates.profiles).toEqual([{ is_public: false }]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull();
  });

  it('survives a saveUser at boot that replaces and pushes the snapshot first', async () => {
    // processYesterdayStreak() saves the user before the remote load starts.
    seedPending({ ownerId: 'uid-1', value: { id: 'uid-1', name: 'A', isPublic: false } });
    storage.saveUser({ id: 'uid-1', name: 'A', isPublic: false, streakDays: 3 });
    await flush(); // its push lands and clears the (now marked) snapshot
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(OPT_OUT_KEY))).toEqual({ ownerId: 'uid-1' });

    await db.loadFromRemote('uid-1');
    expect(captured.updates.profiles).toEqual([{ is_public: false }]);
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull();
  });

  it('a choice made in settings supersedes the kept opt-out', async () => {
    localStorage.setItem(OPT_OUT_KEY, JSON.stringify({ ownerId: 'uid-1' }));
    storage.clearLeaderboardOptOutPending('uid-1');
    await db.loadFromRemote('uid-1');
    expect(captured.updates.profiles).toBeUndefined();
  });

  it('keeps the opt-out and stops the pull when no row was updated', async () => {
    localStorage.setItem(OPT_OUT_KEY, JSON.stringify({ ownerId: 'uid-1' }));
    captured.updateRows = 0;
    await expect(db.loadFromRemote('uid-1')).rejects.toThrow('updated no profile row');
    expect(localStorage.getItem(OPT_OUT_KEY)).not.toBeNull();
  });

  it('ignores another account\'s kept opt-out', async () => {
    localStorage.setItem(OPT_OUT_KEY, JSON.stringify({ ownerId: 'someone-else' }));
    await db.loadFromRemote('uid-1');
    expect(captured.updates.profiles).toBeUndefined();
  });

  it('an unmarked snapshot never turns the leaderboard on', async () => {
    seedPending({ ownerId: 'uid-1', value: { id: 'uid-1', name: 'A', isPublic: true } });
    await db.loadFromRemote('uid-1');
    expect(captured.updates.profiles).toBeUndefined();
  });

  it('a snapshot of this version carries nothing for the leaderboard', async () => {
    seedPending({ ownerId: 'uid-1', value: { id: 'uid-1', name: 'A', isPublic: false }, fields: 'pro014e2' });
    storage.saveUser({ id: 'uid-1', name: 'A', isPublic: false });
    await flush();
    await db.loadFromRemote('uid-1');
    expect(captured.updates.profiles).toBeUndefined();
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull();
  });

  it('keeps the opt-out and stops the pull when it cannot be written', async () => {
    seedPending({ ownerId: 'uid-1', value: { id: 'uid-1', name: 'A', isPublic: false } });
    captured.updateError = { message: 'offline' };
    await expect(db.loadFromRemote('uid-1')).rejects.toEqual({ message: 'offline' });
    expect(JSON.parse(localStorage.getItem(OPT_OUT_KEY))).toEqual({ ownerId: 'uid-1' });
  });

  it('marks the snapshots it writes', () => {
    storage.saveUser({ id: 'uid-1', name: 'A', isPublic: false });
    // Read before the push settles (it clears the snapshot once it lands).
    expect(JSON.parse(localStorage.getItem(PENDING_KEY)).fields).toBe('pro014e2');
  });
});

describe('loadFromRemote — tasks / sessions / energy rows', () => {
  it('task row 逐欄映射（emoji/reason/success_criteria 的 || null；daily_xp_cap 讀取端直通）', async () => {
    tableData.tasks = [{
      id: 't-1', name: '深度學習', category: 'focus', impact_type: 'task',
      task_nature: 'growth', value: 'S', difficulty: 1, resistance: 1.4,
      emoji: null, daily_xp_cap: null, cooldown_minutes: 0,
      min_effective_minutes: 25, is_default: false, reason: null,
      success_criteria: '產出一份筆記', value_confidence: 95, created_at: '2026-01-02',
    }];
    await db.loadFromRemote('uid-1');
    expect(storage.getTasks()).toEqual([{
      id: 't-1', name: '深度學習', category: 'focus', impactType: 'task',
      taskNature: 'growth', value: 'S', difficulty: 1, resistance: 1.4,
      emoji: null,
      dailyXpCap: null,              // 讀取端無預設值——直通
      cooldownMinutes: 0, minEffectiveMinutes: 25, isDefault: false,
      reason: null, successCriteria: '產出一份筆記',
      valueConfidence: 95, createdAt: '2026-01-02',
    }]);
  });

  it('keeps the fields this device has no cloud column for, for the same owner (BUG-127)', async () => {
    const row = (id, value) => ({
      id, name: id, category: 'focus', impact_type: 'task', task_nature: 'growth', value,
      difficulty: 1, resistance: 1, emoji: null, daily_xp_cap: 300, cooldown_minutes: 0,
      min_effective_minutes: 25, is_default: false, reason: 'r', success_criteria: 'c',
      value_confidence: 100, created_at: '2026-03-01T01:02:03.456789+00:00',
    });
    tableData.tasks = [row('still-s', 'S'), row('now-a', 'A'), row('new', 'S')];
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-1', name: 'A' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify([
      { id: 'still-s', value: 'S', sSince: '2026-04-11', iconImg: 'data:image/jpeg;base64,AAAA' },
      // Changed back to A on another device: the S mark does not apply now.
      { id: 'now-a', value: 'S', sSince: '2026-04-11', iconImg: 'data:image/jpeg;base64,BBBB' },
    ]));
    await db.loadFromRemote('uid-1');
    const [stillS, nowA, added] = storage.getTasks();
    expect(stillS).toMatchObject({ id: 'still-s', value: 'S', sSince: '2026-04-11', iconImg: 'data:image/jpeg;base64,AAAA' });
    expect(nowA).toMatchObject({ id: 'now-a', value: 'A', iconImg: 'data:image/jpeg;base64,BBBB' });
    expect(nowA).not.toHaveProperty('sSince');
    expect(added).not.toHaveProperty('sSince');
    expect(added).not.toHaveProperty('iconImg');
  });

  it('uses this device\'s tasks as they are when the pull is written, not when it began (#286 review)', async () => {
    const row = id => ({
      id, name: id, category: 'focus', impact_type: 'task', task_nature: 'growth', value: 'S',
      difficulty: 1, resistance: 1, emoji: null, daily_xp_cap: 300, cooldown_minutes: 0,
      min_effective_minutes: 25, is_default: false, reason: 'r', success_criteria: 'c',
      value_confidence: 100, created_at: '2026-03-01T01:02:03.456789+00:00',
    });
    let queried = false;
    Object.defineProperty(tableData, 'tasks', {
      configurable: true, enumerable: true,
      get() { queried = true; return [row('icon'), row('made-s')]; },
    });
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-1', name: 'A' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify([
      { id: 'icon', value: 'S', iconImg: 'data:image/jpeg;base64,OLD' },
      { id: 'made-s', value: 'A' },
    ]));
    // While the pull runs (after the queries, before the write), the user
    // removes one task's icon and changes the other into S.
    const assertOwner = db._assertOwner;
    const spy = vi.spyOn(db, '_assertOwner').mockImplementation(async function (...args) {
      if (queried) {
        localStorage.setItem('yoyo_tasks', JSON.stringify([
          { id: 'icon', value: 'S', iconImg: null },
          { id: 'made-s', value: 'S', sSince: '2026-04-11' },
        ]));
      }
      return assertOwner.apply(this, args);
    });
    try {
      await db.loadFromRemote('uid-1');
    } finally {
      spy.mockRestore();
      delete tableData.tasks;
    }
    const [icon, madeS] = storage.getTasks();
    expect(icon).not.toHaveProperty('iconImg');
    expect(madeS).toMatchObject({ id: 'made-s', value: 'S', sSince: '2026-04-11' });
  });

  it('still pulls when the cached task list is not a list', async () => {
    tableData.tasks = [{
      id: 't', name: 'x', category: 'focus', impact_type: 'task', task_nature: 'growth', value: 'S',
      difficulty: 1, resistance: 1, emoji: null, daily_xp_cap: 300, cooldown_minutes: 0, min_effective_minutes: 25,
      is_default: false, reason: 'r', success_criteria: 'c', value_confidence: 100, created_at: '2026-03-01',
    }];
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-1', name: 'A' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify({ broken: true }));
    await db.loadFromRemote('uid-1');
    expect(storage.getTasks()).toEqual([expect.objectContaining({ id: 't', value: 'S' })]);
  });

  it('does not carry another owner\'s device fields into this account (BUG-127)', async () => {
    tableData.tasks = [{
      id: 'shared-id', name: 'x', category: 'focus', impact_type: 'task', task_nature: 'growth', value: 'S',
      difficulty: 1, resistance: 1, emoji: null, daily_xp_cap: 300, cooldown_minutes: 0, min_effective_minutes: 25,
      is_default: false, reason: 'r', success_criteria: 'c', value_confidence: 100, created_at: '2026-03-01',
    }];
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'guest-1', name: 'Guest' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify([{ id: 'shared-id', value: 'S', sSince: '2026-04-11', iconImg: 'data:x' }]));
    await db.loadFromRemote('uid-1');
    expect(storage.getTasks()[0]).not.toHaveProperty('sSince');
    expect(storage.getTasks()[0]).not.toHaveProperty('iconImg');
  });

  it('session row 逐欄映射（本機無資料時 merge 結果＝remote 映射）', async () => {
    tableData.sessions = [{
      id: 's-1', task_id: 't-1', task_name: '深度學習', task_emoji: '📚',
      date: '2026-07-06', started_at: '2026-07-06T01:00:00Z',
      completed_at: '2026-07-06T02:00:00Z', duration_minutes: 60,
      result: 'complete', base_xp: 90, final_xp: 120, energy_cost: 15,
      energy_gain: 0, impact_type: 'task', task_nature: 'growth',
      value: 'S', resistance: 1.4, is_productive_xp: true, task_icon_img: null,
    }];
    await db.loadFromRemote('uid-1');
    expect(storage.getSessions()).toEqual([{
      id: 's-1', taskId: 't-1', taskName: '深度學習', taskEmoji: '📚',
      date: '2026-07-06', startedAt: '2026-07-06T01:00:00Z',
      completedAt: '2026-07-06T02:00:00Z', durationMinutes: 60,
      result: 'complete', baseXP: 90, finalXP: 120, energyCost: 15,
      energyGain: 0, impactType: 'task', taskNature: 'growth',
      value: 'S', resistance: 1.4, isProductiveXP: true, taskIconImg: null,
    }]);
  });

  it('回傳的 backfilled 等本機待補傳的 Session 寫入後才完成，並清掉待同步標記（HW-110）', async () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-1' }));
    localStorage.setItem('yoyo_sessions', JSON.stringify([{
      id: 's-local', taskId: '7c3e9a51-2b4d-4f6a-8e1c-9d0b2a4f6e83', date: '2026-07-06',
      completedAt: '2026-07-06T02:00:00Z', _syncPending: true,
    }]));

    const result = await db.loadFromRemote('uid-1');
    await result.backfilled;

    expect(captured.inserts.sessions).toHaveLength(1);
    expect(captured.inserts.sessions[0].task_id).toBe('7c3e9a51-2b4d-4f6a-8e1c-9d0b2a4f6e83');
    expect(storage.getSessions().find(s => s.id === 's-local')._syncPending).toBeUndefined();
  });

  it('energy row：last_reset_date null → \'\'', async () => {
    tableData.energy = { user_id: 'uid-1', current_energy: 80, max_energy: 100, last_reset_date: null };
    await db.loadFromRemote('uid-1');
    expect(storage.getEnergy()).toEqual({ currentEnergy: 80, maxEnergy: 100, lastResetDate: '' });
  });
});

// ─── 寫入方向：upsert / insert payload ────────────────────────────────────────

describe('upsertProfile — user object → DB payload', () => {
  it('全欄位 user 逐欄映射（avatarPath 優先作為 avatar_url）', async () => {
    await db.upsertProfile({
      id: 'uid-1', name: '阿橘', avatar: 'data:image/png;base64,xxx', avatarPath: 'uid-1/a.jpg',
      totalXP: 1234, streakDays: 7, lastStreakDate: '2026-07-06',
      lastWeeklyBonusDate: '2026-07-06', morningState: 'good', mode: 'advanced',
      isPublic: true, displayName: 'Night Owl',
      titleTemplate: 'kny_dynamic', customTitle: '自訂稱號',
      newDayHour: 0, isPro: true, proExpiresAt: '2026-12-31T00:00:00Z',
      trialStartedAt: '2026-06-01T00:00:00Z', streakShieldCount: 0,
      streakShieldResetMonth: '2026-07', streakUnlockUsed: true,
      focusDefaultMinutes: 25, focusSoundEnabled: false,
    });
    expect(captured.upserts.profiles).toHaveLength(1);
    expect(captured.upserts.profiles[0].payload).toEqual({
      user_id: 'uid-1', name: '阿橘', avatar_url: 'uid-1/a.jpg',
      total_xp: 1234, streak_days: 7, last_streak_date: '2026-07-06',
      last_weekly_bonus_date: '2026-07-06', morning_state: 'good', mode: 'advanced',
      // PRO-014E2: is_public / display_name are never pushed with the profile;
      // leaderboardPublic.savePublicSettings() writes them on their own.
      title_template: 'kny_dynamic', custom_title: '自訂稱號',
      new_day_hour: 0,               // ?? — 0 必須保留
      is_pro: true, pro_expires_at: '2026-12-31T00:00:00Z',
      trial_started_at: '2026-06-01T00:00:00Z',
      streak_shield_count: 0,        // ?? — 0 必須保留
      streak_shield_reset_month: '2026-07', streak_unlock_used: true,
      focus_default_minutes: 25,
      focus_sound_enabled: false,    // ?? — false 必須保留
    });
  });

  it('稀疏 user 的寫入預設值（空字串 → null、undefined → 各欄預設）', async () => {
    await db.upsertProfile({ name: '極簡', avatar: 'data:image/png;base64,large', lastStreakDate: '', customTitle: '' });
    expect(captured.upserts.profiles[0].payload).toEqual({
      user_id: 'uid-1', name: '極簡',
      avatar_url: null,              // data: 開頭的本機預覽不上雲
      total_xp: 0, streak_days: 0,
      last_streak_date: null,        // '' → null（||）
      last_weekly_bonus_date: null,
      morning_state: 'normal', mode: 'normal',
      title_template: 'rpg',
      custom_title: null,            // '' → null（||）
      new_day_hour: 5, is_pro: false, pro_expires_at: null, trial_started_at: null,
      streak_shield_count: 2,        // undefined → 2（??）
      streak_shield_reset_month: '', streak_unlock_used: false,
      focus_default_minutes: null, focus_sound_enabled: true,
    });
  });

  it('PRO-014E2：stale 的 isPublic / displayName 不會覆寫 server 上的排行榜設定', async () => {
    await db.upsertProfile({ name: 'A', isPublic: false, displayName: null });
    const payload = captured.upserts.profiles[0].payload;
    expect(payload).not.toHaveProperty('is_public');
    expect(payload).not.toHaveProperty('display_name');
  });

  it('https avatar（無 avatarPath）直接作為 avatar_url', async () => {
    await db.upsertProfile({ name: 'A', avatar: 'https://cdn.example.com/a.jpg' });
    expect(captured.upserts.profiles[0].payload.avatar_url).toBe('https://cdn.example.com/a.jpg');
  });

  it('orbit_dev_backup 存在時不上雲（dev 覆蓋保護）', async () => {
    localStorage.setItem('orbit_dev_backup', '{}');
    const synced = await db.upsertProfile({ name: 'X' });
    expect(synced).toBe(false);
    expect(captured.upserts.profiles).toBeUndefined();
  });
});

const TASK_UUID = '5f0c2a8e-3b1d-4c6e-9a7f-2d8b4e6c1a30';

describe('upsertTasks / insertSession / upsertEnergy payloads', () => {
  it('task 寫入預設值（daily_xp_cap ?? 100、is_default ?? false、value_confidence ?? 100）', async () => {
    await db.upsertTasks([{
      id: TASK_UUID, name: '極簡任務', category: 'instant', impactType: 'task',
      taskNature: 'maintenance', value: 'B', difficulty: 0.4, resistance: 1,
    }]);
    expect(captured.upserts.tasks[0].payload).toEqual([{
      id: TASK_UUID, user_id: 'uid-1', name: '極簡任務', category: 'instant',
      impact_type: 'task', task_nature: 'maintenance', value: 'B',
      difficulty: 0.4, resistance: 1,
      emoji: null, daily_xp_cap: 100, cooldown_minutes: 0,
      min_effective_minutes: 0, is_default: false,
      reason: null, success_criteria: null, value_confidence: 100,
    }]);
    expect(captured.upserts.tasks[0].opts).toEqual({ onConflict: 'id' });
  });

  it('session 寫入欄位集合固定（note / taskIconImg / _syncPending 不上雲）', async () => {
    await db.insertSession({
      id: 's-1', taskId: TASK_UUID, taskName: '深度學習', taskEmoji: '📚',
      taskIconImg: 'data:image/png;base64,icon', date: '2026-07-06',
      startedAt: '2026-07-06T01:00:00Z', completedAt: '2026-07-06T02:00:00Z',
      durationMinutes: 60, result: 'complete', baseXP: 90, finalXP: 120,
      energyCost: 15, energyGain: 0, impactType: 'task', taskNature: 'growth',
      value: 'S', resistance: 1.4, isProductiveXP: true,
      note: '本機備注', _syncPending: true,
    });
    expect(captured.inserts.sessions[0]).toEqual({
      id: 's-1', user_id: 'uid-1', task_id: TASK_UUID, task_name: '深度學習',
      task_emoji: '📚', date: '2026-07-06',
      started_at: '2026-07-06T01:00:00Z', completed_at: '2026-07-06T02:00:00Z',
      duration_minutes: 60, result: 'complete', base_xp: 90, final_xp: 120,
      energy_cost: 15, energy_gain: 0, impact_type: 'task', task_nature: 'growth',
      value: 'S', resistance: 1.4, is_productive_xp: true,
    });
  });

  it('energy 寫入：lastResetDate \'\' → null', async () => {
    await db.upsertEnergy({ currentEnergy: 50, maxEnergy: 100, lastResetDate: '' });
    expect(captured.upserts.energy[0].payload).toEqual({
      user_id: 'uid-1', current_energy: 50, max_energy: 100, last_reset_date: null,
    });
    expect(captured.upserts.energy[0].opts).toEqual({ onConflict: 'user_id' });
  });
});

describe('a session whose task can never be linked (BUG-150/151)', () => {
  const OWNER = 'uid-1';
  const GONE_TASK = '9d1e7b3a-6c2f-4e8a-b5d4-0f3a2c1e7b96';
  const linkMissing = {
    code: '23503',
    message: 'insert or update on table "sessions" violates foreign key constraint "sessions_task_id_fkey"',
    details: `Key (task_id)=(${GONE_TASK}) is not present in table "tasks".`,
  };

  function session(taskId, id = 's-1') {
    return {
      id, taskId, taskName: '完成你的第一個任務', taskEmoji: '⭐', date: '2026-11-27',
      startedAt: '2026-11-27T01:00:00Z', completedAt: '2026-11-27T01:00:00Z',
      durationMinutes: 0, result: 'instant', baseXP: 10, finalXP: 1, energyCost: 0,
      energyGain: 0, impactType: 'task', taskNature: 'maintenance', value: 'B',
      resistance: 1, isProductiveXP: false,
    };
  }

  function cacheOwner(tasks = []) {
    localStorage.setItem('yoyo_user', JSON.stringify({ id: OWNER, name: 'U' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify(tasks));
  }

  const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });

  it('the tour\'s task (not a uuid) goes up without the link, in one insert', async () => {
    await expect(db.insertSession(session('tour-task'), OWNER)).resolves.toBe(true);
    expect(captured.inserts.sessions).toHaveLength(1);
    expect(captured.inserts.sessions[0]).toMatchObject({ id: 's-1', task_id: null, task_name: '完成你的第一個任務' });
  });

  it('a uuid task id goes up as it is; one that only contains a uuid does not', async () => {
    await db.insertSession(session(TASK_UUID), OWNER);
    await db.insertSession(session(`${TASK_UUID}-copy`, 's-2'), OWNER);
    await db.insertSession(session(`x${TASK_UUID}`, 's-3'), OWNER);
    expect(captured.inserts.sessions.map(row => row.task_id)).toEqual([TASK_UUID, null, null]);
  });

  it('a task this device no longer has (deleted offline): retried once without the link', async () => {
    cacheOwner([{ id: TASK_UUID }]);
    captured.insertErrors = [linkMissing];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).resolves.toBe(true);

    expect(captured.inserts.sessions.map(row => row.task_id)).toEqual([GONE_TASK, null]);
    expect(captured.inserts.sessions[1]).toEqual({ ...captured.inserts.sessions[0], task_id: null });
  });

  it('a task this device still has (not uploaded yet): no retry, the session waits for it', async () => {
    cacheOwner([{ id: GONE_TASK }]);
    captured.insertErrors = [linkMissing];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(linkMissing);
    expect(captured.inserts.sessions).toHaveLength(1);
  });

  it('another account cached here: no retry (this device cannot tell)', async () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-other' }));
    localStorage.setItem('yoyo_tasks', JSON.stringify([]));
    captured.insertErrors = [linkMissing];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(linkMissing);
    expect(captured.inserts.sessions).toHaveLength(1);
  });

  it('no task list stored: no retry', async () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ id: OWNER }));
    captured.insertErrors = [linkMissing];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(linkMissing);
    expect(captured.inserts.sessions).toHaveLength(1);
  });

  it('other errors are not retried: a missing profile, a permission error', async () => {
    cacheOwner([]);
    const profileMissing = {
      code: '23503',
      message: 'insert or update on table "sessions" violates foreign key constraint "sessions_user_id_fkey"',
      details: 'Key (user_id)=(uid-1) is not present in table "profiles".',
    };
    const denied = { code: '42501', message: 'new row violates row-level security policy for table "sessions" (task_id)' };
    captured.insertErrors = [profileMissing];
    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(profileMissing);
    captured.insertErrors = [denied];
    await expect(db.insertSession(session(GONE_TASK, 's-2'), OWNER)).rejects.toBe(denied);

    expect(captured.inserts.sessions).toHaveLength(2);
  });

  it('the link named only in the details still counts', async () => {
    cacheOwner([]);
    captured.insertErrors = [{ code: '23503', message: 'foreign key violation', details: linkMissing.details }];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).resolves.toBe(true);
    expect(captured.inserts.sessions.map(row => row.task_id)).toEqual([GONE_TASK, null]);
  });

  it('the retry failing too: that error, and no third insert', async () => {
    cacheOwner([]);
    const offline = { code: '', message: 'Failed to fetch' };
    captured.insertErrors = [linkMissing, offline];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(offline);
    expect(captured.inserts.sessions).toHaveLength(2);
  });

  it('a completed tour task is no longer left waiting to sync', async () => {
    cacheOwner([]);
    storage.saveSessions([session('tour-task')], OWNER);
    expect(storage.getSessions()[0]._syncPending).toBe(true);

    await settle();

    expect(captured.inserts.sessions[0].task_id).toBeNull();
    expect(storage.getSessions()[0]._syncPending).toBeUndefined();
    expect(storage.getPendingSyncSummary(OWNER).sessions).toBe(0);
  });

  it('the tour\'s task is never stored or uploaded with the task list', async () => {
    cacheOwner([]);
    const tutorial = { id: 'tour-task', name: '完成你的第一個任務', isTutorial: true };
    const kept = { id: TASK_UUID, name: '閱讀', category: 'instant', impactType: 'task', taskNature: 'growth', value: 'A', difficulty: 0.7, resistance: 1 };

    expect(storage.saveTasks([tutorial, kept], OWNER)).toBe(true);

    // The upload is still on its way: what waits for it is stored already.
    const pending = Object.keys(localStorage).filter(key => key.startsWith('yoyo_taskSyncPending'));
    expect(pending).toHaveLength(1);
    expect(localStorage.getItem(pending[0])).toContain(TASK_UUID);
    expect(localStorage.getItem(pending[0])).not.toContain('tour-task');

    await settle();
    expect(JSON.parse(localStorage.getItem('yoyo_tasks')).map(task => task.id)).toEqual([TASK_UUID]);
    expect(captured.upserts.tasks[0].payload.map(row => row.id)).toEqual([TASK_UUID]);
  });

  it('removing the tour\'s task from memory deletes nothing on the server', async () => {
    cacheOwner([]);
    const kept = { id: TASK_UUID, name: '閱讀', category: 'instant', impactType: 'task', taskNature: 'growth', value: 'A', difficulty: 0.7, resistance: 1 };
    storage.saveTasks([{ id: 'tour-task', isTutorial: true }, kept], OWNER);
    await settle();

    const deleted = vi.spyOn(db, 'deleteTasks');
    storage.saveTasks([kept], OWNER);
    await settle();

    expect(deleted).toHaveBeenCalledWith([], OWNER);
    deleted.mockRestore();
  });

  const READING = { id: TASK_UUID, name: '閱讀', category: 'instant', impactType: 'task', taskNature: 'growth', value: 'A', difficulty: 0.7, resistance: 1 };
  const pendingKey = `yoyo_taskSyncPending:${OWNER}`;

  it('the settings page drops `isTutorial` when it saves an edit: still known by its id', async () => {
    cacheOwner([]);
    storage.saveTasks([{ id: 'tour-task', name: '改過的名字', value: 'B' }, READING], OWNER);
    await settle();

    expect(JSON.parse(localStorage.getItem('yoyo_tasks')).map(task => task.id)).toEqual([TASK_UUID]);
    expect(captured.upserts.tasks[0].payload.map(row => row.id)).toEqual([TASK_UUID]);
  });

  it('a list saved with the tour\'s task before 1.42.19: the next pull goes through and the stuck session uploads', async () => {
    // As syncableTask() wrote it: without `isTutorial` (#302 review).
    const legacyTour = { id: 'tour-task', name: '完成你的第一個任務', value: 'B' };
    cacheOwner([legacyTour, READING]);
    localStorage.setItem(pendingKey, JSON.stringify({
      ownerId: OWNER, value: [legacyTour, READING], deletedIds: ['tour-task'],
    }));
    localStorage.setItem('yoyo_sessions', JSON.stringify([{ ...session('tour-task', 's-tour'), _syncPending: true }]));

    const result = await db.loadFromRemote(OWNER);
    await result.backfilled;

    expect(captured.upserts.tasks[0].payload.map(row => row.id)).toEqual([TASK_UUID]);
    expect(captured.deletes.tasks ?? []).toEqual([]);
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(captured.inserts.sessions.map(row => [row.id, row.task_id])).toEqual([['s-tour', null]]);
    expect(storage.getPendingSyncSummary(OWNER).total).toBe(0);
  });

  it('a cache that still holds the tour\'s task: saving without it deletes nothing for it, and the upload clears', async () => {
    const OTHER = 'a8d4c2e6-1f3b-4c5d-9e7a-6b2f0c8d4e19';
    cacheOwner([{ id: 'tour-task', isTutorial: true }, READING, { ...READING, id: OTHER }]);

    storage.saveTasks([READING], OWNER);
    await settle();

    // Only the real task that was removed is deleted on the server.
    expect(captured.deletes.tasks).toEqual([[OTHER]]);
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });

  it('BUG-151 through a pull: a session of a task deleted offline is backfilled without the link', async () => {
    cacheOwner([READING]);
    localStorage.setItem('yoyo_sessions', JSON.stringify([{ ...session(GONE_TASK, 's-gone'), _syncPending: true }]));
    tableData.tasks = [{ id: TASK_UUID, user_id: OWNER, name: '閱讀', category: 'instant', impact_type: 'task', task_nature: 'growth', value: 'A', difficulty: 0.7, resistance: 1 }];
    captured.insertErrors = [linkMissing];

    const result = await db.loadFromRemote(OWNER);
    await result.backfilled;

    expect(captured.inserts.sessions.map(row => row.task_id)).toEqual([GONE_TASK, null]);
    expect(storage.getSessions().find(s => s.id === 's-gone')._syncPending).toBeUndefined();
  });

  it('a task only in the list waiting to upload (the cache write failed) is not gone: no retry', async () => {
    cacheOwner([READING]);
    localStorage.setItem(pendingKey, JSON.stringify({
      ownerId: OWNER, value: [READING, { ...READING, id: GONE_TASK }], deletedIds: [],
    }));
    captured.insertErrors = [linkMissing];

    await expect(db.insertSession(session(GONE_TASK), OWNER)).rejects.toBe(linkMissing);
    expect(captured.inserts.sessions).toHaveLength(1);
  });
});

describe('manual sync (BUG-133)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('runs one load at a time: a second request meanwhile shares the first', async () => {
    let finish;
    const load = vi.spyOn(db, 'loadFromRemote').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = storage.syncFromRemote();
    const second = storage.syncFromRemote();
    expect(second).toBe(first);
    expect(storage.currentManualSync()).toBe(first);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    finish({ backfilled: Promise.resolve([]) });
    await expect(first).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(storage.currentManualSync()).toBeNull();
    // It counted once: the next request is inside the 10 s cooldown.
    await expect(storage.syncFromRemote()).rejects.toThrow(/^cooldown:\d+$/);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a failed sync is shared too, and leaves no cooldown, so it can be tried again', async () => {
    const load = vi.spyOn(db, 'loadFromRemote').mockRejectedValueOnce(new Error('offline'));
    const first = storage.syncFromRemote();
    const second = storage.syncFromRemote();
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    expect(storage.currentManualSync()).toBeNull();
    load.mockResolvedValueOnce({ backfilled: Promise.resolve([]) });
    await expect(storage.syncFromRemote()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a load that throws at once is still a failed sync, and is cleared', async () => {
    vi.spyOn(storage, '_syncFromRemoteNow').mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(storage.syncFromRemote()).rejects.toThrow('boom');
    expect(storage.currentManualSync()).toBeNull();
  });

  it('belongs to the account it was started for', async () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-1', name: 'A' }));
    const finishes = [];
    const load = vi.spyOn(db, 'loadFromRemote').mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
    const first = storage.syncFromRemote();
    expect(storage.currentManualSync()).toBe(first);
    // Signed out and another account in, while A's sync still runs.
    localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-2', name: 'B' }));
    expect(storage.currentManualSync()).toBeNull();
    // B's own request is not A's.
    const second = storage.syncFromRemote();
    expect(second).not.toBe(first);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    finishes[0]({ backfilled: Promise.resolve([]) });
    await first;
    // A's sync ending does not clear B's.
    expect(storage.currentManualSync()).toBe(second);
    finishes[1]({ backfilled: Promise.resolve([]) });
    await second;
    expect(storage.currentManualSync()).toBeNull();
  });

  it('is already cleared when its result is seen', async () => {
    vi.spyOn(db, 'loadFromRemote').mockResolvedValue({ backfilled: Promise.resolve([]) });
    let seen = 'unset';
    await storage.syncFromRemote().then(() => { seen = storage.currentManualSync(); });
    expect(seen).toBeNull();
  });
});

describe('saveUserAndSync after an account switch (BUG-139)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('marks the user to push later only while that account is still the one stored', async () => {
    vi.spyOn(db, 'upsertProfile').mockImplementationOnce(async () => {
      // Signed out and another account in while A's write was out.
      localStorage.setItem('yoyo_user', JSON.stringify({ id: 'uid-b', name: 'B' }));
      return false;
    });
    await expect(storage.saveUserAndSync({ id: 'uid-a', name: 'A' })).resolves.toBe(false);
    expect(storage.getUser()).toEqual({ id: 'uid-b', name: 'B' });
  });

  it('still marks this account to push later when it is not signed in', async () => {
    vi.spyOn(db, 'upsertProfile').mockResolvedValueOnce(false);
    await storage.saveUserAndSync({ id: 'uid-a', name: 'A' });
    expect(storage.getUser()).toEqual({ id: 'uid-a', name: 'A', _syncPending: true });
  });
});
