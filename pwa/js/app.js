import { state }                                              from './state.js';
import { storage, db, migrateV1toV2, migrateDefaultFlags }    from './storage.js';
import { signOut as authSignOut, getSession, onAuthStateChange } from './auth.js';
import { showLoginScreen, hideLoading, resetLoginListenerBinding } from './authFlow.js';
import { updateHeader } from './ui/header.js';

// Re-export so existing importers (profile.js via dynamic import, tests) keep working.
export { updateHeader };
import { setBadgeUpdater } from './sessionFlow.js';
import './focusTimer.js'; // binds window.startFocus / endFocus / skipFocus / …
import { uid, today } from './utils.js';
import {
  eToday, processYesterdayStreak, showStreakUnlockModal,
  showDailyReport, showMorningModal, checkWeeklyBonus, startDayWatcher,
} from './dayCycle.js';
import { createDefaultTasks }   from './defaultTasks.js';
import { renderPage, currentHash, isTextInputTarget, isTextInputActive, markTextInputFocus } from './router.js';
import { applyTimeBand }        from './timeBand.js';
import { showToast, showXPFloat, showSyncBanner } from './ui/feedback.js';
import { applyRandomThemeForToday, renderBg, initLiquidGlassReflection } from './theme.js';

// Re-export so existing importers (pages via dynamic import) keep working.
export { showToast, showXPFloat, showSyncBanner };

// ─── Version ─────────────────────────────────────────────────────────────────
export { APP_VERSION } from './version.js';

// Lazy proxy — tour.js is not imported at startup; loaded on first call.
window.startTour = () =>
  import('./tour.js')
    .then(m => m.startTour())
    .catch(() => showToast('導覽載入失敗'));

// ─── Auth session state ───────────────────────────────────────────────────────
let _currentSession   = null;
let _isGuest          = false;
let _loginListenerSet = false;

// ─── Daily Plan ───────────────────────────────────────────────────────────────

window.addToDailyPlan = function (taskId) {
  if (state.dailyPlan.includes(taskId)) {
    showToast('任務已在計劃中');
    return;
  }
  state.dailyPlan.push(taskId);
  storage.saveDailyPlan(state.dailyPlan);
  showToast('✓ 已加入本日計劃');
  renderPage(currentHash());
};

window.removeFromDailyPlan = function (taskId) {
  state.dailyPlan = state.dailyPlan.filter(id => id !== taskId);
  storage.saveDailyPlan(state.dailyPlan);
  renderPage(currentHash());
};

// ─── Trial banner ────────────────────────────────────────────────────────────

function _showTrialBanner() {
  const banner = document.getElementById('trial-banner');
  if (!banner) return;
  if (!storage.isTrialUser()) { banner.classList.add('hidden'); return; }
  const daysLeft = storage.getTrialDaysRemaining();
  if (daysLeft > 5) { banner.classList.add('hidden'); return; }
  if (storage.getTrialBannerDismissDate() === today()) { banner.classList.add('hidden'); return; }

  banner.innerHTML =
    `<span class="trial-banner-text">✦ Pro 試用剩餘 <strong>${daysLeft}</strong> 天</span>` +
    `<button class="trial-banner-cta" onclick="window.navigate('settings')">升級 Pro</button>` +
    `<button class="trial-banner-close" onclick="window._dismissTrialBanner()">✕</button>`;
  banner.classList.remove('hidden');
}

window._dismissTrialBanner = function () {
  storage.saveTrialBannerDismissDate(today());
  document.getElementById('trial-banner')?.classList.add('hidden');
};

window.signOut = async function () {
  try { await authSignOut(); } catch (e) { console.error('signOut error:', e); }
  handleSignOut();
};

