/**
 * storage.test.js
 *
 * 整合測試：storage.js 的 localStorage 層與 Supabase 背景同步層。
 *
 * 策略：
 * - jsdom 環境（提供 localStorage）
 * - mock supabase.js（避免 CDN import 與真實網路請求）
 * - 測試 storage object（localStorage 讀寫）、db object（Supabase 呼叫格式與跳過邏輯）、
 *   以及 migrateV1toV2 資料遷移
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock（必須在 import storage.js 之前 hoisted）────────────────────

const mockGetSession = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { session: null } }))
);

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

// ─── 被測模組（mock 完成後才 import）─────────────────────────────────────────

import { storage, db, migrateV1toV2, migrateDefaultFlags } from '../../pwa/js/storage.js';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const PREFIX = 'yoyo_';
const FAKE_SESSION = { user: { id: 'user-abc' } };

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/**
 * 建立可鏈式呼叫的 Supabase query mock。
 * `.then()` 使整個 chain 成為 thenable，支援 `await chain.delete().eq()` 的用法。
 */
function makeChain(data = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn(() => Promise.resolve({ data, error: null })),
    insert: vi.fn(() => Promise.resolve({ data, error: null })),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn(() => Promise.resolve({ data, error: null })),
    order:  vi.fn(() => Promise.resolve({ data, error: null })),
    single: vi.fn(() => Promise.resolve({ data, error: null })),
    then:   (resolve, reject) =>
      Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return chain;
}

/** 排出所有 pending 的 microtask / Promise（用於 fire-and-forget 的 async 呼叫）。 */
const flushPromises = () => new Promise(r => setTimeout(r, 0));

/** 直接讀 localStorage（with PREFIX），用於測試驗證。 */
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}

/** 直接寫 localStorage（with PREFIX），用於測試準備。 */
function lsSet(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockFrom.mockImplementation(() => makeChain());
});

// ═══════════════════════════════════════════════════════════════════════════════
// localStorage 層（storage object）
// ═══════════════════════════════════════════════════════════════════════════════

describe('storage.getUser()', () => {
  it('returns null when nothing stored', () => {
    expect(storage.getUser()).toBeNull();
  });

  it('returns stored user', () => {
    const user = { id: 'u1', name: 'Alice', totalXP: 50 };
    lsSet('user', user);
    expect(storage.getUser()).toEqual(user);
  });
});

describe('storage.saveUser()', () => {
  it('writes user to localStorage with prefix', () => {
    const user = { id: 'u1', name: 'Alice', totalXP: 0 };
    storage.saveUser(user);
    expect(lsGet('user')).toEqual(user);
  });

  it('saved user is retrievable via getUser()', () => {
    const user = { id: 'u1', name: 'Bob', totalXP: 120 };
    storage.saveUser(user);
    expect(storage.getUser()).toEqual(user);
  });

  it('calls Supabase profiles.upsert when authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    storage.saveUser({ id: 'u1', name: 'Alice', totalXP: 0, streakDays: 0 });
    await flushPromises();

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(chain.upsert).toHaveBeenCalled();
  });

  it('skips Supabase when not authenticated', async () => {
    storage.saveUser({ name: 'Alice' });
    await flushPromises();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('storage.getTasks()', () => {
  it('returns empty array when nothing stored', () => {
    expect(storage.getTasks()).toEqual([]);
  });

  it('returns stored tasks', () => {
    const tasks = [{ id: 't1', name: '讀書' }];
    lsSet('tasks', tasks);
    expect(storage.getTasks()).toEqual(tasks);
  });
});

// 建立最小合法 task 物件（供 saveTasks 測試用）
function makeTask(overrides = {}) {
  return {
    id: 't1', name: '讀書', value: 'A', category: 'focus',
    impactType: 'task', taskNature: 'growth', difficulty: 0.7,
    resistance: 1.2, emoji: '📚', dailyXpCap: 200, cooldownMinutes: 0,
    minEffectiveMinutes: 25, isDefault: false, valueConfidence: 100,
    reason: null, successCriteria: null,
    ...overrides,
  };
}

describe('storage.saveTasks()', () => {
  it('writes tasks to localStorage', () => {
    const tasks = [makeTask()];
    storage.saveTasks(tasks);
    expect(lsGet('tasks')).toEqual(tasks);
  });

  it('calls Supabase tasks.upsert when authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    storage.saveTasks([makeTask()]);
    await flushPromises();

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(chain.upsert).toHaveBeenCalled();
  });

  it('calls db.deleteTasks for removed tasks', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    // 先存兩筆
    lsSet('tasks', [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }]);

    // 只留 t2（t1 被移除）
    storage.saveTasks([makeTask({ id: 't2', name: 'B' })]);
    await flushPromises();

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.in).toHaveBeenCalledWith('id', ['t1']);
  });

  it('does not call deleteTasks when nothing was removed', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    lsSet('tasks', [{ id: 't1' }]);
    storage.saveTasks([makeTask({ id: 't1' })]);
    await flushPromises();

    // chain.in 不應被以 deleteTasks 路徑呼叫
    expect(chain.in).not.toHaveBeenCalledWith('id', expect.any(Array));
  });
});

