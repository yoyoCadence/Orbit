import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isWithinRemindWindow,
  watchRemindWindow,
} from '../../pwa/js/personalSpace/v2/remindWindow.js';

const at = (hour, minute = 0, second = 0) => new Date(2026, 6, 17, hour, minute, second);

function fakeDocument() {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener: (type, listener) => type === 'visibilitychange' && listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
    dispatchVisibility() { listeners.forEach(listener => listener()); },
    get listenerCount() { return listeners.size; },
  };
}

describe('AI-203B reminder window', () => {
  it.each([
    [at(11, 59, 59), false],
    [at(12), true],
    [at(13, 59, 59), true],
    [at(14), false],
    [new Date(Number.NaN), false],
  ])('isWithinRemindWindow(%s) is %s', (now, expected) => {
    expect(isWithinRemindWindow(now)).toBe(expected);
  });
});

describe('AI-203B watchRemindWindow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires when the window opens and again when it closes, then stops for the day', () => {
    vi.setSystemTime(at(11, 59));
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc: fakeDocument() });

    vi.advanceTimersByTime(60 * 1000 + 1000);
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it('re-checks when the page becomes visible after a sleep delayed the timer', () => {
    vi.setSystemTime(at(11, 0));
    const doc = fakeDocument();
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc });

    // The device slept: the clock moved past 12:00 but no timer ran.
    vi.setSystemTime(at(12, 30));
    doc.dispatchVisibility();
    expect(onChange).toHaveBeenCalledTimes(1);

    doc.dispatchVisibility();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('cleanup cancels the timer and the visibility listener, even from inside onChange', () => {
    vi.setSystemTime(at(11, 59));
    const doc = fakeDocument();
    let stop = null;
    const onChange = vi.fn(() => stop());
    stop = watchRemindWindow(onChange, { doc });

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(doc.listenerCount).toBe(0);
  });
});
