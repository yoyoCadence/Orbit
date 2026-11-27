// @vitest-environment jsdom
/**
 * homeInteractions.test.js — TEST-010: the home page's gestures and the
 * parts home.test.js does not reach. Reordering the plan and the task list by
 * dragging (and the click that follows a drag), card swipes (vertical moves,
 * the page-switch gesture, leaving edit mode), the plan's info window, the
 * Main Quest action and the Orbit Window's fallbacks. Same mocks as
 * home.test.js, with the storage calls a drag makes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHome } from '../../pwa/js/pages/home.js';
import { setPersonalSpaceRuntime } from '../../pwa/js/personalSpace/v2/featureFlag.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

// vi.mock is hoisted — use vi.hoisted() so mockState is available in factory
const mockState = vi.hoisted(() => ({
  user:      { name: 'Tester', totalXP: 0, streakDays: 3 },
  tasks:     [],
  sessions:  [],
  energy:    { currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-11' },
  dailyPlan: [],
}));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: {
      getSession:        vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

const mockStorage = vi.hoisted(() => ({
  isProUser: vi.fn(() => false),
  isTrialUser: vi.fn(() => false),
  currentDailyPlan: vi.fn(plan => plan),
  saveDailyPlan: vi.fn(),
  saveTasks: vi.fn(),
}));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage, db: {} }));

vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));

vi.mock('../../pwa/js/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  today:          () => '2026-04-11',
  effectiveToday: () => '2026-04-11',
  formatTime:     () => '10:00',
  sortSessionsNewestFirst: sessions => [...sessions].sort(
    (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
  ),
}));

vi.mock('../../pwa/js/engine.js', async (importOriginal) => ({
  ...(await importOriginal()),
  calcDailyStats: vi.fn(() => ({
    productiveXP:         0,
    hasASTask:            false,
    entertainmentMinutes: 0,
    isEffectiveDay:       false,
  })),
  reorderTasks: vi.fn(tasks => tasks),
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
  localStorage.clear();
  // Reset state to defaults
  mockState.tasks     = [];
  mockState.sessions  = [];
  mockState.dailyPlan = [];
  mockState.user      = { name: 'Tester', totalXP: 0, streakDays: 3 };
  mockState.energy    = { currentEnergy: 80, maxEnergy: 100, lastResetDate: '2026-04-11' };

  // Reset window globals
  window.completeInstant      = vi.fn();
  window.startFocus           = vi.fn();
  window.deleteSession        = vi.fn();
  window.addToDailyPlan       = vi.fn();
  window.removeFromDailyPlan  = vi.fn();
  window.useStreakShield       = vi.fn();
  window.dismissStreakShield   = vi.fn();
  window.reshowShieldBanner    = vi.fn();
  window.showShieldInfo        = vi.fn();
  window.navigate              = vi.fn();
});

// ─── Helpers for gestures ───────────────────────────────────────────────────

const rect = (top, height = 50, left = 0, width = 300) =>
  ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top });

/** Lay cards out top to bottom, 60 px apart (jsdom has no layout). */
function layOut(cards) {
  [...cards].forEach((card, i) => { card.getBoundingClientRect = () => rect(i * 60); });
}

function pointer(el, type, { x = 10, y = 0, pointerType = 'touch', button = 0 } = {}) {
  el.dispatchEvent(new window.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType, button, pointerId: 7,
  }));
}

if (typeof Touch === 'undefined') {
  globalThis.Touch = class Touch { constructor(init) { Object.assign(this, init); } };
}
function touch(el, type, x, y) {
  const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new window.TouchEvent(type, { touches: type === 'touchend' ? [] : [t], bubbles: true }));
}