// ─── Setup screen ────────────────────────────────────────────────────────────

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  let avatarData = null;

  document.getElementById('setup-avatar-btn').addEventListener('click', () => {
    document.getElementById('setup-avatar-input').click();
  });
  document.getElementById('setup-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      avatarData = ev.target.result;
      const preview = document.getElementById('setup-avatar-preview');
      preview.style.cssText += `;background-image:url(${avatarData});background-size:cover;background-position:center`;
      preview.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return;

    state.user = {
      id: _currentSession?.user?.id || uid(), name, avatar: avatarData, totalXP: 0,
      streakDays: 0, lastStreakDate: '', lastWeeklyBonusDate: '',
      morningState: 'normal', newDayHour: 5, createdAt: today(),
    };
    storage.saveUser(state.user);

    if (state.tasks.length === 0) {
      state.tasks = createDefaultTasks();
      storage.saveTasks(state.tasks);
    }

    showMainApp();
    // Ask morning state on first day
    showMorningModal();
    // Show onboarding tour for new users (slight delay so page renders first)
    setTimeout(() => window.startTour(), 600);
  });
}

function showMainApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateHeader();
  renderPage(currentHash());
  startDayWatcher();
  _showTrialBanner();
  if (sessionStorage.getItem('orbit_streak_unlock_new')) {
    sessionStorage.removeItem('orbit_streak_unlock_new');
    setTimeout(showStreakUnlockModal, 800);
  }
  // Warm-load non-critical modules after the initial screen is visible
  warmEnhancementModules();
}

// ─── Boot helpers (shared by guest / auth / cached-init paths) ────────────────

function loadStateFromStorage() {
  state.user      = storage.getUser();
  state.tasks     = storage.getTasks();
  state.sessions  = storage.getSessions();
  state.energy    = storage.getEnergy();
  state.dailyPlan = storage.getDailyPlan();
}

/** Day rollover + show app + periodic bonus — the sequence formerly copy-pasted ×3. */
function bootWithLocalState() {
  processYesterdayStreak();
  if (state.energy.lastResetDate !== eToday()) {
    showMainApp();
    showDailyReport(() => showMorningModal());
  } else {
    showMainApp();
  }
  checkWeeklyBonus();
}

window.continueAsGuest = function () {
  _isGuest = true;
  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');
  loadStateFromStorage();
  if (!state.tasks.length) {
    showSetup();
  } else {
    bootWithLocalState();
  }
};

async function loadAndStart(session) {
  _currentSession = session;

  // Pull fresh data from Supabase; fall back to localStorage cache if offline
  try {
    await db.loadFromRemote(session.user.id);
  } catch (e) {
    console.warn('Supabase load failed, using localStorage cache:', e);
  }

  loadStateFromStorage();

  // Start 15-day Pro trial for new authenticated users
  if (state.user && !state.user.trialStartedAt) {
    await db.startTrial(session.user.id);
    state.user = storage.getUser() ?? state.user;
  }

  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');

  if (!state.tasks.length) {
    // New user: no tasks yet — show setup to customise profile + seed defaults
    showSetup();
  } else {
    bootWithLocalState();
  }
}

