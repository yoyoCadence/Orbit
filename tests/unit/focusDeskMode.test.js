// @vitest-environment jsdom
/**
 * focusDeskMode.test.js — 專注計時的「桌面模式」（TEST-020）
 * 環境：jsdom
 *
 * focusTimer.test.js 測計時本身；這裡測桌面模式：按鈕（一次點擊同時送出
 * pointerup／touchend／click，只切換一次）、手機平放 1.2 秒後自動開啟、手動
 * 關閉後要拿起手機才會再自動開啟、iOS 要先取得方向感測器的權限（拒絕或出錯
 * 時不監看），以及結束專注時關閉並停止監看。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  user:  { streakDays: 0, focusSoundEnabled: false, focusDefaultMinutes: null },
  tasks: [],
}));
const haptic = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/state.js',   () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: { isProUser: () => false, saveUser: vi.fn() } }));
vi.mock('../../pwa/js/sessionFlow.js', () => ({ submitFocusResult: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic }));

const FIXTURE = `
  <div id="focus-overlay" class="hidden">
    <div class="focus-box">
      <span id="focus-task-emoji"></span>
      <span id="focus-task-name"></span>
      <div id="focus-timer-mode"></div>
      <div id="focus-timer"></div>
      <div id="focus-min-effective"></div>
      <button id="focus-pause-btn"></button>
      <button id="focus-end-btn"></button>
      <button class="focus-skip-btn"></button>
    </div>
  </div>
  <div id="focus-pip" class="hidden">
    <span id="focus-pip-emoji"></span><span id="focus-pip-timer"></span>
  </div>
`;

const overlay = () => document.getElementById('focus-overlay');
const deskBtn = () => document.getElementById('focus-desk-btn');
const inDeskMode = () => overlay().classList.contains('focus-desk-mode');
const flush = () => vi.advanceTimersByTimeAsync(0);
const taps = () => haptic.mock.calls.filter(([kind]) => kind === 'tap').length;

/** One tap on a phone: pointerup, touchend and click, all on the button. */
function tap(button = deskBtn()) {
  for (const type of ['pointerup', 'touchend', 'click']) {
    button.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }
}

function orient(beta, gamma) {
  const event = new Event('deviceorientation');
  Object.assign(event, { beta, gamma });
  window.dispatchEvent(event);
}

/** Holds the phone at (beta, gamma) for `ms`, as orientation events every 100 ms. */
async function hold(beta, gamma, ms) {
  for (let t = 0; t < ms; t += 100) {
    orient(beta, gamma);
    await vi.advanceTimersByTimeAsync(100);
  }
}

async function startFocus() {
  window.startFocus('t1');
  await flush();          // the sensor permission request
}

function endFocus() {
  // Ended but no result picked yet: the session is still on; pick one.
  document.querySelector('.result-btn[data-result="complete"]')?.click();
  // Minimised counts as running too: bring it back first (#304 review).
  if (!document.getElementById('focus-pip').classList.contains('hidden')) window.restoreFocus();
  if (overlay().classList.contains('hidden')) return;
  window.skipFocus();
  document.querySelector('#skip-confirm #skip-yes')?.click();
  document.getElementById('skip-confirm')?.remove();
}

// The tap debounce (350 ms) is module state: each test starts a minute after
// the last, or a tap right at the start would count as the previous test's.
let clock = Date.parse('2026-01-01T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  clock += 60_000;
  vi.setSystemTime(clock);
  document.body.innerHTML = FIXTURE;
  mockState.tasks = [{
    id: 't1', name: '測試專注', emoji: '🎯', category: 'focus',
    impactType: 'task', taskNature: 'growth', value: 'A', difficulty: 0.4, resistance: 1.0,
  }];
  haptic.mockClear();
  // jsdom has no DeviceOrientationEvent; a phone browser without the iOS
  // permission step looks like this.
  window.DeviceOrientationEvent = function DeviceOrientationEvent() {};
});

afterEach(async () => {
  endFocus();
  await flush();
  vi.restoreAllMocks();
  delete window.DeviceOrientationEvent;
  vi.useRealTimers();
});

