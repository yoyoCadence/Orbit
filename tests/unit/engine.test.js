/**
 * engine.test.js
 *
 * 測試核心計算引擎的所有純函數。
 * 這是整個系統最高商業風險的部分——公式錯誤會讓所有 XP / Energy 值失真。
 */

import { describe, it, expect } from 'vitest';
import {
  calcBaseXP,
  calcFinalXP,
  calcStreakMultiplier,
  calcEnergyCost,
  calcEnergyGain,
  calcDailyStats,
  processStreakForDate,
  getLevelInfo,
  xpRequired,
  getDailyTaskXP,
  getDailyTaskCount,
  calcValueConfidence,
  getMinEffectiveMinutes,
} from '../../pwa/js/engine.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const makeTask = (overrides = {}) => ({
  impactType: 'task',
  value: 'A',
  difficulty: 0.7,
  resistance: 1.2,
  taskNature: 'growth',
  name: '測試任務',
  successCriteria: null,
  ...overrides,
});

const makeSession = (overrides = {}) => ({
  id: 'sess-1',
  taskId: 'task-1',
  date: '2026-04-10',
  completedAt: '2026-04-10T10:00:00Z',
  result: 'complete',
  finalXP: 40,
  durationMinutes: 30,
  impactType: 'task',
  value: 'A',
  isProductiveXP: true,
  ...overrides,
});

// ─── calcBaseXP ───────────────────────────────────────────────────────────────

describe('calcBaseXP', () => {
  it('A / 中難度 / 中抵抗 = 37', () => {
    // 20 × 2.2 × 0.7 × 1.2 = 36.96 → round = 37
    expect(calcBaseXP(makeTask())).toBe(37);
  });

  it('S / 高難度 / 高抵抗 = 179', () => {
    // 20 × 3.2 × 1.0 × 1.4 = 89.6 → round = 90 ... wait
    // 20 × 3.2 × 1.0 × 1.4 = 89.6 → 90
    const task = makeTask({ value: 'S', difficulty: 1.0, resistance: 1.4 });
    expect(calcBaseXP(task)).toBe(90);
  });

  it('B / 低難度 / 低抵抗 = 10', () => {
    // 20 × 1.2 × 0.4 × 1.0 = 9.6 → 10
    expect(calcBaseXP(makeTask({ value: 'B', difficulty: 0.4, resistance: 1.0 }))).toBe(10);
  });

  it('D value → 0 XP', () => {
    expect(calcBaseXP(makeTask({ value: 'D' }))).toBe(0);
  });

  it('recovery impactType → 0 XP', () => {
    expect(calcBaseXP(makeTask({ impactType: 'recovery', value: 'A' }))).toBe(0);
  });

  it('entertainment impactType → 0 XP', () => {
    expect(calcBaseXP(makeTask({ impactType: 'entertainment', value: 'A' }))).toBe(0);
  });
});

// ─── calcStreakMultiplier ─────────────────────────────────────────────────────

describe('calcStreakMultiplier', () => {
  it('streak 0 → 1.00', () => expect(calcStreakMultiplier(0)).toBe(1.00));
  it('streak 4 → 1.00', () => expect(calcStreakMultiplier(4)).toBe(1.00));
  it('streak 5 → 1.02', () => expect(calcStreakMultiplier(5)).toBe(1.02));
  it('streak 10 → 1.04', () => expect(calcStreakMultiplier(10)).toBe(1.04));
  it('streak 30 → 1.12 (capped)', () => expect(calcStreakMultiplier(30)).toBe(1.12));
  it('streak 100 → 1.12 (still capped)', () => expect(calcStreakMultiplier(100)).toBe(1.12));
  it('null/undefined → 1.00', () => expect(calcStreakMultiplier(null)).toBe(1.00));
});

// ─── calcFinalXP ─────────────────────────────────────────────────────────────