describe('storage.getSessions()', () => {
  it('returns empty array when nothing stored', () => {
    expect(storage.getSessions()).toEqual([]);
  });

  it('returns stored sessions', () => {
    const sessions = [{ id: 's1', taskName: '讀書', finalXP: 20 }];
    lsSet('sessions', sessions);
    expect(storage.getSessions()).toEqual(sessions);
  });
});

function makeSession(overrides = {}) {
  return {
    id: 's1', taskId: 't1', taskName: '讀書', taskEmoji: '📚',
    date: '2026-04-13', startedAt: '', completedAt: '',
    durationMinutes: 30, result: 'complete',
    baseXP: 20, finalXP: 20, energyCost: 5, energyGain: 0,
    impactType: 'task', taskNature: 'growth',
    value: 'A', resistance: 1.2, isProductiveXP: true,
    ...overrides,
  };
}

describe('storage.saveSessions()', () => {
  it('writes sessions to localStorage', () => {
    storage.saveSessions([makeSession()]);
    expect(lsGet('sessions')).toHaveLength(1);
  });

  it('inserts only NEW sessions (not already-stored ones)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    lsSet('sessions', [makeSession({ id: 's1' })]);

    // s1 舊有、s2 全新
    storage.saveSessions([
      makeSession({ id: 's1' }),
      makeSession({ id: 's2', taskName: '運動' }),
    ]);
    await flushPromises();

    // insert 只被呼叫一次（s2）
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('does not call insertSession when all sessions already exist', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    lsSet('sessions', [makeSession({ id: 's1' })]);
    storage.saveSessions([makeSession({ id: 's1' })]);
    await flushPromises();

    expect(chain.insert).not.toHaveBeenCalled();
  });
});

describe('storage.getEnergy()', () => {
  it('returns default energy when nothing stored', () => {
    expect(storage.getEnergy()).toEqual({
      currentEnergy: 100,
      maxEnergy: 100,
      lastResetDate: '',
    });
  });

  it('returns stored energy', () => {
    const energy = { currentEnergy: 75, maxEnergy: 100, lastResetDate: '2026-04-13' };
    lsSet('energy', energy);
    expect(storage.getEnergy()).toEqual(energy);
  });
});

describe('storage.saveEnergy()', () => {
  it('writes energy to localStorage', () => {
    const energy = { currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-13' };
    storage.saveEnergy(energy);
    expect(lsGet('energy')).toEqual(energy);
  });

  it('calls Supabase energy.upsert when authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    storage.saveEnergy({ currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-13' });
    await flushPromises();

    expect(mockFrom).toHaveBeenCalledWith('energy');
    expect(chain.upsert).toHaveBeenCalled();
  });
});