/** The deviceorientation handlers added and removed while `run` runs. */
async function orientationListeners(run) {
  const added = vi.spyOn(window, 'addEventListener');
  const removed = vi.spyOn(window, 'removeEventListener');
  // Read before mockRestore(), which clears the recorded calls.
  const of = spy => spy.mock.calls.filter(([type]) => type === 'deviceorientation').map(([, fn]) => fn);
  try {
    await run();
    return { added: of(added), removed: of(removed) };
  } finally {
    added.mockRestore();
    removed.mockRestore();
  }
}

await import('../../pwa/js/focusTimer.js');

describe('按鈕', () => {
  it('開始專注時放在「略過」之前，一開始是關閉', async () => {
    await startFocus();
    const btn = deskBtn();
    expect(btn.nextElementSibling.classList.contains('focus-skip-btn')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).toBe('桌面模式');
    expect(inDeskMode()).toBe(false);
  });

  it('手機上 click 比 touchend 晚到（約 300 ms）也只算一次', async () => {
    await startFocus();
    deskBtn().dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(300);
    deskBtn().dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    await flush();
    expect(inDeskMode()).toBe(true);
    expect(taps()).toBe(1);
  });

  it('一次點擊（pointerup＋touchend＋click）只切換一次；稍後再點關閉', async () => {
    await startFocus();
    tap();
    await flush();
    expect(inDeskMode()).toBe(true);
    expect(deskBtn().getAttribute('aria-pressed')).toBe('true');
    expect(deskBtn().textContent).toBe('退出桌面模式');
    expect(taps()).toBe(1);

    await vi.advanceTimersByTimeAsync(400);
    tap();
    await flush();
    expect(inDeskMode()).toBe(false);
    expect(deskBtn().textContent).toBe('桌面模式');
  });

  it('下一次專注沿用同一個按鈕，不會多一個，也只切換一次', async () => {
    await startFocus();
    endFocus();
    await vi.advanceTimersByTimeAsync(400);
    await startFocus();
    expect(document.querySelectorAll('#focus-desk-btn')).toHaveLength(1);
    tap();
    await flush();
    expect(inDeskMode()).toBe(true);
  });

  it('沒有在專注時不切換', async () => {
    await startFocus();
    endFocus();
    await window.toggleFocusDeskMode();
    expect(inDeskMode()).toBe(false);
  });
});

describe('手機平放時自動開啟', () => {
  it('平放（螢幕朝上）超過 1.2 秒後開啟，不震動', async () => {
    await startFocus();
    await hold(5, -3, 1100);
    expect(inDeskMode()).toBe(false);
    await hold(5, -3, 300);
    expect(inDeskMode()).toBe(true);
    expect(taps()).toBe(0);
  });

  it('立起來放（beta 約 90°）也算', async () => {
    await startFocus();
    await hold(88, 4, 1400);
    expect(inDeskMode()).toBe(true);
  });

  it('拿在手上（傾斜）不開啟；中途拿起來就重新計時', async () => {
    await startFocus();
    await hold(45, 10, 2000);
    expect(inDeskMode()).toBe(false);
    await hold(2, 2, 800);
    await hold(45, 10, 100);
    await hold(2, 2, 800);
    expect(inDeskMode()).toBe(false);
  });

  it('手動關閉後，放著不會再自動開啟；拿起來再放下才會', async () => {
    await startFocus();
    await hold(0, 0, 1400);
    expect(inDeskMode()).toBe(true);
    tap();
    await flush();
    expect(inDeskMode()).toBe(false);
    await hold(0, 0, 3000);
    expect(inDeskMode()).toBe(false);

    await hold(45, 10, 100);   // picked up
    await hold(0, 0, 1400);
    expect(inDeskMode()).toBe(true);
  });

  it('結束專注時關閉，並移除自己加上的那個監聽', async () => {
    const listeners = await orientationListeners(async () => {
      await startFocus();
      await hold(0, 0, 1400);
      expect(inDeskMode()).toBe(true);
      endFocus();
    });
    expect(inDeskMode()).toBe(false);
    expect(listeners.added).toHaveLength(1);
    expect(listeners.removed).toEqual(listeners.added);

    // The next session, without permission this time: nothing left listening.
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => Promise.resolve('denied'));
    await vi.advanceTimersByTimeAsync(400);
    await startFocus();
    await hold(0, 0, 2000);
    expect(inDeskMode()).toBe(false);
  });

  it('BUG-153：沒有讀數（beta／gamma 為 null）的事件不算平放', async () => {
    await startFocus();
    await hold(null, null, 2000);
    expect(inDeskMode()).toBe(false);
    await hold(0, null, 2000);
    expect(inDeskMode()).toBe(false);
    await hold(null, 0, 2000);
    expect(inDeskMode()).toBe(false);
    await hold(NaN, 0, 2000);
    expect(inDeskMode()).toBe(false);
  });

  it('BUG-153：縮小時關閉，縮小期間平放也不開啟；回來後再平放 1.2 秒才開啟', async () => {
    await startFocus();
    await hold(0, 0, 1400);
    expect(inDeskMode()).toBe(true);
    window.minimizeFocus();
    expect(inDeskMode()).toBe(false);
    await hold(0, 0, 3000);
    expect(inDeskMode()).toBe(false);

    window.restoreFocus();
    await hold(0, 0, 1100);
    expect(inDeskMode()).toBe(false);
    await hold(0, 0, 300);
    expect(inDeskMode()).toBe(true);
  });
});

