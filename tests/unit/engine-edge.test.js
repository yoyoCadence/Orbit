/**
 * engine-edge.test.js
 *
 * 補充 engine.js 核心函數的邊界輸入測試：
 * null / undefined / 缺欄位 / 字串型別傳入等非正常輸入。
 * 正常路徑已在 engine.test.js 覆蓋，此檔聚焦於防護性行為。
 */

import { describe, it, expect } from 'vitest';
import {
  calcBaseXP,
  calcFinalXP,
  calcEnergyCost,
  calcEnergyGain,
  calcDailyStats,
  calcStreakMultiplier,
  processStreakForDate,
} from '../../pwa/js/engine.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const DATE = '2026-04-16';

function makeSession(overrides = {}) {
  return {
    id:              's-1',
    taskId:          'task-1',
    date:            DATE,
    completedAt:     DATE + 'T10:00:00Z',
    result:          'complete',
    finalXP:         60,
    durationMinutes: 30,
    impactType:      'task',
    value:           'A',
    isProductiveXP:  true,
    ...overrides,
  };
}

// ─── calcBaseXP — undefined / missing fields ──────────────────────────────────

describe('calcBaseXP — undefined inputs', () => {
  it('difficulty=undefined → DIFFICULTY_WEIGHT miss → 0', () => {
    expect(calcBaseXP({ impactType: 'task', value: 'A', difficulty: undefined, resistance: 1.2 })).toBe(0);
  });

  it('resistance=undefined → RESISTANCE_WEIGHT miss → 0', () => {
    expect(calcBaseXP({ impactType: 'task', value: 'A', difficulty: 0.7, resistance: undefined })).toBe(0);
  });

  it('value=undefined → VALUE_WEIGHT miss → 0', () => {
    expect(calcBaseXP({ impactType: 'task', value: undefined, difficulty: 0.7, resistance: 1.2 })).toBe(0);
  });

  it('impactType=undefined (not "task") → 0', () => {
    expect(calcBaseXP({ impactType: undefined, value: 'A', difficulty: 0.7, resistance: 1.2 })).toBe(0);
  });
});

// ─── calcFinalXP — unknown result ────────────────────────────────────────────

describe('calcFinalXP — unknown result', () => {
  it('unsupported result string → treated as 0 multiplier', () => {
    // RESULT_MULTIPLIER['foo'] = undefined → ?? 0 → 0
    expect(calcFinalXP(40, 'foo', 0)).toBe(0);
  });

  it('result=undefined → 0', () => {
    expect(calcFinalXP(40, undefined, 0)).toBe(0);
  });
});

// ─── calcEnergyCost — undefined value ────────────────────────────────────────

describe('calcEnergyCost — undefined value', () => {
  it('value=undefined → VALUE_ENERGY_FACTOR miss → 0', () => {
    // VALUE_ENERGY_FACTOR[undefined] = undefined → ?? 0 → cost=0
    expect(calcEnergyCost({ impactType: 'task', value: undefined, difficulty: 0.7, resistance: 1.2 })).toBe(0);
  });
});

// ─── calcStreakMultiplier — string input ──────────────────────────────────────

describe('calcStreakMultiplier — string input', () => {
  it('"10" (string) coerced by JS arithmetic → 1.04', () => {
    // ("10" || 0) = "10", "10" / 5 = 2, Math.floor(2) = 2 → 1 + 0.02*2 = 1.04
    expect(calcStreakMultiplier('10')).toBe(1.04);
  });

  it('"0" (string) → 1.00', () => {
    expect(calcStreakMultiplier('0')).toBe(1.00);
  });
});

// ─── calcEnergyGain — edge inputs ────────────────────────────────────────────

describe('calcEnergyGain — edge inputs', () => {
  const shortFormTask = { impactType: 'entertainment', value: 'D', name: '短影音 / 無目的滑手機 15 分鐘' };
  const entTask       = { impactType: 'entertainment', value: 'D', name: '追劇 / 看影片 30 分鐘' };
  const recoveryTask  = { impactType: 'recovery',      value: 'D', name: '散步' };

  it('durationMinutes=0 → below 15 threshold → 0', () => {
    expect(calcEnergyGain(entTask, 0, 0)).toBe(0);
  });

  it('durationMinutes=14 → still below 15 threshold → 0', () => {
    expect(calcEnergyGain(entTask, 14, 0)).toBe(0);
  });

  it('short-form + totalBefore=61 → double penalty: quality=0.4×0.7=0.28, 30min base=10 → round(2.8)=3', () => {
    expect(calcEnergyGain(shortFormTask, 30, 61)).toBe(3);
  });

  it('short-form 15 min fresh → base=6, quality=0.4 → round(2.4)=2', () => {
    expect(calcEnergyGain(shortFormTask, 15, 0)).toBe(2);
  });

  it('recovery 15 min, totalBefore ignored → base=6, quality=1.3 → round(7.8)=8', () => {
    expect(calcEnergyGain(recoveryTask, 15, 200)).toBe(8); // totalBefore has no effect on recovery
  });
});

