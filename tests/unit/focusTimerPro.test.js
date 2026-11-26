// @vitest-environment jsdom
/**
 * focusTimerPro.test.js — TEST-006: the Pro side of the focus timer
 * (pwa/js/focusTimer.js) that focusTimer.test.js does not reach: the
 * duration picker (suggested minimum, warning, presets and a custom length,
 * the remembered default), the countdown that ends itself at the target, the
 * note in the result picker, and the chime (Pro, sound on).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  user: { streakDays: 0, focusSoundEnabled: true, focusDefaultMinutes: null },
  tasks: [],
}));
const mockStorage = vi.hoisted(() => ({
  isProUser: vi.fn(() => true),
  saveUser: vi.fn(),
}));
const mockSubmit = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage }));
vi.mock('../../pwa/js/sessionFlow.js', () => ({ submitFocusResult: mockSubmit }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: mockToast }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));

await import('../../pwa/js/focusTimer.js');

// difficulty 0.4: at least 5 minutes count (engine.getMinEffectiveMinutes).
const TASK = {
  id: 't1', name: '寫報告', emoji: '📝', category: 'focus', impactType: 'task',
  taskNature: 'growth', value: 'A', difficulty: 0.4, resistance: 1.0,
};

// The picker as in index.html.
const FIXTURE = `
  <div id="focus-duration-picker" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="focus-dur-presets">
        <button class="focus-dur-btn" data-min="15">15 分</button>
        <button class="focus-dur-btn" data-min="25">25 分</button>
        <button class="focus-dur-btn" data-min="45">45 分</button>
        <button class="focus-dur-btn" data-min="90">90 分</button>
      </div>
      <div class="focus-dur-custom-row"><input id="focus-dur-custom" type="number"></div>
      <div class="focus-dur-actions">
        <button id="focus-dur-confirm">開始倒數</button>
        <button id="focus-dur-skip">自由計時</button>
      </div>
    </div>
  </div>
  <div id="focus-overlay" class="hidden">
    <div class="focus-box">
      <span id="focus-task-emoji"></span><span id="focus-task-name"></span>
      <div id="focus-timer-mode"></div><div id="focus-timer"></div>
      <div id="focus-min-effective"></div>
      <button id="focus-pause-btn"></button><button id="focus-end-btn"></button>
      <button class="focus-skip-btn"></button>
    </div>
  </div>
  <div id="focus-pip" class="hidden"><span id="focus-pip-emoji"></span><span id="focus-pip-timer"></span></div>
`;

const $ = id => document.getElementById(id);
const picker = () => $('focus-duration-picker');
const preset = min => picker().querySelector(`.focus-dur-btn[data-min="${min}"]`);
const warning = () => picker().querySelector('.focus-dur-warn').textContent;

// Every oscillator the chime starts: [frequency, start time].
let tones;
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
  }

  createOscillator() {
    const osc = {
      connect() {},
      frequency: { setValueAtTime: frequency => { osc.frequency.value = frequency; } },
      start: when => tones.push([osc.frequency.value, when]),
      stop() {},
    };
    return osc;
  }

  createGain() {
    return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
  }
}

/** Ends the running session through the skip flow so the module is idle again. */
function drain() {
  if (!$('focus-overlay').classList.contains('hidden')) {
    window.skipFocus();
    document.querySelector('#skip-confirm #skip-yes')?.click();
  }
  document.getElementById('skip-confirm')?.remove();
  document.getElementById('result-picker')?.querySelector('.result-btn')?.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = FIXTURE;
  mockState.tasks = [TASK];
  mockState.user = { streakDays: 0, focusSoundEnabled: true, focusDefaultMinutes: null };
  mockStorage.isProUser.mockReturnValue(true);
  mockStorage.saveUser.mockClear();
  mockSubmit.mockClear();
  mockToast.mockClear();
  tones = [];
  window.AudioContext = FakeAudioContext;
});

afterEach(() => {
  drain();
  delete window.AudioContext;
  vi.useRealTimers();
});

