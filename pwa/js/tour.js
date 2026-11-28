/**
 * tour.js — Onboarding step-by-step tour
 *
 * startTour()   — begin (or restart) the tour
 * isTourDone()  — check if user already completed it
 *
 * Step 2 is interactive: the user must actually click the tutorial task card
 * to add it to the daily plan, then click the plan card to complete it.
 * A MutationObserver watches the DOM for these actions so no changes to
 * app.js are required.
 */

import { state } from './state.js';
import { renderPage, currentHash } from './router.js';
import { getDailyTaskCount } from './engine.js';
import { effectiveToday } from './utils.js';

const DONE_KEY = 'yoyo_tourDone';

export function isTourDone() {
  return !!localStorage.getItem(DONE_KEY);
}

function _markDone() {
  localStorage.setItem(DONE_KEY, '1');
}

// ─── Tutorial task (temporary, only exists while tour step 2 is active) ──────

const TUTORIAL_TASK_ID = 'tour-task';

const TUTORIAL_TASK = {
  id:                  TUTORIAL_TASK_ID,
  name:                '完成你的第一個任務',
  category:            'instant',
  impactType:          'task',
  taskNature:          'maintenance',
  value:               'B',
  difficulty:          0.4,
  resistance:          1.0,
  emoji:               '⭐',
  dailyXpCap:          1,      // B-class cap kicks in: finalXP = min(10, 1) = 1 XP
  cooldownMinutes:     0,
  minEffectiveMinutes: 0,
  isDefault:           true,
  isTutorial:          true,
  createdAt:           new Date().toLocaleDateString('sv'),
};

function _injectTutorialTask() {
  if (!state.tasks.find(t => t.id === TUTORIAL_TASK_ID)) {
    state.tasks.unshift(TUTORIAL_TASK);
  }
}

/** @returns {boolean} whether the task was there (in the tasks or the plan) */
function _removeTutorialTask() {
  const wasThere = state.tasks.some(t => t.id === TUTORIAL_TASK_ID)
    || (state.dailyPlan || []).includes(TUTORIAL_TASK_ID);
  state.tasks    = state.tasks.filter(t => t.id !== TUTORIAL_TASK_ID);
  state.dailyPlan = (state.dailyPlan || []).filter(id => id !== TUTORIAL_TASK_ID);
  return wasThere;
}

// ─── Step definitions ─────────────────────────────────────────────────────────
//
// `page`           — navigate here before showing the step (optional)
// `injectTutorial` — inject tutorial task into state.tasks before rendering
// `selector`       — element to spotlight; null = centered modal
// `tip`            — tooltip position: 'below' | 'above' | 'center'
// `hideNext`       — hide "下一步" button; tour advances only via waitFor
// `waitFor`        — CSS selector; tour auto-advances when this element appears in DOM
// `doneWhen`       — with waitFor: also has to hold (checked on each DOM change)
// `cleanup`        — remove tutorial task from state after this step auto-advances

const STEPS = [
  // 0 — header
  {
    selector: '#header',
    title:    '你的成長指標',
    body:     '等級、XP 條和精力條會隨著你完成任務而成長，目標是每天保持上升！',
    tip:      'below',
  },
  // 1a — add tutorial task to daily plan (interactive)
  {
    page:           'home',
    injectTutorial: true,
    selector:       `.task-card[data-task-id="${TUTORIAL_TASK_ID}"]`,
    title:          '加入今日計劃',
    body:           '點擊這個任務小卡，把它加入「本日計劃」👇',
    tip:            'below',
    hideNext:       true,
    waitFor:        `#plan-list .plan-card[data-task-id="${TUTORIAL_TASK_ID}"]`,
  },
  // 1b — complete tutorial task from plan card (interactive)
  {
    page:     'home',
    selector: `#plan-list .plan-card[data-task-id="${TUTORIAL_TASK_ID}"]`,
    title:    '完成任務 ✓',
    body:     '太棒了！現在點擊計劃卡，完成任務並獲得 XP 🎉',
    tip:      'below',
    hideNext: true,
    waitFor:  `#plan-list .plan-card[data-task-id="${TUTORIAL_TASK_ID}"] .plan-count-badge`,
    // BUG-205: restarted the same day, the badge is already there (today's
    // count) and the step went on without the user completing anything. A
    // completion in this run is what counts (also one tapped while step 2
    // was still showing its success state). At the day's cap no completion
    // can be added: the badge is enough, as before (#318 Codex P2).
    doneWhen: () => _practiceIds().some(id => !_practiceIdsAtStart.has(id)) || _practiceCappedToday(),
    cleanup:  true,
  },
  // 2 — week review
  {
    page:     'review',
    selector: '#nav [data-page="review"]',
    title:    '週回顧',
    body:     '查看每日成長 XP、有效日統計，以及任務價值分佈趨勢。',
    tip:      'above',
  },
  // 3 — settings
  {
    page:     'settings',
    selector: '#nav [data-page="settings"]',
    title:    '設定',
    body:     '在設定中新增、編輯你的專屬任務清單，建立個人化成長系統。',
    tip:      'above',
  },
  // 4 — finish
  {
    selector: null,          // centered modal — no spotlight
    title:    '準備好了！🚀',
    body:     '開始記錄你的成長旅程。\n隨時可在「設定 → 重啟教學」重新查看本教學。',
    tip:      'center',
  },
];

