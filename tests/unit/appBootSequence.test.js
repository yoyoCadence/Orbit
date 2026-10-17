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
  getPendingSyncSummary: vi.fn(() => ({ total: 0 })),
  saveUser: vi.fn(),
  saveTasks: vi.fn(),
  saveDailyPlan: vi.fn(),
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
vi.mock('../../pwa/js/personalSpace/v2/controller.js', () => ({
  refreshCanonicalStateAndReconcilePersonalSpaceV2: vi.fn(({ centralState }) => {
    centralState.user     = cache.user;
    centralState.tasks    = cache.tasks;
    centralState.sessions = cache.sessions;
    centralState.energy   = cache.energy;
  }),
}));

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
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => feedback);
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
  db.loadFromRemote.mockResolvedValue();
  db.refreshProEntitlement.mockClear();
  db.refreshProEntitlement.mockResolvedValue(false);
  db.startTrial.mockClear();
  db.startTrial.mockResolvedValue({ ok: true, ownerChanged: false, trialStartedAt: null });
  Object.values(authFlow).forEach(fn => fn.mockClear());
  Object.values(feedback).forEach(fn => fn.mockClear());
  storage.saveUser.mockClear();
  storage.getUser.mockImplementation(() => cache.user);
  storage.saveUser.mockImplementation(user => { cache.user = user; });
  storage.clearAll.mockImplementation(() => { cache.user = null; cache.tasks = []; });
  auth.callback = null;
  auth.sessionResolve = null;
  network.online = true;
  network.handlers = [];
  storage.getPendingSyncSummary.mockImplementation(() => ({ total: 0 }));
  sessionStorage.clear();
  // Keeps warmEnhancementModules() from dynamically importing the real modules.
  window.requestIdleCallback = () => 0;
  document.body.innerHTML = `
    <div id="login-screen" class="hidden"></div>
    <div id="setup-screen" class="hidden"></div>
    <div id="main-app" class="hidden"></div>
    <div id="header"></div>
    <div id="content"></div>
    <div id="trial-banner" class="hidden"></div>
    <button id="setup-avatar-btn" type="button"></button>
    <input id="setup-avatar-input" type="file">
    <div id="setup-avatar-preview"></div>
    <form id="setup-form"><input id="setup-name"></form>
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

  // ── PRO-014C：trial 啟動不得中斷開機 ───────────────────────────────────────
  //
  // app.js 的提前返回位在 hideLoading() 與隱藏 login screen 之前，所以
  // startTrial() 的回傳語意直接決定使用者會不會卡在 loading 畫面。
  //
  // 用「切換帳號」情境測，因為那是 loadAndStart() 必須自己跑完 boot 序列的
  // 情況 —— 快取分支已經替 owner-a 開過機，showDailyReport 要到 2 只能靠
  // loadAndStart() 沒有中途返回。

  async function switchAccountWithoutTrial(nextOwnerId) {
    await bootWithPendingSession('owner-a');
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);

    cache.user = { ...makeUser(nextOwnerId), trialStartedAt: null };
    await auth.callback('SIGNED_IN', sessionFor(nextOwnerId));
    await flush();
  }

  it('RPC 失敗時仍能完成開機 —— 試用啟動失敗是非致命的', async () => {
    db.startTrial.mockResolvedValueOnce({ ok: false, ownerChanged: false, trialStartedAt: null });

    await switchAccountWithoutTrial('owner-b');

    expect(db.startTrial).toHaveBeenCalledWith('owner-b');
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(2);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('owner 改變時仍會中斷 —— 那是唯一該中止開機的情況', async () => {
    db.startTrial.mockResolvedValueOnce({ ok: false, ownerChanged: true, trialStartedAt: null });

    await switchAccountWithoutTrial('owner-b');

    expect(db.startTrial).toHaveBeenCalledWith('owner-b');
    expect(dayCycle.showDailyReport).toHaveBeenCalledTimes(1);   // 沒有跑完
  });

  it('第二次登入不再呼叫 start_trial —— 相容層已寫入 trialStartedAt', async () => {
    await bootWithPendingSession('owner-a');   // makeUser 帶有 trialStartedAt
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();

    expect(db.startTrial).not.toHaveBeenCalled();
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
  });

  it('初始設定只更新表單欄位，完整保留既有 profile 與 start_trial 時間戳', async () => {
    const startedAt = '2026-08-30T05:14:06.352515+00:00';
    const existingProfile = {
      ...makeUser('owner-new'),
      name: '',
      avatar: 'https://example.test/avatar.png',
      avatarPath: 'avatars/owner-new.png',
      totalXP: 1234,
      streakDays: 45,
      lastStreakDate: '2026-08-29',
      lastWeeklyBonusDate: '2026-08-25',
      morningState: 'great',
      mode: 'expert',
      isPublic: true,
      titleTemplate: 'builder',
      customTitle: 'Orbit Builder',
      newDayHour: 3,
      isPro: true,
      proExpiresAt: '2027-08-30T00:00:00.000Z',
      trialStartedAt: null,
      streakShieldCount: 2,
      streakShieldResetMonth: '2026-08',
      streakUnlockUsed: true,
      focusDefaultMinutes: 50,
      focusSoundEnabled: false,
      createdAt: '2025-01-02',
      futureProfileField: 'preserve-me',
    };
    cache.user = null;
    cache.tasks = [];
    auth.getSession.mockImplementation(
      () => new Promise(resolve => { auth.sessionResolve = resolve; }),
    );
    db.loadFromRemote.mockImplementationOnce(async userId => {
      cache.user = { ...existingProfile, id: userId };
      cache.tasks = [];
    });
    db.startTrial.mockImplementationOnce(async () => {
      cache.user = { ...cache.user, trialStartedAt: startedAt };
      return { ok: true, ownerChanged: false, trialStartedAt: startedAt };
    });

    await import('../../pwa/js/app.js');
    await flush();
    await auth.callback('SIGNED_IN', sessionFor('owner-new'));
    await flush();

    expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(false);
    document.getElementById('setup-name').value = 'PRO014J Smoke';
    document.getElementById('setup-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(storage.saveUser).toHaveBeenLastCalledWith({
      ...existingProfile,
      id: 'owner-new',
      name: 'PRO014J Smoke',
      trialStartedAt: startedAt,
    });
  });

  it.each([
    ['沒有', null],
    ['只有其他帳號的', makeUser('owner-other')],
  ])('遠端載入失敗且%s快取時，不得進入 setup 或寫回 profile', async (_label, cachedUser) => {
    cache.user = cachedUser;
    cache.tasks = [];
    auth.getSession.mockImplementation(
      () => new Promise(resolve => { auth.sessionResolve = resolve; }),
    );
    db.loadFromRemote.mockRejectedValueOnce(new Error('offline'));

    await import('../../pwa/js/app.js');
    await flush();
    await auth.callback('SIGNED_IN', sessionFor('owner-no-cache'));
    await flush();

    expect(authFlow.showLoginScreen).toHaveBeenCalled();
    expect(feedback.showSyncBanner).toHaveBeenCalledWith('error', { pending: 0 });
    expect(feedback.showToast).toHaveBeenCalledWith('無法載入雲端資料，請檢查連線後重新整理。');
    expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(true);
    expect(storage.saveUser).not.toHaveBeenCalled();
    expect(db.startTrial).not.toHaveBeenCalled();
  });

  it('遠端載入失敗但有同帳號快取時，即使任務為空也只離線開機、不進 setup', async () => {
    cache.user = makeUser('owner-offline');
    cache.tasks = [];
    auth.getSession.mockImplementation(
      () => new Promise(resolve => { auth.sessionResolve = resolve; }),
    );
    db.loadFromRemote.mockRejectedValueOnce(new Error('offline'));

    await import('../../pwa/js/app.js');
    await flush();
    await auth.callback('SIGNED_IN', sessionFor('owner-offline'));
    await flush();

    expect(document.getElementById('setup-screen').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
    expect(authFlow.showLoginScreen).not.toHaveBeenCalled();
    expect(feedback.showSyncBanner).toHaveBeenCalledWith('error', { pending: 0 });
    expect(storage.saveUser).not.toHaveBeenCalled();
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

// ─── PRO-014O：cached-user 啟動也要 refresh Pro entitlement projection ─────────
//
// 回訪使用者通常走 init() 的快取分支：getSession() → 背景 loadFromRemote()，
// 只有 SIGNED_IN 搶在 getSession() 之前才會進 loadAndStart()。若快取分支不
// refresh，切到 `server` source 後 projection 會在 SNAPSHOT_TTL_MS 後 fail closed，
// 付費使用者失去 Pro。

describe('PRO-014O：快取分支的 entitlement refresh', () => {
  it('getSession() 先 resolve（沒有 SIGNED_IN）時，遠端同步後仍會 refresh', async () => {
    await bootWithPendingSession('owner-a');
    expect(db.refreshProEntitlement).not.toHaveBeenCalled();

    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledWith('owner-a');
    expect(db.refreshProEntitlement).toHaveBeenCalledTimes(1);
    expect(db.refreshProEntitlement).toHaveBeenCalledWith('owner-a');
    // 與 loadAndStart() 相同的順序：先拉遠端，再 refresh，最後才宣告同步完成
    expect(db.loadFromRemote.mock.invocationCallOrder[0])
      .toBeLessThan(db.refreshProEntitlement.mock.invocationCallOrder[0]);
    expect(feedback.showSyncBanner).toHaveBeenCalledWith('synced');
  });

  it('遠端同步失敗（離線）時不 refresh，保留既有 snapshot 讓 grace window 生效', async () => {
    db.loadFromRemote.mockRejectedValueOnce(new Error('offline'));
    await bootWithPendingSession('owner-a');

    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(db.refreshProEntitlement).not.toHaveBeenCalled();
    expect(feedback.showSyncBanner).toHaveBeenCalledWith('error', { pending: 0 });
  });

  it('SIGNED_IN 先到時只 refresh 一次，後到的 getSession() 不重複', async () => {
    await bootWithPendingSession('owner-a');
    await auth.callback('SIGNED_IN', sessionFor('owner-a'));
    await flush();
    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(db.refreshProEntitlement).toHaveBeenCalledTimes(1);
  });

  it('refresh 期間登出時，不再以舊 owner 宣告同步完成', async () => {
    await bootWithPendingSession('owner-a');
    db.refreshProEntitlement.mockImplementationOnce(async () => {
      await auth.callback('SIGNED_OUT', null);
      return false;
    });

    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    expect(db.refreshProEntitlement).toHaveBeenCalledTimes(1);
    expect(feedback.showSyncBanner).not.toHaveBeenCalledWith('synced');
  });
});

// ─── HW-110：離線時顯示待同步數量，連線恢復後立即推送 ─────────────────────────

describe('HW-110：離線佇列提示與連線恢復同步', () => {
  async function bootOfflineWithPending(pending = 3) {
    network.online = false;
    storage.getPendingSyncSummary.mockImplementation(() => ({ total: pending }));
    db.loadFromRemote.mockRejectedValueOnce(new Error('Failed to fetch'));
    await bootWithPendingSession('owner-a');
    auth.sessionResolve(sessionFor('owner-a'));
    await flush();
  }

  it('離線啟動時顯示離線狀態與待同步數量，而不是一般的同步錯誤', async () => {
    await bootOfflineWithPending(3);

    expect(storage.getPendingSyncSummary).toHaveBeenCalledWith('owner-a');
    expect(feedback.showSyncBanner).toHaveBeenLastCalledWith('offline', { pending: 3 });
  });

  it('連線恢復後立即推送並重新整理，不必等下次開啟 App', async () => {
    await bootOfflineWithPending(2);
    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);

    db.loadFromRemote.mockResolvedValueOnce();
    await network.emit(true);
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
    expect(db.refreshProEntitlement).toHaveBeenCalledWith('owner-a');
    expect(feedback.showSyncBanner).toHaveBeenLastCalledWith('synced');
  });

  it('連線恢復後的同步仍失敗時，保留佇列並顯示待同步數量', async () => {
    await bootOfflineWithPending(2);

    db.loadFromRemote.mockRejectedValueOnce(new Error('503'));
    await network.emit(true);
    await flush();

    expect(feedback.showSyncBanner).toHaveBeenLastCalledWith('error', { pending: 2 });
  });

  it('啟動同步成功、之後只是網路短暫切換時，不重複拉取', async () => {
    await bootWithPendingSession('owner-a');
    auth.sessionResolve(sessionFor('owner-a'));
    await flush();
    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);

    await network.emit(true);
    await flush();

    expect(db.loadFromRemote).toHaveBeenCalledTimes(1);
  });

  it('離線事件會把之後的上線標記為需要同步', async () => {
    await bootWithPendingSession('owner-a');
    auth.sessionResolve(sessionFor('owner-a'));
    await flush();

    storage.getPendingSyncSummary.mockImplementation(() => ({ total: 1 }));
    await network.emit(false);
    expect(feedback.showSyncBanner).toHaveBeenLastCalledWith('offline', { pending: 1 });

    await network.emit(true);
    await flush();
    expect(db.loadFromRemote).toHaveBeenCalledTimes(2);
  });

  it('沒有登入 session（遊客）時不顯示離線同步提示，也不嘗試推送', async () => {
    seedCachedUser('guest-local');
    auth.getSession.mockResolvedValue(null);
    await import('../../pwa/js/app.js');
    await flush();

    await network.emit(false);
    await network.emit(true);
    await flush();

    expect(feedback.showSyncBanner).not.toHaveBeenCalledWith('offline', expect.anything());
    expect(db.loadFromRemote).not.toHaveBeenCalled();
  });
});
