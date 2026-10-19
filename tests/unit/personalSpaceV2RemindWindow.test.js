import { readFileSync } from 'node:fs';
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

  it('fires when the window opens and again when it closes', () => {
    vi.setSystemTime(at(11, 59));
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc: fakeDocument() });

    vi.advanceTimersByTime(60 * 1000 + 1000);
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('opens the next day\'s window for a page left open overnight', () => {
    vi.setSystemTime(at(15, 0));
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc: fakeDocument() });

    // 15:00 → next day 11:59: still outside, nothing to refresh.
    vi.advanceTimersByTime((20 * 60 + 59) * 60 * 1000);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(new Date(Date.now()).getDate()).toBe(18);
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

describe('AI-203B static fallback animation (D2)', () => {
  it('plays the reminder approach once instead of looping', () => {
    const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',')
        .some(selector => selector.trim() === '.orbit-window-companion[data-companion-state="remind"]'));
    expect(rules).toHaveLength(1);
    const [, , body] = rules[0];
    expect(body).toMatch(/animation\s*:[^;]*orbit-companion-approach/);
    expect(body).not.toMatch(/infinite/);
  });
});
