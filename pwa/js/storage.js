// Data persistence abstraction layer
// Sync reads/writes → localStorage (always available, used as cache)
// Async background sync → Supabase (when authenticated + online)

import { supabase }  from './supabase.js';
import { today }     from './utils.js';

const PREFIX = 'yoyo_';

function get(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
function set(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
}

// ─── Supabase async operations ────────────────────────────────────────────────

export const db = {

  async _session() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /** Pull all user data from Supabase → write into localStorage cache. */
  async loadFromRemote(userId) {
    const [profileRes, tasksRes, sessionsRes, energyRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('tasks').select('*').eq('user_id', userId).order('created_at'),
      supabase.from('sessions').select('*').eq('user_id', userId)
        .order('completed_at', { ascending: false }),
      supabase.from('energy').select('*').eq('user_id', userId).single(),
    ]);

    if (profileRes.data) {
      const p = profileRes.data;
      set('user', {
        id:                   p.user_id,
        name:                 p.name,
        avatar:               p.avatar_url || null,
        totalXP:              p.total_xp,
        streakDays:           p.streak_days,
        lastStreakDate:       p.last_streak_date  || '',
        lastWeeklyBonusDate:  p.last_weekly_bonus_date || '',
        morningState:         p.morning_state,
        mode:                 p.mode,
        isPublic:             p.is_public       ?? false,
        titleTemplate:        p.title_template  || 'rpg',
        customTitle:          p.custom_title    || '',
        newDayHour:           p.new_day_hour    ?? 5,
        createdAt:            p.created_at,
        isPro:                p.is_pro          ?? false,
        proExpiresAt:         p.pro_expires_at  || null,
        trialStartedAt:       p.trial_started_at || null,
        streakShieldCount:       p.streak_shield_count        ?? 2,
        streakShieldResetMonth:  p.streak_shield_reset_month  || '',
      });
    }

    if (tasksRes.data) {
      set('tasks', tasksRes.data.map(t => ({
        id:                   t.id,
        name:                 t.name,
        category:             t.category,
        impactType:           t.impact_type,
        taskNature:           t.task_nature,
        value:                t.value,
        difficulty:           t.difficulty,
        resistance:           t.resistance,
        emoji:                t.emoji || null,
        dailyXpCap:           t.daily_xp_cap,
        cooldownMinutes:      t.cooldown_minutes,
        minEffectiveMinutes:  t.min_effective_minutes,
        isDefault:            t.is_default,
        reason:               t.reason || null,
        successCriteria:      t.success_criteria || null,
        valueConfidence:      t.value_confidence,
        createdAt:            t.created_at,
      })));
    }

    if (sessionsRes.data) {
      set('sessions', sessionsRes.data.map(s => ({
        id:              s.id,
        taskId:          s.task_id   || null,
        taskName:        s.task_name,
        taskEmoji:       s.task_emoji || null,
        date:            s.date,
        startedAt:       s.started_at,
        completedAt:     s.completed_at,
        durationMinutes: s.duration_minutes,
        result:          s.result,
        baseXP:          s.base_xp,
        finalXP:         s.final_xp,
        energyCost:      s.energy_cost,
        energyGain:      s.energy_gain,
        impactType:      s.impact_type,
        taskNature:      s.task_nature,
        value:           s.value,
        resistance:      s.resistance,
        isProductiveXP:  s.is_productive_xp,
        taskIconImg:     s.task_icon_img    || null,
      })));
    }

    if (energyRes.data) {
      const e = energyRes.data;
      set('energy', {
        currentEnergy: e.current_energy,
        maxEnergy:     e.max_energy,
        lastResetDate: e.last_reset_date || '',
      });
    }
  },

  async upsertProfile(user) {
    const session = await this._session();
    if (!session) return;
    // Skip base64 avatars (too large) — only sync proper Storage URLs
    const avatarUrl = (user.avatar && user.avatar.startsWith('data:'))
      ? null : (user.avatar || null);
    await supabase.from('profiles').upsert({
      user_id:                session.user.id,
      name:                   user.name,
      avatar_url:             avatarUrl,
      total_xp:               user.totalXP              || 0,
      streak_days:            user.streakDays            || 0,
      last_streak_date:       user.lastStreakDate        || null,
      last_weekly_bonus_date: user.lastWeeklyBonusDate   || null,
      morning_state:          user.morningState          || 'normal',
      mode:                   user.mode                  || 'normal',
      is_public:              user.isPublic              ?? false,
      title_template:         user.titleTemplate         || 'rpg',
      custom_title:           user.customTitle           || null,
      new_day_hour:           user.newDayHour            ?? 5,
      is_pro:                 user.isPro                 ?? false,
      pro_expires_at:         user.proExpiresAt          ?? null,
      trial_started_at:       user.trialStartedAt        ?? null,
      streak_shield_count:       user.streakShieldCount       ?? 2,
      streak_shield_reset_month: user.streakShieldResetMonth  || '',
    });
  },

  async upsertTasks(tasks) {
    const session = await this._session();
    if (!session || !tasks.length) return;
    await supabase.from('tasks').upsert(
      tasks.map(t => ({
        id:                    t.id,
        user_id:               session.user.id,
        name:                  t.name,
        category:              t.category,
        impact_type:           t.impactType,
        task_nature:           t.taskNature,
        value:                 t.value,
        difficulty:            t.difficulty,
        resistance:            t.resistance,
        emoji:                 t.emoji                || null,
        daily_xp_cap:          t.dailyXpCap           ?? 100,
        cooldown_minutes:      t.cooldownMinutes       ?? 0,
        min_effective_minutes: t.minEffectiveMinutes   ?? 0,
        is_default:            t.isDefault             ?? false,
        reason:                t.reason               || null,
        success_criteria:      t.successCriteria      || null,
        value_confidence:      t.valueConfidence       ?? 100,
      })),
      { onConflict: 'id' }
    );
  },

  async deleteTasks(ids) {
    const session = await this._session();
    if (!session || !ids.length) return;
    await supabase.from('tasks').delete().in('id', ids);
  },

  async insertSession(session) {
    const authSession = await this._session();
    if (!authSession) return;
    await supabase.from('sessions').insert({
      id:               session.id,
      user_id:          authSession.user.id,
      task_id:          session.taskId        || null,
      task_name:        session.taskName,
      task_emoji:       session.taskEmoji     || null,
      date:             session.date,
      started_at:       session.startedAt,
      completed_at:     session.completedAt,
      duration_minutes: session.durationMinutes,
      result:           session.result,
      base_xp:          session.baseXP,
      final_xp:         session.finalXP,
      energy_cost:      session.energyCost,
      energy_gain:      session.energyGain,
      impact_type:      session.impactType,
      task_nature:      session.taskNature,
      value:            session.value,
      resistance:       session.resistance,
      is_productive_xp: session.isProductiveXP,
    });
  },

  async deleteSession(id) {
    const session = await this._session();
    if (!session) return;
    await supabase.from('sessions').delete().eq('id', id);
  },

  async startTrial(userId) {
    const session = await this._session();
    if (!session) return;
    const now    = new Date().toISOString();
    const expiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('profiles').update({
      is_pro:           true,
      pro_expires_at:   expiry,
      trial_started_at: now,
    }).eq('user_id', userId);
    const user = get('user');
    if (user) {
      user.isPro          = true;
      user.proExpiresAt   = expiry;
      user.trialStartedAt = now;
      set('user', user);
    }
  },

  async upsertEnergy(energy) {
    const session = await this._session();
    if (!session) return;
    await supabase.from('energy').upsert(
      {
        user_id:         session.user.id,
        current_energy:  energy.currentEnergy,
        max_energy:      energy.maxEnergy,
        last_reset_date: energy.lastResetDate || null,
      },
      { onConflict: 'user_id' }
    );
  },
};