describe('calcFinalXP', () => {
  it('complete result, no streak → base × 1.0', () => {
    expect(calcFinalXP(40, 'complete', 0)).toBe(40);
  });

  it('partial result → base × 0.6', () => {
    // 40 × 0.6 × 1.0 = 24
    expect(calcFinalXP(40, 'partial', 0)).toBe(24);
  });

  it('invalid result → 0', () => {
    expect(calcFinalXP(40, 'invalid', 0)).toBe(0);
  });

  it('instant result → base × 1.0', () => {
    expect(calcFinalXP(40, 'instant', 0)).toBe(40);
  });

  it('streak 5 adds 2% bonus', () => {
    // 40 × 1.0 × 1.02 = 40.8 → 41
    expect(calcFinalXP(40, 'complete', 5)).toBe(41);
  });

  it('streak 30 → max 12% bonus', () => {
    // 40 × 1.0 × 1.12 = 44.8 → 45
    expect(calcFinalXP(40, 'complete', 30)).toBe(45);
  });

  it('base 0 always returns 0', () => {
    expect(calcFinalXP(0, 'complete', 100)).toBe(0);
  });
});

// ─── calcEnergyCost ───────────────────────────────────────────────────────────

describe('calcEnergyCost', () => {
  it('A / 中難度 / 中抵抗 = 9', () => {
    // 8 × 1.0 × 1.15 × 1.0 = 9.2 → 9
    expect(calcEnergyCost(makeTask())).toBe(9);
  });

  it('S / 高難度 / 高抵抗 = 17', () => {
    // 8 × 1.4 × 1.3 × 1.2 = 17.472 → 17
    const task = makeTask({ value: 'S', difficulty: 1.0, resistance: 1.4 });
    expect(calcEnergyCost(task)).toBe(17);
  });

  it('D value → 0 energy cost', () => {
    expect(calcEnergyCost(makeTask({ value: 'D' }))).toBe(0);
  });

  it('recovery task → 0 energy cost', () => {
    expect(calcEnergyCost(makeTask({ impactType: 'recovery' }))).toBe(0);
  });

  it('entertainment task → 0 energy cost', () => {
    expect(calcEnergyCost(makeTask({ impactType: 'entertainment' }))).toBe(0);
  });
});

// ─── calcEnergyGain ───────────────────────────────────────────────────────────

describe('calcEnergyGain', () => {
  const recoveryTask = makeTask({ impactType: 'recovery', value: 'D', name: '散步' });
  const entTask      = makeTask({ impactType: 'entertainment', value: 'D', name: '追劇' });
  const shortFormTask = makeTask({ impactType: 'entertainment', value: 'D', name: '短影音' });

  it('task impactType → 0 gain', () => {
    expect(calcEnergyGain(makeTask(), 30, 0)).toBe(0);
  });

  it('duration < 15 min → 0', () => {
    expect(calcEnergyGain(recoveryTask, 14, 0)).toBe(0);
  });

  it('recovery 15 min → round(6 × 1.3) = 8', () => {
    expect(calcEnergyGain(recoveryTask, 15, 0)).toBe(8);
  });

  it('recovery 30 min → round(10 × 1.3) = 13', () => {
    expect(calcEnergyGain(recoveryTask, 30, 0)).toBe(13);
  });

  it('recovery 45 min → round(14 × 1.3) = 18', () => {
    expect(calcEnergyGain(recoveryTask, 45, 0)).toBe(18);
  });

  it('entertainment 30 min, fresh → round(10 × 0.8) = 8', () => {
    expect(calcEnergyGain(entTask, 30, 0)).toBe(8);
  });

  it('entertainment after 60 min already → quality penalty ×0.7', () => {
    // round(10 × 0.8 × 0.7) = round(5.6) = 6
    expect(calcEnergyGain(entTask, 30, 61)).toBe(6);
  });

  it('short-form (短影音) has quality 0.4', () => {
    // round(10 × 0.4) = 4
    expect(calcEnergyGain(shortFormTask, 30, 0)).toBe(4);
  });
});

// ─── calcDailyStats ───────────────────────────────────────────────────────────

