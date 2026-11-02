import { state }                                              from './state.js';
import { storage, db, migrateV1toV2, migrateDefaultFlags }    from './storage.js';
import { signOut as authSignOut, getSession, onAuthStateChange } from './auth.js';
import { showLoginScreen, hideLoading } from './authFlow.js';
import { updateHeader } from './ui/header.js';
import { setBadgeUpdater } from './sessionFlow.js';
import './focusTimer.js'; // binds window.startFocus / endFocus / skipFocus / …
import { uid, today } from './utils.js';
import {
  eToday, processYesterdayStreak, showStreakUnlockModal,
  showDailyReport, showMorningModal, checkWeeklyBonus, startDayWatcher,
  clearDayCycleModals,
} from './dayCycle.js';
import { createDefaultTasks }   from './defaultTasks.js';
import {
  renderPage,
  currentHash,
  isTextInputTarget,
  isTextInputActive,
  markTextInputFocus,
  teardownActivePageRenderer,
} from './router.js';
import { applyTimeBand }        from './timeBand.js';
import { showToast, showSyncBanner } from './ui/feedback.js';
import { applyRandomThemeForToday, renderBg, initLiquidGlassReflection } from './theme.js';
import { FLAG_DEV_BACKUP, FLAG_STREAK_UNLOCK_NEW } from './flags.js';
import { refreshCanonicalStateAndReconcilePersonalSpaceV2 } from './personalSpace/v2/controller.js';
import { createAuthOperationGuard } from './platform/authOperationGuard.js';
import { createBootSequenceGuard } from './platform/bootSequenceGuard.js';
import { resolvePendingProRollover } from './proRollover.js';
import { isOnline, onConnectivityChange } from './platform/network.js';
import { orbitWindowRuntimeDestroyer } from './personalSpace/v2/runtime/pixiSceneRuntime.js';

// Lazy proxy — tour.js is not imported at startup; loaded on first call.
window.startTour = () =>
  import('./tour.js')
    .then(m => m.startTour())
    .catch(() => showToast('導覽載入失敗'));

// ─── Auth session state ───────────────────────────────────────────────────────
let _currentSession   = null;
let _loginListenerSet = false;
const authOperationGuard = createAuthOperationGuard();
const bootSequenceGuard  = createBootSequenceGuard();

// ─── Daily Plan ───────────────────────────────────────────────────────────────

window.addToDailyPlan = function (taskId) {
  state.dailyPlan = storage.currentDailyPlan(state.dailyPlan);
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
  state.dailyPlan = storage.currentDailyPlan(state.dailyPlan).filter(id => id !== taskId);
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
  authOperationGuard.invalidate();
  try { await authSignOut(); } catch (e) { console.error('signOut error:', e); }
  handleSignOut();
};

// ─── Setup screen ────────────────────────────────────────────────────────────

/**
 * @param {string|null} ownerId the signed-in account this setup belongs to.
 *   Only `loadAndStart` passes one. A guest never inherits `_currentSession`:
 *   it can still hold an account whose remote load failed, and taking that id
 *   would push a blank profile over the real one on the next sync.
 */
