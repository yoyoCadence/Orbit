/**
 * dayCycle.test.js — 跨日啟動 modal 的卡死防護（BUG-105 / BUG-106）
 * 環境：jsdom
 *
 * 背景：使用者回報「跨日後第一次開 App 卡在『☀️ 今天的狀態？』，怎麼點都沒
 * 反應，重開也一樣」。這兩個 modal 沒有關閉鈕、沒有點背景關閉、沒有逾時，而
 * 「今天已詢問」的旗標（energy.lastResetDate）又只在 click handler 跑完後才
 * 寫入 —— 因此 handler 中途拋錯就等於永久卡死，且重開會重演。
 *
 * 這裡鎖住三件事：
 *   1. 不論寫入成功、寫入失敗或已登出，點下去 modal 一定會關掉
 *   2. 同一個 modal 不會疊層，且 CTA 綁在自己的 modal 上（不是全域第一個）
 *   3. 登出時殘留在 <body> 的 overlay 會被清掉，靜態 shell 節點不受影響
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const storageMock = vi.hoisted(() => ({
  saveUser:   vi.fn(() => true),
  saveEnergy: vi.fn(() => true),
  isProUser:  vi.fn(() => false),
}));
const toastMock = vi.hoisted(() => vi.fn());
const renderPageMock = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/storage.js', () => ({
  storage: storageMock,
  db: { upsertProfile: vi.fn(() => Promise.resolve(true)) },
}));

vi.mock('../../pwa/js/ui/feedback.js', () => ({
  showToast: toastMock,
  showXPFloat: vi.fn(),
}));

vi.mock('../../pwa/js/router.js', () => ({
  renderPage: renderPageMock,
  currentHash: () => 'home',
}));

const updateHeaderMock = vi.hoisted(() => vi.fn());
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: updateHeaderMock }));
vi.mock('../../pwa/js/theme.js', () => ({ applyRandomThemeForToday: vi.fn() }));
vi.mock('../../pwa/js/engine.js', () => ({
  calcDailyStats: () => ({
    isEffectiveDay: false, hasASTask: false, entertainmentMinutes: 0, productiveXP: 0,
  }),
  processStreakForDate: (days) => days,
}));

const { state } = await import('../../pwa/js/state.js');
const {
  showMorningModal, showDailyReport, clearDayCycleModals,
} = await import('../../pwa/js/dayCycle.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv');
})();

function seedSignedInUser() {
  state.user = {
    id: 'u1', name: 'Tester',
    // newDayHour:0 → effectiveToday(0) always equals today(). With 5, the
    // energy reset is not yet due before 05:00 local, so these tests failed
    // purely by what time CI happened to run (UTC 02:xx). Same reason and
    // same fix as GUEST_USER in tests/e2e/support/seed.js.
    newDayHour: 0,
    morningState: 'normal', streakDays: 3, totalXP: 0,
  };
  state.sessions = [];
  state.energy = { currentEnergy: 90, maxEnergy: 100, lastResetDate: YESTERDAY };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  storageMock.saveUser.mockReturnValue(true);
  storageMock.saveEnergy.mockReturnValue(true);
  seedSignedInUser();
});

// ─── showMorningModal ─────────────────────────────────────────────────────────

describe('showMorningModal', () => {
  const clickState = (s) =>
    document.querySelector(`#morning-modal .morning-btn[data-state="${s}"]`).click();

  it('applies the picked state and closes on a healthy write', () => {
    showMorningModal();
    clickState('good');

    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
    expect(state.user.morningState).toBe('good');
    expect(state.energy.currentEnergy).toBe(100);
    expect(renderPageMock).toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    // The header renders energy; without this refresh it kept the old value.
    expect(updateHeaderMock).toHaveBeenCalled();
  });

  it('closes and warns instead of freezing when localStorage is full', () => {
    // BUG-105 regression: set() used to throw QuotaExceededError straight out
    // of the handler, skipping modal.remove() and stranding the user.
    storageMock.saveUser.mockImplementation(() => {
      const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err;
    });

    showMorningModal();
    clickState('tired');

    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('closes and tells the user when the write is merely rejected', () => {
    storageMock.saveUser.mockReturnValue(false);

    showMorningModal();
    clickState('normal');

    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
    // Energy still advances in memory so the app stays usable this session.
    expect(state.energy.lastResetDate).not.toBe(YESTERDAY);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('closes without throwing when the session ended while it was open', () => {
    // handleSignOut() nulls state.user; the modal lives on <body> so it can
    // outlive #main-app being hidden.
    showMorningModal();
    state.user = null;

    expect(() => clickState('good')).not.toThrow();
    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
    expect(storageMock.saveUser).not.toHaveBeenCalled();
  });

  it('never stacks two overlays for the same id', () => {
    showMorningModal();
    showMorningModal();

    expect(document.querySelectorAll('#morning-modal')).toHaveLength(1);
    clickState('good');
    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
  });
});

// ─── showDailyReport ──────────────────────────────────────────────────────────

describe('showDailyReport', () => {
  it('runs the follow-up when its own CTA is pressed', () => {
    const onDone = vi.fn();
    showDailyReport(onDone);

    document.querySelector('#daily-report-modal #rpt-next-btn').click();

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('#daily-report-modal')).toHaveLength(0);
  });

  it('keeps the visible CTA live when the boot sequence runs twice', () => {
    // BUG-106 regression: a duplicated boot appended a second report modal,
    // and the global document.getElementById('rpt-next-btn') bound the click
    // to the *first* (hidden) node — the visible button had no listener.
    const first = vi.fn();
    const second = vi.fn();
    showDailyReport(first);
    showDailyReport(second);

    expect(document.querySelectorAll('#daily-report-modal')).toHaveLength(1);

    document.querySelector('#daily-report-modal #rpt-next-btn').click();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('still closes when the follow-up throws', () => {
    showDailyReport(() => { throw new Error('boom'); });

    expect(() => document.querySelector('#rpt-next-btn').click()).not.toThrow();
    expect(document.querySelectorAll('#daily-report-modal')).toHaveLength(0);
  });

  it('renders with no signed-in user instead of throwing', () => {
    state.user = null;
    expect(() => showDailyReport(vi.fn())).not.toThrow();
    expect(document.querySelectorAll('#daily-report-modal')).toHaveLength(1);
  });
});

// ─── clearDayCycleModals ──────────────────────────────────────────────────────

describe('clearDayCycleModals', () => {
  it('removes body-level overlays but leaves the static app shell alone', () => {
    // #focus-duration-picker is a static .modal-overlay inside #app — removing
    // it would break the focus timer, so the selector is body-scoped.
    document.body.innerHTML =
      '<div id="app"><div id="focus-duration-picker" class="modal-overlay hidden"></div></div>';
    showMorningModal();
    showDailyReport(vi.fn());

    clearDayCycleModals();

    expect(document.querySelectorAll('#morning-modal')).toHaveLength(0);
    expect(document.querySelectorAll('#daily-report-modal')).toHaveLength(0);
    expect(document.getElementById('focus-duration-picker')).not.toBeNull();
  });
});