describe('calcDailyStats', () => {
  const date = '2026-04-10';

  it('empty sessions → not effective day', () => {
    const stats = calcDailyStats([], date);
    expect(stats.isEffectiveDay).toBe(false);
    expect(stats.productiveXP).toBe(0);
    expect(stats.hasASTask).toBe(false);
    expect(stats.entertainmentMinutes).toBe(0);
  });

  it('effective day: productiveXP ≥ 50, has A/S, entertainment ≤ 120', () => {
    const sessions = [
      makeSession({ finalXP: 60, value: 'A', isProductiveXP: true }),
    ];
    const stats = calcDailyStats(sessions, date);
    expect(stats.productiveXP).toBe(60);
    expect(stats.hasASTask).toBe(true);
    expect(stats.entertainmentMinutes).toBe(0);
    expect(stats.isEffectiveDay).toBe(true);
  });

  it('not effective: productiveXP < 50', () => {
    const sessions = [
      makeSession({ finalXP: 30, value: 'A', isProductiveXP: true }),
    ];
    expect(calcDailyStats(sessions, date).isEffectiveDay).toBe(false);
  });

  it('not effective: no A/S task', () => {
    const sessions = [
      makeSession({ finalXP: 80, value: 'B', isProductiveXP: true }),
    ];
    expect(calcDailyStats(sessions, date).isEffectiveDay).toBe(false);
  });

  it('not effective: entertainment > 120 min', () => {
    const sessions = [
      makeSession({ finalXP: 60, value: 'A', isProductiveXP: true }),
      makeSession({
        impactType: 'entertainment', value: 'D',
        isProductiveXP: false, finalXP: 0,
        durationMinutes: 130,
      }),
    ];
    const stats = calcDailyStats(sessions, date);
    expect(stats.entertainmentMinutes).toBe(130);
    expect(stats.isEffectiveDay).toBe(false);
  });

  it('invalid A/S result does NOT count as hasASTask', () => {
    const sessions = [
      makeSession({ finalXP: 60, value: 'A', result: 'invalid', isProductiveXP: true }),
    ];
    expect(calcDailyStats(sessions, date).hasASTask).toBe(false);
  });

  it('only counts sessions for the given date', () => {
    const sessions = [
      makeSession({ date: '2026-04-09', finalXP: 60, value: 'A', isProductiveXP: true }),
    ];
    const stats = calcDailyStats(sessions, date);
    expect(stats.productiveXP).toBe(0);
    expect(stats.isEffectiveDay).toBe(false);
  });
});

// ─── processStreakForDate ─────────────────────────────────────────────────────

describe('processStreakForDate', () => {
  it('effective day → streak + 1', () => {
    expect(processStreakForDate(5, true)).toBe(6);
  });

  it('ineffective day → streak resets to 0', () => {
    expect(processStreakForDate(5, false)).toBe(0);
    expect(processStreakForDate(30, false)).toBe(0);
  });

  it('streak already 0, ineffective → still 0', () => {
    expect(processStreakForDate(0, false)).toBe(0);
  });

  it('streak 0, effective → 1', () => {
    expect(processStreakForDate(0, true)).toBe(1);
  });
});

// ─── xpRequired ──────────────────────────────────────────────────────────────

describe('xpRequired', () => {
  it('level 1 requires 120 XP', () => {
    expect(xpRequired(1)).toBe(120);
  });

  it('level 2 > level 1 (progression increases)', () => {
    expect(xpRequired(2)).toBeGreaterThan(xpRequired(1));
  });

  it('level 10 > level 5 (non-linear growth)', () => {
    expect(xpRequired(10)).toBeGreaterThan(xpRequired(5));
  });

  it('returns positive integer', () => {
    for (let i = 1; i <= 20; i++) {
      expect(xpRequired(i)).toBeGreaterThan(0);
      expect(Number.isInteger(xpRequired(i))).toBe(true);
    }
  });
});

// ─── getLevelInfo ─────────────────────────────────────────────────────────────

describe('getLevelInfo', () => {
  it('0 XP → level 1, 0 currentXP', () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.currentXP).toBe(0);
    expect(info.percent).toBe(0);
  });

  it('exactly xpRequired(1) XP → level 2', () => {
    const info = getLevelInfo(xpRequired(1));
    expect(info.level).toBe(2);
    expect(info.currentXP).toBe(0);
  });

  it('percent is between 0 and 100', () => {
    const info = getLevelInfo(500);
    expect(info.percent).toBeGreaterThanOrEqual(0);
    expect(info.percent).toBeLessThanOrEqual(100);
  });

  it('negative XP → level 1', () => {
    const info = getLevelInfo(-100);
    expect(info.level).toBe(1);
  });

  it('totalXP preserved in result', () => {
    expect(getLevelInfo(300).totalXP).toBe(300);
  });
});

