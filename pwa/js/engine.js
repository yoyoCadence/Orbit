// Core calculation engine — pure functions, no side effects

// ─── Weights ──────────────────────────────────────────────────────────────────

export const VALUE_WEIGHT       = { S: 3.2, A: 2.2, B: 1.2, D: 0 };
// Keys include both '1.0' (string from form) and '1' (String(1.0) when stored as number)
export const DIFFICULTY_WEIGHT  = { '0.4': 0.4, '0.7': 0.7, '1': 1.0, '1.0': 1.0 };
export const RESISTANCE_WEIGHT  = { '1': 1.0, '1.0': 1.0, '1.2': 1.2, '1.4': 1.4 };
export const DIFFICULTY_ENERGY  = { '0.4': 0.6, '0.7': 1.0, '1': 1.4, '1.0': 1.4 };
export const RESISTANCE_ENERGY  = { '1': 1.0, '1.0': 1.0, '1.2': 1.15, '1.4': 1.3 };
export const VALUE_ENERGY_FACTOR = { S: 1.2, A: 1.0, B: 0.8, D: 0 };
export const RESULT_MULTIPLIER  = { complete: 1.0, partial: 0.6, invalid: 0, instant: 1.0 };

// ─── XP ──────────────────────────────────────────────────────────────────────

/** Base XP before result and streak multipliers */
export function calcBaseXP(task) {
  if (task.impactType !== 'task') return 0;
  if (task.value === 'D') return 0;
  const vw = VALUE_WEIGHT[task.value]                  ?? 0;
  const dw = DIFFICULTY_WEIGHT[String(task.difficulty)] ?? 0;
  const rw = RESISTANCE_WEIGHT[String(task.resistance)] ?? 0;
  return Math.round(20 * vw * dw * rw);
}

/** streakMultiplier: 1.00 → 1.12 in 0.02 steps per 5 streak days */
export function calcStreakMultiplier(streakDays) {
  return Math.min(1 + 0.02 * Math.floor((streakDays || 0) / 5), 1.12);
}

/** Final XP after result multiplier + streak bonus */
export function calcFinalXP(baseXP, result, streakDays) {
  return Math.round(baseXP * (RESULT_MULTIPLIER[result] ?? 0) * calcStreakMultiplier(streakDays));
}

// ─── Energy ──────────────────────────────────────────────────────────────────

/** Energy consumed by a task session */
export function calcEnergyCost(task) {
  if (task.impactType !== 'task') return 0;
  if (task.value === 'D') return 0;
  const de  = DIFFICULTY_ENERGY[String(task.difficulty)]  ?? 1;
  const re  = RESISTANCE_ENERGY[String(task.resistance)]  ?? 1;
  const vef = VALUE_ENERGY_FACTOR[task.value]             ?? 0;
  return Math.round(8 * de * re * vef);
}

/**
 * Energy recovered from recovery/entertainment.
 * @param {object} task
 * @param {number} durationMinutes
 * @param {number} totalEntertainmentMinutesBefore  — entertainment already logged today BEFORE this session
 */
export function calcEnergyGain(task, durationMinutes, totalEntertainmentMinutesBefore) {
  if (task.impactType === 'task') return 0;

  let baseRecovery = 0;
  if      (durationMinutes >= 45) baseRecovery = 14;
  else if (durationMinutes >= 30) baseRecovery = 10;
  else if (durationMinutes >= 15) baseRecovery = 6;
  else return 0;

  let quality;
  if (task.impactType === 'recovery') {
    quality = 1.3;
  } else {
    // entertainment
    const isShortForm = /短影音|滑手機|滑社群/.test(task.name);
    quality = isShortForm ? 0.4 : 0.8;
    if ((totalEntertainmentMinutesBefore || 0) > 60) quality *= 0.7;
  }
  return Math.round(baseRecovery * quality);
}

// ─── Daily stats ──────────────────────────────────────────────────────────────

/**
 * Compute daily productivity stats from a sessions array.
 * isEffectiveDay: productiveXP >= 50 AND hasASTask AND entertainmentMinutes <= 120
 */
