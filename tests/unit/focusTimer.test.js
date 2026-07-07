/**
 * focusTimer.test.js — 焦點計時器狀態機（handoff Phase 18b）
 * 環境：jsdom + vi fake timers（同步推進 setInterval 與 Date.now）
 *
 * 覆蓋 e2e 難以精確斷言的時序語義：
 * - 正計時顯示、最低有效時間門檻訊息
 * - 暫停補償（暫停期間不計入 elapsed）
 * - 略過打卡的預設時長與 submitFocusResult 參數
 * - 早退確認 → invalid 結算；達標結束 → 結果選擇器
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  user:  { streakDays: 0, focusSoundEnabled: false, focusDefaultMinutes: null },
  tasks: [],
}));
const mockStorage = vi.hoisted(() => ({
  isProUser: vi.fn(() => false),
  saveUser:  vi.fn(),
}));
const mockSubmit = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/state.js',   () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage }));
vi.mock('../../pwa/js/sessionFlow.js', () => ({ submitFocusResult: mockSubmit }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));

import '../../pwa/js/focusTimer.js';

function makeTask(overrides = {}) {
  return {
    id: 't1', name: '測試專注', emoji: '🎯', category: 'focus',
    impactType: 'task', taskNature: 'growth', value: 'A',
    difficulty: 0.4, resistance: 1.0,        // difficulty 0.4 → 最低有效 5 分鐘
    ...overrides,
  };
}

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

/** 結束當前 focus session（經略過流程），讓模組層級狀態歸位。 */
function drainFocusViaSkip() {
  if (document.getElementById('focus-overlay').classList.contains('hidden')) return;
  window.skipFocus();
  document.querySelector('#skip-confirm #skip-yes')?.click();
  document.getElementById('skip-confirm')?.remove();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = FIXTURE;
  mockState.tasks = [makeTask()];
  mockSubmit.mockClear();
});

afterEach(() => {
  drainFocusViaSkip();
  vi.useRealTimers();
});

describe('正計時與最低有效時間', () => {
  it('startFocus 顯示 overlay，65 秒後計時顯示 01:05', () => {
    window.startFocus('t1');
    expect(document.getElementById('focus-overlay').classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(65_000);
    expect(document.getElementById('focus-timer').textContent).toBe('01:05');
  });

  it('未達 5 分鐘顯示剩餘時間；達標後切換為 ✓ 訊息', () => {
    window.startFocus('t1');
    vi.advanceTimersByTime(60_000);
    expect(document.getElementById('focus-min-effective').textContent)
      .toContain('最低有效時間：還需');
    vi.advanceTimersByTime(4 * 60_000);  // 累計 5 分鐘
    expect(document.getElementById('focus-min-effective').textContent)
      .toBe('達到最低有效時間 ✓');
    expect(document.getElementById('focus-min-effective').className)
      .toBe('focus-min-reached');
  });
});

describe('暫停補償', () => {
  it('暫停期間不計入 elapsed：60s 跑 + 30s 暫停 + 10s 跑 → 01:10', () => {
    window.startFocus('t1');
    vi.advanceTimersByTime(60_000);
    window.togglePauseFocus();               // 暫停
    expect(document.getElementById('focus-pause-btn').textContent).toBe('▶ 繼續');
    vi.advanceTimersByTime(30_000);          // 暫停中流逝 30s
    window.togglePauseFocus();               // 繼續（補償 startTime）
    expect(document.getElementById('focus-pause-btn').textContent).toBe('⏸ 暫停');
    vi.advanceTimersByTime(10_000);
    expect(document.getElementById('focus-timer').textContent).toBe('01:10');
  });
});

describe('略過打卡', () => {
  it('預設選中 ≥ 最低有效時間的最小 preset（5 分鐘門檻 → 15m），確認後以 complete 結算', () => {
    window.startFocus('t1');
    vi.advanceTimersByTime(10_000);
    window.skipFocus();
    const modal = document.getElementById('skip-confirm');
    expect(modal).not.toBeNull();
    expect(modal.querySelector('.skip-dur-btn.active').dataset.min).toBe('15');
    modal.querySelector('#skip-yes').click();
    expect(mockSubmit).toHaveBeenCalledWith('t1', 10, 'complete', 15, '');
    expect(document.getElementById('focus-overlay').classList.contains('hidden')).toBe(true);
  });
});

describe('結束專注', () => {
  it('未達最低時間按結束 → 勸留 modal；確定結束 → invalid 結算', () => {
    window.startFocus('t1');
    vi.advanceTimersByTime(2 * 60_000);      // 2 分鐘 < 5 分鐘門檻
    window.endFocus();
    const modal = document.getElementById('early-end-confirm');
    expect(modal).not.toBeNull();
    modal.querySelector('#early-end-confirm-btn').click();
    expect(mockSubmit).toHaveBeenCalledWith('t1', 120, 'invalid', 2, '');
  });

  it('達最低時間按結束 → 結果選擇器；選「完成」以實際分鐘數結算', () => {
    window.startFocus('t1');
    vi.advanceTimersByTime(6 * 60_000);      // 6 分鐘 ≥ 5 分鐘門檻
    window.endFocus();
    const picker = document.getElementById('result-picker');
    expect(picker).not.toBeNull();
    picker.querySelector('.result-btn[data-result="complete"]').click();
    expect(mockSubmit).toHaveBeenCalledWith('t1', 360, 'complete', 6, '');
  });
});
