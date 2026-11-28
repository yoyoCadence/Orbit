// @vitest-environment jsdom
/**
 * appShell.test.js — app.js 的外殼（TEST-013）
 * 環境：jsdom
 *
 * appBootSequence.test.js 測啟動的時序；這裡測其餘的部分：試用橫幅、登出、
 * 同步橫幅跟著帳號走（BUG-140）、今日計畫、導覽的延後載入、App 圖示的徽章、
 * 點 header 回到頂端、輸入時的鍵盤狀態、另一個分頁換了帳號的提示與重新載入、
 * 重設密碼、啟動時沒有快取或 getSession() 失敗、連線恢復同步與 loadAndStart
 * 中途換了帳號。mock 與 appBootSequence.test.js 相同，另外 mock 導覽、徽章與
 * 排行榜（暖身載入的三個模組），同步橫幅用真的 feedback.js 畫在畫面上。
 *
 * app.js 每個測試都重新 import，之前的 listener 會留在 window／document 上：
 * 這裡記下每次 import 加上的 listener，測試結束時移除。
 */

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { today } from '../../pwa/js/utils.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY     = '2026-08-26';
const YESTERDAY = '2026-08-25';

function makeUser(id) {
  return {
    id, name: `User ${id}`, totalXP: 0, newDayHour: 5,
    streakDays: 3, lastStreakDate: YESTERDAY, trialStartedAt: '2026-01-01',
  };
}

