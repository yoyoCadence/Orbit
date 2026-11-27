// @vitest-environment jsdom
/**
 * reviewEffectiveDay.test.js — 週回顧與月曆以有效日計算（BUG-146）
 * 環境：jsdom
 *
 * review.test.js 把 effectiveToday() mock 成日曆日期；這裡用真的 utils.js，
 * 把時間放在午夜到換日時間之間，確認週視圖的 7 天、月曆的「今天」、打開時的
 * 月份與免費版的月份限制都從有效日算起。每個測試重新 import review.js（它記住
 * 目前看的月份）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = vi.hoisted(() => ({ user: null, tasks: [], sessions: [] }));
const mockStorage = vi.hoisted(() => ({
  isProUser: vi.fn(() => false),
  isPaidProUser: vi.fn(() => false),
  isTrialUser: vi.fn(() => false),
}));

vi.mock('../../pwa/js/supabase.js', () => ({ supabase: { auth: {}, from: vi.fn() } }));
vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage, db: {} }));

let container;

function session(date, overrides = {}) {
  return {
    id: `s-${date}`, taskId: 't1', taskName: 'Task', date,
    completedAt: `${date}T12:00:00`, result: 'complete', finalXP: 60,
    durationMinutes: 30, impactType: 'task', value: 'A', isProductiveXP: true,
    ...overrides,
  };
}

/** Sets the clock, then imports a fresh review.js and draws it. */
async function render(at, { newDayHour = 5, mode = 'week' } = {}) {
  vi.setSystemTime(at);
  mockState.user = { id: 'u1', name: 'Tester', newDayHour };
  const { renderReview } = await import('../../pwa/js/pages/review.js');
  window._reviewSetMode(mode);
  renderReview(container);
}

const barValues = () => [...container.querySelectorAll('.bar-val')].map(el => el.textContent.trim());
const monthLabel = () => container.querySelector('.month-nav-label').textContent;
const todayCell = () => container.querySelector('.cal-cell-today .cal-day-num')?.textContent ?? null;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mockState.sessions = [];
  mockStorage.isProUser.mockReturnValue(false);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
});

describe('週視圖', () => {
  it('凌晨 2 點：7 天到有效日（前一個日曆日）為止，最早那天也算進來', async () => {
    mockState.sessions = [
      session('2026-04-15', { finalXP: 60 }),   // tonight, effective day
      session('2026-04-09', { finalXP: 40 }),   // the oldest of the 7 effective days
      session('2026-04-08', { finalXP: 30 }),   // outside
    ];
    await render(new Date('2026-04-16T02:00:00'));

    const values = barValues();
    expect(values).toHaveLength(7);
    expect(values[0]).toBe('40');
    expect(values[6]).toBe('60');
    expect(container.querySelector('.review-stat-val').textContent).toBe('100');
  });

  it('換日時間是 0 點時照日曆日期', async () => {
    mockState.sessions = [session('2026-04-16', { finalXP: 60 }), session('2026-04-09', { finalXP: 40 })];
    await render(new Date('2026-04-16T02:00:00'), { newDayHour: 0 });
    const values = barValues();
    expect(values[6]).toBe('60');
    expect(values[0]).toBe('');
  });
});

describe('月視圖', () => {
  it('凌晨 2 點：「今天」標在有效日', async () => {
    await render(new Date('2026-04-16T02:00:00'), { mode: 'month' });
    expect(todayCell()).toBe('15');
  });

  it('月初凌晨 2 點：打開的是有效日所在的上個月，今天是那個月的最後一天', async () => {
    await render(new Date('2026-05-01T02:00:00'), { mode: 'month' });
    expect(monthLabel()).toBe(new Date(2026, 3, 1).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' }));
    expect(todayCell()).toBe('30');
  });

  it('免費版的月份限制從有效月份算（月初凌晨不會少一個月）', async () => {
    const label = month => new Date(2026, month, 1).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    await render(new Date('2026-05-01T02:00:00'), { mode: 'month' });
    // April (effective) → March → February: still open (2 months back).
    window._reviewPrevMonth();
    window._reviewPrevMonth();
    expect(monthLabel()).toBe(label(1));
    expect(container.querySelector('.history-lock-card')).toBeNull();
    // January (3 back) is shown locked; December cannot be reached.
    window._reviewPrevMonth();
    expect(monthLabel()).toBe(label(0));
    expect(container.querySelector('.history-lock-card')).not.toBeNull();
    window._reviewPrevMonth();
    expect(monthLabel()).toBe(label(0));
  });
});
