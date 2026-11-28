// INFRA-113: also loaded by its own <script> tag; importing it here covers an
// older cached index.html (no such tag) running this version's modules.
import './domActions.js';
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
import { requestStreakUnlock } from './streakUnlock.js';
import { appShellHeight } from './appHeight.js';
import { needsProRefreshOnResume } from './proResume.js';
import {
  statusBarNoticeStep, statusBarNoticeText, statusBarSyncCheckText, dismissStatusBarNotice,
  readStatusBarNoticeState, writeStatusBarNoticeState,
} from './statusBarNotice.js';
import { hasStoredSession } from './sessionPresence.js';
import { flushProofSync } from './platform/proofSync.js';
import { forgetCloudProofMisses, keepCloudProofsOf } from './platform/proofCloud.js';
import { photosNotSurelyUploaded, signOutProofCleanup } from './platform/proofLocal.js';
import { unsureProofPhotos } from './platform/proofUnsure.js';
import { sweepOrphanCloudProofs } from './platform/proofSweep.js';
import { closeProofKeepSheet, showProofKeepSheet } from './ui/proofKeepSheet.js';
import { isOnline, onConnectivityChange } from './platform/network.js';
import { orbitWindowRuntimeDestroyer } from './personalSpace/v2/runtime/pixiSceneRuntime.js';
import { forgetLocalSession } from './localSession.js';

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
    `<button class="trial-banner-cta" data-action="navigate" data-action-arg="settings">升級 Pro</button>` +
    `<button class="trial-banner-close" data-action="dismissTrialBanner">✕</button>`;
  banner.classList.remove('hidden');
}

// PRO-014H: what depends on the Pro status, re-run once a refresh may have
// changed it (each step is safe to repeat).
function _applyProDependentUi() {
  resolvePendingProRollover();     // PRO-014P: deferred Pro effects
  applyRandomThemeForToday();      // Pro-only; once a day
  _showTrialBanner();
  _showStatusBarNotice();          // BUG-118: signed in or out since the boot
  updateHeader();
  // Re-rendering under a focused text field would throw away what is being typed.
  if (!isTextInputActive()) renderPage(currentHash());
}

// PRO-014H: a PWA kept in memory can outlive the projection's 24 h without a
// boot or a reconnect (js/proResume.js).
let _resumeProRefresh = null;
function _refreshProOnResume() {
  const session = _currentSession;
  if (!session || _resumeProRefresh) return;
  if (!needsProRefreshOnResume(session.user.id, { online: isOnline() })) return;
  _resumeProRefresh = db.refreshProEntitlement(session.user.id)
    .then(() => { if (_currentSession === session) _applyProDependentUi(); })
    .catch(error => console.warn('Pro refresh on resume failed:', error))
    .finally(() => { _resumeProRefresh = null; });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _refreshProOnResume();
});