/** localStorage stand-in shared by the storage and controller mocks. */
const cache = vi.hoisted(() => ({
  user: null,
  tasks: [],
  sessions: [],
  energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' },
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

const auth = vi.hoisted(() => ({
  callback: null,
  sessionResolve: null,
  getSession: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../pwa/js/auth.js', () => ({
  signOut: auth.signOut,
  getSession: auth.getSession,
  onAuthStateChange: cb => { auth.callback = cb; },
}));

const dayCycle = vi.hoisted(() => ({
  processYesterdayStreak: vi.fn(),
  checkWeeklyBonus: vi.fn(),
  showDailyReport: vi.fn(),
  showMorningModal: vi.fn(),
  showStreakUnlockModal: vi.fn(),
  startDayWatcher: vi.fn(),
  clearDayCycleModals: vi.fn(),
}));

// The effective day app.js sees; a test may move it on (reset in beforeEach).
const clock = vi.hoisted(() => ({ today: null }));

vi.mock('../../pwa/js/dayCycle.js', () => ({
  ...dayCycle,
  eToday: () => clock.today ?? TODAY,
}));

const storage = vi.hoisted(() => ({
  getUser: vi.fn(),
  getTheme: vi.fn(() => 'dark'),
  getUiSkin: vi.fn(() => 'default'),
  getBgImage: vi.fn(() => null),
  isTrialUser: vi.fn(() => false),
  isProUser: vi.fn(() => false),
  getTrialDaysRemaining: vi.fn(() => 0),
  getTrialBannerDismissDate: vi.fn(() => ''),
  saveTrialBannerDismissDate: vi.fn(),
  recoverPendingSessionDeletions: vi.fn(),
  getPendingSyncSummary: vi.fn(() => ({ total: 0 })),
  getSessions: vi.fn(() => []),
  saveUser: vi.fn(),
  saveTasks: vi.fn(),
  saveDailyPlan: vi.fn(),
  currentDailyPlan: vi.fn(plan => plan),
  clearAll: vi.fn(),
}));

const db = vi.hoisted(() => ({
  loadFromRemote: vi.fn(() => Promise.resolve()),
  refreshProEntitlement: vi.fn(() => Promise.resolve(false)),
  startTrial: vi.fn(() => Promise.resolve({ ok: true, ownerChanged: false, trialStartedAt: null })),
}));

const authFlow = vi.hoisted(() => ({
  showLoginScreen: vi.fn(),
  hideLoading: vi.fn(),
}));

// The toast is a spy; the sync banner is the real one (set up in beforeEach),
// so what it shows can be read from #sync-banner.
const feedback = vi.hoisted(() => ({
  showToast: vi.fn(),
  showSyncBanner: vi.fn(),
}));

vi.mock('../../pwa/js/storage.js', () => ({
  storage, db,
  migrateV1toV2: vi.fn(),
  migrateDefaultFlags: vi.fn(),
}));

// Mirrors the real controller's contract: republish the cache into central state.
const controller = vi.hoisted(() => ({
  refreshCanonicalStateAndReconcilePersonalSpaceV2: vi.fn(),
}));
vi.mock('../../pwa/js/personalSpace/v2/controller.js', () => controller);

const network = vi.hoisted(() => ({
  online: true,
  handlers: [],
  emit(value) {
    network.online = value;
    return Promise.all(network.handlers.map(handler => handler(value)));
  },
}));

vi.mock('../../pwa/js/platform/network.js', () => ({
  isOnline: () => network.online,
  onConnectivityChange: handler => { network.handlers.push(handler); return () => {}; },
}));

vi.mock('../../pwa/js/authFlow.js', () => authFlow);
const proRollover = vi.hoisted(() => ({ resolvePendingProRollover: vi.fn(() => false) }));
vi.mock('../../pwa/js/proRollover.js', () => proRollover);
const streakUnlock = vi.hoisted(() => ({ requestStreakUnlock: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../pwa/js/streakUnlock.js', () => streakUnlock);
const header = vi.hoisted(() => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/ui/header.js', () => header);
vi.mock('../../pwa/js/ui/feedback.js', () => feedback);
const sessionFlow = vi.hoisted(() => ({ badgeUpdater: null }));
vi.mock('../../pwa/js/sessionFlow.js', () => ({
  setBadgeUpdater: fn => { sessionFlow.badgeUpdater = fn; },
}));
const proofSync = vi.hoisted(() => ({ flushProofSync: vi.fn(() => Promise.resolve()) }));
vi.mock('../../pwa/js/platform/proofSync.js', () => proofSync);
const proofSweep = vi.hoisted(() => ({ sweepOrphanCloudProofs: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../pwa/js/platform/proofSweep.js', () => proofSweep);
vi.mock('../../pwa/js/focusTimer.js', () => ({}));
vi.mock('../../pwa/js/defaultTasks.js', () => ({ createDefaultTasks: () => [] }));
vi.mock('../../pwa/js/timeBand.js', () => ({ applyTimeBand: vi.fn() }));
vi.mock('../../pwa/js/theme.js', () => ({
  applyRandomThemeForToday: vi.fn(),
  renderBg: vi.fn(),
  initLiquidGlassReflection: vi.fn(),
}));
const router = vi.hoisted(() => ({ renderPage: vi.fn() }));
vi.mock('../../pwa/js/router.js', () => ({
  renderPage: router.renderPage,
  currentHash: () => 'home',
  // A text field is an <input> here; the real router also counts textareas etc.
  isTextInputTarget: target => target?.tagName === 'INPUT',
  isTextInputActive: () => document.activeElement?.tagName === 'INPUT',
  markTextInputFocus: vi.fn(),
  teardownActivePageRenderer: vi.fn(),
}));
// BUG-141: whether this device stores a Supabase session, and ending it.
const presence = vi.hoisted(() => ({ stored: false }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => presence.stored }));
const localSession = vi.hoisted(() => ({ forgetLocalSession: vi.fn() }));
vi.mock('../../pwa/js/localSession.js', () => localSession);
const proofLocal = vi.hoisted(() => ({ signOutProofCleanup: vi.fn(), photosNotSurelyUploaded: vi.fn(() => 0) }));
vi.mock('../../pwa/js/platform/proofLocal.js', () => proofLocal);
vi.mock('../../pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js', () => ({
  orbitWindowRuntimeDestroyer: { destroyNow: vi.fn() },
}));

// The three modules warmEnhancementModules() loads.
const badge = vi.hoisted(() => ({
  setBadge: vi.fn(() => Promise.resolve()),
  clearBadge: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../pwa/js/platform/badge.js', () => badge);
vi.mock('../../pwa/js/pages/leaderboard.js', () => ({}));
const tour = vi.hoisted(() => ({ startTour: vi.fn() }));
vi.mock('../../pwa/js/tour.js', () => ({ startTour: tour.startTour }));

// ─── Harness ──────────────────────────────────────────────────────────────────

const flush = () => new Promise(resolve => { setTimeout(resolve, 0); });

function seedCachedUser(id, overrides = {}) {
  cache.user     = makeUser(id);
  cache.tasks    = [{ id: 't1', name: 'Task' }];
  cache.sessions = [];
  cache.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: TODAY };
  Object.assign(cache, overrides);
}

function sessionFor(userId) {
  return { user: { id: userId }, access_token: `token-${userId}` };
}

/** Boots app.js against a cached user; getSession() stays pending. */
async function bootCached(id = 'owner-a', overrides = {}) {
  seedCachedUser(id, overrides);
  auth.getSession.mockImplementation(
    () => new Promise(resolve => { auth.sessionResolve = resolve; }),
  );
  await import('../../pwa/js/app.js');
  await flush();
}

/** Boots a cached user and lets getSession() resolve to the same account. */
async function bootSignedIn(id = 'owner-a', overrides = {}) {
  await bootCached(id, overrides);
  auth.sessionResolve(sessionFor(id));
  await flush();
}

const syncBanner = () => document.getElementById('sync-banner');

// Listeners app.js adds to window and document, removed after each test.
let added = [];
function recordListeners(target) {
  const original = target.addEventListener;
  vi.spyOn(target, 'addEventListener').mockImplementation(function (type, fn, options) {
    added.push([target, type, fn, options]);
    return original.call(this, type, fn, options);
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  clock.today = null;
  // clearAllMocks() keeps queued *Once values: one a failed test never used
  // would reach the next test (#296 review).
  [...Object.values(db), auth.getSession, auth.signOut].forEach(fn => fn.mockReset());
  added = [];
  recordListeners(window);
  recordListeners(document);

  const actualFeedback = await vi.importActual('../../pwa/js/ui/feedback.js');
  feedback.showSyncBanner.mockImplementation(actualFeedback.showSyncBanner);

  controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mockImplementation(({ centralState }) => {
    centralState.user     = cache.user;
    centralState.tasks    = cache.tasks;
    centralState.sessions = cache.sessions;
    centralState.energy   = cache.energy;
  });
  db.loadFromRemote.mockResolvedValue();
  db.refreshProEntitlement.mockResolvedValue(false);
  db.startTrial.mockResolvedValue({ ok: true, ownerChanged: false, trialStartedAt: null });
  storage.getUser.mockImplementation(() => cache.user);
  storage.saveUser.mockImplementation(user => { cache.user = user; });
  storage.clearAll.mockImplementation(() => { cache.user = null; cache.tasks = []; cache.sessions = []; });
  storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
  storage.currentDailyPlan.mockImplementation(plan => plan);
  storage.isTrialUser.mockReturnValue(false);
  storage.getTrialDaysRemaining.mockReturnValue(0);
  storage.getTrialBannerDismissDate.mockReturnValue('');
  storage.getSessions.mockReturnValue([]);
  auth.signOut.mockResolvedValue();
  auth.callback = null;
  auth.sessionResolve = null;
  network.online = true;
  network.handlers = [];
  sessionFlow.badgeUpdater = null;
  presence.stored = false;
  localSession.forgetLocalSession.mockReset();
  // As dayCycle.js does: the report is an overlay on <body> (BUG-201 looks for one).
  dayCycle.showDailyReport.mockImplementation(() => {
    const report = document.createElement('div');
    report.id = 'daily-report-modal';
    report.className = 'modal-overlay';
    document.body.appendChild(report);
  });
  // What dayCycle.js's own clearDayCycleModals() does: it takes every overlay
  // (BUG-141: the fail-closed return must not take the password-reset form).
  dayCycle.clearDayCycleModals.mockImplementation(() => {
    document.querySelectorAll('body > .modal-overlay, body > .shield-confirm-overlay').forEach(el => el.remove());
  });
  localSession.forgetLocalSession.mockResolvedValue(null);
  sessionStorage.clear();
  // Keeps warmEnhancementModules() from loading anything unless a test runs it.
  window.requestIdleCallback = () => 0;
  document.body.innerHTML = `
    <div id="login-screen" class="hidden">
      <input id="auth-email"><input id="auth-password" type="password">
    </div>
    <div id="setup-screen" class="hidden"></div>
    <div id="main-app" class="hidden">
      <header id="header"><span id="header-title">Orbit</span><button id="header-btn" type="button">⚙</button></header>
      <div id="sync-banner" class="hidden"></div>
      <div id="trial-banner" class="hidden"></div>
      <main id="content"></main>
    </div>
    <button id="setup-avatar-btn" type="button"></button>
    <input id="setup-avatar-input" type="file">
    <div id="setup-avatar-preview"></div>
    <form id="setup-form"><input id="setup-name"></form>
  `;
});

afterEach(() => {
  for (const [target, type, fn, options] of added) target.removeEventListener(type, fn, options);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete window.requestIdleCallback;
  delete window._showResetPasswordModal;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('試用橫幅', () => {
  const banner = () => document.getElementById('trial-banner');

  function trial(daysLeft) {
    storage.isTrialUser.mockReturnValue(true);
    storage.getTrialDaysRemaining.mockReturnValue(daysLeft);
  }

  it('剩 5 天以內時顯示天數、升級（前往設定頁）與關閉按鈕', async () => {
    trial(3);
    await bootCached();

    expect(banner().classList.contains('hidden')).toBe(false);
    expect(banner().querySelector('.trial-banner-text').textContent).toBe('✦ Pro 試用剩餘 3 天');
    const cta = banner().querySelector('.trial-banner-cta');
    expect(cta.dataset.action).toBe('navigate');
    expect(cta.dataset.actionArg).toBe('settings');
    expect(banner().querySelector('.trial-banner-close').dataset.action).toBe('dismissTrialBanner');
  });

  it('剛好 5 天時顯示，6 天時不顯示', async () => {
    trial(5);
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(false);

    vi.resetModules();
    banner().className = 'hidden';
    banner().innerHTML = '';
    trial(6);
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(true);
    expect(banner().innerHTML).toBe('');
  });

  it('不是試用中時不顯示', async () => {
    storage.getTrialDaysRemaining.mockReturnValue(2);
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(true);
  });

  it('今天已關閉時不顯示；按 ✕ 記下今天並收起', async () => {
    trial(2);
    storage.getTrialBannerDismissDate.mockReturnValue(today());
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(true);

    vi.resetModules();
    storage.getTrialBannerDismissDate.mockReturnValue('2000-01-01');
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(false);

    window._dismissTrialBanner();
    expect(storage.saveTrialBannerDismissDate).toHaveBeenCalledWith(today());
    expect(banner().classList.contains('hidden')).toBe(true);
  });

  it('PRO-014H：開機時還不是試用、refresh 之後是試用時，背景同步後顯示', async () => {
    await bootCached();
    expect(banner().classList.contains('hidden')).toBe(true);

    db.refreshProEntitlement.mockImplementationOnce(async () => { trial(4); return true; });
    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(banner().classList.contains('hidden')).toBe(false);
    expect(banner().textContent).toContain('4');
  });
});

describe('登出', () => {
  it('呼叫 auth 的登出，清掉這台裝置的資料與登入欄位，回到登入畫面', async () => {
    await bootSignedIn('owner-a');
    document.getElementById('auth-email').value = 'a@example.com';
    document.getElementById('auth-password').value = 'secret';

    await window.signOut();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    expect(authFlow.showLoginScreen).toHaveBeenCalled();
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('auth-email').value).toBe('');
    expect(document.getElementById('auth-password').value).toBe('');
  });

  it('auth 的登出失敗（例如離線）時仍在這台裝置登出', async () => {
    await bootSignedIn('owner-a');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.signOut.mockRejectedValueOnce(new Error('Failed to fetch'));

    await window.signOut();

    expect(error).toHaveBeenCalled();
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    expect(authFlow.showLoginScreen).toHaveBeenCalled();
  });

  it('已經登出時（沒有 session 也沒有儲存的帳號）不再清一次，只收起畫面上的東西', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(1);

    auth.callback('SIGNED_OUT', null);

    expect(dayCycle.clearDayCycleModals).toHaveBeenCalled();
    expect(storage.clearAll).not.toHaveBeenCalled();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(1);
  });

  it('登出中途 loadAndStart() 的載入才完成：不開機', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();

    let finishLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    auth.callback('SIGNED_OUT', null);
    seedCachedUser('owner-a');
    finishLoad();
    await signingIn;
    await flush();

    expect(db.refreshProEntitlement).not.toHaveBeenCalled();
    expect(dayCycle.processYesterdayStreak).not.toHaveBeenCalled();
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(true);
  });
});

describe('BUG-140：同步橫幅跟著帳號走', () => {
  async function bootOffline(id = 'owner-a', pending = 2) {
    network.online = false;
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: pending }));
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn(id);
    expect(syncBanner().textContent).toContain(`${pending} 筆待同步`);
  }

  async function signInAs(id) {
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser(id); });
    await auth.callback('SIGNED_IN', sessionFor(id));
    await flush();
  }

  it('離線時登出，換另一個帳號登入後不再顯示上一個帳號的「離線中 · N 筆待同步」', async () => {
    await bootOffline('owner-a', 2);

    await window.signOut();
    expect(syncBanner().classList.contains('hidden')).toBe(true);

    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
    await network.emit(true);
    await signInAs('owner-b');

    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(syncBanner().textContent).toBe('');
  });

  it('同步失敗後登出，再登入同一個帳號：載入成功後不顯示「同步暫停」', async () => {
    db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
    await bootSignedIn('owner-a');
    expect(syncBanner().textContent).toContain('同步暫停');

    auth.callback('SIGNED_OUT', null);
    await signInAs('owner-a');

    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('登出時也清掉上一個帳號的「連線恢復後同步」標記', async () => {
    await bootOffline('owner-a', 1);
    await window.signOut();
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
    await signInAs('owner-b');
    const loads = db.loadFromRemote.mock.calls.length;

    // 瀏覽器只在 offline 之後送 online（offline 會再設一次標記），所以使用者
    // 看不出差別；這裡直接送 online，檢查標記本身已清掉。
    await network.emit(true);
    await flush();

    expect(db.loadFromRemote.mock.calls.length).toBe(loads);
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('帳號沒有快取、載入失敗回到登入畫面後，登入另一個帳號：不顯示前一個帳號的「同步暫停」（#296 review）', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
    // BUG-141: cleared already when the load failed (nothing of it is shown).
    expect(syncBanner().classList.contains('hidden')).toBe(true);

    await signInAs('owner-b');

    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('沒有登出、直接換成另一個帳號（另一個分頁）時也收起', async () => {
    db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
    await bootSignedIn('owner-a');
    expect(syncBanner().textContent).toContain('同步暫停');

    await signInAs('owner-b');

    expect(db.loadFromRemote).toHaveBeenLastCalledWith('owner-b');
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('另一個帳號登入時收起前一個帳號的佐證照片大圖；同一個帳號（BUG-106 的早到 SIGNED_IN）不收（#296 review）', async () => {
    await bootCached('owner-a');
    const lightbox = document.createElement('div');
    lightbox.className = 'proof-lightbox';
    document.body.append(lightbox);

    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(lightbox.isConnected).toBe(true);

    await signInAs('owner-b');
    expect(lightbox.isConnected).toBe(false);
  });

  it('同一個帳號照常：同步失敗的橫幅留著，連線恢復後同步', async () => {
    await bootOffline('owner-a', 2);
    db.loadFromRemote.mockImplementationOnce(async () => {
      storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
    });

    await network.emit(true);
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });
});

describe('連線恢復同步與換帳號', () => {
  it('同步途中登出：不顯示同步失敗，也不再刷新 Pro', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.online = false;
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn('owner-a');

    let failLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise((resolve, reject) => { failLoad = reject; }));
    const syncing = network.emit(true);
    await flush();
    expect(syncBanner().textContent).toBe('☁️ 同步中…');
    const refreshes = db.refreshProEntitlement.mock.calls.length;

    auth.callback('SIGNED_OUT', null);
    failLoad(new Error('Failed to fetch'));
    await syncing;
    await flush();

    expect(db.refreshProEntitlement.mock.calls.length).toBe(refreshes);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Reconnect sync failed'), expect.anything());
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('載入完成前已登出：不刷新 Pro、不重新載入 state', async () => {
    network.online = false;
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn('owner-a');

    let finishLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const syncing = network.emit(true);
    await flush();
    const refreshes = db.refreshProEntitlement.mock.calls.length;
    const loadsOfState = controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length;

    auth.callback('SIGNED_OUT', null);
    finishLoad();
    await syncing;
    await flush();

    expect(db.refreshProEntitlement.mock.calls.length).toBe(refreshes);
    expect(controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length).toBe(loadsOfState);
  });

  it('啟動同步還沒結束時恢復連線、又在它結束前登出：不再以前一個帳號載入', async () => {
    let finishStartup;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishStartup = resolve; }));
    await bootSignedIn('owner-a');
    await network.emit(false);
    const syncing = network.emit(true);
    await flush();

    auth.callback('SIGNED_OUT', null);
    finishStartup();
    await syncing;
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
  });

  it('同步時 storage 回報帳號已換（OwnerSessionChangedError）：不顯示同步失敗', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.online = false;
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn('owner-a');
    warn.mockClear();

    const changed = Object.assign(new Error('owner changed'), { name: 'OwnerSessionChangedError' });
    db.loadFromRemote.mockRejectedValueOnce(changed);
    await network.emit(true);
    await flush();

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Reconnect sync failed'), expect.anything());
    expect(syncBanner().textContent).toBe('☁️ 同步中…');
  });

  it('refresh 之後才發現換了帳號：不重新載入 state，也不詢問 SUB-16', async () => {
    network.online = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn('owner-a');

    let finishRefresh;
    db.refreshProEntitlement.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const syncing = network.emit(true);
    await flush();
    const loadsOfState = controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length;

    auth.callback('SIGNED_OUT', null);
    finishRefresh(true);
    await syncing;
    await flush();

    expect(controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length).toBe(loadsOfState);
    expect(streakUnlock.requestStreakUnlock).not.toHaveBeenCalled();
  });

  it('loadAndStart：載入完成時 storage 回報帳號已換，不開機也不顯示同步失敗', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const changed = Object.assign(new Error('owner changed'), { name: 'OwnerSessionChangedError' });
    db.loadFromRemote.mockRejectedValueOnce(changed);
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(warn).not.toHaveBeenCalled();
    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(dayCycle.processYesterdayStreak).not.toHaveBeenCalled();
  });

  it('loadAndStart：refresh 期間換成另一個帳號，前一個不再開機', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();

    let finishRefresh;
    db.refreshProEntitlement.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-a'); });
    const first = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-b'); });
    await auth.callback('SIGNED_IN', sessionFor('owner-b'));
    const theme = await import('../../pwa/js/theme.js');
    const themeCalls = theme.applyRandomThemeForToday.mock.calls.length;
    finishRefresh(false);
    await first;
    await flush();

    // 只有 owner-b 開機；owner-a 的 refresh 結束時也不再套用主題
    expect(theme.applyRandomThemeForToday.mock.calls.length).toBe(themeCalls);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    expect(streakUnlock.requestStreakUnlock.mock.calls.map(call => call[0])).toEqual(['owner-b']);
  });

  it('SUB-16 狀態改變時更新 header 並重畫；正在輸入時不重畫', async () => {
    await bootSignedIn('owner-a');
    expect(streakUnlock.requestStreakUnlock).toHaveBeenCalledWith('owner-a', expect.any(Object));
    const { onChange } = streakUnlock.requestStreakUnlock.mock.calls.at(-1)[1];
    header.updateHeader.mockClear();
    router.renderPage.mockClear();

    onChange();
    expect(header.updateHeader).toHaveBeenCalledTimes(1);
    expect(router.renderPage).toHaveBeenCalledWith('home');

    const input = document.createElement('input');
    document.getElementById('content').append(input);
    input.focus();
    router.renderPage.mockClear();
    onChange();
    expect(header.updateHeader).toHaveBeenCalledTimes(2);
    expect(router.renderPage).not.toHaveBeenCalled();
  });

  it('清理雲端照片時出錯：只記一筆警告，同步照常完成', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.getSessions.mockImplementation(() => { throw new Error('quota'); });
    await bootSignedIn('owner-a');
    await flush();

    expect(warn).toHaveBeenCalledWith('Proof photo sweep skipped:', expect.any(Error));
    expect(proofSweep.sweepOrphanCloudProofs).not.toHaveBeenCalled();
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });
});

describe('今日計畫', () => {
  it('已在計畫中的任務不重複加入', async () => {
    await bootCached('owner-a');
    const { state } = await import('../../pwa/js/state.js');
    state.dailyPlan = ['t1'];

    window.addToDailyPlan('t1');

    expect(feedback.showToast).toHaveBeenCalledWith('任務已在計劃中');
    expect(storage.saveDailyPlan).not.toHaveBeenCalled();
    expect(state.dailyPlan).toEqual(['t1']);
  });

  it('加入時存檔、提示並重畫目前的頁面', async () => {
    await bootCached('owner-a');
    const { state } = await import('../../pwa/js/state.js');
    state.dailyPlan = [];
    router.renderPage.mockClear();

    window.addToDailyPlan('t1');

    expect(storage.saveDailyPlan).toHaveBeenCalledWith(['t1']);
    expect(feedback.showToast).toHaveBeenCalledWith('✓ 已加入本日計劃');
    expect(router.renderPage).toHaveBeenCalledWith('home');
  });
});

describe('導覽與暖身載入', () => {
  it('導覽載入失敗時提示，不丟出錯誤', async () => {
    await bootCached('owner-a');
    // A mock's module stays cached once a test has imported it, even across
    // vi.resetModules(): a flag read by the factory only worked while no
    // earlier test had loaded the tour (TEST-016). Replace the module instead.
    vi.resetModules();
    vi.doMock('../../pwa/js/tour.js', () => { throw new Error('chunk failed to load'); });
    try {
      await window.startTour();
    } finally {
      vi.doMock('../../pwa/js/tour.js', () => ({ startTour: tour.startTour }));
    }

    expect(feedback.showToast).toHaveBeenCalledWith('導覽載入失敗');
    expect(tour.startTour).not.toHaveBeenCalled();
  });

  it('導覽載入成功時開始導覽', async () => {
    await bootCached('owner-a');
    await window.startTour();
    expect(tour.startTour).toHaveBeenCalledTimes(1);
  });

  it('App 圖示的徽章：今天的有效紀錄數；之後每次完成或刪除都重算；登出時清掉', async () => {
    window.requestIdleCallback = cb => { cb(); return 0; };
    await bootCached('owner-a', {
      sessions: [
        { id: 's1', date: TODAY, result: 'valid' },
        { id: 's2', date: TODAY, result: 'invalid' },
        { id: 's3', date: TODAY, result: 'partial' },
        { id: 's4', date: YESTERDAY, result: 'valid' },
      ],
    });
    await flush();
    expect(badge.setBadge).toHaveBeenLastCalledWith(2);

    const { state } = await import('../../pwa/js/state.js');
    state.sessions = [...state.sessions, { id: 's5', date: TODAY, result: 'valid' }];
    sessionFlow.badgeUpdater();
    expect(badge.setBadge).toHaveBeenLastCalledWith(3);

    auth.sessionResolve(sessionFor('owner-a'));
    await flush();
    await window.signOut();
    expect(badge.clearBadge).toHaveBeenCalled();
  });

  it('沒有 requestIdleCallback 時 500 ms 後才載入', async () => {
    delete window.requestIdleCallback;
    const realSetTimeout = globalThis.setTimeout;
    const warm = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      if (ms === 500) { warm.push(fn); return 0; }
      return realSetTimeout(fn, ms, ...args);
    });
    seedCachedUser('owner-a', { sessions: [{ id: 's1', date: TODAY, result: 'valid' }] });
    auth.getSession.mockImplementation(() => new Promise(() => {}));
    await import('../../pwa/js/app.js');
    await flush();
    expect(warm).toHaveLength(1);
    expect(badge.setBadge).not.toHaveBeenCalled();

    warm[0]();
    await vi.waitFor(() => expect(badge.setBadge).toHaveBeenCalledWith(1));
  });

  it('徽章模組還沒載入時，完成紀錄不會出錯', async () => {
    await bootCached('owner-a');
    expect(() => sessionFlow.badgeUpdater()).not.toThrow();
    expect(badge.setBadge).not.toHaveBeenCalled();
  });

  it('HW-110：遊客離線時完成紀錄不顯示待同步（沒有帳號可以同步）', async () => {
    network.online = false;
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 2 }));
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    seedCachedUser('guest-1');
    window.continueAsGuest();

    sessionFlow.badgeUpdater();

    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(syncBanner().textContent).toBe('');
  });

  it('HW-110：離線時完成或刪除紀錄，橫幅的待同步數量跟著更新；回到線上後不再更新', async () => {
    network.online = false;
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 1 }));
    await bootSignedIn('owner-a');
    expect(syncBanner().textContent).toContain('1 筆待同步');

    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 4 }));
    sessionFlow.badgeUpdater();
    expect(syncBanner().textContent).toContain('4 筆待同步');

    network.online = true;
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 5 }));
    sessionFlow.badgeUpdater();
    expect(syncBanner().textContent).toContain('4 筆待同步');
  });
});