// ─── calcDailyStats — missing / undefined session fields ─────────────────────

describe('calcDailyStats — missing session fields', () => {
  it('session with isProductiveXP=undefined → filter skips it, productiveXP=0, no crash', () => {
    const sessions = [makeSession({ isProductiveXP: undefined, finalXP: 100 })];
    const stats = calcDailyStats(sessions, DATE);
    expect(stats.productiveXP).toBe(0);
    expect(stats.isEffectiveDay).toBe(false);
  });

  it('entertainment session with durationMinutes=undefined → (undefined || 0) = 0', () => {
    const sessions = [makeSession({
      impactType: 'entertainment', value: 'D', isProductiveXP: false,
      finalXP: 0, durationMinutes: undefined,
    })];
    const stats = calcDailyStats(sessions, DATE);
    expect(stats.entertainmentMinutes).toBe(0);
  });

  it('entertainmentMinutes=120 exactly + XP≥50 + A task → isEffectiveDay=true (boundary inclusive)', () => {
    const sessions = [
      makeSession({ finalXP: 60, value: 'A', isProductiveXP: true }),
      makeSession({ impactType: 'entertainment', value: 'D', isProductiveXP: false, finalXP: 0, durationMinutes: 120 }),
    ];
    const stats = calcDailyStats(sessions, DATE);
    expect(stats.entertainmentMinutes).toBe(120);
    expect(stats.isEffectiveDay).toBe(true);
  });

  it('entertainmentMinutes=121 + XP≥50 + A task → isEffectiveDay=false (just over boundary)', () => {
    const sessions = [
      makeSession({ finalXP: 60, value: 'A', isProductiveXP: true }),
      makeSession({ impactType: 'entertainment', value: 'D', isProductiveXP: false, finalXP: 0, durationMinutes: 121 }),
    ];
    const stats = calcDailyStats(sessions, DATE);
    expect(stats.entertainmentMinutes).toBe(121);
    expect(stats.isEffectiveDay).toBe(false);
  });

  it('S task + result=partial (non-invalid) → hasASTask=true', () => {
    const sessions = [makeSession({ value: 'S', result: 'partial', isProductiveXP: true, finalXP: 60 })];
    expect(calcDailyStats(sessions, DATE).hasASTask).toBe(true);
  });

  it('productiveXP=50 exactly + hasASTask + entertainment=0 → isEffectiveDay=true', () => {
    const sessions = [makeSession({ finalXP: 50, value: 'A', isProductiveXP: true })];
    const stats = calcDailyStats(sessions, DATE);
    expect(stats.productiveXP).toBe(50);
    expect(stats.isEffectiveDay).toBe(true);
  });

  it('productiveXP=49 + hasASTask → isEffectiveDay=false (just under threshold)', () => {
    const sessions = [makeSession({ finalXP: 49, value: 'A', isProductiveXP: true })];
    expect(calcDailyStats(sessions, DATE).isEffectiveDay).toBe(false);
  });
});

// ─── processStreakForDate — null / undefined streakDays ───────────────────────

describe('processStreakForDate — null / undefined streakDays', () => {
  it('undefined streakDays + isEffectiveDay=true → (undefined || 0) + 1 = 1', () => {
    expect(processStreakForDate(undefined, true)).toBe(1);
  });

  it('null streakDays + isEffectiveDay=true → 1', () => {
    expect(processStreakForDate(null, true)).toBe(1);
  });

  it('undefined streakDays + isEffectiveDay=false → 0', () => {
    expect(processStreakForDate(undefined, false)).toBe(0);
  });

  it('null streakDays + isEffectiveDay=false → 0', () => {
    expect(processStreakForDate(null, false)).toBe(0);
  });
});
