/** PRO-014L day-cycle integration: local streak processing cannot grant Pro. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  saveUser: vi.fn(() => true),
  saveEnergy: vi.fn(() => true),
  getUser: vi.fn(),
  isProUser: vi.fn(() => false),
}));
const grantStreakUnlockMock = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/storage.js', () => ({
  storage: storageMock,
  db: {
    grantStreakUnlock: grantStreakUnlockMock,
    upsertProfile: vi.fn(() => Promise.resolve(true)),
  },
}));
vi.mock('../../pwa/js/ui/feedback.js', () => ({
  showToast: vi.fn(),
  showXPFloat: vi.fn(),
}));
vi.mock('../../pwa/js/router.js', () => ({
  renderPage: vi.fn(),
  currentHash: () => 'home',
}));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/theme.js', () => ({ applyRandomThemeForToday: vi.fn() }));
vi.mock('../../pwa/js/engine.js', () => ({
  calcDailyStats: () => ({
    isEffectiveDay: true,
    hasASTask: true,
    entertainmentMinutes: 0,
    productiveXP: 50,
  }),
  processStreakForDate: days => (days || 0) + 1,
}));

const { state } = await import('../../pwa/js/state.js');
const {
  processYesterdayStreak,
  requestStreakUnlock,
} = await import('../../pwa/js/dayCycle.js');

const OWNER = 'owner-1';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv');
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  storageMock.isProUser.mockReturnValue(false);
  state.user = {
    id: OWNER,
    newDayHour: 0,
    streakDays: 44,
    lastStreakDate: dateOffset(-1),
    streakUnlockUsed: false,
  };
  state.sessions = [];
  state.energy = { currentEnergy: 90, maxEnergy: 100, lastResetDate: dateOffset(-1) };
  storageMock.getUser.mockImplementation(() => state.user);
  grantStreakUnlockMock.mockResolvedValue({
    ok: true,
    ownerChanged: false,
    result: {
      status: 'not_eligible', granted: false, isActive: false,
      expiresAt: null, grantedAt: null,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('local day rollover', () => {
  it('達到第 45 天只更新 streak，不再自行寫 Pro 或 expiry', () => {
    processYesterdayStreak();

    expect(state.user.streakDays).toBe(45);
    expect(state.user.isPro).toBeUndefined();
    expect(state.user.proExpiresAt).toBeUndefined();
    expect(state.user.streakUnlockUsed).toBe(false);
    expect(grantStreakUnlockMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('orbit_streak_unlock_new')).toBeNull();
  });
});

describe('server streak request', () => {
  it('不把本機 streak 傳入 RPC wrapper，即使本機是 0 也由 server 判斷', async () => {
    state.user.streakDays = 0;

    await requestStreakUnlock();

    expect(grantStreakUnlockMock).toHaveBeenCalledWith(OWNER);
    expect(grantStreakUnlockMock).toHaveBeenCalledTimes(1);
  });

  it('只有 server 回報新 grant 才顯示一次慶祝 modal', async () => {
    vi.useFakeTimers();
    const serverUser = {
      ...state.user,
      isPro: true,
      proExpiresAt: '2026-10-01T00:00:00.000Z',
      streakUnlockUsed: true,
    };
    storageMock.getUser.mockReturnValue(serverUser);
    grantStreakUnlockMock.mockResolvedValueOnce({
      ok: true,
      ownerChanged: false,
      result: {
        status: 'granted', granted: true, isActive: true,
        expiresAt: serverUser.proExpiresAt,
        grantedAt: '2026-09-01T00:00:00.000Z',
      },
    });

    await expect(requestStreakUnlock()).resolves.toBe(true);
    expect(state.user).toBe(serverUser);
    expect(sessionStorage.getItem('orbit_streak_unlock_new')).toBe('1');

    vi.runAllTimers();
    expect(sessionStorage.getItem('orbit_streak_unlock_new')).toBeNull();
    expect(document.querySelectorAll('#streak-unlock-modal')).toHaveLength(1);
  });

  it('同 owner 的重複 boot 共用一個 in-flight request', async () => {
    let resolveRequest;
    grantStreakUnlockMock.mockReturnValueOnce(new Promise(resolve => {
      resolveRequest = resolve;
    }));

    const first = requestStreakUnlock();
    const second = requestStreakUnlock();
    expect(second).toBe(first);
    expect(grantStreakUnlockMock).toHaveBeenCalledTimes(1);

    resolveRequest({
      ok: true,
      ownerChanged: false,
      result: {
        status: 'not_eligible', granted: false, isActive: false,
        expiresAt: null, grantedAt: null,
      },
    });
    await first;
  });

  it('已使用、已是 Pro、RPC 失敗都不會顯示慶祝', async () => {
    state.user.streakUnlockUsed = true;
    await expect(requestStreakUnlock()).resolves.toBe(false);
    expect(grantStreakUnlockMock).not.toHaveBeenCalled();

    state.user.streakUnlockUsed = false;
    storageMock.isProUser.mockReturnValue(true);
    await expect(requestStreakUnlock()).resolves.toBe(false);
    expect(grantStreakUnlockMock).not.toHaveBeenCalled();

    storageMock.isProUser.mockReturnValue(false);
    grantStreakUnlockMock.mockResolvedValueOnce({ ok: false, ownerChanged: false, result: null });
    await expect(requestStreakUnlock()).resolves.toBe(false);
    expect(document.querySelector('#streak-unlock-modal')).toBeNull();
  });
});