describe('duration picker (Pro)', () => {
  it('opens instead of the timer, with the task\'s suggested minimum', () => {
    window.startFocus('t1');
    expect(picker().classList.contains('hidden')).toBe(false);
    expect($('focus-overlay').classList.contains('hidden')).toBe(true);
    expect(picker().querySelector('.focus-dur-hint').textContent).toBe('💡 此任務建議最少 5 分鐘');
    expect(warning()).toBe('');
    // Opened again: one hint and one warning line, not two.
    $('focus-dur-skip').click();
    drain();
    window.startFocus('t1');
    expect(picker().querySelectorAll('.focus-dur-hint, .focus-dur-warn')).toHaveLength(2);
  });

  it('warns when the chosen length is under the suggested minimum, for a preset or a custom length', () => {
    mockState.tasks = [{ ...TASK, difficulty: 1.0 }];
    window.startFocus('t1');
    const minimum = Number(picker().querySelector('.focus-dur-hint').textContent.match(/(\d+) 分鐘/)[1]);
    expect(minimum).toBeGreaterThan(15);
    preset(15).click();
    expect(preset(15).classList.contains('active')).toBe(true);
    expect(warning()).toBe('⚠ 低於建議時間，對成長的實際幫助較低');
    preset(90).click();
    expect(preset(15).classList.contains('active')).toBe(false);
    expect(warning()).toBe('');
    // Typing a length clears the presets.
    $('focus-dur-custom').value = '3';
    $('focus-dur-custom').dispatchEvent(new Event('input'));
    expect(picker().querySelector('.focus-dur-btn.active')).toBe(null);
    expect(warning()).not.toBe('');
    // And picking a preset clears the typed length.
    preset(45).click();
    expect($('focus-dur-custom').value).toBe('');
  });

  it('remembers the chosen length and starts a countdown to it', () => {
    window.startFocus('t1');
    preset(25).click();
    $('focus-dur-confirm').click();
    expect(picker().classList.contains('hidden')).toBe(true);
    expect(mockState.user.focusDefaultMinutes).toBe(25);
    expect(mockStorage.saveUser).toHaveBeenCalledWith(mockState.user);
    expect($('focus-overlay').classList.contains('hidden')).toBe(false);
    expect($('focus-timer-mode').textContent).toBe('目標 25 分鐘');
    expect($('focus-timer-mode').className).toContain('focus-timer-mode--countdown');
    expect($('focus-timer').textContent).toBe('25:00');
    vi.advanceTimersByTime(61_000);
    expect($('focus-timer').textContent).toBe('23:59');
    expect($('focus-pip-timer').textContent).toBe('23:59');
  });

  it('marks the remembered length, a preset or a custom one, next time', () => {
    mockState.user.focusDefaultMinutes = 45;
    window.startFocus('t1');
    expect([...picker().querySelectorAll('.focus-dur-btn.active')].map(button => button.dataset.min)).toEqual(['45']);
    expect($('focus-dur-custom').value).toBe('');
    $('focus-dur-skip').click();
    drain();
    mockState.user.focusDefaultMinutes = 50;
    window.startFocus('t1');
    expect(picker().querySelector('.focus-dur-btn.active')).toBe(null);
    expect($('focus-dur-custom').value).toBe('50');
    $('focus-dur-confirm').click();
    expect($('focus-timer-mode').textContent).toBe('目標 50 分鐘');
  });

  it('counts up without a target, and remembers nothing, when the length is skipped or empty', () => {
    window.startFocus('t1');
    $('focus-dur-skip').click();
    expect($('focus-timer-mode').textContent).toBe('');
    expect($('focus-timer').textContent).toBe('00:00');
    vi.advanceTimersByTime(65_000);
    expect($('focus-timer').textContent).toBe('01:05');
    drain();
    // A length that is not positive counts as none.
    for (const value of ['0', '-5', '']) {
      window.startFocus('t1');
      $('focus-dur-custom').value = value;
      $('focus-dur-custom').dispatchEvent(new Event('input'));
      $('focus-dur-confirm').click();
      expect($('focus-timer-mode').textContent, value).toBe('');
      vi.advanceTimersByTime(2000);
      expect($('focus-overlay').classList.contains('hidden'), value).toBe(false);
      drain();
    }
    expect(mockStorage.saveUser).not.toHaveBeenCalled();
  });
});