describe('header 與鍵盤', () => {
  it('點 header 的空白處回到頁面頂端；點 header 上的按鈕不會', async () => {
    const scrollTo = vi.fn();
    await bootCached('owner-a');
    document.getElementById('content').scrollTo = scrollTo;

    document.getElementById('header-title').click();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    scrollTo.mockClear();
    document.getElementById('header-btn').click();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('文字欄位取得焦點時標記鍵盤編輯中；離開 260 ms 後取消並重新計算高度', async () => {
    await bootCached('owner-a');
    vi.useFakeTimers();
    const input = document.createElement('input');
    const other = document.createElement('input');
    document.getElementById('content').append(input, other);
    const root = document.documentElement;

    input.focus();
    expect(root.classList.contains('keyboard-editing')).toBe(true);

    // 換到另一個文字欄位：仍在編輯
    other.focus();
    await vi.advanceTimersByTimeAsync(300);
    expect(root.classList.contains('keyboard-editing')).toBe(true);

    root.style.removeProperty('--app-height');
    other.blur();
    await vi.advanceTimersByTimeAsync(259);
    expect(root.classList.contains('keyboard-editing')).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(root.classList.contains('keyboard-editing')).toBe(false);
    expect(root.style.getPropertyValue('--app-height')).toMatch(/px$/);
  });

  it('不是文字欄位的焦點不影響', async () => {
    await bootCached('owner-a');
    document.documentElement.classList.remove('keyboard-editing');
    document.getElementById('header-btn').focus();
    expect(document.documentElement.classList.contains('keyboard-editing')).toBe(false);
  });

  it('鍵盤編輯中不因視窗大小改變而重新計算高度', async () => {
    await bootCached('owner-a');
    const input = document.createElement('input');
    document.getElementById('content').append(input);
    input.focus();
    const root = document.documentElement;
    root.style.setProperty('--app-height', '123px');

    window.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--app-height')).toBe('123px');

    input.blur();
    window.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--app-height')).not.toBe('123px');
  });
});

describe('另一個分頁換了帳號', () => {
  let reload;
  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
  });

  it('寫入被拒時提示一次，3 秒內不重複', async () => {
    await bootCached('owner-a');
    vi.useFakeTimers({ toFake: ['Date'] });
    const fire = () => window.dispatchEvent(new Event('orbit:stored-account-changed'));
    const message = '另一個分頁已切換帳號，這裡的變更沒有儲存；請重新整理這個頁面';

    fire();
    fire();
    expect(feedback.showToast.mock.calls.filter(([text]) => text === message)).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    fire();
    expect(feedback.showToast.mock.calls.filter(([text]) => text === message)).toHaveLength(1);

    vi.advanceTimersByTime(1);
    fire();
    expect(feedback.showToast.mock.calls.filter(([text]) => text === message)).toHaveLength(2);
  });

  it('從返回／前進快取回來（pageshow persisted）且帳號已換時重新載入；一般的 pageshow 不會', async () => {
    await bootCached('owner-a');
    cache.user = makeUser('owner-b');

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(reload).not.toHaveBeenCalled();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('orbit_account_reloaded')).toBe('1');
  });

  it('回到前景時帳號已換就重新載入；還是同一個帳號、或這個視窗自己正在換成它時不會', async () => {
    await bootCached('owner-a');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).not.toHaveBeenCalled();

    // 這個視窗自己登入 owner-b：session 已是 owner-b，載入還沒換掉記憶體
    let finishLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-b'));
    cache.user = makeUser('owner-b');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).not.toHaveBeenCalled();
    finishLoad();
    await signingIn;
    await flush();

    cache.user = makeUser('owner-c');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('另一個分頁存入無法解析的帳號資料：不重新載入', async () => {
    await bootCached('owner-a');
    window.dispatchEvent(new window.StorageEvent('storage', {
      storageArea: localStorage, key: 'yoyo_user', oldValue: '{"id":"owner-a"}', newValue: '{not json',
    }));
    expect(reload).not.toHaveBeenCalled();
  });

  it('重新載入後的第一次開機提示一次，之後不再提示', async () => {
    sessionStorage.setItem('orbit_account_reloaded', '1');
    await bootSignedIn('owner-a');

    const message = '另一個分頁切換了帳號，這裡已重新載入';
    expect(feedback.showToast.mock.calls.filter(([text]) => text === message)).toHaveLength(1);
    expect(sessionStorage.getItem('orbit_account_reloaded')).toBeNull();

    auth.callback('SIGNED_OUT', null);
    seedCachedUser('owner-a');
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(feedback.showToast.mock.calls.filter(([text]) => text === message)).toHaveLength(1);
  });
});

