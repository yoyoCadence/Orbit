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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const tableData = vi.hoisted(() => ({}));           // table → rows/row for reads
const captured  = vi.hoisted(() => ({ upserts: {}, inserts: {} }));

vi.mock('../../pwa/js/supabase.js', () => {
  function chain(table) {
    const self = {
      select: () => self,
      eq:     () => self,
      in:     () => Promise.resolve({ error: null }),
      delete: () => self,
      update: () => self,
      single: () => Promise.resolve({ data: tableData[table] ?? null, error: null }),
      order:  () => Promise.resolve({ data: tableData[table] ?? null, error: null }),
      upsert: (payload, opts) => {
        (captured.upserts[table] ??= []).push({ payload, opts });
        return Promise.resolve({ error: null });
      },
      insert: (payload) => {
        (captured.inserts[table] ??= []).push(payload);
        return Promise.resolve({ error: null });
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
});

// ─── 讀取方向：loadFromRemote → localStorage cache ───────────────────────────

describe('loadFromRemote — profile row → user object', () => {
  it('全欄位 row 逐欄映射（含 https avatar 直接採用不簽名）', async () => {
    tableData.profiles = {
      user_id: 'uid-1', name: '阿橘', avatar_url: 'https://cdn.example.com/a.jpg',
      total_xp: 1234, streak_days: 7, last_streak_date: '2026-07-06',
      last_weekly_bonus_date: '2026-07-06', morning_state: 'good', mode: 'advanced',
      is_public: true, title_template: 'kny_dynamic', custom_title: '自訂稱號',
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
      isPublic: true, titleTemplate: 'kny_dynamic', customTitle: '自訂稱號',
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
      is_public: null, title_template: null, custom_title: null,
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
      isPublic: true, titleTemplate: 'kny_dynamic', customTitle: '自訂稱號',
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
      is_public: true, title_template: 'kny_dynamic', custom_title: '自訂稱號',
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
      morning_state: 'normal', mode: 'normal', is_public: false,
      title_template: 'rpg',
      custom_title: null,            // '' → null（||）
      new_day_hour: 5, is_pro: false, pro_expires_at: null, trial_started_at: null,
      streak_shield_count: 2,        // undefined → 2（??）
      streak_shield_reset_month: '', streak_unlock_used: false,
      focus_default_minutes: null, focus_sound_enabled: true,
    });
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

describe('upsertTasks / insertSession / upsertEnergy payloads', () => {
  it('task 寫入預設值（daily_xp_cap ?? 100、is_default ?? false、value_confidence ?? 100）', async () => {
    await db.upsertTasks([{
      id: 't-1', name: '極簡任務', category: 'instant', impactType: 'task',
      taskNature: 'maintenance', value: 'B', difficulty: 0.4, resistance: 1,
    }]);
    expect(captured.upserts.tasks[0].payload).toEqual([{
      id: 't-1', user_id: 'uid-1', name: '極簡任務', category: 'instant',
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
      id: 's-1', taskId: 't-1', taskName: '深度學習', taskEmoji: '📚',
      taskIconImg: 'data:image/png;base64,icon', date: '2026-07-06',
      startedAt: '2026-07-06T01:00:00Z', completedAt: '2026-07-06T02:00:00Z',
      durationMinutes: 60, result: 'complete', baseXP: 90, finalXP: 120,
      energyCost: 15, energyGain: 0, impactType: 'task', taskNature: 'growth',
      value: 'S', resistance: 1.4, isProductiveXP: true,
      note: '本機備注', _syncPending: true,
    });
    expect(captured.inserts.sessions[0]).toEqual({
      id: 's-1', user_id: 'uid-1', task_id: 't-1', task_name: '深度學習',
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
