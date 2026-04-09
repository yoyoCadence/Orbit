// Data persistence abstraction layer
// Swap LocalStorageProvider for an API provider later without changing callers

const PREFIX = 'yoyo_';

function get(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
function set(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
}

export const storage = {
  // ── User ──────────────────────────────────────────────────────────────────
  getUser:       ()  => get('user'),
  saveUser:      (u) => set('user', u),

  // ── Tasks (new) ───────────────────────────────────────────────────────────
  getTasks:      ()  => get('tasks')    ?? [],
  saveTasks:     (t) => set('tasks', t),

  // ── Sessions (new) ────────────────────────────────────────────────────────
  getSessions:   ()  => get('sessions') ?? [],
  saveSessions:  (s) => set('sessions', s),

  // ── Energy ────────────────────────────────────────────────────────────────
  getEnergy:     ()  => get('energy')   ?? { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' },
  saveEnergy:    (e) => set('energy', e),

  // ── Legacy (kept for migration) ───────────────────────────────────────────
  getGoals:      ()  => get('goals')    ?? [],
  getLogs:       ()  => get('logs')     ?? [],

  // ── Theme / Background (unchanged) ───────────────────────────────────────
  getTheme:      ()  => get('theme') || 'dark-purple',
  saveTheme:     (t) => set('theme', t),
  getBgImage:    ()  => localStorage.getItem(PREFIX + 'bgImage') || null,
  saveBgImage:   (d) => d
    ? localStorage.setItem(PREFIX + 'bgImage', d)
    : localStorage.removeItem(PREFIX + 'bgImage'),

  // ── Nuke everything ───────────────────────────────────────────────────────
  clearAll: () => {
    ['user','tasks','sessions','energy','goals','logs','theme','bgImage']
      .forEach(k => localStorage.removeItem(PREFIX + k));
  },
};

// ─── Migration: v1 (goals/logs) → v2 (tasks/sessions) ────────────────────────
//
// Runs once. Converts old Goal objects to minimal Tasks and old Log objects
// to instant Sessions so history is preserved. Old keys are left in place
// (they don't interfere) but are never written to again.

export function migrateV1toV2(today) {
  // Already migrated?
  if (get('tasks') !== null) return;

  const oldGoals = get('goals') ?? [];
  const oldLogs  = get('logs')  ?? [];

  // Convert goals → tasks (use sensible defaults for new fields)
  const tasks = oldGoals.map(g => ({
    id:                 g.id,
    name:               g.name,
    category:           'instant',
    impactType:         'task',
    taskNature:         'maintenance',
    value:              'B',
    difficulty:         0.4,
    resistance:         1.0,
    emoji:              g.emoji  || '🎯',
    iconImg:            g.iconImg || null,
    minEffectiveMinutes: 0,
    cooldownMinutes:    0,
    dailyXpCap:         100,
    requiresReasonIfS:  false,
    valueConfidence:    100,
    createdAt:          today,
  }));
  set('tasks', tasks);

  // Convert logs → sessions (treat as instant completions)
  const sessions = oldLogs.map(l => {
    const task = tasks.find(t => t.id === l.goalId) || {};
    return {
      id:            l.id,
      taskId:        l.goalId,
      taskName:      l.goalName,
      taskEmoji:     l.goalEmoji  || '🎯',
      taskIconImg:   l.goalIconImg || null,
      date:          l.date,
      startedAt:     l.completedAt,
      completedAt:   l.completedAt,
      durationMinutes: 0,
      result:        'instant',
      baseXP:        l.xp,
      finalXP:       l.xp,
      energyCost:    0,
      energyGain:    0,
      streakMultiplier: 1,
      impactType:    task.impactType  || 'task',
      taskNature:    task.taskNature  || 'maintenance',
      value:         task.value       || 'B',
      resistance:    task.resistance  || 1.0,
      isProductiveXP: true,
    };
  });
  set('sessions', sessions);
}