describe('storage.clearAll()', () => {
  it('removes all prefixed keys from localStorage', () => {
    lsSet('user',     { name: 'Alice' });
    lsSet('tasks',    [{ id: 't1' }]);
    lsSet('sessions', [{ id: 's1' }]);
    lsSet('energy',   { currentEnergy: 80 });
    lsSet('theme',    'dark-purple');

    storage.clearAll();

    ['user', 'tasks', 'sessions', 'energy', 'theme'].forEach(k => {
      expect(localStorage.getItem(PREFIX + k)).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Supabase 同步層（db object）
// ═══════════════════════════════════════════════════════════════════════════════

// ─── db.loadFromRemote() ──────────────────────────────────────────────────────

const PROFILE_DB = {
  user_id: 'user-abc', name: 'Alice', avatar_url: null,
  total_xp: 150, streak_days: 5,
  last_streak_date: '2026-04-12', last_weekly_bonus_date: null,
  morning_state: 'good', mode: 'normal', is_public: false,
  created_at: '2026-01-01',
};

const TASKS_DB = [{
  id: 't1', name: '深度學習', category: 'focus',
  impact_type: 'task', task_nature: 'growth', value: 'A',
  difficulty: 0.7, resistance: 1.2, emoji: '🧠',
  daily_xp_cap: 200, cooldown_minutes: 0, min_effective_minutes: 25,
  is_default: true, reason: null, success_criteria: null,
  value_confidence: 100, created_at: '2026-01-01',
}];

const SESSIONS_DB = [{
  id: 's1', task_id: 't1', task_name: '深度學習', task_emoji: '🧠',
  date: '2026-04-13',
  started_at: '2026-04-13T10:00:00Z', completed_at: '2026-04-13T10:30:00Z',
  duration_minutes: 30, result: 'complete',
  base_xp: 20, final_xp: 22, energy_cost: 8, energy_gain: 0,
  impact_type: 'task', task_nature: 'growth',
  value: 'A', resistance: 1.2, is_productive_xp: true,
}];

const ENERGY_DB = {
  current_energy: 80, max_energy: 100, last_reset_date: '2026-04-13',
};

describe('db.loadFromRemote()', () => {
  beforeEach(() => {
    mockFrom.mockImplementation((table) => {
      if (table === 'profiles') return makeChain(PROFILE_DB);
      if (table === 'tasks')    return makeChain(TASKS_DB);
      if (table === 'sessions') return makeChain(SESSIONS_DB);
      if (table === 'energy')   return makeChain(ENERGY_DB);
      return makeChain(null);
    });
  });

  it('writes profile fields to localStorage user (snake_case → camelCase)', async () => {
    await db.loadFromRemote('user-abc');
    const user = lsGet('user');
    expect(user.id).toBe('user-abc');
    expect(user.name).toBe('Alice');
    expect(user.totalXP).toBe(150);
    expect(user.streakDays).toBe(5);
    expect(user.morningState).toBe('good');
    expect(user.mode).toBe('normal');
    expect(user.isPublic).toBe(false);
  });

  it('writes tasks to localStorage with camelCase field mapping', async () => {
    await db.loadFromRemote('user-abc');
    const tasks = lsGet('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1');
    expect(tasks[0].impactType).toBe('task');
    expect(tasks[0].taskNature).toBe('growth');
    expect(tasks[0].dailyXpCap).toBe(200);
    expect(tasks[0].minEffectiveMinutes).toBe(25);
    expect(tasks[0].isDefault).toBe(true);
  });

  it('writes sessions to localStorage with camelCase field mapping', async () => {
    await db.loadFromRemote('user-abc');
    const sessions = lsGet('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('s1');
    expect(sessions[0].taskId).toBe('t1');
    expect(sessions[0].taskName).toBe('深度學習');
    expect(sessions[0].durationMinutes).toBe(30);
    expect(sessions[0].finalXP).toBe(22);
    expect(sessions[0].energyCost).toBe(8);
    expect(sessions[0].isProductiveXP).toBe(true);
  });

  it('writes energy to localStorage with camelCase field mapping', async () => {
    await db.loadFromRemote('user-abc');
    const energy = lsGet('energy');
    expect(energy.currentEnergy).toBe(80);
    expect(energy.maxEnergy).toBe(100);
    expect(energy.lastResetDate).toBe('2026-04-13');
  });

  it('handles null data gracefully (no crash when tables are empty)', async () => {
    mockFrom.mockImplementation(() => makeChain(null));
    await expect(db.loadFromRemote('user-abc')).resolves.toBeUndefined();
  });
});

// ─── db.upsertProfile() ───────────────────────────────────────────────────────

describe('db.upsertProfile()', () => {
  it('skips Supabase when not authenticated', async () => {
    await db.upsertProfile({ name: 'Alice', totalXP: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls profiles.upsert with snake_case field mapping', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.upsertProfile({
      name: 'Alice', avatar: null, totalXP: 100,
      streakDays: 3, lastStreakDate: '2026-04-12',
      lastWeeklyBonusDate: null, morningState: 'good',
      mode: 'advanced', isPublic: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:       'user-abc',
        name:          'Alice',
        total_xp:      100,
        streak_days:   3,
        morning_state: 'good',
        mode:          'advanced',
        is_public:     true,
      })
    );
  });

  it('does not sync base64 avatar to Supabase (omits data-URL)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.upsertProfile({
      name: 'Alice',
      avatar: 'data:image/png;base64,abc123',
      totalXP: 0, streakDays: 0,
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: null })
    );
  });
});

// ─── db.upsertTasks() ────────────────────────────────────────────────────────

describe('db.upsertTasks()', () => {
  it('skips when not authenticated', async () => {
    await db.upsertTasks([makeTask()]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips when tasks array is empty', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    await db.upsertTasks([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls tasks.upsert with snake_case field mapping', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.upsertTasks([{
      id: 't1', name: '深度學習', category: 'focus',
      impactType: 'task', taskNature: 'growth', value: 'A',
      difficulty: 0.7, resistance: 1.2, emoji: '🧠',
      dailyXpCap: 200, cooldownMinutes: 0, minEffectiveMinutes: 25,
      isDefault: true, reason: null, successCriteria: null, valueConfidence: 100,
    }]);

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id:                    't1',
          user_id:               'user-abc',
          impact_type:           'task',
          task_nature:           'growth',
          daily_xp_cap:          200,
          min_effective_minutes: 25,
          is_default:            true,
        }),
      ]),
      { onConflict: 'id' }
    );
  });
});