beforeEach(() => {
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.clearAllMocks();
  mockStorage.currentDailyPlan.mockImplementation(plan => plan);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

// ─── Reordering the plan ────────────────────────────────────────────────────

describe('reordering the plan by its handle', () => {
  function planPage(ids = ['p1', 'p2', 'p3']) {
    mockState.tasks = ids.map(id => makeTask({ id, name: id }));
    mockState.dailyPlan = [...ids];
    const c = makeContainer();
    renderHome(c);
    layOut(c.querySelectorAll('.plan-card'));
    return c;
  }
  const handleOf = (c, id) => c.querySelector(`.plan-card[data-task-id="${id}"] .plan-drag-handle`);

  it('drops a task below the lower half of another, and saves the order', () => {
    vi.useFakeTimers();
    const c = planPage();
    const handle = handleOf(c, 'p1');
    pointer(handle, 'pointerdown', { y: 25 });
    // A floating copy follows the finger; the card itself is a placeholder.
    const clone = [...document.body.children].find(el => el !== c && el.classList.contains('plan-card'));
    expect(clone.style.position).toBe('fixed');
    expect(c.querySelector('.plan-card[data-task-id="p1"]').classList.contains('plan-drag-placeholder')).toBe(true);
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);

    pointer(handle, 'pointermove', { y: 100 });   // lower half of p2 (60-110)
    expect(clone.style.top).toBe('75px');
    expect(c.querySelector('.plan-card[data-task-id="p2"]').classList.contains('plan-drag-over-bottom')).toBe(true);
    pointer(handle, 'pointerup', { y: 100 });

    expect(clone.isConnected).toBe(false);
    expect(mockState.dailyPlan).toEqual(['p2', 'p1', 'p3']);
    expect(mockStorage.saveDailyPlan).toHaveBeenCalledWith(['p2', 'p1', 'p3']);
    expect([...c.querySelectorAll('.plan-card')].map(card => card.dataset.taskId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('drops a task above the upper half of another', () => {
    const c = planPage();
    const handle = handleOf(c, 'p3');
    pointer(handle, 'pointerdown', { y: 145 });
    pointer(handle, 'pointermove', { y: 70 });    // upper half of p2
    expect(c.querySelector('.plan-card[data-task-id="p2"]').classList.contains('plan-drag-over-top')).toBe(true);
    pointer(handle, 'pointerup', { y: 70 });
    expect(mockState.dailyPlan).toEqual(['p1', 'p3', 'p2']);
  });

  it('changes nothing when dropped on itself or outside the list, and the next tap is not a completion', () => {
    vi.useFakeTimers();
    const c = planPage();
    const handle = handleOf(c, 'p2');
    pointer(handle, 'pointerdown', { y: 80 });
    pointer(handle, 'pointermove', { y: 90 });
    pointer(handle, 'pointerup', { y: 90 });
    pointer(handle, 'pointerdown', { y: 80 });
    pointer(handle, 'pointermove', { y: 900 });
    pointer(handle, 'pointerup', { y: 900 });
    expect(mockStorage.saveDailyPlan).not.toHaveBeenCalled();
    expect(mockState.dailyPlan).toEqual(['p1', 'p2', 'p3']);
    expect(c.querySelectorAll('.plan-drag-placeholder, .plan-drag-over-top, .plan-drag-over-bottom')).toHaveLength(0);
    // The click that follows the drag does not complete the task...
    c.querySelector('.plan-card[data-task-id="p1"]').click();
    expect(window.completeInstant).not.toHaveBeenCalled();
    // ...and a later tap does.
    c.querySelector('.plan-card[data-task-id="p1"]').click();
    expect(window.completeInstant).toHaveBeenCalledWith('p1');
  });

  it('a drop with no click after it does not swallow a later tap', () => {
    vi.useFakeTimers();
    const c = planPage();
    const handle = handleOf(c, 'p1');
    pointer(handle, 'pointerdown', { y: 25 });
    pointer(handle, 'pointerup', { y: 25 });
    vi.advanceTimersByTime(50);
    c.querySelector('.plan-card[data-task-id="p2"]').click();
    expect(window.completeInstant).toHaveBeenCalledWith('p2');
  });

  it('a cancelled drag does not swallow the next tap', () => {
    const c = planPage();
    const handle = handleOf(c, 'p1');
    pointer(handle, 'pointerdown', { y: 25 });
    pointer(handle, 'pointercancel');
    c.querySelector('.plan-card[data-task-id="p2"]').click();
    expect(window.completeInstant).toHaveBeenCalledWith('p2');
  });

  it('moves without a drag in progress are ignored', () => {
    const c = planPage();
    pointer(handleOf(c, 'p1'), 'pointermove', { y: 100 });
    pointer(handleOf(c, 'p1'), 'pointerup', { y: 100 });
    expect(mockStorage.saveDailyPlan).not.toHaveBeenCalled();
    expect(c.querySelectorAll('.plan-drag-over-top, .plan-drag-over-bottom')).toHaveLength(0);
  });
});

// ─── Reordering the task list ───────────────────────────────────────────────

describe('reordering tasks by their handle', () => {
  async function engine() {
    return import('../../pwa/js/engine.js');
  }
  function taskPage() {
    mockState.user = { ...mockState.user, id: 'owner-1' };
    mockState.tasks = ['t1', 't2', 't3'].map(id => makeTask({ id, name: id, taskNature: 'growth' }));
    const c = makeContainer();
    renderHome(c);
    layOut(c.querySelectorAll('.task-card'));
    return c;
  }
  const cardOf = (c, id) => c.querySelector(`.task-card[data-task-id="${id}"]`);

  it('drops a task on another, saves the order and stays in edit mode', async () => {
    vi.useFakeTimers();
    const { reorderTasks } = await engine();
    reorderTasks.mockImplementation((tasks, from, to) => {
      const moved = tasks.find(t => t.id === from);
      const rest = tasks.filter(t => t.id !== from);
      rest.splice(rest.findIndex(t => t.id === to), 0, moved);
      return rest;
    });
    navigator.vibrate = vi.fn();
    const c = taskPage();
    c.querySelector('.task-edit-btn[data-section="growth"]').click();
    const handle = cardOf(c, 't3').querySelector('.task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 125 });
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
    expect(window._isDragging).toBe(true);
    expect(cardOf(c, 't3').classList.contains('drag-placeholder')).toBe(true);
    const clone = [...document.body.children].find(el => el !== c && el.classList.contains('task-card'));
    expect(clone.style.position).toBe('fixed');

    pointer(handle, 'pointermove', { x: 20, y: 10 });
    expect(clone.style.left).toBe('10px');
    expect(clone.style.top).toBe('5px');      // 10 − (125 − 120)
    expect(cardOf(c, 't1').classList.contains('drag-over')).toBe(true);
    pointer(handle, 'pointerup', { x: 20, y: 10 });

    expect(reorderTasks).toHaveBeenCalledWith(expect.any(Array), 't3', 't1');
    expect(mockState.tasks.map(t => t.id)).toEqual(['t3', 't1', 't2']);
    expect(mockStorage.saveTasks).toHaveBeenCalledWith(mockState.tasks, 'owner-1');
    expect(clone.isConnected).toBe(false);
    // Drawn again, still editing.
    expect([...c.querySelectorAll('.task-card')].map(card => card.dataset.taskId)).toEqual(['t3', 't1', 't2']);
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
    expect(c.querySelector('.task-edit-btn[data-section="growth"]').textContent).toBe('完成');
    // The click that follows does not add a task to the plan.
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(false);
    delete navigator.vibrate;
  });

  it('changes nothing when dropped on itself or between cards', async () => {
    const { reorderTasks } = await engine();
    const c = taskPage();
    const handle = cardOf(c, 't2').querySelector('.task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 80 });
    pointer(handle, 'pointermove', { x: 10, y: 55 });   // the gap between t1 and t2
    pointer(handle, 'pointerup', { x: 10, y: 55 });
    pointer(handle, 'pointerdown', { x: 10, y: 80 });
    pointer(handle, 'pointercancel');
    expect(reorderTasks).not.toHaveBeenCalled();
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
    expect(c.querySelectorAll('.drag-placeholder, .drag-over')).toHaveLength(0);
    // The tap that follows a drag is not an "add to plan".
    cardOf(c, 't1').click();
    expect(window.addToDailyPlan).not.toHaveBeenCalled();
    cardOf(c, 't1').click();
    expect(window.addToDailyPlan).toHaveBeenCalledWith('t1');
  });

  it('a right-click does not start a drag, and the handle has no context menu', () => {
    const c = taskPage();
    const handle = cardOf(c, 't1').querySelector('.task-drag-handle');
    pointer(handle, 'pointerdown', { pointerType: 'mouse', button: 2 });
    expect(cardOf(c, 't1').classList.contains('drag-placeholder')).toBe(false);
    const menu = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    handle.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    // A tap on the handle is not an "add to plan".
    handle.click();
    expect(window.addToDailyPlan).not.toHaveBeenCalled();
  });
});

// ─── Swipes and leaving edit mode ───────────────────────────────────────────

describe('card swipes and taps around them', () => {
  function cards(n = 2) {
    mockState.tasks = Array.from({ length: n }, (_, i) => makeTask({ id: `s${i}`, name: `s${i}` }));
    const c = makeContainer();
    renderHome(c);
    return c;
  }

  it('a mostly vertical move, or a short one, does not open a card', () => {
    const c = cards(1);
    const card = c.querySelector('.task-card');
    touch(card, 'touchstart', 100, 100);
    touch(card, 'touchmove', 92, 100);      // under 12 px
    touch(card, 'touchmove', 70, 130);      // more vertical than 1.5× horizontal
    expect(card.classList.contains('swipe-open')).toBe(false);
  });

  it('a horizontal swipe does not also switch the page', () => {
    const c = cards(1);
    const card = c.querySelector('.task-card');
    const pageSwitch = vi.fn();
    document.addEventListener('touchend', pageSwitch);
    try {
      touch(card, 'touchstart', 100, 100);
      touch(card, 'touchmove', 60, 102);
      touch(card, 'touchend', 60, 102);
      expect(pageSwitch).not.toHaveBeenCalled();
      // A tap (no swipe) still reaches it.
      touch(card, 'touchstart', 100, 100);
      touch(card, 'touchend', 100, 100);
      expect(pageSwitch).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('touchend', pageSwitch);
    }
  });

  it('a tap outside the cards closes an open one and leaves edit mode', () => {
    const c = cards(1);
    const card = c.querySelector('.task-card');
    touch(card, 'touchstart', 100, 100);
    touch(card, 'touchmove', 60, 102);
    c.querySelector('.task-edit-btn[data-section="growth"]').click();
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
    // A tap inside the grid being edited stays in edit mode.
    c.querySelector('.task-grid[data-section="growth"]').click();
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
    c.querySelector('.stats-bar').click();
    expect(card.classList.contains('swipe-open')).toBe(false);
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(false);
    expect(c.querySelector('.task-edit-btn[data-section="growth"]').textContent).toBe('編輯');
  });
});

// ─── The task detail window ─────────────────────────────────────────────────

describe('the task detail window', () => {
  it('stays open for taps inside it, and closes with ✕ or a tap outside', () => {
    mockState.tasks = [makeTask({ id: 'd1', name: '細節任務' })];
    const c = makeContainer();
    renderHome(c);
    c.querySelector('.task-icon-wrap').click();
    let modal = document.querySelector('.modal-overlay');
    expect(modal.textContent).toContain('細節任務');
    modal.querySelector('.task-detail-grid').click();
    expect(modal.isConnected).toBe(true);
    modal.querySelector('.modal-close-btn').click();
    expect(modal.isConnected).toBe(false);
    // Opening the details does not add the task to the plan.
    expect(window.addToDailyPlan).not.toHaveBeenCalled();
    c.querySelector('.task-icon-wrap').click();
    modal = document.querySelector('.modal-overlay');
    modal.click();
    expect(modal.isConnected).toBe(false);
  });
});

// ─── The plan's info window ─────────────────────────────────────────────────

describe('the plan info window', () => {
  it('explains planning, and closes with ✕ or a tap outside', () => {
    const c = makeContainer();
    renderHome(c);
    c.querySelector('#plan-info-btn').click();
    let modal = document.querySelector('.modal-overlay');
    expect(modal.querySelector('.modal-title').textContent).toBe('📋 為什麼要規劃本日任務？');
    expect(modal.textContent).toContain('實行意圖（Implementation Intention）');
    modal.querySelector('.modal-box').click();
    expect(modal.isConnected).toBe(true);
    modal.querySelector('.modal-close-btn').click();
    expect(modal.isConnected).toBe(false);
    c.querySelector('#plan-info-btn').click();
    modal = document.querySelector('.modal-overlay');
    modal.click();
    expect(modal.isConnected).toBe(false);
  });
});

// ─── The Orbit Window's Main Quest button ───────────────────────────────────

describe('the Main Quest button', () => {
  it('sends someone with no A/S focus task to Settings to make one', () => {
    setPersonalSpaceRuntime('v2');
    mockState.user = { id: 'owner-mq-1', name: 'Tester', totalXP: 0, streakDays: 0 };
    mockState.tasks = [makeTask({ id: 'b-instant', value: 'B', category: 'instant' })];
    const c = makeContainer();
    const cleanup = renderHome(c);
    c.querySelector('[data-orbit-main-quest]').click();
    expect(window.navigate).toHaveBeenCalledWith('settings');
    expect(window.startFocus).not.toHaveBeenCalled();
    cleanup?.();
  });
});

// ─── BUG-134: drawn again into the same container ───────────────────────────

describe('home drawn again into the same page container (BUG-134)', () => {
  it('handles a tap outside the cards once, however often it was drawn', () => {
    mockState.tasks = [makeTask({ id: 'r1' })];
    const c = makeContainer();
    for (let i = 0; i < 5; i += 1) renderHome(c);
    const lookups = vi.spyOn(c, 'querySelectorAll');
    c.querySelector('.stats-bar').click();
    expect(lookups.mock.calls.filter(([selector]) => selector === '.task-grid.edit-mode')).toHaveLength(1);
  });

  it('the latest drawing still closes its open card and leaves edit mode', () => {
    mockState.tasks = [makeTask({ id: 'r1' })];
    const c = makeContainer();
    renderHome(c);
    renderHome(c);
    const card = c.querySelector('.task-card');
    touch(card, 'touchstart', 100, 100);
    touch(card, 'touchmove', 60, 102);
    c.querySelector('.task-edit-btn[data-section="growth"]').click();
    c.querySelector('.stats-bar').click();
    expect(card.classList.contains('swipe-open')).toBe(false);
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(false);
  });
});
