/**
 * @vitest-environment jsdom
 */
/**
 * focusAmbient.test.js — HW-106：Focus 模式的環境噪音訊號。
 *
 * 麥克風只在使用者點擊後開啟；離開 focus 畫面（結束、略過、縮小）或 App 進入背景時
 * 一定關閉。adapter 本身的錄音邊界見 ambientNoise.test.js，這裡驗證 UI 接線。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  user: { streakDays: 0, focusSoundEnabled: false, focusDefaultMinutes: null },
  tasks: [],
}));
const ambient = vi.hoisted(() => ({
  supported: true,
  stop: null,
  onLevel: null,
  start: null,
}));

vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: { isProUser: () => false, saveUser: vi.fn() } }));
vi.mock('../../pwa/js/sessionFlow.js', () => ({ submitFocusResult: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));
vi.mock('../../pwa/js/platform/ambientNoise.js', () => ({
  supportsAmbientNoise: () => ambient.supported,
  startAmbientNoiseMonitor: (...args) => ambient.start(...args),
}));

await import('../../pwa/js/focusTimer.js');

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

const flush = () => Promise.resolve().then(() => Promise.resolve());
const status = () => document.getElementById('focus-ambient-status');
const button = () => document.getElementById('focus-ambient-btn');

function startFocus() {
  window.startFocus('t1');
}

async function enableAmbient() {
  button().click();
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = FIXTURE;
  mockState.tasks = [{
    id: 't1', name: '測試專注', emoji: '🎯', category: 'focus', impactType: 'task',
    taskNature: 'growth', value: 'A', difficulty: 0.4, resistance: 1.0,
  }];
  ambient.supported = true;
  ambient.stop = vi.fn();
  ambient.onLevel = null;
  ambient.start = vi.fn(async ({ onLevel }) => {
    ambient.onLevel = onLevel;
    return { stop: ambient.stop };
  });
});

afterEach(() => {
  if (!document.getElementById('focus-overlay').classList.contains('hidden')) {
    window.skipFocus();
    document.querySelector('#skip-confirm #skip-yes')?.click();
    document.getElementById('skip-confirm')?.remove();
  }
  vi.useRealTimers();
});

describe('HW-106：Focus 環境噪音訊號', () => {
  it('開始專注時只顯示控制項，未點擊前不開啟麥克風', () => {
    startFocus();
    expect(button()).not.toBeNull();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(ambient.start).not.toHaveBeenCalled();
  });

  it('不支援麥克風的瀏覽器不顯示控制項', () => {
    ambient.supported = false;
    startFocus();
    expect(button()).toBeNull();
  });

  it('點擊後即時顯示 quiet／normal／noisy 狀態', async () => {
    startFocus();
    await enableAmbient();
    expect(ambient.start).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-pressed')).toBe('true');

    ambient.onLevel({ level: 'noisy', dbfs: -20 });
    expect(status().textContent).toBe('📢 環境吵雜');
    expect(status().dataset.level).toBe('noisy');
    ambient.onLevel({ level: 'quiet', dbfs: -70 });
    expect(status().textContent).toBe('🤫 環境安靜');
  });

  it('再次點擊關閉偵測並停止麥克風', async () => {
    startFocus();
    await enableAmbient();
    button().click();
    expect(ambient.stop).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('縮小 focus 畫面即離開 view，麥克風停止', async () => {
    startFocus();
    await enableAmbient();
    window.minimizeFocus();
    expect(ambient.stop).toHaveBeenCalledTimes(1);
    window.restoreFocus();
  });

  it('略過（結束）專注時麥克風停止', async () => {
    startFocus();
    await enableAmbient();
    window.skipFocus();
    document.querySelector('#skip-confirm #skip-yes').click();
    expect(ambient.stop).toHaveBeenCalledTimes(1);
  });

  it('App 進入背景時麥克風停止', async () => {
    startFocus();
    await enableAmbient();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(ambient.stop).toHaveBeenCalledTimes(1);
  });

  it('權限對話框期間離開 view，之後才取得的麥克風會立即關閉', async () => {
    let grant;
    ambient.start = vi.fn(() => new Promise(resolve => { grant = resolve; }));
    startFocus();
    button().click();
    expect(status().textContent).toBe('等待麥克風權限…');

    window.minimizeFocus();
    grant({ stop: ambient.stop });
    await flush();

    expect(ambient.stop).toHaveBeenCalledTimes(1);
    window.restoreFocus();
  });

  it('權限被拒時顯示提示且不留在開啟狀態', async () => {
    ambient.start = vi.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); });
    startFocus();
    await enableAmbient();
    expect(status().textContent).toBe('無法使用麥克風');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });
});