function handleSignOut() {
  if (!_currentSession && !storage.getUser()) return; // already signed out
  _currentSession = null;
  _isGuest        = false;
  resetLoginListenerBinding();
  state.user     = null;
  state.tasks    = [];
  state.sessions = [];
  state.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
  storage.clearAll();
  if (_badgeMod) _badgeMod.clearBadge().catch(() => {});

  // Clear login form fields
  const emailEl = document.getElementById('auth-email');
  if (emailEl) emailEl.value = '';
  const pwEl = document.getElementById('auth-password');
  if (pwEl) pwEl.value = '';

  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  showLoginScreen();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Sync the app shell to the real visible viewport height on mobile browsers.
// visualViewport is more reliable on Chrome when the address bar expands/collapses.
function _syncAppHeight() {
  if (isTextInputActive()) return;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const sab = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
  document.documentElement.style.setProperty('--app-height', Math.round(viewportHeight + sab) + 'px');
}
_syncAppHeight();
window.addEventListener('resize', _syncAppHeight);
window.addEventListener('orientationchange', _syncAppHeight);
window.visualViewport?.addEventListener('resize', _syncAppHeight);
window.visualViewport?.addEventListener('scroll', _syncAppHeight);
document.addEventListener('focusin', e => {
  if (!isTextInputTarget(e.target)) return;
  markTextInputFocus();
  document.documentElement.classList.add('keyboard-editing');
}, true);
document.addEventListener('focusout', e => {
  if (!isTextInputTarget(e.target)) return;
  markTextInputFocus();
  setTimeout(() => {
    if (isTextInputActive()) return;
    document.documentElement.classList.remove('keyboard-editing');
    _syncAppHeight();
  }, 260);
}, true);

// ─── Warm / lazy module loading ───────────────────────────────────────────────

// _badgeMod is populated by warmEnhancementModules(); calls before that are no-ops.
let _badgeMod = null;

function warmEnhancementModules() {
  const run = typeof window.requestIdleCallback !== 'undefined'
    ? cb => window.requestIdleCallback(cb, { timeout: 2000 })
    : cb => setTimeout(cb, 500);
  run(_doWarmImports);
}

async function _doWarmImports() {
  const [badgeResult] = await Promise.allSettled([
    import('./platform/badge.js'),
    import('./pages/leaderboard.js'), // pre-warm so leaderboard navigation is instant
    import('./tour.js'),              // pre-warm for new-user onboarding path
  ]);
  if (badgeResult.status === 'fulfilled') {
    _badgeMod = badgeResult.value;
    _updateBadge(); // apply badge count now that the module is ready
  }
}

function _updateBadge() {
  if (!_badgeMod) return;
  const todayStr = eToday();
  const count = state.sessions.filter(s => s.date === todayStr && s.result !== 'invalid').length;
  _badgeMod.setBadge(count).catch(() => {});
}
// sessionFlow calls this after every commit/delete (no-op until badge module loads)
setBadgeUpdater(_updateBadge);

// Tap header to scroll main content to top (mirrors iOS status-bar tap behavior)
document.getElementById('header')?.addEventListener('click', e => {
  if (e.target.closest('button, a, label, input, select')) return;
  document.getElementById('content')?.scrollTo({ top: 0, behavior: 'smooth' });
});

async function init() {
  migrateV1toV2(today());
  migrateDefaultFlags();         // tag pre-existing default tasks with isDefault:true
  document.documentElement.setAttribute('data-theme', storage.getTheme());
  document.documentElement.setAttribute('data-ui-skin', storage.getUiSkin());
  applyRandomThemeForToday(); // overrides saved theme if random-theme feature is on
  initLiquidGlassReflection();
  applyTimeBand();
  renderBg(storage.getBgImage());

  // Listen for future auth changes (sign-ins, sign-outs)
  onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      window._showResetPasswordModal();
    } else if (event === 'SIGNED_IN' && session && !_currentSession) {
      await loadAndStart(session);
    } else if (event === 'SIGNED_OUT') {
      handleSignOut();
    }
  });

  // If we have cached user data, show app immediately — don't wait for Supabase.
  // (No empty-tasks → setup branch here: a cached user with zero tasks keeps
  // seeing the main app, matching the pre-refactor behavior.)
  const cachedUser = storage.getUser();
  if (cachedUser) {
    loadStateFromStorage();
    hideLoading();
    bootWithLocalState();
    _updateBadge();

    // Sync from Supabase in background (no spinner)
    getSession().then(session => {
      if (session) {
        _currentSession = session;
        showSyncBanner('syncing');
        db.loadFromRemote(session.user.id).then(() => {
          // Quietly refresh state from updated cache
          state.user     = storage.getUser()     || state.user;
          state.tasks    = storage.getTasks();
          state.sessions = storage.getSessions();
          state.energy   = storage.getEnergy();
          updateHeader();
          renderPage(currentHash());
          _updateBadge();
          showSyncBanner('synced');
        }).catch(() => {
          showSyncBanner('synced'); // hide banner even on failure
        });
      }
    }).catch(() => {});
    return;
  }

  // No cache: wait for Supabase session (first launch or after sign-out)
  const session = await getSession();
  if (session) {
    await loadAndStart(session);
  } else {
    showLoginScreen();
  }
}

init();
