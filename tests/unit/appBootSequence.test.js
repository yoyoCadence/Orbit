/**
 * appBootSequence.test.js — 啟動時序：`SIGNED_IN` 早於 `getSession()` resolve（BUG-106）
 * 環境：jsdom
 *
 * 背景：`bootWithLocalState()` 有兩條呼叫路徑 —— `init()` 的快取使用者分支，
 * 以及 `onAuthStateChange('SIGNED_IN')` → `loadAndStart()`。後者的守門條件比對
 * `_currentSession`，但那個變數要到 `getSession()` resolve 後才被賦值。當
 * Supabase 先送出 `SIGNED_IN`（token 需要 refresh、網路慢、PWA 由背景恢復）時，
 * 同一次啟動就會跑兩次完整 boot：疊兩層日報／晨間 modal，並且用剛拉回來、可能
 * 還沒帶到本機剛寫入的 `lastStreakDate` 的遠端 profile 再跑一次連勝與週獎勵。
 *
 * 這裡直接在那個時序下驅動 app.js，鎖住四件事：
 *   1. 早到的 `SIGNED_IN` 不會讓 boot 序列跑第二次（但遠端仍然會載入）
 *   2. 後到的 `getSession()` 不會重複拉遠端
 *   3. 登出後重新登入會重跑 boot 序列
 *   4. 直接切換到另一個帳號會重跑 boot 序列
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('../../pwa/js/dayCycle.js', () => ({
  ...dayCycle,
  eToday: () => TODAY,
}));

const storage = vi.hoisted(() => ({
  getUser: vi.fn(),
  getTheme: vi.fn(() => 'dark'),
  getUiSkin: vi.fn(() => 'default'),
  getBgImage: vi.fn(() => null),
  isTrialUser: vi.fn(() => false),
  isProUser: vi.fn(() => false),
  recoverPendingSessionDeletions: vi.fn(),
  saveUser: vi.fn(),
  saveTasks: vi.fn(),
  saveDailyPlan: vi.fn(),
  clearAll: vi.fn(),
}));

const db = vi.hoisted(() => ({
  loadFromRemote: vi.fn(() => Promise.resolve()),
  refreshProEntitlement: vi.fn(() => Promise.resolve(false)),
  startTrial: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../pwa/js/storage.js', () => ({
  storage, db,
  migrateV1toV2: vi.fn(),
  migrateDefaultFlags: vi.fn(),
}));

// Mirrors the real controller's contract: republish the cache into central state.
vi.mock('../../pwa/js/personalSpace/v2/controller.js', () => ({
  refreshCanonicalStateAndReconcilePersonalSpaceV2: vi.fn(({ centralState }) => {
    centralState.user     = cache.user;
    centralState.tasks    = cache.tasks;
    centralState.sessions = cache.sessions;
    centralState.energy   = cache.energy;
  }),
}));

vi.mock('../../pwa/js/authFlow.js', () => ({
  showLoginScreen: vi.fn(),
  hideLoading: vi.fn(),
}));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({
  showToast: vi.fn(), showSyncBanner: vi.fn(),
}));
vi.mock('../../pwa/js/sessionFlow.js', () => ({ setBadgeUpdater: vi.fn() }));
vi.mock('../../pwa/js/focusTimer.js', () => ({}));
vi.mock('../../pwa/js/defaultTasks.js', () => ({ createDefaultTasks: () => [] }));
vi.mock('../../pwa/js/timeBand.js', () => ({ applyTimeBand: vi.fn() }));
vi.mock('../../pwa/js/theme.js', () => ({
  applyRandomThemeForToday: vi.fn(),
  renderBg: vi.fn(),
  initLiquidGlassReflection: vi.fn(),
}));
vi.mock('../../pwa/js/router.js', () => ({
  renderPage: vi.fn(),
  currentHash: () => 'home',
  isTextInputTarget: () => false,
  isTextInputActive: () => false,
  markTextInputFocus: vi.fn(),
  teardownActivePageRenderer: vi.fn(),
}));
vi.mock('../../pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js', () => ({
  orbitWindowRuntimeDestroyer: { destroyNow: vi.fn() },
}));

// ─── Harness ──────────────────────────────────────────────────────────────────

const flush = () => new Promise(resolve => { setTimeout(resolve, 0); });

function seedCachedUser(id) {
  cache.user     = makeUser(id);
  cache.tasks    = [{ id: 't1', name: 'Task' }];
  cache.sessions = [];
  cache.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: YESTERDAY };
}

/**
 * Boots app.js against a cached user whose energy is still on yesterday, with
 * `getSession()` left pending so `SIGNED_IN` can be delivered first.
 */
async function bootWithPendingSession(cachedUserId = 'owner-a') {
  seedCachedUser(cachedUserId);
  auth.getSession.mockImplementation(
    () => new Promise(resolve => { auth.sessionResolve = resolve; }),
  );
  await import('../../pwa/js/app.js');
  await flush();
}

function sessionFor(userId) {
  return { user: { id: userId }, access_token: `token-${userId}` };
}

beforeEach(() => {
  vi.resetModules();
  Object.values(dayCycle).forEach(fn => fn.mockClear());
  db.loadFromRemote.mockClear();
  storage.getUser.mockImplementation(() => cache.user);
  storage.clearAll.mockImplementation(() => { cache.user = null; cache.tasks = []; });
  auth.callback = null;
  auth.sessionResolve = null;
  sessionStorage.clear();
  // Keeps warmEnhancementModules() from dynamically importing the real modules.
  window.requestIdleCallback = () => 0;
  document.body.innerHTML = `
    <div id="login-screen" class="hidden"></div>
    <div id="setup-screen" class="hidden"></div>
    <div id="main-app" class="hidden"></div>
    <div id="header"></div>
    <div id="content"></div>
  `;
});

afterEach(() => {
  delete window.requestIdleCallback;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('app boot sequencing', () => {
  it('快取分支已 boot 後，早到的 SIGNED_IN 不會再跑一次 boot 序列', async () => {
    await bootWithPendingSession('owner-a');

    // 快取分支：boot 序列跑過一次，日報已排隊
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    expect(dayCycle.checkWeeklyBonus).toHaveBeenCalledTimes(1);

    // getSession() 仍未 resolve —— 這正是 _currentSession 還是 null 的空窗期
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
    expect(dayCycle.processYesterdayStreak).toHaveBeenCalledTimes(1);
    expect(dayCycle.checkWeeklyBonus).toHaveBeenCalledTimes(1);
    // 收斂的是 boot 序列，不是遠端同步：資料仍然要拉回來
    expect(db.loadFromRemote).toHaveBeenCalledWith('owner-a');
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('後到的 getSession() 不會因為 SIGNED_IN 已處理而重複載入遠端', async () => {
    await bootWithPendingSession('owner-a');
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);
  });

  it('登出後重新登入同一個帳號會重跑 boot 序列', async () => {
    await bootWithPendingSession('owner-a');
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);

    auth.callback('SIGNED_OUT', null);
    expect(dayCycle.clearDayCycleModals).toHaveBeenCalled();

    seedCachedUser('owner-a');
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
  });

  it('直接切換到另一個帳號會重跑 boot 序列', async () => {
    await bootWithPendingSession('owner-a');
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);

    seedCachedUser('owner-b');
    await auth.callback('SIGNED_IN', sessionFor('owner-b'));
    await flush();

    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
    expect(db.loadFromRemote).toHaveBeenCalledWith('owner-b');
  });
});