function showSetup(ownerId = null) {
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
    // Each showSetup() adds a listener that keeps its own owner. If another tab
    // switched accounts while setup stayed open, a listener left over from the
    // earlier account must not save the new account's data under the old id.
    if (ownerId && _currentSession?.user?.id !== ownerId) return;
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return;
    // Authenticated setup can be reached with an existing profile (for example,
    // when the remote task list is empty). Treat setup as a partial update:
    // preserve every existing field, including future profile fields unknown to
    // this form, and only replace values the user actually edits here.
    const existingProfile = storage.getUser() ?? state.user ?? {};

    state.user = {
      ...existingProfile,
      id: ownerId || existingProfile.id || uid(),
      name,
      avatar: avatarData ?? existingProfile.avatar ?? null,
      totalXP: existingProfile.totalXP ?? 0,
      streakDays: existingProfile.streakDays ?? 0,
      lastStreakDate: existingProfile.lastStreakDate ?? '',
      lastWeeklyBonusDate: existingProfile.lastWeeklyBonusDate ?? '',
      morningState: existingProfile.morningState ?? 'normal',
      newDayHour: existingProfile.newDayHour ?? 5,
      createdAt: existingProfile.createdAt ?? today(),
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
  if (sessionStorage.getItem(FLAG_STREAK_UNLOCK_NEW)) {
    sessionStorage.removeItem(FLAG_STREAK_UNLOCK_NEW);
    setTimeout(showStreakUnlockModal, 800);
  }
  // Warm-load non-critical modules after the initial screen is visible
  warmEnhancementModules();
}

// ─── Boot helpers (shared by guest / auth / cached-init paths) ────────────────

function loadStateFromStorage({
  authoritative = false,
  provisionalMigration = false,
  finalizeMigration = authoritative === true,
} = {}) {
  const cachedOwnerId = storage.getUser()?.id;
  if (typeof cachedOwnerId === 'string' && cachedOwnerId.trim()) {
    try {
      storage.recoverPendingSessionDeletions(cachedOwnerId);
    } catch (error) {
      console.warn('Interrupted Session undo recovery will retry on the next load:', error);
    }
  }
  return refreshCanonicalStateAndReconcilePersonalSpaceV2({
    centralState: state,
    storageApi: storage,
    authoritative,
    provisionalMigration,
    finalizeMigration,
  });
}

/** Day rollover + show app + periodic bonus — the sequence formerly copy-pasted ×3. */
function bootWithLocalState() {
  // BUG-106: the cached-user branch and a 'SIGNED_IN' that lands before
  // getSession() resolves can both reach this in one launch. Revealing the app
  // again is harmless, but replaying the day rollover is not: it stacks a
  // second daily-report / morning modal, and re-runs the streak and weekly
  // bonus against the just-pulled remote profile, which may still be missing
  // the lastStreakDate / lastWeeklyBonusDate the first pass wrote locally.
  if (!bootSequenceGuard.claim(state.user?.id ?? null)) {
    showMainApp();
    return;
  }
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
  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');
  loadStateFromStorage();
  // PRO-014Q Q6: clearing leftover dev data can delete a guest's local user
  // while its tasks stay (the backup belonged to another account, so the
  // guest could not be told apart from that account's cached user). Without a
  // user nothing can be recorded, so the guest sets a profile up again.
  if (!state.tasks.length || !state.user) {
    showSetup();
  } else {
    bootWithLocalState();
  }
};

async function loadAndStart(session) {
  const operation = authOperationGuard.begin(session);
  _currentSession = session;
  let remoteLoaded = false;

  // Pull fresh data from Supabase; fall back to localStorage cache if offline
  try {
    await _loadRemote(session.user.id);
    if (!authOperationGuard.isCurrent(operation)) return;
    remoteLoaded = true;
    // PRO-014B: refresh the owner-scoped entitlement projection from the
    // server response. No-ops under the default legacy source, so this costs
    // production nothing until PRO-014H performs the cutover.
    await db.refreshProEntitlement(session.user.id);
    if (!authOperationGuard.isCurrent(operation)) return;
  } catch (e) {
    if (!authOperationGuard.isCurrent(operation) || e?.name === 'OwnerSessionChangedError') return;
    console.warn('Supabase load failed, using localStorage cache:', e);
    _showSyncFailure();
  }

  if (!authOperationGuard.isCurrent(operation)) return;

  loadStateFromStorage({
    authoritative: remoteLoaded,
    finalizeMigration: true,
  });

  // An empty task list only means "new account" after a successful canonical
  // remote load. If the pull failed, setup must never rebuild and sync a profile
  // from incomplete local state. Same-owner cache may still boot offline; an
  // absent or foreign-owner cache fails closed and waits for a retry.
  const hasCurrentOwnerCache = state.user?.id === session.user.id;
  if (!remoteLoaded && !hasCurrentOwnerCache) {
    showLoginScreen();
    showToast('無法載入雲端資料，請檢查連線後重新整理。');
    return;
  }

  // Start the Pro trial for new authenticated users. PRO-014C: the server
  // grants it, and `start_trial()` is idempotent, so a repeat call is a normal
  // result rather than an error. Only a changed owner may abort the boot — an
  // RPC failure must not, because the abort below sits before `hideLoading()`
  // and would leave the user stranded on the loading screen over something as
  // ordinary as being offline. A failed trial start is retried next launch.
  if (state.user && !state.user.trialStartedAt) {
    const trial = await db.startTrial(session.user.id);
    if (!authOperationGuard.isCurrent(operation) || trial.ownerChanged) return;
    state.user = storage.getUser() ?? state.user;
  }

  // PRO-014P: Pro effects an earlier rollover deferred, now that the refresh
  // above may have settled the status. Here rather than relying on the
  // rollover's own call: when this boot is the second one (BUG-106) the
  // rollover is skipped, and the cached-user sync is skipped too.
  resolvePendingProRollover();

  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');

  if (!state.tasks.length && remoteLoaded) {
    // New user: no tasks yet — show setup to customise profile + seed defaults
    showSetup(session.user.id);
  } else {
    bootWithLocalState();
  }
}

function handleSignOut() {
  authOperationGuard.invalidate();
  // Releases the launch-scoped boot claim so the next sign-in runs the day
  // rollover again — for a different account, or the same one after a reset.
  bootSequenceGuard.reset();
  teardownActivePageRenderer();
  orbitWindowRuntimeDestroyer.destroyNow();
  // Overlays are mounted on <body>, so hiding #main-app below leaves them
  // floating above the login screen with a null state.user behind them.
  clearDayCycleModals();
  if (!_currentSession && !storage.getUser()) return; // already signed out
  _currentSession = null;
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
// ── HW-110: offline queue visibility and reconnect sync ─────────────────────
// Offline writes already wait in owner-scoped pending sidecars, and
// db.loadFromRemote() pushes them. This makes that queue visible and pushes it
// as soon as the connection returns instead of at the next launch. Guests have
// no remote account, so none of this applies without a session.
let _needsResync = false;
let _reconnectSync = null;
let _remoteSync = null;   // settles once the latest remote load and its backfills finish

// Every remote load goes through here so a reconnect never runs concurrently
// with the startup load: both would replay the same pending snapshots and
// insert the same backfilled Sessions twice.
function _loadRemote(ownerId) {
  const load = db.loadFromRemote(ownerId);
  const settled = load.then(result => result?.backfilled, () => {});
  _remoteSync = settled;
  settled.then(() => { if (_remoteSync === settled) _remoteSync = null; });
  return load;
}

// A resolved load can still leave writes queued: Session backfills settle
// after it and a failed deletion stays in the log. Only an empty queue reads
// as synced; anything else stays flagged for the next reconnect.
async function _reportSyncResult(loaded, isCurrent) {
  await loaded?.backfilled;
  if (!isCurrent()) return;
  if (_pendingSyncCount() > 0) {
    _showSyncFailure();
    return;
  }
  _needsResync = false;
  showSyncBanner('synced');
}

function _pendingSyncCount() {
  return storage.getPendingSyncSummary(_currentSession?.user?.id ?? null).total;
}

function _showSyncFailure() {
  _needsResync = true;
  showSyncBanner(isOnline() ? 'error' : 'offline', { pending: _pendingSyncCount() });
}

/** Keeps the offline banner's pending count current after local writes. */
function _refreshOfflineHint() {
  if (!_currentSession || isOnline()) return;
  showSyncBanner('offline', { pending: _pendingSyncCount() });
}

// Deliberately not authOperationGuard.begin(): a new generation would cancel a
// loadAndStart() still in flight. Session identity is checked after each await
// instead, and loadFromRemote() itself rejects when the owner changes.
async function _syncAfterReconnect() {
  const session = _currentSession;
  if (!session || _reconnectSync) return;
  showSyncBanner('syncing');
  _reconnectSync = (async () => {
    try {
      if (_remoteSync) await _remoteSync;
      if (_currentSession !== session) return;
      const loaded = await _loadRemote(session.user.id);
      if (_currentSession !== session) return;
      await db.refreshProEntitlement(session.user.id);
      if (_currentSession !== session) return;
      loadStateFromStorage({ authoritative: true });
      resolvePendingProRollover();   // PRO-014P: deferred Pro effects, now that the status may be known
      updateHeader();
      // Re-rendering under a focused text field would throw away what is being typed.
      if (!isTextInputActive()) renderPage(currentHash());
      _updateBadge();
      await _reportSyncResult(loaded, () => _currentSession === session);
    } catch (error) {
      if (_currentSession !== session || error?.name === 'OwnerSessionChangedError') return;
      console.warn('Reconnect sync failed; pending changes stay queued:', error);
      _showSyncFailure();
    } finally {
      _reconnectSync = null;
    }
  })();
  await _reconnectSync;
}

onConnectivityChange(online => {
  if (!online) {
    _needsResync = true;
    _refreshOfflineHint();
  } else if (_needsResync) {
    _syncAfterReconnect();
  }
});

// PRO-014Q S0 (A1): the developer panel's reset in another window removes the
// dev backup, which is what kept this window from syncing its in-memory user.
// That user may still hold the simulated values, and the next saveUser() would
// push them to `profiles`, so start over from what the reset left on disk. A
// null key means localStorage was cleared outright; no app path does that.
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage) return;
  const backupRemoved = event.key === FLAG_DEV_BACKUP && event.oldValue !== null && event.newValue === null;
  if (event.key === null || backupRemoved) location.reload();
});

