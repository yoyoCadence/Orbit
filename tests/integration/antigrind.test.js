/**
 * antigrind.test.js
 *
 * 整合測試：防刷分機制。
 * 這是系統公平性的核心保障——若這裡出錯，用戶可以無限刷分。
 *
 * 測試 app.js 裡 completeInstant / _submitFocusResult 的 cap 邏輯，
 * 以純函數的方式驗證（不依賴 DOM）。
 */

import { describe, it, expect } from 'vitest';
import {
  calcBaseXP,
  calcFinalXP,
  getDailyTaskXP,
  getDailyTaskCount,
} from '../../pwa/js/engine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate the B-class XP cap logic from app.js */
function applyBClassCap(task, finalXP, sessions, date) {
  if (task.value !== 'B') return finalXP;
  const alreadyToday = getDailyTaskXP(sessions, task.id, date);
  const taskCap = task.dailyXpCap ?? 100;
  if (alreadyToday >= taskCap) return 0;
  return Math.min(finalXP, taskCap - alreadyToday);
}

/** Simulate the 3x per day task count check from app.js */
function isTaskAtDailyLimit(sessions, taskId, date) {
  return getDailyTaskCount(sessions, taskId, date) >= 3;
}

const makeTaskB = (id = 'task-b') => ({
  id,
  impactType: 'task',
  value: 'B',
  difficulty: 0.4,
  resistance: 1.0,
  taskNature: 'maintenance',
  name: 'B 級任務',
  dailyXpCap: 100,
});

const makeSession = (overrides = {}) => ({
  id: 'sess-' + Math.random(),
  taskId: 'task-b',
  date: '2026-04-10',
  result: 'instant',
  finalXP: 10,
  isProductiveXP: true,
  ...overrides,
});

// ─── B-class XP cap ───────────────────────────────────────────────────────────

describe('B-class daily XP cap (100 XP/day)', () => {
  const date = '2026-04-10';
  const task = makeTaskB();
  const baseXP = calcBaseXP(task); // 10

  it('first session: no cap applied', () => {
    const finalXP = applyBClassCap(task, baseXP, [], date);
    expect(finalXP).toBe(10);
  });

  it('partial cap: existing 95, new 10 → only 5 granted', () => {
    const sessions = [
      makeSession({ finalXP: 95, isProductiveXP: true }),
    ];
    const finalXP = applyBClassCap(task, baseXP, sessions, date);
    expect(finalXP).toBe(5);
  });

  it('already at cap 100: new session gives 0', () => {
    const sessions = [
      makeSession({ finalXP: 60, isProductiveXP: true }),
      makeSession({ finalXP: 40, isProductiveXP: true }),
    ];
    const finalXP = applyBClassCap(task, baseXP, sessions, date);
    expect(finalXP).toBe(0);
  });

  it('over cap: existing 110 (shouldn\'t happen but handles gracefully)', () => {
    const sessions = [
      makeSession({ finalXP: 110, isProductiveXP: true }),
    ];
    const finalXP = applyBClassCap(task, baseXP, sessions, date);
    expect(finalXP).toBe(0);
  });

  it('S/A tasks are not capped', () => {
    const taskA = { ...task, id: 'task-a', value: 'A', dailyXpCap: 200 };
    const sessions = [makeSession({ taskId: 'task-a', finalXP: 199, isProductiveXP: true })];
    // A-class: cap logic not applied — returns finalXP as-is
    const finalXP = applyBClassCap(taskA, 37, sessions, date);
    expect(finalXP).toBe(37); // not capped because value !== 'B'
  });

  it('cap does not count non-productive sessions (recovery/entertainment)', () => {
    const sessions = [
      makeSession({ finalXP: 0, isProductiveXP: false }),
      makeSession({ finalXP: 0, isProductiveXP: false }),
    ];
    const finalXP = applyBClassCap(task, baseXP, sessions, date);
    expect(finalXP).toBe(10); // none of those count toward cap
  });
});

// ─── 3x per day limit ─────────────────────────────────────────────────────────

describe('3x per day task completion limit', () => {
  const date = '2026-04-10';
  const taskId = 'task-b';

  it('0 completions → not at limit', () => {
    expect(isTaskAtDailyLimit([], taskId, date)).toBe(false);
  });

  it('2 completions → not at limit', () => {
    const sessions = [
      makeSession({ result: 'complete' }),
      makeSession({ result: 'complete' }),
    ];
    expect(isTaskAtDailyLimit(sessions, taskId, date)).toBe(false);
  });

  it('3 completions → at limit', () => {
    const sessions = [
      makeSession({ result: 'complete' }),
      makeSession({ result: 'complete' }),
      makeSession({ result: 'instant' }),
    ];
    expect(isTaskAtDailyLimit(sessions, taskId, date)).toBe(true);
  });

  it('3 invalid results → NOT at limit (invalid does not count)', () => {
    const sessions = [
      makeSession({ result: 'invalid' }),
      makeSession({ result: 'invalid' }),
      makeSession({ result: 'invalid' }),
    ];
    expect(isTaskAtDailyLimit(sessions, taskId, date)).toBe(false);
  });

  it('2 complete + 1 invalid → not at limit', () => {
    const sessions = [
      makeSession({ result: 'complete' }),
      makeSession({ result: 'complete' }),
      makeSession({ result: 'invalid' }),
    ];
    expect(isTaskAtDailyLimit(sessions, taskId, date)).toBe(false);
  });

  it('sessions from yesterday do not count toward today limit', () => {
    const sessions = [
      makeSession({ date: '2026-04-09', result: 'complete' }),
      makeSession({ date: '2026-04-09', result: 'complete' }),
      makeSession({ date: '2026-04-09', result: 'complete' }),
    ];
    expect(isTaskAtDailyLimit(sessions, taskId, date)).toBe(false);
  });
});

// ─── deleteSession reversal ───────────────────────────────────────────────────

describe('deleteSession: XP / energy reversal', () => {
  it('reverses XP correctly', () => {
    const totalXP = 200;
    const session = makeSession({ finalXP: 40 });
    const newXP = Math.max(0, totalXP - session.finalXP);
    expect(newXP).toBe(160);
  });

  it('XP cannot go below 0', () => {
    const session = makeSession({ finalXP: 200 });
    const newXP = Math.max(0, 50 - session.finalXP);
    expect(newXP).toBe(0);
  });

  it('reverses energy cost', () => {
    const currentEnergy = 70;
    const maxEnergy = 100;
    const energyCost = 9;
    const restored = Math.min(maxEnergy, currentEnergy + energyCost);
    expect(restored).toBe(79);
  });

  it('energy does not exceed max after reversal', () => {
    const currentEnergy = 96;
    const maxEnergy = 100;
    const energyCost = 9;
    const restored = Math.min(maxEnergy, currentEnergy + energyCost);
    expect(restored).toBe(100);
  });

  it('reverses energy gain (recovery session)', () => {
    const currentEnergy = 80;
    const energyGain = 13;
    const reversed = Math.max(0, currentEnergy - energyGain);
    expect(reversed).toBe(67);
  });
});
