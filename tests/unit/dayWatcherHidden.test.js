// @vitest-environment jsdom
/**
 * dayWatcherHidden.test.js — the cross-day watcher while the app is hidden, or
 * while today is already being asked (BUG-203). Each test loads dayCycle.js
 * anew: the watcher starts once per module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  saveUser: vi.fn(() => true),
  saveEnergy: vi.fn(() => true),
  isProUser: vi.fn(() => false),
  getDailyPlan: vi.fn(() => []),
}));
const themeMock = vi.hoisted(() => ({ applyRandomThemeForToday: vi.fn() }));

vi.mock('../../pwa/js/storage.js', () => ({
  storage: storageMock,
  db: { upsertProfile: vi.fn(() => Promise.resolve(true)) },
}));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn(), showXPFloat: vi.fn() }));
vi.mock('../../pwa/js/router.js', () => ({ renderPage: vi.fn(), currentHash: () => 'home' }));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/theme.js', () => themeMock);

let state;
const report = () => document.getElementById('daily-report-modal');
const morning = () => document.getElementById('morning-modal');
const mainApp = () => document.getElementById('main-app');

/** The watcher started on 2026-11-26 at 23:59:30 (new day at midnight). */
async function startWatcher() {
  vi.setSystemTime(new Date('2026-11-26T23:59:30'));
  ({ state } = await import('../../pwa/js/state.js'));
  state.user = { id: 'guest-1', name: 'Guest', newDayHour: 0, streakDays: 0, totalXP: 0 };
  state.energy = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '2026-11-26' };
  state.sessions = [];
  const { startDayWatcher } = await import('../../pwa/js/dayCycle.js');
  startDayWatcher();
}

const pastMidnight = (at = '2026-11-27T00:00:30') => {
  vi.setSystemTime(new Date(at));
  vi.advanceTimersByTime(60_000);
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="login-screen" class="hidden"></div><div id="main-app"></div>';
});

afterEach(() => {
  // Each test's watcher would keep running into the next one.
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('BUG-203：app 隱藏時', () => {
  it('載入失敗回到登入畫面（記憶體裡仍是訪客）時換日：不在登入畫面上掛日報', async () => {
    await startWatcher();
    mainApp().classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');

    pastMidnight();
    vi.advanceTimersByTime(5 * 60_000);

    expect(report()).toBeNull();
    expect(themeMock.applyRandomThemeForToday).not.toHaveBeenCalled();
    expect(storageMock.getDailyPlan).not.toHaveBeenCalled();
  });

  it('之後 app 再顯示（改用訪客）：下一次檢查照常換日並問', async () => {
    await startWatcher();
    mainApp().classList.add('hidden');
    pastMidnight();
    expect(report()).toBeNull();

    mainApp().classList.remove('hidden');
    vi.advanceTimersByTime(60_000);

    expect(report()).not.toBeNull();
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(1);
    expect(storageMock.getDailyPlan).toHaveBeenCalledTimes(1);
    // That day is now seen: once.
    report().remove();
    vi.advanceTimersByTime(60_000);
    expect(report()).toBeNull();
  });

  it('已登出（記憶體裡沒有使用者）時照舊：那一天算看過了', async () => {
    await startWatcher();
    state.user = null;
    mainApp().classList.add('hidden');
    // With no user the day starts at 05:00 (eToday's default).
    pastMidnight('2026-11-27T05:00:30');

    state.user = { id: 'guest-1', name: 'Guest', newDayHour: 0, streakDays: 0, totalXP: 0 };
    mainApp().classList.remove('hidden');
    vi.advanceTimersByTime(60_000);

    expect(report()).toBeNull();
    expect(themeMock.applyRandomThemeForToday).not.toHaveBeenCalled();
  });
});

describe('BUG-203：今天已經在問時', () => {
  it('日報已在畫面上（訪客回來時再問的那一次）：不再掛一次，那一天算看過了', async () => {
    await startWatcher();
    const asked = document.createElement('div');
    asked.id = 'daily-report-modal';
    document.body.appendChild(asked);

    pastMidnight();

    expect(report()).toBe(asked);
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(1);
    asked.remove();
    vi.advanceTimersByTime(60_000);
    expect(report()).toBeNull();
  });

  it('日報剛關掉、晨間視窗開著：不再掛日報（#315 review 的 60 秒時間窗）', async () => {
    await startWatcher();
    const asking = document.createElement('div');
    asking.id = 'morning-modal';
    document.body.appendChild(asking);

    pastMidnight();

    expect(report()).toBeNull();
    expect(morning()).toBe(asking);
  });

  it('今天已經回答過：不問', async () => {
    await startWatcher();
    state.energy.lastResetDate = '2026-11-27';

    pastMidnight();

    expect(report()).toBeNull();
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(1);
  });
});
