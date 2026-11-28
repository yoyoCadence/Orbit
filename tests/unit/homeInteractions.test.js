// @vitest-environment jsdom
/**
 * homeInteractions.test.js — TEST-010: the home page's gestures and the
 * parts home.test.js does not reach. Reordering the plan and the task list by
 * dragging (and the click that follows a drag), card swipes (vertical moves,
 * the page-switch gesture, leaving edit mode), the task detail and plan info
 * windows and the Main Quest's way to Settings. Same mocks as home.test.js,
 * with the storage calls a drag makes.
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

function pointer(el, type, { x = 10, y = 0, pointerType = 'touch', button = 0, pointerId = 7 } = {}) {
  const event = new window.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType, button, pointerId,
  });
  el.dispatchEvent(event);
  return event;
}

if (typeof Touch === 'undefined') {
  globalThis.Touch = class Touch { constructor(init) { Object.assign(this, init); } };
}
function touch(el, type, x, y) {
  const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new window.TouchEvent(type, { touches: type === 'touchend' ? [] : [t], bubbles: true }));
}

beforeEach(() => {
  // TEST-028: fake timers in every test, so a drag's 50 ms reset (and the
  // Orbit Window's deferred start) never waits on real timers: it would fire
  // after the file, when jsdom's `window` is gone.
  vi.useFakeTimers();
  window._isDragging = false;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.clearAllMocks();
  mockStorage.currentDailyPlan.mockImplementation(plan => plan);
});
afterEach(() => {
  // Let a drag's 50 ms reset run, so no test starts with a drag's flags set.
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
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
    // No text selection or click from the press itself.
    expect(pointer(handle, 'pointerdown', { y: 25 }).defaultPrevented).toBe(true);
    // A floating copy follows the finger; the card itself is a placeholder.
    const clone = [...document.body.children].find(el => el !== c && el.classList.contains('plan-card'));
    expect(clone.style.position).toBe('fixed');
    expect(c.querySelector('.plan-card[data-task-id="p1"]').classList.contains('plan-drag-placeholder')).toBe(true);
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);

    // Over p3 first: only the card under the finger is marked.
    pointer(handle, 'pointermove', { y: 130 });
    expect(c.querySelector('.plan-card[data-task-id="p3"]').classList.contains('plan-drag-over-top')).toBe(true);
    pointer(handle, 'pointermove', { y: 100 });   // lower half of p2 (60-110)
    expect(clone.style.top).toBe('75px');
    expect(c.querySelector('.plan-card[data-task-id="p2"]').classList.contains('plan-drag-over-bottom')).toBe(true);
    expect(c.querySelectorAll('.plan-drag-over-top, .plan-drag-over-bottom')).toHaveLength(1);
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

  it('a plan from an earlier day starts over empty, as other plan edits do (HW-113)', () => {
    const c = planPage();
    mockStorage.currentDailyPlan.mockReturnValue([]);
    const handle = handleOf(c, 'p1');
    pointer(handle, 'pointerdown', { y: 25 });
    pointer(handle, 'pointermove', { y: 100 });
    pointer(handle, 'pointerup', { y: 100 });
    expect(mockStorage.currentDailyPlan).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(mockState.dailyPlan).toEqual([]);
    expect(mockStorage.saveDailyPlan).toHaveBeenCalledWith([]);
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
    try {
      const c = taskPage();
      c.querySelector('.task-edit-btn[data-section="growth"]').click();
      const handle = cardOf(c, 't3').querySelector('.task-drag-handle');
      // The press stays with the handle: not passed up to the page.
      const pageDown = vi.fn();
      c.addEventListener('pointerdown', pageDown);
      pointer(handle, 'pointerdown', { x: 10, y: 125 });
      expect(pageDown).not.toHaveBeenCalled();
      expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
      expect(navigator.vibrate).toHaveBeenCalledWith(50);
      expect(window._isDragging).toBe(true);
      expect(cardOf(c, 't3').classList.contains('drag-placeholder')).toBe(true);
      const clone = [...document.body.children].find(el => el !== c && el.classList.contains('task-card'));
      expect(clone.style.position).toBe('fixed');

      // Over t2 first: only the card under the finger is marked.
      pointer(handle, 'pointermove', { x: 20, y: 70 });
      expect(cardOf(c, 't2').classList.contains('drag-over')).toBe(true);
      pointer(handle, 'pointermove', { x: 20, y: 10 });
      expect(clone.style.left).toBe('10px');
      expect(clone.style.top).toBe('5px');      // 10 − (125 − 120)
      expect(cardOf(c, 't1').classList.contains('drag-over')).toBe(true);
      expect(c.querySelectorAll('.drag-over')).toHaveLength(1);
      pointer(handle, 'pointerup', { x: 20, y: 10 });
      // The drop redraws Home, and page swipes stay off for 50 ms more.
      expect(window._isDragging).toBe(true);

      expect(reorderTasks).toHaveBeenCalledWith(expect.any(Array), 't3', 't1');
      expect(mockState.tasks.map(t => t.id)).toEqual(['t3', 't1', 't2']);
      expect(mockStorage.saveTasks).toHaveBeenCalledWith(mockState.tasks, 'owner-1');
      expect(clone.isConnected).toBe(false);
      // Drawn again, still editing.
      expect([...c.querySelectorAll('.task-card')].map(card => card.dataset.taskId)).toEqual(['t3', 't1', 't2']);
      expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
      expect(c.querySelector('.task-edit-btn[data-section="growth"]').textContent).toBe('完成');
      // The click that follows the drop does not add a task to the plan...
      cardOf(c, 't1').click();
      expect(window.addToDailyPlan).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50);
      expect(window._isDragging).toBe(false);
      // ...and the next tap does.
      cardOf(c, 't2').click();
      expect(window.addToDailyPlan).toHaveBeenCalledWith('t2');
    } finally {
      delete navigator.vibrate;
    }
  });

  it('a drop with no click after it does not swallow a later tap (BUG-135)', () => {
    vi.useFakeTimers();
    const c = taskPage();
    const handle = cardOf(c, 't2').querySelector('.task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 80 });
    pointer(handle, 'pointermove', { x: 10, y: 55 });
    pointer(handle, 'pointerup', { x: 10, y: 55 });
    // A touch drag sends no click; seconds later the user taps a card.
    vi.advanceTimersByTime(5000);
    cardOf(c, 't1').click();
    expect(window.addToDailyPlan).toHaveBeenCalledWith('t1');
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
    // One decision per gesture: turning sideways later does not open it.
    touch(card, 'touchmove', 20, 131);
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

  it('a tap outside the cards closes an open one', () => {
    const c = cards(1);
    const card = c.querySelector('.task-card');
    touch(card, 'touchstart', 100, 100);
    touch(card, 'touchmove', 60, 102);
    expect(card.classList.contains('swipe-open')).toBe(true);
    c.querySelector('.stats-bar').click();
    expect(card.classList.contains('swipe-open')).toBe(false);
    expect(window.addToDailyPlan).not.toHaveBeenCalled();
  });

  it('a tap outside the grid being edited leaves edit mode; a tap inside does not', () => {
    const c = cards(1);
    c.querySelector('.task-edit-btn[data-section="growth"]').click();
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
    c.querySelector('.task-grid[data-section="growth"]').click();
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(true);
    c.querySelector('.stats-bar').click();
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
    expect(card.classList.contains('swipe-open')).toBe(true);
    c.querySelector('.stats-bar').click();
    expect(card.classList.contains('swipe-open')).toBe(false);
    c.querySelector('.task-edit-btn[data-section="growth"]').click();
    c.querySelector('.stats-bar').click();
    expect(c.querySelector('.task-grid[data-section="growth"]').classList.contains('edit-mode')).toBe(false);
  });

  it('takes its tap-outside listener away when Home is left', () => {
    mockState.tasks = [makeTask({ id: 'r1' })];
    const c = makeContainer();
    const cleanup = renderHome(c);
    cleanup();
    // The router reuses the container for another page.
    c.innerHTML = '<div class="task-grid edit-mode" data-section="growth"></div><p id="elsewhere">設定</p>';
    const lookups = vi.spyOn(c, 'querySelectorAll');
    c.querySelector('#elsewhere').click();
    expect(lookups.mock.calls.filter(([selector]) => selector === '.task-grid.edit-mode')).toHaveLength(0);
    expect(c.querySelector('.task-grid').classList.contains('edit-mode')).toBe(true);
  });
});

// ─── BUG-136: drag edge cases ───────────────────────────────────────────────

describe('drag edge cases (BUG-136)', () => {
  function page({ plan = [], tasks }) {
    mockState.user = { ...mockState.user, id: 'owner-1' };
    mockState.tasks = tasks;
    mockState.dailyPlan = plan;
    const c = makeContainer();
    renderHome(c);
    layOut(c.querySelectorAll('.plan-card'));
    layOut(c.querySelectorAll('.task-card'));
    return c;
  }
  const growth = id => makeTask({ id, name: id, taskNature: 'growth' });
  const floating = (c, cls) => [...document.body.children].filter(el => el !== c && el.classList.contains(cls));

  it('a task drag ends when Home is drawn again mid-drag: no floating copy, page swipes back', () => {
    const c = page({ tasks: [growth('t1'), growth('t2')] });
    const handle = c.querySelector('.task-card[data-task-id="t2"] .task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 80 });
    expect(floating(c, 'task-card')).toHaveLength(1);
    expect(window._isDragging).toBe(true);
    renderHome(c);   // a sync finished, say
    expect(floating(c, 'task-card')).toHaveLength(0);
    expect(window._isDragging).toBe(false);
    // The old handle's events never come; if they did, nothing would move.
    pointer(handle, 'pointermove', { x: 10, y: 10 });
    pointer(handle, 'pointerup', { x: 10, y: 10 });
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
  });

  it('a plan drag ends when Home is drawn again mid-drag', () => {
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const handle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(handle, 'pointerdown', { y: 25 });
    expect(floating(c, 'plan-card')).toHaveLength(1);
    renderHome(c);
    expect(floating(c, 'plan-card')).toHaveLength(0);
    expect(window._isDragging).toBe(false);
    pointer(handle, 'pointermove', { y: 100 });
    pointer(handle, 'pointerup', { y: 100 });
    expect(mockStorage.saveDailyPlan).not.toHaveBeenCalled();
  });

  it('a drag ends when Home is left mid-drag (BUG-137)', () => {
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const cleanup = renderHome(c);
    layOut(c.querySelectorAll('.plan-card'));
    const handle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(handle, 'pointerdown', { y: 25 });
    expect(floating(c, 'plan-card')).toHaveLength(1);
    cleanup();   // another page is shown
    expect(floating(c, 'plan-card')).toHaveLength(0);
    expect(window._isDragging).toBe(false);
  });

  it('one drag at a time: a second finger on another handle does nothing (BUG-137)', () => {
    vi.useFakeTimers();
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const planHandle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    const taskHandle = c.querySelector('.task-card[data-task-id="p2"] .task-drag-handle');
    pointer(taskHandle, 'pointerdown', { x: 10, y: 80 });
    pointer(planHandle, 'pointerdown', { y: 25 });
    pointer(c.querySelector('.plan-card[data-task-id="p2"] .plan-drag-handle'), 'pointerdown', { y: 85 });
    expect(floating(c, 'plan-card')).toHaveLength(0);
    expect(floating(c, 'task-card')).toHaveLength(1);
    pointer(taskHandle, 'pointercancel');
    expect(floating(c, 'task-card')).toHaveLength(0);
  });

  it('one drag at a time, the plan first too (BUG-137)', () => {
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    pointer(c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle'), 'pointerdown', { y: 25 });
    pointer(c.querySelector('.task-card[data-task-id="p2"] .task-drag-handle'), 'pointerdown', { x: 10, y: 80 });
    expect(floating(c, 'plan-card')).toHaveLength(1);
    expect(floating(c, 'task-card')).toHaveLength(0);
    expect(c.querySelector('.task-card[data-task-id="p2"]').classList.contains('drag-placeholder')).toBe(false);
  });

  it('in the plan, a second finger neither starts a drag nor moves the first (BUG-137)', () => {
    vi.useFakeTimers();
    mockState.tasks = ['p1', 'p2', 'p3'].map(growth);
    mockState.dailyPlan = ['p1', 'p2', 'p3'];
    const c = makeContainer();
    renderHome(c);
    layOut(c.querySelectorAll('.plan-card'));
    const first = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    const second = c.querySelector('.plan-card[data-task-id="p3"] .plan-drag-handle');
    pointer(first, 'pointerdown', { y: 25 });
    pointer(second, 'pointerdown', { y: 145, pointerId: 8 });
    expect(floating(c, 'plan-card')).toHaveLength(1);
    pointer(second, 'pointermove', { y: 100, pointerId: 8 });
    // Its move does not drive the first drag (no highlight, copy not moved).
    expect(c.querySelectorAll('.plan-drag-over-top, .plan-drag-over-bottom')).toHaveLength(0);
    expect(floating(c, 'plan-card')[0].style.top).toBe('0px');
    pointer(second, 'pointerup', { y: 100, pointerId: 8 });
    pointer(second, 'pointercancel', { pointerId: 8 });
    expect(mockStorage.saveDailyPlan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(true);
    expect(floating(c, 'plan-card')).toHaveLength(1);
    // The first finger still drives its own drag.
    pointer(first, 'pointermove', { y: 100 });
    pointer(first, 'pointerup', { y: 100 });
    expect(mockState.dailyPlan).toEqual(['p2', 'p1', 'p3']);
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(false);
  });

  it('in the task list, a second finger neither starts a drag nor moves the first (BUG-137)', async () => {
    vi.useFakeTimers();
    const { reorderTasks } = await import('../../pwa/js/engine.js');
    const c = page({ tasks: [growth('t1'), growth('t2'), growth('t3')] });
    const first = c.querySelector('.task-card[data-task-id="t3"] .task-drag-handle');
    const second = c.querySelector('.task-card[data-task-id="t2"] .task-drag-handle');
    pointer(first, 'pointerdown', { x: 10, y: 125 });
    pointer(second, 'pointerdown', { x: 10, y: 80, pointerId: 8 });
    expect(floating(c, 'task-card')).toHaveLength(1);
    expect(c.querySelector('.task-card[data-task-id="t2"]').classList.contains('drag-placeholder')).toBe(false);
    pointer(second, 'pointermove', { x: 10, y: 10, pointerId: 8 });
    // Its move does not drive the first drag (no highlight).
    expect(c.querySelectorAll('.drag-over')).toHaveLength(0);
    pointer(second, 'pointerup', { x: 10, y: 10, pointerId: 8 });
    pointer(second, 'pointercancel', { pointerId: 8 });
    expect(reorderTasks).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(true);
    pointer(first, 'pointermove', { x: 10, y: 10 });
    pointer(first, 'pointerup', { x: 10, y: 10 });
    expect(reorderTasks).toHaveBeenCalledWith(expect.any(Array), 't3', 't1');
  });

  it('a plan drag right after another keeps page swipes off (BUG-137)', () => {
    vi.useFakeTimers();
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const handle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(handle, 'pointerdown', { y: 25 });
    pointer(handle, 'pointerup', { y: 25 });
    pointer(c.querySelector('.plan-card[data-task-id="p2"] .plan-drag-handle'), 'pointerdown', { y: 85 });
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(true);
  });

  it('a task drag right after another keeps page swipes off (BUG-137)', () => {
    vi.useFakeTimers();
    const c = page({ tasks: [growth('t1'), growth('t2')] });
    const handle = c.querySelector('.task-card[data-task-id="t1"] .task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 25 });
    pointer(handle, 'pointerup', { x: 10, y: 25 });
    pointer(c.querySelector('.task-card[data-task-id="t2"] .task-drag-handle'), 'pointerdown', { x: 10, y: 80 });
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(true);
  });

  it('a plan drag started within 50 ms of a task drop keeps page swipes off (BUG-137)', () => {
    vi.useFakeTimers();
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const taskHandle = c.querySelector('.task-card[data-task-id="p2"] .task-drag-handle');
    pointer(taskHandle, 'pointerdown', { x: 10, y: 80 });
    pointer(taskHandle, 'pointerup', { x: 10, y: 80 });   // no reorder, no redraw
    pointer(c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle'), 'pointerdown', { y: 25 });
    vi.advanceTimersByTime(50);                            // the task drag's reset
    expect(window._isDragging).toBe(true);
  });

  it('a drag started within 50 ms of the last one keeps page swipes off (BUG-137)', () => {
    vi.useFakeTimers();
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const planHandle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(planHandle, 'pointerdown', { y: 25 });
    pointer(planHandle, 'pointerup', { y: 25 });   // no reorder, no redraw
    const taskHandle = c.querySelector('.task-card[data-task-id="p2"] .task-drag-handle');
    pointer(taskHandle, 'pointerdown', { x: 10, y: 80 });
    vi.advanceTimersByTime(50);                     // the plan drag's reset
    expect(window._isDragging).toBe(true);
    pointer(taskHandle, 'pointerup', { x: 10, y: 80 });
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(false);
  });

  it('a drop that redraws Home still blocks the page switch for 50 ms', () => {
    vi.useFakeTimers();
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const handle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(handle, 'pointerdown', { y: 25 });
    expect(window._isDragging).toBe(true);
    pointer(handle, 'pointermove', { y: 100 });
    pointer(handle, 'pointerup', { y: 100 });
    expect(mockState.dailyPlan).toEqual(['p2', 'p1']);
    expect(window._isDragging).toBe(true);
    vi.advanceTimersByTime(50);
    expect(window._isDragging).toBe(false);
  });

  it('a cancelled drag puts the task back, in the plan and in the list', async () => {
    const { reorderTasks } = await import('../../pwa/js/engine.js');
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const planHandle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(planHandle, 'pointerdown', { y: 25 });
    pointer(planHandle, 'pointermove', { y: 100 });
    pointer(planHandle, 'pointercancel');
    expect(mockStorage.saveDailyPlan).not.toHaveBeenCalled();
    expect(mockState.dailyPlan).toEqual(['p1', 'p2']);

    const taskHandle = c.querySelector('.task-card[data-task-id="p2"] .task-drag-handle');
    pointer(taskHandle, 'pointerdown', { x: 10, y: 80 });
    pointer(taskHandle, 'pointermove', { x: 10, y: 10 });
    expect(c.querySelector('.task-card[data-task-id="p1"]').classList.contains('drag-over')).toBe(true);
    pointer(taskHandle, 'pointercancel');
    expect(reorderTasks).not.toHaveBeenCalled();
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
    expect(c.querySelectorAll('.drag-over, .drag-placeholder')).toHaveLength(0);
  });

  it('the plan handle ignores a right-click and has no context menu', () => {
    const c = page({ plan: ['p1', 'p2'], tasks: [growth('p1'), growth('p2')] });
    const handle = c.querySelector('.plan-card[data-task-id="p1"] .plan-drag-handle');
    pointer(handle, 'pointerdown', { pointerType: 'mouse', button: 2 });
    expect(floating(c, 'plan-card')).toHaveLength(0);
    expect(window._isDragging).toBeFalsy();
    const menu = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    handle.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('a task dragged onto another section is not dropped there', async () => {
    const { reorderTasks } = await import('../../pwa/js/engine.js');
    const c = page({ tasks: [growth('g1'), makeTask({ id: 'm1', name: 'm1', taskNature: 'maintenance', value: 'B' })] });
    const handle = c.querySelector('.task-card[data-task-id="m1"] .task-drag-handle');
    pointer(handle, 'pointerdown', { x: 10, y: 80 });
    pointer(handle, 'pointermove', { x: 10, y: 10 });   // over g1, in 成長任務
    expect(c.querySelector('.task-card[data-task-id="g1"]').classList.contains('drag-over')).toBe(false);
    pointer(handle, 'pointerup', { x: 10, y: 10 });
    expect(reorderTasks).not.toHaveBeenCalled();
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
  });
});
