/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeControl,
  findControl,
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

    // 15:00 → next day 11:59: the reminder window stays shut, but the time
    // band changes at 17, 21, 05 and 10 (PS-251B).
    vi.advanceTimersByTime((20 * 60 + 59) * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(4);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(new Date(Date.now()).getDate()).toBe(18);
    stop();
  });

  it('re-renders on time at every time band boundary (PS-251B)', () => {
    vi.setSystemTime(at(4, 0));
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc: fakeDocument() });
    const fired = [];
    onChange.mockImplementation(() => fired.push(new Date(Date.now()).getHours()));

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    // 05 morning, 10 day, 12/14 reminder window, 17 evening, 21 night.
    expect(fired).toEqual([5, 10, 12, 14, 17, 21]);
    expect(vi.getTimerCount()).toBe(1);
    stop();
  });

  it('does not re-render inside a time band', () => {
    vi.setSystemTime(at(17, 5));
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc: fakeDocument() });
    vi.advanceTimersByTime((3 * 60 + 50) * 60 * 1000);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('updates when the page comes back after sleeping across a time band', () => {
    vi.setSystemTime(at(16, 30));
    const doc = fakeDocument();
    const onChange = vi.fn();
    const stop = watchRemindWindow(onChange, { doc });

    vi.setSystemTime(at(17, 40));
    doc.dispatchVisibility();
    expect(onChange).toHaveBeenCalledTimes(1);
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

describe('AI-203B describeControl / findControl', () => {
  const markup = `
    <button data-v2-mode="edit">header</button>
    <button data-v2-open-detail="companion">dock</button>
    <button data-v2-mode="edit">dock edit</button>
    <section data-v2-detail="companion"><h2 tabindex="-1">Orbit</h2></section>
    <canvas></canvas>
    <svg><circle></circle></svg>`;
  const root = () => {
    const element = document.createElement('div');
    element.innerHTML = markup;
    return element;
  };

  it('finds the twin control by attribute value and position', () => {
    const before = root();
    const after = root();
    const key = describeControl(before, before.querySelectorAll('[data-v2-mode="edit"]')[1]);
    expect(findControl(after, key)).toBe(after.querySelectorAll('[data-v2-mode="edit"]')[1]);
  });

  it('finds the detail heading through its section', () => {
    const before = root();
    const after = root();
    const key = describeControl(before, before.querySelector('h2'));
    expect(findControl(after, key)).toBe(after.querySelector('[data-v2-detail="companion"] h2'));
  });

  it('describes nothing it cannot match again', () => {
    const element = root();
    const detached = document.createElement('button');
    detached.setAttribute('data-v2-mode', 'edit');
    expect(describeControl(element, null)).toBeNull();
    expect(describeControl(element, element)).toBeNull();
    expect(describeControl(element, detached)).toBeNull();
    expect(describeControl(element, element.querySelector('canvas'))).toBeNull();
    expect(describeControl(element, element.querySelector('circle'))).toBeNull();
  });

  it('returns null when the control is gone from the new markup', () => {
    const before = root();
    const key = describeControl(before, before.querySelectorAll('[data-v2-mode="edit"]')[1]);
    const after = document.createElement('div');
    after.innerHTML = '<button data-v2-mode="edit">only one</button>';
    expect(findControl(after, key)).toBeNull();
    expect(findControl(after, null)).toBeNull();
  });
});

describe('AI-203B static fallback animation (D2)', () => {
  it('plays the reminder approach once instead of looping', () => {
    // A path, not a URL: jsdom replaces the global URL that readFileSync accepts.
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../pwa/assets/style.css'), 'utf8')
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