describe('啟動與 auth 事件', () => {
  it('沒有快取也沒有 session：顯示登入畫面，不載入遠端', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();

    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(1);
    expect(db.loadFromRemote).not.toHaveBeenCalled();
  });

  it('沒有快取：SIGNED_IN 比 getSession() 先到時只載入一次', async () => {
    cache.user = null;
    auth.getSession.mockImplementation(
      () => new Promise(resolve => { auth.sessionResolve = resolve; }),
    );
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-a'); });
    await import('../../pwa/js/app.js');
    await flush();

    const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    auth.sessionResolve(sessionFor('owner-a'));
    await signingIn;
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
  });

  it('沒有快取：refresh 之後才套用隨機主題（PRO-014H；開機時 Pro 狀態還不明）', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    const theme = await import('../../pwa/js/theme.js');
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-a'); });

    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    const refreshAt = db.refreshProEntitlement.mock.invocationCallOrder.at(-1);
    expect(refreshAt).toBeDefined();
    expect(theme.applyRandomThemeForToday.mock.invocationCallOrder.some(order => order > refreshAt)).toBe(true);
  });

  it('沒有快取但有 session：載入那個帳號；之後同一個帳號的 SIGNED_IN 不再載入', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(sessionFor('owner-a'));
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-a'); });
    await import('../../pwa/js/app.js');
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);

    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
  });

  it('快取開機時 getSession() 失敗：以本機資料完成移轉，不載入遠端', async () => {
    seedCachedUser('owner-a');
    auth.getSession.mockRejectedValue(new Error('storage unavailable'));
    await import('../../pwa/js/app.js');
    await flush();

    expect(db.loadFromRemote).not.toHaveBeenCalled();
    expect(controller.refreshCanonicalStateAndReconcilePersonalSpaceV2)
      .toHaveBeenLastCalledWith(expect.objectContaining({ authoritative: false, finalizeMigration: true }));
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('快取開機時 getSession() 沒有 session：以本機資料完成移轉', async () => {
    seedCachedUser('owner-a');
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();

    expect(controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.map(([options]) => [
      options.provisionalMigration, options.finalizeMigration,
    ])).toEqual([[true, false], [false, true]]);
  });

  it('getSession() 失敗前已登入另一個帳號：不再以本機資料覆蓋', async () => {
    seedCachedUser('owner-a');
    let failSession;
    auth.getSession.mockImplementation(() => new Promise((resolve, reject) => { failSession = reject; }));
    await import('../../pwa/js/app.js');
    await flush();
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-b'); });
    await auth.callback('SIGNED_IN', sessionFor('owner-b'));
    await flush();
    const calls = controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length;

    failSession(new Error('storage unavailable'));
    await flush();

    expect(controller.refreshCanonicalStateAndReconcilePersonalSpaceV2.mock.calls.length).toBe(calls);
  });

  it('PASSWORD_RECOVERY 打開重設密碼的視窗', async () => {
    window._showResetPasswordModal = vi.fn();
    await bootCached('owner-a');

    await auth.callback('PASSWORD_RECOVERY', sessionFor('owner-a'));

    expect(window._showResetPasswordModal).toHaveBeenCalledTimes(1);
    expect(db.loadFromRemote).not.toHaveBeenCalled();
  });

  it('沒有 session 的 SIGNED_IN 不做任何事', async () => {
    await bootCached('owner-a');
    await auth.callback('SIGNED_IN', null);
    expect(db.loadFromRemote).not.toHaveBeenCalled();
  });

  it('遊客：有本機的使用者與任務時直接開機', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    seedCachedUser('guest-1', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } });

    window.continueAsGuest();

    expect(document.getElementById('login-screen').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-142：登入時的補傳失敗', () => {
  let pending;
  const summary = (sessions = 0, deletions = 0, profile = false) => ({
    sessions, deletions, tasks: false, profile, energy: false,
    total: sessions + deletions + Number(profile),
  });

  /** No cache: signs owner-a in through loadAndStart(); its load resolves with `backfilled`. */
  async function signInWithBackfills(backfilled) {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    db.loadFromRemote.mockImplementationOnce(async () => {
      seedCachedUser('owner-a');
      return { backfilled };
    });
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
  }

  beforeEach(() => {
    pending = summary();
    // Keyed by owner: the check must ask about the account that signed in.
    storage.getPendingSyncSummary.mockImplementation(owner => (owner === 'owner-a' ? pending : summary()));
  });

  it('補傳失敗時顯示「同步暫停」與待同步數，並在連線恢復時再同步', async () => {
    await signInWithBackfills(Promise.resolve().then(() => { pending = summary(2); }));

    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(syncBanner().textContent).toBe('⚠️ 同步暫停，將於下次連線重試 · 2 筆待同步');
    expect(storage.getPendingSyncSummary).toHaveBeenCalledWith('owner-a');

    // 直接送 online：檢查標記本身（瀏覽器只在 offline 之後送 online）。
    db.loadFromRemote.mockImplementationOnce(async () => { pending = summary(); });
    await network.emit(true);
    await flush();
    expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });

  it('待同步數只算補傳與刪除：還在送出的 profile 不算（#297 review）', async () => {
    await signInWithBackfills(Promise.resolve().then(() => { pending = summary(1, 0, true); }));
    expect(syncBanner().textContent).toBe('⚠️ 同步暫停，將於下次連線重試 · 1 筆待同步');
  });

  it('刪除紀錄沒有確認時也顯示', async () => {
    pending = summary(0, 1);
    await signInWithBackfills(Promise.resolve([]));
    expect(syncBanner().textContent).toBe('⚠️ 同步暫停，將於下次連線重試 · 1 筆待同步');
  });

  it('離線時顯示「離線中」', async () => {
    await signInWithBackfills(Promise.resolve().then(() => {
      network.online = false;
      pending = summary(1);
    }));
    expect(syncBanner().textContent).toBe('📴 離線中 · 1 筆待同步，連線後自動同步');
  });

  it('離線時待同步數算全部（profile 是排隊中，不是送出中；之後的更新也這樣算，#298 review）', async () => {
    await signInWithBackfills(Promise.resolve().then(() => {
      network.online = false;
      pending = summary(1, 0, true);
    }));
    expect(syncBanner().textContent).toBe('📴 離線中 · 2 筆待同步，連線後自動同步');
  });

  it('等補傳結束才讀待同步：補傳成功時不顯示', async () => {
    pending = summary(1);
    let finish;
    await signInWithBackfills(new Promise(resolve => { finish = resolve; }));
    expect(syncBanner().classList.contains('hidden')).toBe(true);

    pending = summary();
    finish([]);
    await flush();
    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(streakUnlock.requestStreakUnlock).toHaveBeenCalledWith('owner-a', expect.anything());
  });

  it('只剩這次開機自己寫的資料（例如換日寫的 profile，還在送出）時不顯示', async () => {
    pending = summary(0, 0, true);
    await signInWithBackfills(Promise.resolve([]));
    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(syncBanner().textContent).toBe('');
  });

  it('補傳結束前已登出：不顯示，也不詢問 SUB-16', async () => {
    let fail;
    await signInWithBackfills(new Promise(resolve => { fail = resolve; }));
    auth.callback('SIGNED_OUT', null);
    pending = summary(1);
    fail([]);
    await flush();

    expect(syncBanner().classList.contains('hidden')).toBe(true);
    expect(streakUnlock.requestStreakUnlock).not.toHaveBeenCalled();
  });
});

