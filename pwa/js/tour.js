/**
 * tour.js — Onboarding step-by-step tour
 *
 * startTour()   — begin (or restart) the tour
 * isTourDone()  — check if user already completed it
 *
 * Each step highlights one element via a spotlight (box-shadow trick).
 * A backdrop div blocks accidental page interaction while the tour is open.
 */

const DONE_KEY = 'yoyo_tourDone';

export function isTourDone() {
  return !!localStorage.getItem(DONE_KEY);
}

function _markDone() {
  localStorage.setItem(DONE_KEY, '1');
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  {
    selector: '#header',
    title:    '你的成長指標',
    body:     '等級、XP 條和精力條會隨著你完成任務而成長，目標是每天保持上升！',
    tip:      'below',
  },
  {
    selector: '[data-page="home"]',
    title:    '今日頁',
    body:     '點擊任務小卡加入「今日計劃」，再點擊計劃卡完成任務、記錄 XP。',
    tip:      'above',
  },
  {
    selector: '[data-page="review"]',
    title:    '週回顧',
    body:     '查看每日成長 XP、有效日統計，以及任務價值分佈趨勢。',
    tip:      'above',
  },
  {
    selector: '[data-page="settings"]',
    title:    '設定',
    body:     '在設定中新增、編輯你的專屬任務清單，建立個人化成長系統。',
    tip:      'above',
  },
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

// ─── Public API ──────────────────────────────────────────────────────────────

export function startTour() {
  _step = 0;
  _showStep();
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function _showStep() {
  _clear();
  if (_step >= STEPS.length) { _markDone(); return; }

  const s      = STEPS[_step];
  const isLast = _step === STEPS.length - 1;

  // Backdrop — blocks accidental page interaction
  _backdrop = document.createElement('div');
  _backdrop.className = 'tour-backdrop';
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
        <button class="tour-next">${isLast ? '完成 ✓' : '下一步 →'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(_tooltip);

  _tooltip.querySelector('.tour-next').addEventListener('click', () => { _step++; _showStep(); });
  _tooltip.querySelector('.tour-skip').addEventListener('click', () => { _clear(); _markDone(); });

  if (s.selector) {
    const target = document.querySelector(s.selector);
    if (!target) { _step++; _showStep(); return; }

    const PAD = 6;
    const r   = target.getBoundingClientRect();

    _spot = document.createElement('div');
    _spot.className = 'tour-spot';
    _spot.style.cssText = `
      left:${r.left - PAD}px;top:${r.top - PAD}px;
      width:${r.width + PAD * 2}px;height:${r.height + PAD * 2}px;
    `;
    document.body.appendChild(_spot);

    _placeTooltip(r, s.tip, PAD);
  } else {
    // Centered step: add extra darkening class to backdrop
    _backdrop.classList.add('tour-backdrop-center');
    _tooltip.classList.add('tour-tooltip-center');
  }
}

// ─── Tooltip placement ────────────────────────────────────────────────────────

const TOOLTIP_W   = 288;
const TOOLTIP_H   = 148;   // rough estimate
const GAP         = 14;    // gap between spotlight and tooltip
const EDGE_MARGIN = 12;

function _placeTooltip(r, tip, pad) {
  const vw = window.innerWidth;

  let left = Math.max(EDGE_MARGIN,
    Math.min(r.left + r.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - EDGE_MARGIN));

  let top;
  if (tip === 'below') {
    top = r.bottom + pad + GAP;
    // If it would overflow the bottom, flip above
    if (top + TOOLTIP_H > window.innerHeight - EDGE_MARGIN) {
      top = r.top - pad - GAP - TOOLTIP_H;
    }
  } else {
    top = r.top - pad - GAP - TOOLTIP_H;
    if (top < EDGE_MARGIN) {
      top = r.bottom + pad + GAP;
    }
  }

  _tooltip.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${TOOLTIP_W}px;`;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function _clear() {
  _backdrop?.remove(); _backdrop = null;
  _spot?.remove();     _spot     = null;
  _tooltip?.remove();  _tooltip  = null;
}