// BUG-118: an icon added before v1.41.14 keeps the old translucent status bar
// (js/statusBarNotice.js). The step is decided once per page load. Whether
// the device is signed in comes from the stored session as well: a cached boot
// shows the main app before getSession() resolves, and offline with an expired
// token it never does (BUG-116). The banner is rebuilt only when its text
// changes, so a redraw neither re-announces it nor drops focus.
let _statusBarNotice = null;
function _showStatusBarNotice() {
  const el = document.getElementById('status-bar-notice');
  if (!el) return;
  if (!_statusBarNotice) {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const decision = statusBarNoticeStep({
      iosHomeScreen: window.navigator.standalone === true,
      safeTop: parseFloat(rootStyle.getPropertyValue('--sat')) || 0,
      portrait: window.innerHeight >= window.innerWidth,
      screenShortSide: Math.min(window.screen?.width ?? Infinity, window.screen?.height ?? Infinity),
      navigationType: window.performance?.getEntriesByType?.('navigation')?.[0]?.type ?? 'navigate',
      saved: readStatusBarNoticeState(window.localStorage),
      nowMs: Date.now(),
    });
    writeStatusBarNoticeState(window.localStorage, decision.next);
    _statusBarNotice = { step: decision.step };
  }
  const { step } = _statusBarNotice;
  if (step === 'none') {
    el.classList.add('hidden');
    el.replaceChildren();
    delete el.dataset.key;
    return;
  }
  const signedIn = Boolean(_currentSession) || hasStoredSession();
  const key = `${step}:${signedIn ? 'account' : 'guest'}`;
  if (el.dataset.key === key && !el.classList.contains('hidden')) return;
  const appUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
  const text = statusBarNoticeText(step, { signedIn, appUrl });

  const body = document.createElement('div');
  body.className = 'sbn-text';
  const title = document.createElement('strong');
  title.textContent = text.title;
  const summary = document.createElement('p');
  summary.textContent = text.summary;
  body.append(title, summary);
  if (text.steps.length) {
    const details = document.createElement('details');
    const toggle = document.createElement('summary');
    toggle.textContent = '怎麼做';
    const list = document.createElement('ol');
    for (const line of text.steps) {
      const item = document.createElement('li');
      item.textContent = line;
      list.append(item);
    }
    const warning = document.createElement('p');
    warning.className = 'sbn-warning';
    warning.textContent = text.warning;
    details.append(toggle, list, warning);
    if (signedIn) {
      const check = document.createElement('button');
      check.className = 'sbn-check';
      check.dataset.action = 'checkStatusBarSync';
      check.textContent = '檢查同步';
      const result = document.createElement('p');
      result.className = 'sbn-check-result';
      result.setAttribute('role', 'status');
      details.append(check, result);
    }
    body.append(details);
  }
  const close = document.createElement('button');
  close.className = 'sbn-close';
  close.dataset.action = 'dismissStatusBarNotice';
  close.setAttribute('aria-label', '關閉這個提示');
  close.textContent = '✕';
  el.replaceChildren(body, close);
  el.dataset.step = step;
  el.dataset.key = key;
  el.classList.remove('hidden');
}

// BUG-118: whether the old icon still holds writes the server has not
// confirmed, read when the button is pressed (never a stale count).
window._checkStatusBarSync = function () {
  const result = document.querySelector('#status-bar-notice .sbn-check-result');
  if (!result) return;
  const ownerId = _statusBarSyncOwner();
  const sessions = ownerId ? _sessionsOf(ownerId) : [];
  // HW-112D (a): the ones waiting will not change, named apart.
  const unsure = ownerId ? unsureProofPhotos(ownerId, sessions) : [];
  const check = statusBarSyncCheckText({
    online: isOnline(),
    pending: ownerId ? storage.getPendingSyncSummary(ownerId).total : 0,
    // Not just the queue: photos never queued yet (or not sendable as is)
    // live only in this icon too.
    photos: ownerId ? photosNotSurelyUploaded(ownerId, sessions) : 0,
    unsure: unsure.length,
  });
  result.textContent = check.text;
  result.dataset.ok = String(check.ok);
  result.parentElement?.querySelector('.sbn-keep-photos')?.remove();
  // Only when the text names them (an older statusBarNotice.js does not).
  if (unsure.length && check.unsure > 0) {
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'sbn-keep-photos';
    view.textContent = `查看這 ${check.unsure} 張照片`;
    view.addEventListener('click', () => {
      // The account may have changed since (another tab): check again instead.
      if (_statusBarSyncOwner() !== ownerId) {
        window._checkStatusBarSync();
        return;
      }
      showProofKeepSheet(unsure.slice(0, check.unsure), { returnFocus: view });
    });
    result.after(view);
  }
};

function _statusBarSyncOwner() {
  return _currentSession?.user?.id
    ?? (hasStoredSession() ? storage.getUser()?.id ?? null : null);
}

// This account's sessions: the ones in memory, or the stored ones while they
// are this account's (another tab may have switched the stored user).
function _sessionsOf(ownerId) {
  if (state.user?.id === ownerId) return state.sessions || [];
  return storage.getUser()?.id === ownerId ? storage.getSessions() || [] : [];
}