describe('BUG-143：前一個帳號的連線恢復同步不擋住下一個帳號', () => {
  async function signInAs(id) {
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser(id); });
    await auth.callback('SIGNED_IN', sessionFor(id));
    await flush();
  }
  const loadsOf = id => db.loadFromRemote.mock.calls.filter(([owner]) => owner === id).length;

  /** owner-a's reconnect sync hangs in its load; returns what settles it. */
  async function hangReconnectOf(id) {
    await bootSignedIn(id);
    await network.emit(false);
    let finish;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const syncing = network.emit(true);
    await flush();
    expect(loadsOf(id)).toBe(2);
    return { syncing, finish: () => finish() };
  }

  it.each([
    ['換成另一個帳號', 'owner-b'],
    ['登出後再登入同一個帳號', 'owner-a'],
  ])('%s後恢復連線：等前一個停下，再以新的 session 同步', async (_label, next) => {
    const stale = await hangReconnectOf('owner-a');
    auth.callback('SIGNED_OUT', null);
    await signInAs(next);
    const before = loadsOf(next);

    await network.emit(false);
    const syncing = network.emit(true);
    await flush();
    // 兩個載入不同時進行（_loadRemote）：前一個還沒停下，這一個先等。
    expect(loadsOf(next)).toBe(before);
    expect(syncBanner().textContent).toBe('☁️ 同步中…');

    stale.finish();
    await stale.syncing;
    await syncing;
    await flush();

    expect(loadsOf(next)).toBe(before + 1);
    expect(db.loadFromRemote).toHaveBeenLastCalledWith(next);
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });

  it('同一個 session 的同步還在進行時不再開一個', async () => {
    const running = await hangReconnectOf('owner-a');
    await network.emit(false);
    const again = network.emit(true);
    await flush();
    expect(loadsOf('owner-a')).toBe(2);

    running.finish();
    await running.syncing;
    await again;
    await flush();
    expect(loadsOf('owner-a')).toBe(2);
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });

  it('等待前一個時又登出：不再同步', async () => {
    const stale = await hangReconnectOf('owner-a');
    auth.callback('SIGNED_OUT', null);
    await signInAs('owner-b');
    await network.emit(false);
    const syncing = network.emit(true);
    await flush();

    auth.callback('SIGNED_OUT', null);
    stale.finish();
    await stale.syncing;
    await syncing;
    await flush();

    expect(loadsOf('owner-b')).toBe(1);
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('前一個結束時不會清掉新帳號那個還在進行的同步', async () => {
    const stale = await hangReconnectOf('owner-a');
    auth.callback('SIGNED_OUT', null);
    await signInAs('owner-b');
    await network.emit(false);
    let finishB;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
    const first = network.emit(true);
    stale.finish();
    await stale.syncing;
    await flush();
    expect(loadsOf('owner-b')).toBe(2);

    await network.emit(false);
    const again = network.emit(true);
    await flush();
    expect(loadsOf('owner-b')).toBe(2);

    finishB();
    await first;
    await again;
    await flush();
    expect(loadsOf('owner-b')).toBe(2);
  });

  it('前一個結束後，下一次恢復連線照常同步（不留下「進行中」）', async () => {
    const stale = await hangReconnectOf('owner-a');
    auth.callback('SIGNED_OUT', null);
    await signInAs('owner-b');
    await network.emit(false);
    const first = network.emit(true);
    stale.finish();
    await stale.syncing;
    await first;
    await flush();
    expect(loadsOf('owner-b')).toBe(2);

    await network.emit(false);
    await network.emit(true);
    await flush();
    expect(loadsOf('owner-b')).toBe(3);
  });
});