// sessionFlow calls this after every commit/delete (no-op until badge module
// loads); HW-110 also refreshes the offline pending count from the same hook.
setBadgeUpdater(() => {
  _updateBadge();
  _refreshOfflineHint();
});

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
    } else if (
      event === 'SIGNED_IN'
      && session
      && _currentSession?.user?.id !== session.user.id
    ) {
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
    const cachedResolution = authOperationGuard.begin(cachedUser.id);
    // The cached snapshot makes the UI available immediately, but the first
    // V2 Gold cutover remains provisional until auth/remote resolution ends.
    loadStateFromStorage({ provisionalMigration: true });
    hideLoading();
    bootWithLocalState();
    _updateBadge();

    // Sync from Supabase in background (no spinner)
    getSession().then(session => {
      if (session) {
        if (_currentSession?.user?.id === session.user.id) return;
        const operation = authOperationGuard.begin(session);
        _currentSession = session;
        showSyncBanner('syncing');
        _loadRemote(session.user.id).then(async loaded => {
          if (!authOperationGuard.isCurrent(operation)) return;
          // PRO-014O: returning users usually land here rather than in
          // loadAndStart(), which only runs when SIGNED_IN beats getSession().
          // Without this refresh the `server` source would let a paying
          // user's projection age out after SNAPSHOT_TTL_MS. No-op on legacy.
          await db.refreshProEntitlement(session.user.id);
          if (!authOperationGuard.isCurrent(operation)) return;
          // Quietly refresh canonical state and the V2 projection from the
          // completed remote/local merge without enqueueing a reveal.
          loadStateFromStorage({ authoritative: true });
          resolvePendingProRollover();   // PRO-014P: deferred Pro effects of this boot's rollover
          updateHeader();
          renderPage(currentHash());
          _updateBadge();
          await _reportSyncResult(loaded, () => authOperationGuard.isCurrent(operation));
        }).catch(error => {
          if (!authOperationGuard.isCurrent(operation)) return;
          if (error?.name === 'OwnerSessionChangedError') return;
          // Offline is an explicit local-cache decision, so finish the cutover
          // without treating the incomplete remote snapshot as authoritative.
          loadStateFromStorage({ finalizeMigration: true });
          _showSyncFailure();
        });
      } else {
        if (authOperationGuard.isCurrent(cachedResolution) && !_currentSession) {
          loadStateFromStorage({ finalizeMigration: true });
        }
      }
    }).catch(() => {
      if (authOperationGuard.isCurrent(cachedResolution) && !_currentSession) {
        loadStateFromStorage({ finalizeMigration: true });
      }
    });
    return;
  }

  // No cache: wait for Supabase session (first launch or after sign-out)
  const session = await getSession();
  if (session) {
    if (_currentSession?.user?.id !== session.user.id) await loadAndStart(session);
  } else {
    showLoginScreen();
  }
}

init();