// ─── Sync localStorage API (unchanged signatures) ─────────────────────────────

export const storage = {

  // ── User ─────────────────────────────────────────────────────────────────────
  getUser:    ()  => get('user'),
  saveUser:   (u) => { set('user', u); db.upsertProfile(u).catch(console.error); },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  getTasks:   ()  => get('tasks') ?? [],
  saveTasks:  (t) => {
    const prev = get('tasks') ?? [];
    set('tasks', t);
    db.upsertTasks(t).catch(console.error);
    const removedIds = prev.filter(p => !t.find(n => n.id === p.id)).map(p => p.id);
    if (removedIds.length) db.deleteTasks(removedIds).catch(console.error);
  },

  // ── Sessions ─────────────────────────────────────────────────────────────────
  getSessions:  ()  => get('sessions') ?? [],
  saveSessions: (s) => {
    const prev = get('sessions') ?? [];
    set('sessions', s);
    // Only INSERT the newly added sessions (not the whole array)
    s.filter(ns => !prev.find(ps => ps.id === ns.id))
     .forEach(ns => db.insertSession(ns).catch(console.error));
  },

  // ── Energy ───────────────────────────────────────────────────────────────────
  getEnergy:   ()  => get('energy') ?? { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' },
  saveEnergy:  (e) => { set('energy', e); db.upsertEnergy(e).catch(console.error); },

  // ── Legacy (migration read-only) ─────────────────────────────────────────────
  getGoals:   ()  => get('goals') ?? [],
  getLogs:    ()  => get('logs')  ?? [],

  // ── Pro / Trial status ───────────────────────────────────────────────────────
  isProUser: () => {
    const user = get('user');
    if (!user || !user.isPro) return false;
    if (!user.proExpiresAt) return true;            // lifetime Pro
    return new Date(user.proExpiresAt) > new Date();
  },
  getProExpiry: () => get('user')?.proExpiresAt || null,
  isTrialUser: () => {
    const user = get('user');
    if (!user?.trialStartedAt) return false;
    const end = new Date(user.trialStartedAt).getTime() + 15 * 24 * 60 * 60 * 1000;
    return Date.now() < end;
  },
  getTrialDaysRemaining: () => {
    const user = get('user');
    if (!user?.trialStartedAt) return 0;
    const end = new Date(user.trialStartedAt).getTime() + 15 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  },
  getTrialBannerDismissDate:  ()  => get('trialBannerDismiss') || '',
  saveTrialBannerDismissDate: (d) => set('trialBannerDismiss', d),

  // ── Theme / Background (local only) ──────────────────────────────────────────
  getTheme:    ()  => get('theme') || 'dark-purple',
  saveTheme:   (t) => set('theme', t),
  getRandomThemeEnabled: ()  => !!get('randomThemeEnabled'),
  saveRandomThemeEnabled:(v) => set('randomThemeEnabled', !!v),
  getRandomThemeDate:    ()  => get('randomThemeDate') || '',
  saveRandomThemeDate:   (d) => set('randomThemeDate', d),
  getBgImage:  ()  => localStorage.getItem(PREFIX + 'bgImage') || null,
  saveBgImage: (d) => d
    ? localStorage.setItem(PREFIX + 'bgImage', d)
    : localStorage.removeItem(PREFIX + 'bgImage'),

  // ── Daily Plan (local only, resets each day) ─────────────────────────────────
  getDailyPlan: () => {
    const data     = get('dailyPlan');
    const todayStr = today();
    if (!data || data.date !== todayStr) return [];
    return data.taskIds || [];
  },
  saveDailyPlan: (taskIds) => {
    const todayStr = today();
    set('dailyPlan', { date: todayStr, taskIds });
  },

  // ── Clear all local data (on sign-out) ────────────────────────────────────────
  clearAll: () => {
    ['user','tasks','sessions','energy','goals','logs','theme','bgImage','dailyPlan','trialBannerDismiss']
      .forEach(k => localStorage.removeItem(PREFIX + k));
  },
};

// ─── Migration: tag existing default tasks with isDefault:true ───────────────

const _DEFAULT_TASK_NAMES = new Set([
  '高價值深度輸出','深度學習 45 分鐘','運動 30 分鐘','閱讀高品質內容 30 分鐘',
  '例行工作處理','記帳 / 檢查支出','整理環境 10 分鐘','回覆必要訊息 / 行政處理',
  '散步 20 分鐘','午休 / 冥想 / 伸展','追劇 / 看影片 30 分鐘','遊戲 30 分鐘',
  '短影音 / 無目的滑手機 15 分鐘',
]);

export function migrateDefaultFlags() {
  const tasks = get('tasks');
  if (!tasks) return;
  let changed = false;
  tasks.forEach(t => {
    if (t.isDefault === undefined && _DEFAULT_TASK_NAMES.has(t.name)) {
      t.isDefault = true;
      changed = true;
    }
  });
  if (changed) set('tasks', tasks);
}

// ─── Migration: v1 (goals/logs) → v2 (tasks/sessions) ────────────────────────

export function migrateV1toV2(today) {
  if (get('tasks') !== null) return;   // Already migrated

  const oldGoals = get('goals') ?? [];
  const oldLogs  = get('logs')  ?? [];

  const tasks = oldGoals.map(g => ({
    id:                  g.id,
    name:                g.name,
    category:            'instant',
    impactType:          'task',
    taskNature:          'maintenance',
    value:               'B',
    difficulty:          0.4,
    resistance:          1.0,
    emoji:               g.emoji   || '🎯',
    iconImg:             g.iconImg || null,
    minEffectiveMinutes: 0,
    cooldownMinutes:     0,
    dailyXpCap:          100,
    valueConfidence:     100,
    createdAt:           today,
  }));
  set('tasks', tasks);

  const sessions = oldLogs.map(l => {
    const task = tasks.find(t => t.id === l.goalId) || {};
    return {
      id:              l.id,
      taskId:          l.goalId,
      taskName:        l.goalName,
      taskEmoji:       l.goalEmoji || '🎯',
      date:            l.date,
      startedAt:       l.completedAt,
      completedAt:     l.completedAt,
      durationMinutes: 0,
      result:          'instant',
      baseXP:          l.xp,
      finalXP:         l.xp,
      energyCost:      0,
      energyGain:      0,
      impactType:      task.impactType || 'task',
      taskNature:      task.taskNature || 'maintenance',
      value:           task.value      || 'B',
      resistance:      task.resistance || 1.0,
      isProductiveXP:  true,
    };
  });
  set('sessions', sessions);
}
