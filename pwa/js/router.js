// Hash router, page slide animation, and swipe navigation.
// Moved verbatim from app.js. window.navigate keeps its global name —
// index.html inline onclick and the pages depend on it.

import { renderHome }           from './pages/home.js';
import { renderGoals }          from './pages/goals.js';
import { renderReview }         from './pages/review.js';
import { renderProfile }        from './pages/profile.js';
import { renderSettings }       from './pages/settings.js';
import { renderPersonalSpace }  from './pages/personalSpace.js';
import { showToast }            from './ui/feedback.js';

// ─── Router ──────────────────────────────────────────────────────────────────

const SYNC_ROUTES = {
  home:          renderHome,
  goals:         renderGoals,
  review:        renderReview,
  profile:       renderProfile,
  personalSpace: renderPersonalSpace,
  settings:      renderSettings,
};

// Lazy routes: module is not imported at startup; loaded on first navigation.
const LAZY_ROUTES = {
  leaderboard: () => import('./pages/leaderboard.js').then(m => m.renderLeaderboard),
};

export function currentHash() { return window.location.hash.slice(1) || 'home'; }

// ─── Page slide animation + dot indicator ─────────────────────────────────────

const PAGE_ORDER = ['home', 'goals', 'review', 'profile', 'personalSpace', 'leaderboard', 'settings'];
let _prevPageIdx = -1;   // -1 = first render, skip animation

export async function renderPage(hash) {
  const content = document.getElementById('content');
  content.dataset.route = hash;
  const newIdx = PAGE_ORDER.indexOf(hash);

  const syncFn = SYNC_ROUTES[hash];
  if (syncFn) {
    syncFn(content);
  } else if (LAZY_ROUTES[hash]) {
    let loadTimer;
    try {
      // Only show loading skeleton if the import takes longer than 200ms
      // (avoids flicker when the module is already in the browser module cache)
      loadTimer = setTimeout(() => {
        if (content.dataset.route === hash) content.innerHTML = '<div class="lazy-page-loading"></div>';
      }, 200);
      const renderFn = await LAZY_ROUTES[hash]();
      clearTimeout(loadTimer);
      if (content.dataset.route !== hash) return; // user navigated away while loading
      renderFn(content);
    } catch {
      clearTimeout(loadTimer);
      if (content.dataset.route !== hash) return;
      showToast('頁面載入失敗，請稍後再試');
      renderHome(content);
    }
  } else {
    renderHome(content);
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === hash);
  });

  // Slide animation — skip on first render
  if (_prevPageIdx !== -1 && newIdx !== _prevPageIdx) {
    const cls = newIdx > _prevPageIdx ? 'page-slide-left' : 'page-slide-right';
    content.classList.remove('page-slide-left', 'page-slide-right');
    void content.offsetWidth;   // force reflow so re-adding the class re-triggers
    content.classList.add(cls);
    content.addEventListener('animationend', () => content.classList.remove(cls), { once: true });
  }
  _prevPageIdx = newIdx === -1 ? 0 : newIdx;
}

window.navigate = function (page) { window.location.hash = '#' + page; };
window.addEventListener('hashchange', () => renderPage(currentHash()));

// ─── Swipe navigation ─────────────────────────────────────────────────────────

let _swipeStartX = 0, _swipeStartY = 0;
let _lastTextInputFocusAt = 0;

export function isTextInputTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

export function isTextInputActive() {
  return isTextInputTarget(document.activeElement);
}

/** Called on focusin/focusout so a recent keyboard session suppresses swipe nav. */
export function markTextInputFocus() {
  _lastTextInputFocusAt = Date.now();
}

document.addEventListener('touchstart', e => {
  if (isTextInputTarget(e.target) || isTextInputActive()) {
    _swipeStartX = 0;
    _swipeStartY = 0;
    return;
  }
  _swipeStartX = e.touches[0].clientX;
  _swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (window._isDragging) return;
  if (isTextInputTarget(e.target) || isTextInputActive() || Date.now() - _lastTextInputFocusAt < 900) return;
  const dx = e.changedTouches[0].clientX - _swipeStartX;
  const dy = e.changedTouches[0].clientY - _swipeStartY;
  // Only trigger for clearly horizontal swipes (not vertical scrolling)
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.75) return;
  const hash = currentHash();
  const idx  = PAGE_ORDER.indexOf(hash);
  if (idx === -1) return;
  if (dx < 0 && idx < PAGE_ORDER.length - 1) window.navigate(PAGE_ORDER[idx + 1]);
  else if (dx > 0 && idx > 0) window.navigate(PAGE_ORDER[idx - 1]);
}, { passive: true });