// ─── db.deleteTasks() ────────────────────────────────────────────────────────

describe('db.deleteTasks()', () => {
  it('skips when ids array is empty', async () => {
    await db.deleteTasks([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips when not authenticated', async () => {
    await db.deleteTasks(['t1']);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls tasks.delete().in() with given ids', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.deleteTasks(['t1', 't2']);

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.in).toHaveBeenCalledWith('id', ['t1', 't2']);
  });
});

// ─── db.insertSession() ──────────────────────────────────────────────────────

describe('db.insertSession()', () => {
  it('skips when not authenticated', async () => {
    await db.insertSession(makeSession());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls sessions.insert with snake_case field mapping', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.insertSession({
      id: 's1', taskId: 't1', taskName: '深度學習', taskEmoji: '🧠',
      date: '2026-04-13',
      startedAt: '2026-04-13T10:00:00Z', completedAt: '2026-04-13T10:30:00Z',
      durationMinutes: 30, result: 'complete',
      baseXP: 20, finalXP: 22, energyCost: 8, energyGain: 0,
      impactType: 'task', taskNature: 'growth',
      value: 'A', resistance: 1.2, isProductiveXP: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id:               's1',
        user_id:          'user-abc',
        task_id:          't1',
        task_name:        '深度學習',
        duration_minutes: 30,
        final_xp:         22,
        energy_cost:      8,
        is_productive_xp: true,
      })
    );
  });
});