export function calcDailyStats(sessions, date) {
  const day = sessions.filter(s => s.date === date);

  const productiveXP = day
    .filter(s => s.isProductiveXP)
    .reduce((sum, s) => sum + s.finalXP, 0);

  const hasASTask = day.some(s =>
    s.impactType === 'task' &&
    (s.value === 'A' || s.value === 'S') &&
    s.result !== 'invalid'
  );

  const entertainmentMinutes = day
    .filter(s => s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  return {
    date,
    productiveXP,
    hasASTask,
    entertainmentMinutes,
    isEffectiveDay: productiveXP >= 50 && hasASTask && entertainmentMinutes <= 120,
  };
}

/** Update streak: +1 on effective day, reset to 0 on failure */
export function processStreakForDate(streakDays, isEffectiveDay) {
  return isEffectiveDay
    ? (streakDays || 0) + 1
    : 0;
}

// ─── Level formula ────────────────────────────────────────────────────────────

/**
 * XP required to advance from `level` to `level + 1`.
 *
 * 分段設計（v1.4.1 調整）：
 *   Lv.1–20  （前期）：round((50 + 14×(level-1)) / 2)  — 線性，每級門檻約 25–158 XP
 *   Lv.21+   （後期）：round((330 + 10n + 3n^1.3) / 2)  — n = level-20，幂次加速
 *
 * 舊公式（v1.0.0–v1.4.0）：round(120 + 45×(level-1) + 10×(level-1)^1.35)
 */
export function xpRequired(level) {
  if (level <= 20) {
    return Math.round((50 + 14 * (level - 1)) / 2);
  }
  const n = level - 20;
  return Math.round((330 + 10 * n + 3 * Math.pow(n, 1.3)) / 2);
}

/** Derive current level + progress from totalXP */
export function getLevelInfo(totalXP) {
  let level = 1;
  let remaining = Math.max(0, totalXP || 0);
  while (remaining >= xpRequired(level)) {
    remaining -= xpRequired(level);
    level++;
  }
  const needed = xpRequired(level);
  return {
    level,
    currentXP: remaining,
    needed,
    percent: Math.round((remaining / needed) * 100),
    totalXP: totalXP || 0,
  };
}

// ─── Anti-grind helpers ───────────────────────────────────────────────────────

/** Total productive XP logged for a task today */
export function getDailyTaskXP(sessions, taskId, date) {
  return sessions
    .filter(s => s.taskId === taskId && s.date === date && s.isProductiveXP)
    .reduce((sum, s) => sum + s.finalXP, 0);
}

/** Count of non-invalid completions of a task today */
export function getDailyTaskCount(sessions, taskId, date) {
  return sessions.filter(
    s => s.taskId === taskId && s.date === date && s.result !== 'invalid'
  ).length;
}

// ─── Value confidence ────────────────────────────────────────────────────────

/**
 * Calculate a task's value confidence score (0-100).
 * High score = trustworthy label; low = needs calibration.
 */
export function calcValueConfidence(task, allSessions) {
  let score = 100;
  const ts = allSessions.filter(s => s.taskId === task.id);

  const avgDur = ts.length
    ? ts.reduce((s, x) => s + (x.durationMinutes || 0), 0) / ts.length
    : 0;

  const sevenDaysAgo    = Date.now() - 7  * 86400000;
  const fourteenDaysAgo = Date.now() - 14 * 86400000;

  const weeklyCount  = ts.filter(s => new Date(s.completedAt).getTime() >= sevenDaysAgo).length;
  const recentSuccess = ts.filter(
    s => s.result === 'complete' && new Date(s.completedAt).getTime() >= fourteenDaysAgo
  );

  // Deductions
  if (avgDur > 0 && avgDur < 10)                                score -= 20;
  if (weeklyCount > 10)                                          score -= 20;
  if (task.value === 'S' && recentSuccess.length === 0 && ts.length > 0) score -= 20;
  if (task.taskNature !== 'growth' && task.value === 'S')        score -= 20;

  // Additions
  if (task.successCriteria)     score += 10;
  if (task.resistance >= 1.2)   score += 5;
  if (avgDur >= 25)             score += 10;

  return Math.max(0, Math.min(100, score));
}

/** Minimum effective minutes for a focus session based on difficulty */
export function getMinEffectiveMinutes(difficulty) {
  if (difficulty <= 0.4) return 5;
  if (difficulty <= 0.7) return 15;
  return 25;
}

export function calcTimeMultiplier(durationMin, minEffectiveMin) {
  if (!durationMin || durationMin <= 0 || !minEffectiveMin) return 1;
  return Math.min(durationMin / minEffectiveMin, 4);
}

// ─── Advanced dashboard analytics ────────────────────────────────────────────

/**
 * XP earned by local-time bucket (derived from completedAt).
 * morning: 6–12, afternoon: 12–18, evening: 18–24, night: 0–6
 */
export function calcHourDistribution(sessions) {
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const s of sessions) {
    if (!s.isProductiveXP || !s.finalXP || !s.completedAt) continue;
    const h = new Date(s.completedAt).getHours();
    if      (h >= 6  && h < 12) buckets.morning   += s.finalXP;
    else if (h >= 12 && h < 18) buckets.afternoon += s.finalXP;
    else if (h >= 18)           buckets.evening   += s.finalXP;
    else                        buckets.night     += s.finalXP;
  }
  return buckets;
}

/**
 * Predict the next streak milestone and estimated calendar days to reach it.
 * @param {number} streakDays   current streak
 * @param {Session[]} sessions
 * @param {string} todayStr     'YYYY-MM-DD' (effectiveToday)
 * @returns {{ next: number|null, daysNeeded: number, rate: number }}
 */
export function calcStreakMilestone(streakDays, sessions, todayStr) {
  const MILESTONES = [7, 14, 30, 60, 100, 200, 365];
  const next = MILESTONES.find(m => m > (streakDays || 0)) ?? null;

  // Effective-day rate over last 30 calendar days
  const today = new Date(todayStr + 'T00:00:00');
  let effectiveDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toLocaleDateString('sv');
    if (calcDailyStats(sessions, ds).isEffectiveDay) effectiveDays++;
  }
  const rate = Math.max(effectiveDays / 30, 0.01);

  if (next === null) return { next: null, daysNeeded: 0, rate };
  return { next, daysNeeded: Math.ceil((next - (streakDays || 0)) / rate), rate };
}

// ─── Task ordering ────────────────────────────────────────────────────────────

/**
 * Reorder tasks by moving the task with `fromId` to the position of `toId`.
 * Returns a new array; does not mutate the original.
 * If either id is missing, returns a shallow copy of the original.
 */
export function reorderTasks(tasks, fromId, toId) {
  if (fromId === toId) return [...tasks];
  const fromIdx = tasks.findIndex(t => t.id === fromId);
  const toIdx   = tasks.findIndex(t => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return [...tasks];
  const result = [...tasks];
  const [moved] = result.splice(fromIdx, 1);
  result.splice(toIdx, 0, moved);
  return result;
}