// ─── State ───────────────────────────────────────────────────────────────────

let _step     = 0;
let _backdrop = null;
let _spot     = null;
let _tooltip  = null;
let _observer = null;
let _advanceTimer = null;
let _generation = 0;   // bumped by _clear(): a step drawn after it is stale
let _practiceIdsAtStart = new Set();

/**
 * The practice task's sessions recorded so far (any day). A new id, not a
 * higher count: an earlier one undone (or rewritten by a sync) meanwhile
 * must not hide this run's completion (#318 review).
 */
const _practiceIds = () => (state.sessions || [])
  .filter(s => s.taskId === TUTORIAL_TASK_ID)
  .map(s => s.id);

// completeInstant (sessionFlow.js) records a task at most 3 times a day.
const DAILY_COMPLETION_CAP = 3;
const _practiceCappedToday = () => getDailyTaskCount(
  state.sessions || [], TUTORIAL_TASK_ID, effectiveToday(state.user?.newDayHour ?? 5),
) >= DAILY_COMPLETION_CAP;

// ─── Public API ──────────────────────────────────────────────────────────────

export function startTour() {
  // Clean up any leftover tutorial task from a previous interrupted run
  _removeTutorialTask();
  _clear();
  _step = 0;
  _practiceIdsAtStart = new Set(_practiceIds());
  _whenNoBlockingModal(_showStep);
}

// BUG-152: setup asks a new user for the morning state (dayCycle.js) right
// before the tour starts, and the tour went over that modal while it was still
// waiting for an answer. The tour starts once it is closed.
const BLOCKING_MODAL = '#morning-modal';
let _modalWaiter = null;

function _whenNoBlockingModal(callback) {
  _modalWaiter?.disconnect();
  _modalWaiter = null;
  if (!document.querySelector(BLOCKING_MODAL)) { callback(); return; }
  _modalWaiter = new MutationObserver(() => {
    if (document.querySelector(BLOCKING_MODAL)) return;
    _modalWaiter.disconnect();
    _modalWaiter = null;
    // A sign-out also closes it (app.js handleSignOut: clearDayCycleModals(),
    // then the app is hidden before this observer runs): no tour over the
    // login screen (#302 review).
    if (document.getElementById('main-app')?.classList.contains('hidden')) return;
    callback();
  });
  _modalWaiter.observe(document.body, { childList: true, subtree: true });
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function _showStep() {
  _clear();
  if (_step >= STEPS.length) { _markDone(); return; }

  const s = STEPS[_step];

  // Inject tutorial task before navigating so home renders it immediately
  if (s.injectTutorial) _injectTutorialTask();

  // Navigate to the required page first, then wait two animation frames
  // so renderPage() has time to update the DOM before we measure anything.
  if (s.page) {
    const generation = _generation;
    window.navigate?.(s.page);
    // Not if the tour was skipped or restarted meanwhile: that would draw a
    // second backdrop over the page (#298 review).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation === _generation) _renderStep(s);
    }));
  } else {
    _renderStep(s);
  }
}