describe('BUG-141：帳號沒有快取、雲端資料載入失敗之後', () => {
  /** A signs in on a device with no cache for it, and its remote load fails. */
  async function failedLoad({ online = true } = {}) {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.online = online;
    storage.getPendingSyncSummary.mockImplementation(owner => ({ total: owner === 'owner-a' ? 3 : 0 }));
    db.loadFromRemote.mockRejectedValueOnce(new Error(online ? '500' : 'Failed to fetch'));
    presence.stored = true;                     // A's session stays on this device
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
    expect(feedback.showToast).toHaveBeenCalledWith('無法載入雲端資料，請檢查連線後重新整理。');
  }

  it('(c) 停在登入畫面時連線恢復：不在背景以那個帳號同步', async () => {
    await failedLoad({ online: false });
    const loads = db.loadFromRemote.mock.calls.length;

    await network.emit(true);
    await flush();

    expect(db.loadFromRemote.mock.calls.length).toBe(loads);
    expect(syncBanner().classList.contains('hidden')).toBe(true);
  });

  it('(d) 在登入畫面再登入同一個帳號：重新載入，成功就開機', async () => {
    await failedLoad();

    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-a'); });
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(db.loadFromRemote).toHaveBeenLastCalledWith('owner-a');
    expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('(a)(b)(e) 改用訪客：只在這台裝置結束那個帳號的 session，訪客照常開機、不顯示帳號的同步狀態、連線恢復也不同步', async () => {
    await failedLoad({ online: false });
    // supabase-js notifies SIGNED_OUT before signOut() resolves.
    localSession.forgetLocalSession.mockImplementationOnce(async () => {
      presence.stored = false;
      await auth.callback('SIGNED_OUT', null);
      return null;
    });
    seedCachedUser('guest-1');

    const modalsCleared = dayCycle.clearDayCycleModals.mock.calls.length;
    window.continueAsGuest();
    await flush();

    expect(localSession.forgetLocalSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();          // not the settings page's sign-out
    // The SIGNED_OUT it caused is not a sign-out of what is shown.
    expect(storage.clearAll).not.toHaveBeenCalled();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
    expect(dayCycle.clearDayCycleModals.mock.calls.length).toBe(modalsCleared);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);

    // (a) The guest's offline writes show no "N 筆待同步" of the account.
    sessionFlow.badgeUpdater();
    expect(syncBanner().classList.contains('hidden')).toBe(true);
    // (b) Back online: nothing is loaded as the account.
    const loads = db.loadFromRemote.mock.calls.length;
    await network.emit(true);
    await flush();
    expect(db.loadFromRemote.mock.calls.length).toBe(loads);
  });

  it('再登入那個帳號、載入還沒完成時改用訪客：那次載入作廢，不以帳號開機、也不再同步', async () => {
    await failedLoad();
    let finishLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    seedCachedUser('guest-1');

    window.continueAsGuest();
    await flush();
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);   // the guest's boot

    cache.user = makeUser('owner-a');      // what the account's load writes here
    finishLoad();
    await signingIn;
    await flush();

    expect(db.refreshProEntitlement).not.toHaveBeenCalled();
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    const loads = db.loadFromRemote.mock.calls.length;
    await network.emit(false);
    await network.emit(true);
    await flush();
    expect(db.loadFromRemote.mock.calls.length).toBe(loads);
  });

  /** Signs in as `id` and its load succeeds: the tab shows an account again. */
  async function signInAgainAs(id) {
    db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser(id); });
    await auth.callback('SIGNED_IN', sessionFor(id));
    await flush();
  }

  it('結束之後旗標清掉：之後登入的帳號登出時照常處理', async () => {
    await failedLoad();
    seedCachedUser('guest-1');
    window.continueAsGuest();
    await flush();

    await signInAgainAs('owner-b');
    await auth.callback('SIGNED_OUT', null);

    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(3);
  });

  it('訪客的分頁收到另一個分頁送來的 SIGNED_OUT：訪客的資料留著（#313 review）', async () => {
    await failedLoad();
    seedCachedUser('guest-1');
    window.continueAsGuest();
    await flush();

    await auth.callback('SIGNED_OUT', null);

    expect(storage.clearAll).not.toHaveBeenCalled();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('另一個分頁也停在同一個「載入失敗」的登入畫面，那邊改用訪客：這裡存著的訪客資料不清（#313 review）', async () => {
    await failedLoad();                          // the account's load fails here too
    cache.user = makeUser('guest-1');            // a guest's data on this device (the other tab's)

    await auth.callback('SIGNED_OUT', null);     // broadcast by the other tab's guest path

    expect(storage.clearAll).not.toHaveBeenCalled();
    expect(cache.user?.id).toBe('guest-1');
  });

  it('另一個分頁改用訪客時，這個分頁正在重新載入那個帳號：訪客的資料留著，那次載入作廢（#313 re-review）', async () => {
    await failedLoad();
    cache.user = makeUser('guest-1');            // a guest's data on this device
    // A refocus or a newly opened tab retries the account; its load hangs.
    let finishLoad;
    db.loadFromRemote.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const retrying = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    await auth.callback('SIGNED_OUT', null);     // the other tab's guest path

    expect(storage.clearAll).not.toHaveBeenCalled();
    expect(cache.user?.id).toBe('guest-1');
    finishLoad();
    await retrying;
    await flush();
    expect(db.refreshProEntitlement).not.toHaveBeenCalled();
    expect(dayCycle.processYesterdayStreak).not.toHaveBeenCalled();
  });

  it('這個分頁顯示著帳號（存著的就是它）時，SIGNED_OUT 照常登出', async () => {
    await bootSignedIn('owner-a');
    await auth.callback('SIGNED_OUT', null);
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    expect(authFlow.showLoginScreen).toHaveBeenCalled();
  });

  it('同步過的帳號的快取（getSession() 之前 session 已失效）收到 SIGNED_OUT：照舊清掉並回到登入畫面', async () => {
    localStorage.setItem('yoyo_sessionSyncCutover:v1.21:owner-a', JSON.stringify({ ownerId: 'owner-a', completed: true }));
    try {
      await bootCached('owner-a');
      await auth.callback('SIGNED_OUT', null);
      expect(storage.clearAll).toHaveBeenCalledTimes(1);
      expect(authFlow.showLoginScreen).toHaveBeenCalled();
    } finally {
      localStorage.removeItem('yoyo_sessionSyncCutover:v1.21:owner-a');
    }
  });

  it('結束失敗也不擋住訪客，之後的登出照常處理', async () => {
    await failedLoad();
    localSession.forgetLocalSession.mockRejectedValueOnce(new Error('storage unavailable'));
    seedCachedUser('guest-1');

    window.continueAsGuest();
    await flush();

    expect(console.warn).toHaveBeenCalledWith('Could not end the account session for the guest:', expect.any(Error));
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    await signInAgainAs('owner-b');
    await auth.callback('SIGNED_OUT', null);
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
  });

  it('登入還在查 Pro 狀態（資料已存下）時改用訪客：那個帳號的資料清掉，訪客從頭設定、不顯示帳號（#313 review）', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    presence.stored = true;
    // A successful load marks the account synced here (storage.js).
    localStorage.setItem('yoyo_sessionSyncCutover:v1.21:owner-a', JSON.stringify({ ownerId: 'owner-a', completed: true }));
    onTestFinished(() => localStorage.removeItem('yoyo_sessionSyncCutover:v1.21:owner-a'));
    // supabase-js notifies SIGNED_OUT before signOut() resolves: a synced
    // account's data is stored here then, and only the flag keeps this from
    // running handleSignOut() (clearing again and showing the login screen).
    localSession.forgetLocalSession.mockImplementationOnce(async () => {
      presence.stored = false;
      await auth.callback('SIGNED_OUT', null);
      return null;
    });
    let finishRefresh;
    const accountSessions = [{ id: 's-a1', date: TODAY, result: 'complete' }];
    db.loadFromRemote.mockImplementationOnce(async () => {
      seedCachedUser('owner-a', { sessions: accountSessions });
      storage.getSessions.mockReturnValue(accountSessions);
    });
    db.refreshProEntitlement.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(cache.user?.id).toBe('owner-a');      // the load wrote the account's data

    window.continueAsGuest();
    await flush();

    expect(localSession.forgetLocalSession).toHaveBeenCalledTimes(1);
    // As on a sign-out: its photos surely in the cloud and its downloads go too.
    expect(proofLocal.signOutProofCleanup).toHaveBeenCalledWith({
      authOwnerId: 'owner-a', sessionsOwnerId: 'owner-a', sessions: accountSessions,
    });
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    expect(proofLocal.signOutProofCleanup.mock.invocationCallOrder[0])
      .toBeLessThan(storage.clearAll.mock.invocationCallOrder[0]);
    expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(true);
    expect(dayCycle.processYesterdayStreak).not.toHaveBeenCalled();
    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(1);   // the first launch's only
    expect(dayCycle.clearDayCycleModals).not.toHaveBeenCalled();

    finishRefresh(true);
    await signingIn;
    await flush();
    expect(dayCycle.processYesterdayStreak).not.toHaveBeenCalled();
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(true);
  });

  function overlay(id, className = 'modal-overlay') {
    const el = document.createElement('div');
    el.className = className;
    if (id) el.id = id;
    document.body.append(el);
    return el;
  }

  it('載入失敗回到登入畫面時，只收起前一次開機留下的日報類視窗，不收重設密碼的表單（#313 review）', async () => {
    await bootCached('owner-c');                 // a cached boot of another owner
    const dayCycleOverlays = [
      overlay('daily-report-modal'), overlay('morning-modal'), overlay('streak-unlock-modal'),
      overlay(null, 'shield-confirm-overlay'),
    ];
    const resetPassword = overlay(null);         // authFlow's 設定新密碼 (no id)
    const forgotPassword = overlay('forgot-pw-modal');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.loadFromRemote.mockRejectedValueOnce(new Error('500'));

    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(authFlow.showLoginScreen).toHaveBeenCalled();
    expect(dayCycleOverlays.map(el => el.isConnected)).toEqual([false, false, false, false]);
    expect(resetPassword.isConnected).toBe(true);
    expect(forgotPassword.isConnected).toBe(true);
  });

  it('PASSWORD_RECOVERY 之後載入失敗：設定新密碼的表單留著（#313 re-review）', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    let resetForm = null;
    window._showResetPasswordModal = vi.fn(() => { resetForm = overlay(null); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.loadFromRemote.mockRejectedValueOnce(new Error('500'));

    await auth.callback('PASSWORD_RECOVERY', sessionFor('owner-a'));
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
    expect(resetForm.isConnected).toBe(true);
  });

  it('一般的訪客（這台裝置沒有 session）不呼叫登出', async () => {
    cache.user = null;
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();
    seedCachedUser('guest-1');

    window.continueAsGuest();
    await flush();

    expect(localSession.forgetLocalSession).not.toHaveBeenCalled();
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('同一個帳號有快取時照舊離線開機，不忘掉它（連線恢復後同步）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.online = false;
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootSignedIn('owner-a');
    warn.mockRestore();
    db.loadFromRemote.mockImplementationOnce(async () => {
      storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
    });

    await network.emit(true);
    await flush();

    expect(db.loadFromRemote).toHaveBeenLastCalledWith('owner-a');
    expect(syncBanner().textContent).toBe('✓ 已更新');
  });

  describe('BUG-201：失敗時收起的日報，改用訪客後再問一次', () => {
    it('快取的訪客開機（今天還沒問）、帳號載入失敗收起日報，再改用訪客：日報再出現一次', async () => {
      await bootCached('guest-1', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } });
      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
      expect(document.getElementById('daily-report-modal')).not.toBeNull();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
      presence.stored = true;
      await auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();
      expect(document.getElementById('daily-report-modal')).toBeNull();

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);   // not run twice
      expect(dayCycle.checkWeeklyBonus).toHaveBeenCalledTimes(1);
      // Closing the report asks the morning state, as on a first boot.
      dayCycle.showDailyReport.mock.calls[1][0]();
      expect(dayCycle.showMorningModal).toHaveBeenCalledTimes(1);
    });

    it('今天已經回答過（精力已重設）：不再問', async () => {
      await bootCached('guest-1', { energy: { currentEnergy: 90, maxEnergy: 100, lastResetDate: TODAY } });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
      presence.stored = true;
      await auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).not.toHaveBeenCalled();
    });

    /** A cached guest boot with today unasked, then an account's load fails here. */
    async function guestBootThenFailedLoad({ beforeFailure } = {}) {
      await bootCached('guest-1', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } });
      beforeFailure?.();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
      presence.stored = true;
      await auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();
    }

    it('收起的是晨間視窗（日報已關掉）：只再問晨間狀態', async () => {
      await guestBootThenFailedLoad({
        beforeFailure() {
          document.getElementById('daily-report-modal').remove();
          const morning = document.createElement('div');
          morning.id = 'morning-modal';
          document.body.appendChild(morning);
        },
      });
      expect(document.getElementById('morning-modal')).toBeNull();

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);   // only the first boot's
      expect(dayCycle.showMorningModal).toHaveBeenCalledTimes(1);
    });

    it('收起的是晨間視窗、換日後才改用訪客：從新的一天的日報問起（#316 review）', async () => {
      await guestBootThenFailedLoad({
        beforeFailure() {
          document.getElementById('daily-report-modal').remove();
          const morning = document.createElement('div');
          morning.id = 'morning-modal';
          document.body.appendChild(morning);
        },
      });
      clock.today = '2026-08-27';                                   // the login screen stayed past the new day

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      expect(dayCycle.showMorningModal).not.toHaveBeenCalled();
      dayCycle.showDailyReport.mock.calls[1][0]();
      expect(dayCycle.showMorningModal).toHaveBeenCalledTimes(1);
    });

    it('日報與晨間視窗都開著時失敗：再問的是日報（關掉後才問晨間狀態，#315 review）', async () => {
      await guestBootThenFailedLoad({
        beforeFailure() {
          const morning = document.createElement('div');
          morning.id = 'morning-modal';
          document.body.appendChild(morning);
        },
      });
      expect(document.getElementById('daily-report-modal')).toBeNull();
      expect(document.getElementById('morning-modal')).toBeNull();

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      expect(dayCycle.showMorningModal).not.toHaveBeenCalled();
      dayCycle.showDailyReport.mock.calls[1][0]();
      expect(dayCycle.showMorningModal).toHaveBeenCalledTimes(1);
    });

    it('在登入畫面再失敗一次（畫面上已沒有日報）：記號留著，改用訪客時照樣再問（#315 review）', async () => {
      await guestBootThenFailedLoad();
      db.loadFromRemote.mockRejectedValueOnce(new Error('500'));
      await auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();
      expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
      expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);   // once per failure

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    });

    it('改用訪客前換日計時器已掛上日報：不再疊一層', async () => {
      await guestBootThenFailedLoad();
      const report = document.createElement('div');
      report.id = 'daily-report-modal';
      document.body.appendChild(report);

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
    });

    it('只問一次：之後再開機（同一次開啟）不再問', async () => {
      await guestBootThenFailedLoad();
      window.continueAsGuest();
      await flush();
      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      document.getElementById('daily-report-modal').remove();   // closed, morning not answered

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
    });

    it('沒有被 fail-closed 收起過：重複的開機照舊不問（BUG-106 的帳號路徑，#315 review）', async () => {
      // The cached boot asked; the user closed it, then a stale pull left
      // yesterday's energy: the early SIGNED_IN's repeat boot does not ask.
      await bootCached('owner-a', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } });
      document.getElementById('daily-report-modal').remove();
      seedCachedUser('owner-a', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } });

      await auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
      expect(dayCycle.showMorningModal).not.toHaveBeenCalled();
    });

    it('另一個分頁已經回答了今天的狀態（共用的儲存）：不再問', async () => {
      await guestBootThenFailedLoad();
      cache.energy = { currentEnergy: 90, maxEnergy: 100, lastResetDate: TODAY };

      window.continueAsGuest();
      await flush();

      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
      expect(dayCycle.showMorningModal).not.toHaveBeenCalled();
    });

    it('fail-closed 之後登入另一個帳號：記號清掉，那個帳號的重複開機不問', async () => {
      await guestBootThenFailedLoad();
      db.loadFromRemote.mockImplementationOnce(async () => { seedCachedUser('owner-b', { energy: { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY } }); });
      await auth.callback('SIGNED_IN', sessionFor('owner-b'));
      await flush();
      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);    // owner-b's own first boot
      document.getElementById('daily-report-modal').remove();
      presence.stored = false;                                      // a repeat boot of the same data

      window.continueAsGuest();
      await flush();

      expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(2);   // guest-1's, owner-b's
      expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
      expect(dayCycle.showMorningModal).not.toHaveBeenCalled();
    });
  });

  describe('BUG-202：被打斷的登入表單還原', () => {
    function showLogin() {
      document.getElementById('login-screen').classList.remove('hidden');
    }

    it('這個分頁停在登入畫面、自己的登入載入中，被另一個分頁的訪客流程打斷：登入表單還原', async () => {
      await failedLoad();
      showLogin();
      cache.user = makeUser('guest-1');
      db.loadFromRemote.mockImplementationOnce(() => new Promise(() => {}));   // its sign-in hangs
      const signingIn = auth.callback('SIGNED_IN', sessionFor('owner-a'));
      await flush();
      expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);

      await auth.callback('SIGNED_OUT', null);

      expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(3);
      expect(storage.clearAll).not.toHaveBeenCalled();
      void signingIn;
    });

    it('這個分頁開著訪客的設定畫面：不切到登入畫面（#315 review）', async () => {
      await failedLoad();
      window.continueAsGuest();                    // no user: the setup screen
      await flush();
      expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(false);
      cache.user = makeUser('guest-1');

      await auth.callback('SIGNED_OUT', null);

      expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
      expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(false);
    });

    it('這個分頁顯示著訪客的畫面：不切到登入畫面', async () => {
      await failedLoad();
      seedCachedUser('guest-1');                 // the guest's user and tasks
      window.continueAsGuest();
      await flush();

      await auth.callback('SIGNED_OUT', null);

      expect(authFlow.showLoginScreen).toHaveBeenCalledTimes(2);
      expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    });
  });
});
