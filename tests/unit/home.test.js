/**
 * home.test.js
 *
 * DOM 測試：renderHome 渲染邏輯與事件綁定。
 * 使用 jsdom 環境，mock state / utils / engine，
 * 避免依賴 Supabase 或真實 localStorage。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHome } from '../../pwa/js/pages/home.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

// vi.mock is hoisted — use vi.hoisted() so mockState is available in factory
const mockState = vi.hoisted(() => ({
  user:      { name: 'Tester', totalXP: 0, streakDays: 3 },
  tasks:     [],
  sessions:  [],
  energy:    { currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-11' },
  dailyPlan: [],
}));

vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));

vi.mock('../../pwa/js/utils.js', () => ({
  today:          () => '2026-04-11',
  effectiveToday: () => '2026-04-11',
  formatTime:     () => '10:00',
}));

vi.mock('../../pwa/js/engine.js', () => ({
  calcDailyStats: vi.fn(() => ({
    productiveXP:         0,
    hasASTask:            false,
    entertainmentMinutes: 0,
    isEffectiveDay:       false,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides = {}) {
  return {
    id:          'task-1',
    name:        '深度學習',
    category:    'instant',
    impactType:  'task',
    taskNature:  'growth',
    value:       'A',
    difficulty:  0.7,
    resistance:  1.2,
    emoji:       '🧠',
    iconImg:     null,
    ...overrides,
  };
}

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset state to defaults
  mockState.tasks     = [];
  mockState.sessions  = [];
  mockState.dailyPlan = [];
  mockState.user      = { name: 'Tester', totalXP: 0, streakDays: 3 };
  mockState.energy    = { currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-11' };

  // Reset window globals
  window.completeInstant    = vi.fn();
  window.startFocus         = vi.fn();
  window.deleteSession      = vi.fn();
  window.addToDailyPlan     = vi.fn();
  window.removeFromDailyPlan = vi.fn();
});

describe('renderHome: stats bar', () => {
  it('shows current energy value', () => {
    mockState.energy.currentEnergy = 65;
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('65');
  });

  it('shows streak days from state.user', () => {
    mockState.user.streakDays = 7;
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('7');
  });
});

describe('renderHome: empty state', () => {
  it('shows empty-state message when no tasks', () => {
    mockState.tasks = [];
    const c = makeContainer();
    renderHome(c);
    expect(c.querySelector('.empty-state')).not.toBeNull();
    expect(c.textContent).toContain('前往設定新增你的第一個任務');
  });
});

describe('renderHome: task rendering', () => {
  it('renders task cards for growth tasks', () => {
    mockState.tasks = [makeTask({ taskNature: 'growth' })];
    const c = makeContainer();
    renderHome(c);
    const cards = c.querySelectorAll('.task-card');
    expect(cards.length).toBe(1);
    expect(c.textContent).toContain('深度學習');
  });

  it('groups growth / maintenance / recovery into separate sections', () => {
    mockState.tasks = [
      makeTask({ id: 't1', name: '成長任務', taskNature: 'growth' }),
      makeTask({ id: 't2', name: '維持任務', taskNature: 'maintenance', value: 'B' }),
      makeTask({ id: 't3', name: '恢復任務', taskNature: 'recovery', impactType: 'recovery', value: 'D' }),
    ];
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('成長任務');
    expect(c.textContent).toContain('維持任務');
    expect(c.textContent).toContain('恢復任務');
  });

  it('shows count badge when task completed today', () => {
    const task = makeTask({ id: 'task-count' });
    mockState.tasks    = [task];
    mockState.sessions = [
      { id: 's1', taskId: 'task-count', date: '2026-04-11', result: 'instant', finalXP: 10, isProductiveXP: true },
    ];
    const c = makeContainer();
    renderHome(c);
    expect(c.querySelector('.count-badge')).not.toBeNull();
    expect(c.querySelector('.count-badge').textContent).toBe('1');
  });

  it('shows focus label for focus-category tasks not in plan', () => {
    mockState.tasks     = [makeTask({ category: 'focus', taskNature: 'growth' })];
    mockState.dailyPlan = []; // not in plan → shows focus label
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('▶ 專注');
  });
});

describe('renderHome: task card clicks', () => {
  it('clicking a task card adds it to daily plan', () => {
    mockState.tasks = [makeTask({ id: 'instant-task', category: 'instant' })];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.task-card').click();
    expect(window.addToDailyPlan).toHaveBeenCalledWith('instant-task');
  });

  it('clicking a plan card (instant) calls window.completeInstant', () => {
    const task = makeTask({ id: 'plan-instant', category: 'instant' });
    mockState.tasks     = [task];
    mockState.dailyPlan = ['plan-instant'];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.plan-card').click();
    expect(window.completeInstant).toHaveBeenCalledWith('plan-instant');
  });

  it('clicking a plan card (focus) calls window.startFocus', () => {
    const task = makeTask({ id: 'plan-focus', category: 'focus' });
    mockState.tasks     = [task];
    mockState.dailyPlan = ['plan-focus'];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.plan-card').click();
    expect(window.startFocus).toHaveBeenCalledWith('plan-focus');
  });

  it('clicking plan remove button calls window.removeFromDailyPlan', () => {
    const task = makeTask({ id: 'plan-remove', category: 'instant' });
    mockState.tasks     = [task];
    mockState.dailyPlan = ['plan-remove'];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.plan-remove-btn').click();
    expect(window.removeFromDailyPlan).toHaveBeenCalledWith('plan-remove');
  });
});

describe('renderHome: session list', () => {
  it('shows today sessions in log', () => {
    mockState.sessions = [{
      id: 'sess-1', taskId: 'task-1', taskName: '深度學習',
      date: '2026-04-11', result: 'instant', finalXP: 15,
      energyGain: 0, durationMinutes: 0,
      completedAt: new Date().toISOString(),
    }];
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('深度學習');
    expect(c.textContent).toContain('+15 XP');
  });

  it('session delete button calls window.deleteSession', () => {
    mockState.sessions = [{
      id: 'sess-del', taskId: 'task-1', taskName: '學習',
      date: '2026-04-11', result: 'instant', finalXP: 10,
      energyGain: 0, durationMinutes: 0,
      completedAt: new Date().toISOString(),
    }];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.session-del-btn').click();
    expect(window.deleteSession).toHaveBeenCalledWith('sess-del');
  });

  it('shows empty log message when no sessions today', () => {
    mockState.sessions = [];
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('點擊任務開始今日記錄');
  });
});

// ─── xpPreview label on task cards ───────────────────────────────────────────

describe('renderHome: xpPreview XP label', () => {
  it('instant task shows "+N XP" label (no trailing +)', () => {
    // A, difficulty=0.7, resistance=1.2 → round(20 × 2.2 × 0.7 × 1.2) = 37
    mockState.tasks = [makeTask({ category: 'instant', value: 'A', difficulty: 0.7, resistance: 1.2 })];
    const c = makeContainer();
    renderHome(c);
    const label = c.querySelector('.task-xp-label');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('+37 XP');
  });

  it('focus task shows "+N+ XP" label (trailing + for focus bonus)', () => {
    mockState.tasks = [makeTask({ category: 'focus', value: 'A', difficulty: 0.7, resistance: 1.2 })];
    const c = makeContainer();
    renderHome(c);
    const label = c.querySelector('.task-xp-label');
    expect(label.textContent).toBe('+37+ XP');
  });

  it('entertainment D-value task shows "娛樂" label (not XP)', () => {
    mockState.tasks = [makeTask({ value: 'D', impactType: 'entertainment', taskNature: 'entertainment' })];
    const c = makeContainer();
    renderHome(c);
    const taskCard = c.querySelector('.task-card');
    expect(taskCard).not.toBeNull();
    const label = taskCard.querySelector('.task-xp-label');
    expect(label.textContent).toBe('娛樂');
  });

  it('recovery D-value task shows "回能" label (not XP)', () => {
    mockState.tasks = [makeTask({ value: 'D', impactType: 'recovery', taskNature: 'recovery' })];
    const c = makeContainer();
    renderHome(c);
    const taskCard = c.querySelector('.task-card');
    expect(taskCard).not.toBeNull();
    const label = taskCard.querySelector('.task-xp-label');
    expect(label.textContent).toBe('回能');
  });

  it('S task, max weights → correct XP', () => {
    // S, difficulty=1.0, resistance=1.4 → round(20 × 3.2 × 1.0 × 1.4) = 90
    mockState.tasks = [makeTask({ value: 'S', difficulty: 1.0, resistance: 1.4, taskNature: 'growth' })];
    const c = makeContainer();
    renderHome(c);
    const label = c.querySelector('.task-xp-label');
    expect(label.textContent).toBe('+90 XP');
  });

  it('difficulty stored as integer 1 (not string "1.0") still calculates correctly', () => {
    // This was a bug: difficulty=1 (number) → String(1)='1', weight map needed '1' key
    // B, difficulty=1 (integer), resistance=1.0 → round(20 × 1.2 × 1.0 × 1.0) = 24
    mockState.tasks = [makeTask({ value: 'B', difficulty: 1, resistance: 1.0, taskNature: 'maintenance' })];
    const c = makeContainer();
    renderHome(c);
    const label = c.querySelector('.task-xp-label');
    expect(label.textContent).toBe('+24 XP');
  });

  it('resistance stored as integer 1 calculates correctly', () => {
    // A, difficulty=0.7, resistance=1 (integer) → round(20 × 2.2 × 0.7 × 1.0) = 31
    mockState.tasks = [makeTask({ value: 'A', difficulty: 0.7, resistance: 1, taskNature: 'growth' })];
    const c = makeContainer();
    renderHome(c);
    const label = c.querySelector('.task-xp-label');
    expect(label.textContent).toBe('+31 XP');
  });
});

describe('renderHome: effective day indicator', () => {
  it('shows 今日有效 when all three conditions met', async () => {
    const { calcDailyStats } = await import('../../pwa/js/engine.js');
    calcDailyStats.mockReturnValueOnce({
      productiveXP: 60, hasASTask: true, entertainmentMinutes: 30, isEffectiveDay: true,
    });
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('今日有效');
  });

  it('shows 未達有效日 when conditions not met', () => {
    const c = makeContainer();
    renderHome(c);
    expect(c.textContent).toContain('未達有效日');
  });
});