describe('countdown end', () => {
  it('ends by itself at the target with the end chime, and asks how it went', () => {
    window.startFocus('t1');
    preset(15).click();
    $('focus-dur-confirm').click();
    vi.advanceTimersByTime(15 * 60_000);
    expect($('focus-overlay').classList.contains('hidden')).toBe(true);
    expect($('focus-pip').classList.contains('hidden')).toBe(true);
    expect($('focus-timer').textContent).toBe('00:00');
    // The minimum (5 minutes) chimed on the way; the end chime has three notes.
    expect(tones.map(([frequency]) => frequency)).toEqual([528, 660, 528, 660, 784]);
    const result = $('result-picker');
    expect(result).not.toBe(null);
    // Pro: a note goes with the result.
    result.querySelector('#focus-note-input').value = '  寫完第一節 ';
    result.querySelector('.result-btn[data-result="partial"]').click();
    expect(mockSubmit).toHaveBeenCalledWith('t1', 900, 'partial', 15, '寫完第一節');
    expect($('result-picker')).toBe(null);
    // The timer stopped: nothing more happens.
    vi.advanceTimersByTime(60_000);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('has no note for a free user', () => {
    mockStorage.isProUser.mockReturnValue(false);
    window.startFocus('t1');
    expect(picker().classList.contains('hidden')).toBe(true);
    vi.advanceTimersByTime(6 * 60_000);
    window.endFocus();
    expect($('result-picker').querySelector('#focus-note-input')).toBe(null);
    $('result-picker').querySelector('.result-btn[data-result="complete"]').click();
    expect(mockSubmit).toHaveBeenCalledWith('t1', 360, 'complete', 6, '');
  });
});

describe('chime', () => {
  function countUp() {
    window.startFocus('t1');
    $('focus-dur-skip').click();
  }

  it('sounds two notes once when the minimum is reached', () => {
    countUp();
    vi.advanceTimersByTime(5 * 60_000 - 1000);
    expect(tones).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(tones).toEqual([[528, 0], [660, 0.25]]);
    vi.advanceTimersByTime(60_000);
    expect(tones).toHaveLength(2);
    expect($('focus-min-effective').textContent).toBe('達到最低有效時間 ✓');
  });

  it('stays silent with the sound off, for a free user, or without Web Audio', () => {
    mockState.user.focusSoundEnabled = false;
    countUp();
    vi.advanceTimersByTime(5 * 60_000);
    drain();
    mockState.user.focusSoundEnabled = true;
    mockStorage.isProUser.mockReturnValue(false);
    window.startFocus('t1');
    vi.advanceTimersByTime(5 * 60_000);
    drain();
    expect(tones).toEqual([]);
    mockStorage.isProUser.mockReturnValue(true);
    window.AudioContext = class { constructor() { throw new Error('not allowed'); } };
    countUp();
    expect(() => vi.advanceTimersByTime(5 * 60_000)).not.toThrow();
    expect($('focus-min-effective').textContent).toBe('達到最低有效時間 ✓');
  });
});

describe('starting', () => {
  it('ignores an unknown task, and refuses a second session while one runs', () => {
    window.startFocus('missing');
    expect(picker().classList.contains('hidden')).toBe(true);
    window.startFocus('t1');
    $('focus-dur-skip').click();
    window.startFocus('t1');
    expect(mockToast).toHaveBeenCalledWith('⚡ 已有任務進行中，請先完成或略過');
    // The running session goes on; no second picker.
    expect(picker().classList.contains('hidden')).toBe(true);
    expect($('focus-overlay').classList.contains('hidden')).toBe(false);
  });
});
