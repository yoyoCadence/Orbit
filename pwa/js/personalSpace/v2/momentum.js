import { calcDailyStats } from '../../engine.js';

export const MOMENTUM_STATES = Object.freeze({
  LOW: 'low',
  STABLE: 'stable',
  STRONG: 'strong',
  PEAK: 'peak',
});

export const MOMENTUM_WINDOW_DAYS = 7;

/** Map an effective-day count to the bounded Personal Space atmosphere state. */
export function getMomentumState(effectiveDays) {
  const count = Number.isFinite(effectiveDays)
    ? Math.max(0, Math.min(MOMENTUM_WINDOW_DAYS, Math.floor(effectiveDays)))
    : 0;

  if (count === MOMENTUM_WINDOW_DAYS) return MOMENTUM_STATES.PEAK;
  if (count >= 5) return MOMENTUM_STATES.STRONG;
  if (count >= 3) return MOMENTUM_STATES.STABLE;
  return MOMENTUM_STATES.LOW;
}

/** Return the newest unique persisted Session dates without mutating Sessions. */
export function getLatestSessionDates(sessions, limit = MOMENTUM_WINDOW_DAYS) {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : MOMENTUM_WINDOW_DAYS;
  return [...new Set(
    (Array.isArray(sessions) ? sessions : [])
      .map(session => typeof session?.date === 'string' ? session.date.trim() : '')
      .filter(Boolean)
  )]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, safeLimit);
}

/**
 * Derive Momentum from the latest seven unique Session dates. Effective-day
 * meaning remains owned by engine.calcDailyStats().
 */
export function deriveMomentum(sessions, { limit = MOMENTUM_WINDOW_DAYS } = {}) {
  const source = Array.isArray(sessions) ? sessions : [];
  const windowSize = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : MOMENTUM_WINDOW_DAYS;
  const dates = getLatestSessionDates(source, windowSize);
  const dailyStats = dates.map(date => calcDailyStats(source, date));
  const effectiveDays = dailyStats.filter(stats => stats.isEffectiveDay).length;

  const result = {
    state: getMomentumState(effectiveDays),
    effectiveDays,
    observedDays: dates.length,
    windowSize,
    dates: Object.freeze([...dates]),
    dailyStats: Object.freeze(dailyStats.map(stats => Object.freeze({ ...stats }))),
  };

  return Object.freeze(result);
}