window._dismissStatusBarNotice = function () {
  const step = _statusBarNotice?.step;
  if (!step || step === 'none') return;
  const hadFocus = Boolean(document.activeElement?.closest?.('#status-bar-notice'));
  const storageArea = window.localStorage;
  const next = dismissStatusBarNotice(readStatusBarNoticeState(storageArea), step, Date.now());
  writeStatusBarNoticeState(storageArea, next);
  _statusBarNotice = { step: 'none' };
  _showStatusBarNotice();
  // The focused ✕ is gone: move focus to the page instead of the document body.
  if (hadFocus) {
    const content = document.getElementById('content');
    content?.setAttribute('tabindex', '-1');
    content?.focus({ preventScroll: true });
  }
};

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

// An account this device has synced: storage.js marks its first successful
// remote load (the session sync cutover, private there; the boot test checks
// the key against storage.js). A guest's local user never has the mark.
function _isSyncedAccount(userId) {
  if (!userId) return false;
  try {
    const marker = JSON.parse(localStorage.getItem(`yoyo_sessionSyncCutover:v1.21:${encodeURIComponent(String(userId))}`));
    return marker?.ownerId === userId && marker?.completed === true;
  } catch {
    return false;
  }
}

// Every showSetup() adds its own listeners to the same form; only the latest
// one acts (HW-112D, #262 review): an earlier one would save with the owner it
// was opened for.
let _setupGeneration = 0;

/**
 * @param {string|null} ownerId the signed-in account this setup belongs to.
 *   Only `loadAndStart` passes one. A guest never inherits `_currentSession`:
 *   it can still hold an account whose remote load failed, and taking that id
 *   would push a blank profile over the real one on the next sync.
 */