function _renderStep(s) {
  const isLast = _step === STEPS.length - 1;

  // Backdrop — blocks accidental page interaction on non-interactive steps.
  // For interactive steps (waitFor), pointer-events must be none so clicks
  // can reach the spotlight target element and trigger the waitFor observer.
  _backdrop = document.createElement('div');
  _backdrop.className = 'tour-backdrop';
  if (s.waitFor) _backdrop.style.pointerEvents = 'none';
  document.body.appendChild(_backdrop);

  // Tooltip
  _tooltip = document.createElement('div');
  _tooltip.className = 'tour-tooltip';
  _tooltip.innerHTML = `
    <div class="tour-title">${s.title}</div>
    <div class="tour-body">${s.body.replace(/\n/g, '<br>')}</div>
    <div class="tour-footer">
      <span class="tour-counter">${_step + 1} / ${STEPS.length}</span>
      <div class="tour-actions">
        <button class="tour-skip">跳過</button>
        ${!s.hideNext ? `<button class="tour-next">${isLast ? '完成 ✓' : '下一步 →'}</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(_tooltip);

  if (!s.hideNext) {
    _tooltip.querySelector('.tour-next').addEventListener('click', () => { _step++; _showStep(); });
  }
  _tooltip.querySelector('.tour-skip').addEventListener('click', () => {
    // Skipped during a step's 600 ms success state: step 3 has already taken
    // the practice task out, but its cards are still drawn (#318 review).
    const advancing = _advanceTimer !== null;
    const removed = _removeTutorialTask();
    _clear();
    _markDone();
    // BUG-205: skipped at step 2 or 3, its task card (and plan card) stayed on
    // Home until the page was drawn again, doing nothing when tapped.
    if (removed || advancing) renderPage(currentHash());
  });

  if (s.selector) {
    const target = document.querySelector(s.selector);
    if (!target) { _step++; _showStep(); return; }

    // BUG-152: on a phone the tour's task card is far below the fold (Home
    // shows the plan, the Orbit Window and the growth tasks first). Measured
    // there, the spotlight was off screen and the whole page went dark under a
    // tip pointing at nothing. Bring it to the middle first.
    _bringIntoView(target);

    const PAD = 6;
    const r   = target.getBoundingClientRect();

    // Clamp spotlight to viewport so it doesn't get cut off at screen edges
    const spotL = Math.max(0, r.left   - PAD);
    const spotT = Math.max(0, r.top    - PAD);
    const spotR = Math.min(window.innerWidth,  r.right  + PAD);
    const spotB = Math.min(window.innerHeight, r.bottom + PAD);

    _spot = document.createElement('div');
    _spot.className = 'tour-spot';
    _spot.style.cssText =
      `left:${spotL}px;top:${spotT}px;` +
      `width:${spotR - spotL}px;height:${spotB - spotT}px;`;
    document.body.appendChild(_spot);

    _placeTooltip(r, s.tip, PAD);
  } else {
    // Centered step: extra darkening on backdrop, tooltip centered
    _backdrop.classList.add('tour-backdrop-center');
    _tooltip.classList.add('tour-tooltip-center');
  }

  // Set up auto-advance observer for interactive steps
  if (s.waitFor) {
    _watchFor(s.waitFor, s.doneWhen, () => {
      // Out at once: a second tap on its card in the next 600 ms then finds
      // no task and records nothing (#318 re-review).
      if (s.cleanup) _removeTutorialTask();
      _step++;
      // Small delay so the user sees the success state (e.g. count badge).
      // The step stays up meanwhile: skipping it cancels this (BUG-144).
      _advanceTimer = setTimeout(() => {
        _advanceTimer = null;
        _showStep();
      }, 600);
    });
  }
}

// Scrolls only the page (#content): scrollIntoView() would also scroll any
// other ancestor that overflows, and the app shell can be taller than the
// window (appHeight.js adds the bottom inset), so the root, which nothing
// scrolls back, moved and cut the header off (#302 review). Targets outside
// #content (the header, the bottom bar) are fixed and always on screen.
function _bringIntoView(target) {
  const scroller = target.closest('#content');
  if (!scroller) return;
  const box = target.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  // On screen means inside #content: under the header or the bottom bar it
  // is covered (430×932: the plan card under the header, #302 review).
  if (box.top >= view.top && box.bottom <= view.bottom) return;
  scroller.scrollTop += (box.top + box.height / 2) - (view.top + view.height / 2);
}

// ─── DOM watcher ─────────────────────────────────────────────────────────────

function _watchFor(selector, doneWhen, callback) {
  if (_observer) { _observer.disconnect(); _observer = null; }

  const met = () => Boolean(document.querySelector(selector)) && (!doneWhen || doneWhen());

  // Already present? Advance immediately.
  if (met()) {
    callback();
    return;
  }

  _observer = new MutationObserver(() => {
    if (met()) {
      _observer.disconnect();
      _observer = null;
      callback();
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Tooltip placement ────────────────────────────────────────────────────────

const TOOLTIP_W   = 288;
const TOOLTIP_H   = 148;   // rough estimate
const GAP         = 14;    // gap between spotlight and tooltip
const EDGE_MARGIN = 12;

function _placeTooltip(r, tip, pad) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = Math.max(EDGE_MARGIN,
    Math.min(r.left + r.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - EDGE_MARGIN));

  let top;
  if (tip === 'below') {
    top = r.bottom + pad + GAP;
    if (top + TOOLTIP_H > vh - EDGE_MARGIN) {
      top = r.top - pad - GAP - TOOLTIP_H;
    }
  } else {
    top = r.top - pad - GAP - TOOLTIP_H;
    if (top < EDGE_MARGIN) {
      top = r.bottom + pad + GAP;
    }
  }

  // Final clamp: never go outside viewport
  top = Math.max(EDGE_MARGIN, Math.min(top, vh - TOOLTIP_H - EDGE_MARGIN));

  _tooltip.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${TOOLTIP_W}px;`;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function _clear() {
  _backdrop?.remove(); _backdrop = null;
  _spot?.remove();     _spot     = null;
  _tooltip?.remove();  _tooltip  = null;
  if (_observer) { _observer.disconnect(); _observer = null; }
  clearTimeout(_advanceTimer);
  _advanceTimer = null;
  _generation++;
}