// ─── getDailyTaskXP ───────────────────────────────────────────────────────────

describe('getDailyTaskXP', () => {
  const date = '2026-04-10';

  it('sums productive XP for a task on a given date', () => {
    const sessions = [
      makeSession({ taskId: 'task-1', date, finalXP: 30, isProductiveXP: true }),
      makeSession({ taskId: 'task-1', date, finalXP: 20, isProductiveXP: true }),
    ];
    expect(getDailyTaskXP(sessions, 'task-1', date)).toBe(50);
  });

  it('ignores non-productive XP sessions', () => {
    const sessions = [
      makeSession({ taskId: 'task-1', date, finalXP: 30, isProductiveXP: true }),
      makeSession({ taskId: 'task-1', date, finalXP: 20, isProductiveXP: false }),
    ];
    expect(getDailyTaskXP(sessions, 'task-1', date)).toBe(30);
  });

  it('ignores different taskId', () => {
    const sessions = [
      makeSession({ taskId: 'task-2', date, finalXP: 50, isProductiveXP: true }),
    ];
    expect(getDailyTaskXP(sessions, 'task-1', date)).toBe(0);
  });

  it('ignores different date', () => {
    const sessions = [
      makeSession({ taskId: 'task-1', date: '2026-04-09', finalXP: 50, isProductiveXP: true }),
    ];
    expect(getDailyTaskXP(sessions, 'task-1', date)).toBe(0);
  });
});

// ─── getDailyTaskCount ────────────────────────────────────────────────────────

describe('getDailyTaskCount', () => {
  const date = '2026-04-10';

  it('counts non-invalid completions', () => {
    const sessions = [
      makeSession({ taskId: 'task-1', date, result: 'complete' }),
      makeSession({ taskId: 'task-1', date, result: 'partial' }),
      makeSession({ taskId: 'task-1', date, result: 'instant' }),
    ];
    expect(getDailyTaskCount(sessions, 'task-1', date)).toBe(3);
  });

  it('does not count invalid results', () => {
    const sessions = [
      makeSession({ taskId: 'task-1', date, result: 'complete' }),
      makeSession({ taskId: 'task-1', date, result: 'invalid' }),
    ];
    expect(getDailyTaskCount(sessions, 'task-1', date)).toBe(1);
  });

  it('returns 0 when no sessions', () => {
    expect(getDailyTaskCount([], 'task-1', date)).toBe(0);
  });
});

// ─── getMinEffectiveMinutes ───────────────────────────────────────────────────

describe('getMinEffectiveMinutes', () => {
  it('difficulty 0.4 → 5 min', () => expect(getMinEffectiveMinutes(0.4)).toBe(5));
  it('difficulty 0.7 → 15 min', () => expect(getMinEffectiveMinutes(0.7)).toBe(15));
  it('difficulty 1.0 → 25 min', () => expect(getMinEffectiveMinutes(1.0)).toBe(25));
});

// ─── calcValueConfidence ──────────────────────────────────────────────────────

describe('calcValueConfidence', () => {
  it('new task with no sessions → 100', () => {
    expect(calcValueConfidence(makeTask(), [])).toBe(100);
  });

  it('task with successCriteria → capped at 100', () => {
    // 100 + 10 bonus = 110, but Math.min(100, score) clamps to 100
    const task = makeTask({ id: 'task-1', successCriteria: '完成交付' });
    const score = calcValueConfidence(task, []);
    expect(score).toBe(100);
  });

  it('S task with no recent completions → -20 deduction', () => {
    const task = makeTask({ id: 'task-1', value: 'S', taskNature: 'growth' });
    const oldSession = makeSession({
      taskId: 'task-1',
      result: 'complete',
      completedAt: '2020-01-01T10:00:00Z', // very old
    });
    const score = calcValueConfidence(task, [oldSession]);
    expect(score).toBeLessThan(100);
  });

  it('S task with non-growth nature → -20', () => {
    const task = makeTask({ id: 'task-1', value: 'S', taskNature: 'maintenance' });
    const score = calcValueConfidence(task, []);
    expect(score).toBeLessThan(100);
  });

  it('score is always between 0 and 100', () => {
    const task = makeTask({ id: 'task-1', value: 'S', taskNature: 'maintenance' });
    const score = calcValueConfidence(task, []);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