// ─── db.deleteSession() ──────────────────────────────────────────────────────

describe('db.deleteSession()', () => {
  it('skips when not authenticated', async () => {
    await db.deleteSession('s1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls sessions.delete().eq() with session id', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.deleteSession('s1');

    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 's1');
  });
});

// ─── db.upsertEnergy() ───────────────────────────────────────────────────────

describe('db.upsertEnergy()', () => {
  it('skips when not authenticated', async () => {
    await db.upsertEnergy({ currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-13' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls energy.upsert with snake_case field mapping', async () => {
    mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    const chain = makeChain();
    mockFrom.mockImplementation(() => chain);

    await db.upsertEnergy({ currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-13' });

    expect(mockFrom).toHaveBeenCalledWith('energy');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:         'user-abc',
        current_energy:  80,
        max_energy:      100,
        last_reset_date: '2026-04-13',
      }),
      { onConflict: 'user_id' }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 資料遷移：migrateV1toV2()
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Daily Plan: getDailyPlan / saveDailyPlan
// ═══════════════════════════════════════════════════════════════════════════════

describe('storage.getDailyPlan()', () => {
  it('returns [] when nothing stored', () => {
    expect(storage.getDailyPlan()).toEqual([]);
  });

  it('returns [] when stored plan is for a different date', () => {
    lsSet('dailyPlan', { date: '2020-01-01', taskIds: ['t1', 't2'] });
    expect(storage.getDailyPlan()).toEqual([]);
  });

  it('returns taskIds when plan date matches today', () => {
    const today = new Date().toISOString().slice(0, 10);
    lsSet('dailyPlan', { date: today, taskIds: ['a', 'b', 'c'] });
    expect(storage.getDailyPlan()).toEqual(['a', 'b', 'c']);
  });
});

describe('storage.saveDailyPlan()', () => {
  it('saves plan with today date', () => {
    const today = new Date().toISOString().slice(0, 10);
    storage.saveDailyPlan(['x', 'y']);
    const raw = lsGet('dailyPlan');
    expect(raw.date).toBe(today);
    expect(raw.taskIds).toEqual(['x', 'y']);
  });

  it('saved plan is retrievable via getDailyPlan()', () => {
    storage.saveDailyPlan(['task-1', 'task-2']);
    expect(storage.getDailyPlan()).toEqual(['task-1', 'task-2']);
  });

  it('overwrites a previously saved plan', () => {
    storage.saveDailyPlan(['old']);
    storage.saveDailyPlan(['new-1', 'new-2']);
    expect(storage.getDailyPlan()).toEqual(['new-1', 'new-2']);
  });
});

describe('storage.clearAll()', () => {
  it('also removes dailyPlan', () => {
    storage.saveDailyPlan(['t1']);
    storage.clearAll();
    expect(storage.getDailyPlan()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 資料遷移：migrateDefaultFlags()
// ═══════════════════════════════════════════════════════════════════════════════

describe('migrateDefaultFlags()', () => {
  it('no-op when no tasks stored', () => {
    migrateDefaultFlags(); // should not throw
    expect(lsGet('tasks')).toBeNull();
  });

  it('sets isDefault:true for known default task names', () => {
    lsSet('tasks', [
      { id: 't1', name: '運動 30 分鐘' },
      { id: 't2', name: '深度學習 45 分鐘' },
    ]);
    migrateDefaultFlags();
    const tasks = lsGet('tasks');
    expect(tasks[0].isDefault).toBe(true);
    expect(tasks[1].isDefault).toBe(true);
  });

  it('does not override isDefault when already set', () => {
    lsSet('tasks', [
      { id: 't1', name: '運動 30 分鐘', isDefault: false }, // explicitly false
    ]);
    migrateDefaultFlags();
    // Should not change — only fills in undefined
    const tasks = lsGet('tasks');
    expect(tasks[0].isDefault).toBe(false);
  });

  it('leaves custom (non-default) tasks without isDefault', () => {
    lsSet('tasks', [
      { id: 't1', name: '我的自訂任務' },
    ]);
    migrateDefaultFlags();
    const tasks = lsGet('tasks');
    expect(tasks[0].isDefault).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 資料遷移：migrateV1toV2()
// ═══════════════════════════════════════════════════════════════════════════════

describe('migrateV1toV2()', () => {
  it('no-op when tasks already exist (migration already done)', () => {
    lsSet('tasks', [{ id: 't1', name: '讀書' }]);
    migrateV1toV2('2026-04-13');
    // tasks 不被覆蓋
    expect(lsGet('tasks')).toEqual([{ id: 't1', name: '讀書' }]);
  });

  it('creates empty tasks and sessions when goals/logs are empty', () => {
    migrateV1toV2('2026-04-13');
    expect(lsGet('tasks')).toEqual([]);
    expect(lsGet('sessions')).toEqual([]);
  });

  it('migrates goals → tasks with correct default fields', () => {
    lsSet('goals', [{ id: 'g1', name: '讀書', emoji: '📚', iconImg: null }]);
    migrateV1toV2('2026-04-13');

    const tasks = lsGet('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('g1');
    expect(tasks[0].name).toBe('讀書');
    expect(tasks[0].emoji).toBe('📚');
    expect(tasks[0].category).toBe('instant');
    expect(tasks[0].impactType).toBe('task');
    expect(tasks[0].taskNature).toBe('maintenance');
    expect(tasks[0].value).toBe('B');
    expect(tasks[0].createdAt).toBe('2026-04-13');
  });

  it('migrates logs → sessions and links them to migrated tasks', () => {
    lsSet('goals', [{ id: 'g1', name: '讀書', emoji: '📚' }]);
    lsSet('logs', [{
      id: 'l1', goalId: 'g1', goalName: '讀書', goalEmoji: '📚',
      date: '2026-04-13', completedAt: '2026-04-13T09:00:00Z', xp: 10,
    }]);

    migrateV1toV2('2026-04-13');

    const sessions = lsGet('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('l1');
    expect(sessions[0].taskId).toBe('g1');
    expect(sessions[0].taskName).toBe('讀書');
    expect(sessions[0].finalXP).toBe(10);
    expect(sessions[0].result).toBe('instant');
    expect(sessions[0].isProductiveXP).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// storage.isProUser() / storage.getProExpiry()
// ═══════════════════════════════════════════════════════════════════════════════

describe('storage.isProUser()', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when no user in localStorage', () => {
    expect(storage.isProUser()).toBe(false);
  });

  it('returns false when isPro is false', () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: false }));
    expect(storage.isProUser()).toBe(false);
  });

  it('returns true when isPro is true and proExpiresAt is null (lifetime)', () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true, proExpiresAt: null }));
    expect(storage.isProUser()).toBe(true);
  });

  it('returns true when isPro is true and proExpiresAt is in the future', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true, proExpiresAt: future }));
    expect(storage.isProUser()).toBe(true);
  });

  it('returns false when isPro is true but proExpiresAt is in the past', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true, proExpiresAt: past }));
    expect(storage.isProUser()).toBe(false);
  });
});

describe('storage.getProExpiry()', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no user stored', () => {
    expect(storage.getProExpiry()).toBeNull();
  });

  it('returns null when proExpiresAt is not set', () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true }));
    expect(storage.getProExpiry()).toBeNull();
  });

  it('returns the stored proExpiresAt string', () => {
    const expiry = '2027-01-01T00:00:00.000Z';
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true, proExpiresAt: expiry }));
    expect(storage.getProExpiry()).toBe(expiry);
  });
});