describe('iOS 的方向感測器權限', () => {
  it('允許時才監看', async () => {
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => Promise.resolve('granted'));
    await startFocus();
    expect(window.DeviceOrientationEvent.requestPermission).toHaveBeenCalled();
    await hold(0, 0, 1400);
    expect(inDeskMode()).toBe(true);
  });

  it('拒絕時不監看，按鈕照樣可以用', async () => {
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => Promise.resolve('denied'));
    await startFocus();
    await hold(0, 0, 2000);
    expect(inDeskMode()).toBe(false);
    tap();
    await flush();
    expect(inDeskMode()).toBe(true);
  });

  it('要求權限出錯時也不監看', async () => {
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => Promise.reject(new Error('not allowed')));
    await startFocus();
    await hold(0, 0, 2000);
    expect(inDeskMode()).toBe(false);
  });

  it('沒有方向感測器的瀏覽器：不監看', async () => {
    delete window.DeviceOrientationEvent;
    const listeners = await orientationListeners(() => startFocus());
    expect(listeners.added).toEqual([]);
    await hold(0, 0, 2000);
    expect(inDeskMode()).toBe(false);
  });

  it('BUG-153：iOS 還在詢問時專注就結束了：允許後不監看，也不切換', async () => {
    let answer;
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const listeners = await orientationListeners(async () => {
      await startFocus();
      tap();                      // also waits for the same answer
      await flush();
      endFocus();                 // skipped meanwhile
      answer('granted');
      await flush();
    });
    expect(listeners.added).toEqual([]);
    expect(inDeskMode()).toBe(false);
    expect(taps()).toBe(0);
  });
});

describe('BUG-153：iOS 詢問中按「結束」（#304 review）', () => {
  // Ending (and the countdown running out, which goes through the same
  // _stopFocusDeskMode()) keeps `active` until a result is picked, so only
  // stopping desk mode tells the late answer apart.
  it('結束後才允許：不監看，也不切換；選結果時也沒有東西要移除', async () => {
    let answer;
    window.DeviceOrientationEvent.requestPermission = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const listeners = await orientationListeners(async () => {
      await startFocus();
      tap();
      await flush();
      await vi.advanceTimersByTimeAsync(6 * 60_000);   // past the 5-minute minimum
      window.endFocus();
      expect(overlay().classList.contains('hidden')).toBe(true);
      answer('granted');
      await flush();
    });
    expect(listeners.added).toEqual([]);
    expect(inDeskMode()).toBe(false);
    expect(taps()).toBe(0);
  });
});