function showSetup(ownerId = null) {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  const generation = ++_setupGeneration;
  const isCurrent = () => generation === _setupGeneration;
  // A guest's setup must not take over an account another tab stored meanwhile.
  const storedIdAtOpen = storage.getUser()?.id ?? null;
  let avatarData = null;
  // A photo picked on an earlier opening is not this one's (#264 review): clear
  // the preview, and the input so picking the same file again is a change.
  const preview = document.getElementById('setup-avatar-preview');
  preview.style.backgroundImage = '';
  preview.textContent = '👤';
  document.getElementById('setup-avatar-input').value = '';

  document.getElementById('setup-avatar-btn').addEventListener('click', () => {
    if (!isCurrent()) return;
    document.getElementById('setup-avatar-input').click();
  });
  document.getElementById('setup-avatar-input').addEventListener('change', e => {
    if (!isCurrent()) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (!isCurrent()) return; // set up again while reading (#265 review)
      avatarData = ev.target.result;
      const preview = document.getElementById('setup-avatar-preview');
      preview.style.cssText += `;background-image:url(${avatarData});background-size:cover;background-position:center`;
      preview.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!isCurrent()) return;
    // If another tab switched accounts while setup stayed open, setup for the
    // earlier account must not save the new account's data under the old id.
    if (ownerId && _currentSession?.user?.id !== ownerId) return;
    // A guest's setup with an account stored meanwhile (another tab signed in,
    // and this one never heard): it would copy that account's id, upload the
    // guest's name to its profile and replace its tasks. Show it instead.
    const storedIdNow = storage.getUser()?.id ?? null;
    if (!ownerId && storedIdNow !== storedIdAtOpen) {
      // Said after the reload when an account is there to show (not after a
      // sign-out elsewhere, which lands on the login screen; #265 review).
      if (storedIdNow) {
        try { sessionStorage.setItem(ACCOUNT_RELOADED_KEY, '1'); } catch { /* the toast is optional */ }
      }
      location.reload();
      return;
    }
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return;
    // Authenticated setup can be reached with an existing profile (for example,
    // when the remote task list is empty). Treat setup as a partial update:
    // preserve every existing field, including future profile fields unknown to
    // this form, and only replace values the user actually edits here.
    // A guest never takes over an account's cached profile (#264 review): after
    // an account's failed load the login screen offers the guest path while
    // another account's user may still be cached here. That one starts afresh.
    const cachedProfile = storage.getUser() ?? state.user ?? null;
    const existingProfile = !ownerId && _isSyncedAccount(cachedProfile?.id) ? {} : (cachedProfile ?? {});

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
      storage.saveTasks(state.tasks, state.user?.id ?? null);
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
  _showStatusBarNotice();
  // Mixed versions (INFRA-105): only a dayCycle.js cached from before 1.41.13
  // still sets this flag; streakUnlock.js shows the celebration itself now.
  // Remove with the legacy write-backs in PRO-014HB (docs/pro-014h-cutover.md).
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
  _toastIfReloadedForAccount();
  // BUG-106: the cached-user branch and a 'SIGNED_IN' that lands before
  // getSession() resolves can both reach this in one launch. Revealing the app
  // again is harmless, but replaying the day rollover is not: it stacks a
  // second daily-report / morning modal, and re-runs the streak and weekly
  // bonus against the just-pulled remote profile, which may still be missing
  // the lastStreakDate / lastWeeklyBonusDate the first pass wrote locally.
  if (!bootSequenceGuard.claim(state.user?.id ?? null)) {
    showMainApp();
    // BUG-201: a failed account load took this launch's daily report or
    // morning modal down over the login screen (BUG-141); a guest who then
    // continues was never asked today: ask again, from where it was. Only
    // then: a repeat boot otherwise leaves the first pass's to it (BUG-106).
    const interrupted = _dayCycleInterrupted;
    _dayCycleInterrupted = null;
    if (interrupted && state.energy.lastResetDate !== eToday() && !document.querySelector(DAY_CYCLE_OVERLAYS)) {
      if (interrupted === 'report') showDailyReport(() => showMorningModal());
      else showMorningModal();
    }
    return;
  }
  _dayCycleInterrupted = null;
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
  // BUG-141: an account whose load failed here still has its session on this
  // device. A guest ends it (on this device only), or the next launch would
  // load that account and replace the guest's data with its own.
  const endedOwnerId = hasStoredSession() ? _endAccountSessionForGuest() : null;
  // A sign-in still finishing (its Pro refresh) has already stored that
  // account's data here: it goes with the account, as on a sign-out, and the
  // guest starts afresh (#313 review).
  if (endedOwnerId && storage.getUser()?.id === endedOwnerId) {
    signOutProofCleanup({ authOwnerId: endedOwnerId, sessionsOwnerId: endedOwnerId, sessions: storage.getSessions() });
    storage.clearAll();
  }
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

// An account's proof photos shown full screen (the lightbox, HW-112D's sheet)
// are mounted on <body>: they go when the account does.
function _closeProofOverlays() {
  closeProofKeepSheet();
  document.querySelectorAll('.proof-lightbox').forEach(overlay => overlay.remove());
}

async function loadAndStart(session) {
  // Another account signing in here (or in another tab) replaces the one shown.
  const replacesShown = Boolean(state.user?.id) && state.user.id !== session?.user?.id;
  if (replacesShown) _closeProofOverlays();
  // BUG-140: its sync status goes too, and so does that of an account whose
  // load failed here and left the login screen up (no user shown, but its
  // session and failure banner stay; #296 review).
  if (replacesShown || (_currentSession && _currentSession.user?.id !== session?.user?.id)) {
    _clearSyncStatus();
  }
  const operation = authOperationGuard.begin(session);
  _currentSession = session;
  let remoteLoaded = false;
  let loaded = null;

  // Pull fresh data from Supabase; fall back to localStorage cache if offline
  try {
    loaded = await _loadRemote(session.user.id);
    if (!authOperationGuard.isCurrent(operation)) return;
    remoteLoaded = true;
    // PRO-014B: refresh the owner-scoped entitlement projection from the
    // server response. No-ops under the default legacy source, so this costs
    // production nothing until PRO-014H performs the cutover.
    await db.refreshProEntitlement(session.user.id);
    if (!authOperationGuard.isCurrent(operation)) return;
    applyRandomThemeForToday();   // PRO-014H: init ran it before the Pro status was known
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
    // BUG-141: nothing of this account is shown, so forget it here: a
    // reconnect must not sync it behind the login screen (or under a guest),
    // and signing in again must load it (its SIGNED_IN was ignored while
    // _currentSession still held it). Its stored session stays, so a reload
    // retries; the guest path ends it. A cached boot of another owner may have
    // left its daily report or morning modal up, over the login screen and its
    // guest button (#313 review; its proof photos closed at the top). Only
    // those: clearDayCycleModals() takes every overlay, the password-reset
    // form of a recovery link among them (#313 re-review).
    _forgetCurrentAccount();
    const dayCycleOverlays = [...document.querySelectorAll(DAY_CYCLE_OVERLAYS)];
    if (dayCycleOverlays.some(overlay => overlay.id === 'daily-report-modal')) _dayCycleInterrupted = 'report';
    else if (dayCycleOverlays.some(overlay => overlay.id === 'morning-modal')) _dayCycleInterrupted = 'morning';
    dayCycleOverlays.forEach(overlay => overlay.remove());
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

  // PRO-014L2: after the rollover above has updated the streak. Here because a
  // second boot (BUG-106) skips the rollover and the cached-user sync.
  if (remoteLoaded) {
    const isCurrent = () => authOperationGuard.isCurrent(operation);
    Promise.resolve(loaded?.backfilled).then(() => {
      if (!isCurrent()) return;
      _reportBootLoadLeftovers(session.user.id);
      _askStreakUnlock(session.user.id, isCurrent);
    }, () => {});
  }
}

// BUG-142: a sign-in whose load succeeded shows no banner, but one whose
// Session backfills or Session deletions failed says so (and flags the next
// reconnect), as the cached-user sync does through _reportSyncResult(). Only
// those two count: the profile, task and Energy snapshots are pushed before
// the pull, which throws if they fail (the catch above), so one queued now is
// a write this boot made after the load (the day rollover), still in flight.
function _reportBootLoadLeftovers(ownerId) {
  const { sessions = 0, deletions = 0 } = storage.getPendingSyncSummary(ownerId);
  // The count too: a snapshot still in flight would read as a failure, and
  // online nothing refreshes the banner once it lands (#297 review).
  // Offline, though, a snapshot is not in flight but queued, and the offline
  // banner counts it after the next write (_refreshOfflineHint, #298 review).
  if (sessions + deletions > 0) _showSyncFailure(isOnline() ? sessions + deletions : undefined);
}

// PRO-014L2: SUB-16 is granted by the server (streakUnlock.js). Asked only
// after the remote load and its Session backfills, so the server sees the days
// this device recorded offline. Not awaited: nothing waits for the answer.
function _askStreakUnlock(ownerId, isCurrent) {
  requestStreakUnlock(ownerId, {
    isCurrent,
    onChange: () => {
      updateHeader();
      if (!isTextInputActive()) renderPage(currentHash());
    },
  });
}

// BUG-201: which part of this launch's day rollover the fail-closed return
// took down ('report' | 'morning'), for the guest path to ask again.
let _dayCycleInterrupted = null;

// What dayCycle.js mounts on <body> (its mountModal ids, the shield confirm).
// Listed here: app.js may not import a new export of dayCycle.js (INFRA-105).
const DAY_CYCLE_OVERLAYS = [
  '#daily-report-modal', '#morning-modal', '#streak-unlock-modal', 'body > .shield-confirm-overlay',
].join(', ');

// BUG-141: stops treating the current session as the account shown here,
// without signing it out (loadAndStart's fail-closed return, the guest path).
function _forgetCurrentAccount() {
  authOperationGuard.invalidate();
  _currentSession = null;
  _clearSyncStatus();
}

// Set while the guest path ends the account's session: the SIGNED_OUT it
// causes in this tab is not a sign-out of what is shown (supabase-js notifies
// before signOut() resolves; every call waits for the client's start-up, so
// the event is never queued past it).
let _guestEndingSession = false;
/** @returns {string|null} the account it stopped treating as current, if any */
function _endAccountSessionForGuest() {
  const ownerId = _currentSession?.user?.id ?? null;
  _forgetCurrentAccount();
  _guestEndingSession = true;
  forgetLocalSession()
    .catch(error => console.warn('Could not end the account session for the guest:', error))
    .finally(() => { _guestEndingSession = false; });
  return ownerId;
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
  _closeProofOverlays();
  _clearSyncStatus();
  if (!_currentSession && !storage.getUser()) return; // already signed out
  // HW-112C2a/b: this account's downloaded proof photos leave with it, and so
  // do its local photos that are surely in the cloud (§5.5, §9.5 B); photos
  // still waiting to upload stay. Before state.sessions is cleared below.
  // The local photos are checked against the owner of the sessions in memory
  // (during an account switch the session can be ahead of them).
  signOutProofCleanup({
    authOwnerId: _currentSession?.user?.id ?? null,
    sessionsOwnerId: state.user?.id ?? null,
    sessions: state.sessions,
  });
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
  const rootStyle = window.getComputedStyle(document.documentElement);
  const height = appShellHeight({
    viewportHeight: window.visualViewport?.height || window.innerHeight,
    safeBottom: parseFloat(rootStyle.getPropertyValue('--sab')) || 0,
    safeTop: parseFloat(rootStyle.getPropertyValue('--sat')) || 0,
    iosHomeScreen: window.navigator.standalone === true,   // iOS only (BUG-117)
  });
  document.documentElement.style.setProperty('--app-height', height + 'px');
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
  // Sessions the load backfills are confirmed after it resolves: once they
  // are, a photo waiting for its session (HW-112D c) is queued again now rather
  // than at the next sync (#263 review).
  settled.then(backfilled => {
    if (backfilled?.length) void flushProofSync(ownerId);
  });
  // HW-112C1: after each successful remote load (boot and reconnect), send the
  // proof photos still queued. In the background; never part of the sync result.
  // HW-112C2a: a photo may have arrived since a row found none (uploaded later
  // from the other device), so every sync forgets those "not found".
  load.then(() => {
    forgetCloudProofMisses();
    // Downloaded photos of any other account that never signed out here go.
    void keepCloudProofsOf(ownerId);
    // HW-112D (c): then, at most weekly, photos left behind by deleted sessions
    // (proofSweep.js). Only with this account's sessions as stored here.
    return flushProofSync(ownerId).then(() => _sweepOrphanProofs(ownerId));
  }, () => {});
  return load;
}

// HW-112D (c): never throws (it runs in the background of every sync).
function _sweepOrphanProofs(ownerId) {
  try {
    const sessions = storage.getUser()?.id === ownerId ? storage.getSessions() : null;
    return sweepOrphanCloudProofs(ownerId, { sessions });
  } catch (error) {
    console.warn('Proof photo sweep skipped:', error);
    return null;
  }
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

function _showSyncFailure(pending = _pendingSyncCount()) {
  _needsResync = true;
  showSyncBanner(isOnline() ? 'error' : 'offline', { pending });
}

// BUG-140: the banner and the reconnect flag are about the account shown, and
// go with it. The banner keeps 'offline', 'error' or 'syncing' until the next
// status (ui/feedback.js), and a successful loadAndStart() shows none, so the
// next account would see the previous one's "N 筆待同步". The flag is reset for
// the same reason; a browser sends 'online' only after 'offline', which sets it
// again, so that half changes nothing a user can see today.
function _clearSyncStatus() {
  _needsResync = false;
  const banner = document.getElementById('sync-banner');
  if (!banner) return;
  banner.className = 'hidden';
  banner.textContent = '';
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
  // BUG-143: only a sync for this session stands in for this one. One still
  // running for the account before it (signed out or switched mid-sync) stops
  // at its next check without syncing anything; skipping on it left this
  // account's queue waiting for the next time the connection dropped.
  const previous = _reconnectSync;
  if (!session || previous?.session === session) return;
  showSyncBanner('syncing');
  const run = { session, done: null };
  _reconnectSync = run;
  run.done = (async () => {
    try {
      // Not alongside that one (see _loadRemote): wait for it to stop. Only
      // reconnect syncs wait here; loadAndStart() does not, so signing in to
      // the same account again while one runs still loads twice (as before).
      if (previous) await previous.done;
      if (_remoteSync) await _remoteSync;
      if (_currentSession !== session) return;
      const loaded = await _loadRemote(session.user.id);
      if (_currentSession !== session) return;
      await db.refreshProEntitlement(session.user.id);
      if (_currentSession !== session) return;
      loadStateFromStorage({ authoritative: true });
      _applyProDependentUi();        // now that the Pro status may be known
      _updateBadge();
      await _reportSyncResult(loaded, () => _currentSession === session);
      if (_currentSession === session) _askStreakUnlock(session.user.id, () => _currentSession === session);
    } catch (error) {
      if (_currentSession !== session || error?.name === 'OwnerSessionChangedError') return;
      console.warn('Reconnect sync failed; pending changes stay queued:', error);
      _showSyncFailure();
    } finally {
      if (_reconnectSync === run) _reconnectSync = null;
    }
  })();
  await run.done;
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

// HW-112D (b): storage refused to write this window's tasks or energy because
// another tab switched the stored account (storage.js names the same event).
let _storedAccountToastAt = 0;
window.addEventListener('orbit:stored-account-changed', () => {
  if (Date.now() - _storedAccountToastAt < 3000) return;
  _storedAccountToastAt = Date.now();
  showToast('另一個分頁已切換帳號，這裡的變更沒有儲存；請重新整理這個頁面');
});

// HW-112D (b, #262 review): another tab switched the stored account while this
// window still holds the previous one. Every write of this window's memory
// (the user included: the morning check-in, settings toggles, …) would land on
// the stored account, so the window reloads and shows the stored account. A
// switch this window is making itself (its session already is the stored
// account) is left to finish. Storage events are missed in the back/forward
// cache and may be late for a frozen tab, so pageshow and the return to the
// foreground check too.
const ACCOUNT_RELOADED_KEY = 'orbit_account_reloaded';
function _reloadIfAccountChangedElsewhere(storedId = storage.getUser()?.id ?? null) {
  const memoryId = state.user?.id ?? null;
  if (!memoryId || !storedId || storedId === memoryId) return;
  if (_currentSession?.user?.id === storedId) return;
  try { sessionStorage.setItem(ACCOUNT_RELOADED_KEY, '1'); } catch { /* the toast is optional */ }
  location.reload();
}
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || event.key !== 'yoyo_user' || !event.newValue) return;
  // Only another account written in; a removal is a sign-out (SIGNED_OUT handles it).
  let storedId = null;
  try { storedId = JSON.parse(event.newValue)?.id ?? null; } catch { return; }
  _reloadIfAccountChangedElsewhere(storedId);
});
window.addEventListener('pageshow', event => {
  if (event.persisted) _reloadIfAccountChangedElsewhere();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _reloadIfAccountChangedElsewhere();
});
// Read (and cleared) when this page starts, so a launch that ends on the login
// screen does not keep it for a later sign-in (#262 review P3); said by the
// first boot of the app.
let _reloadedForAccount = false;
try {
  _reloadedForAccount = sessionStorage.getItem(ACCOUNT_RELOADED_KEY) === '1';
  sessionStorage.removeItem(ACCOUNT_RELOADED_KEY);
} catch { /* nothing to say */ }
function _toastIfReloadedForAccount() {
  if (!_reloadedForAccount) return;
  _reloadedForAccount = false;
  showToast('另一個分頁切換了帳號，這裡已重新載入');
}

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
      // BUG-141: the guest path ended the session itself; the guest keeps
      // this device's data and the page it is on.
      if (_guestEndingSession) return;
      // Another tab's guest path ended an account this tab does not show
      // either (its load failed here too): what is stored here is a guest's,
      // with no copy in the cloud, and stays. A synced account's cache still
      // goes (a cached boot whose session ended before getSession()), and so
      // does everything when this tab shows an account (#313 review).
      // That holds while this tab is loading the account again (a refocus or
      // a new tab retries it): the stored user is not that account; the load
      // is dropped with it (#313 re-review).
      const storedId = storage.getUser()?.id ?? null;
      if (storedId && storedId !== _currentSession?.user?.id && !_isSyncedAccount(storedId)) {
        _forgetCurrentAccount();
        // BUG-202: the load just dropped may be this tab's own sign-in: give
        // its form back (the button would stay at 登入中… until a reload).
        if (!document.getElementById('login-screen')?.classList.contains('hidden')) showLoginScreen();
        return;
      }
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
          _applyProDependentUi();        // the boot ran these before the refresh
          _updateBadge();
          await _reportSyncResult(loaded, () => authOperationGuard.isCurrent(operation));
          if (authOperationGuard.isCurrent(operation)) {
            _askStreakUnlock(session.user.id, () => authOperationGuard.isCurrent(operation));
          }
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
