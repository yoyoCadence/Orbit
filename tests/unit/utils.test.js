/**
 * utils.test.js
 *
 * 測試 today() 與 effectiveToday() 的本地時間正確性。
 * 因 today() 依賴 Date，測試中用 vi.setSystemTime() 控制時鐘。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { today, effectiveToday } from '../../pwa/js/utils.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── today() ─────────────────────────────────────────────────────────────────

describe('today()', () => {
  it('returns local date as YYYY-MM-DD', () => {
    // Set to 2026-04-15 10:00 local
    vi.setSystemTime(new Date('2026-04-15T10:00:00'));
    expect(today()).toBe('2026-04-15');
  });

  it('format is always YYYY-MM-DD (zero-padded)', () => {
    vi.setSystemTime(new Date('2026-01-05T08:00:00'));
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── effectiveToday() ─────────────────────────────────────────────────────────

describe('effectiveToday()', () => {
  it('returns same day when hour >= newDayHour (default 5)', () => {
    vi.setSystemTime(new Date('2026-04-15T05:00:00'));
    expect(effectiveToday(5)).toBe('2026-04-15');
  });

  it('returns same day well after threshold', () => {
    vi.setSystemTime(new Date('2026-04-15T14:00:00'));
    expect(effectiveToday(5)).toBe('2026-04-15');
  });

  it('returns previous day when hour < newDayHour (night owl)', () => {
    // 03:00 is before 05:00 threshold → still "yesterday"
    vi.setSystemTime(new Date('2026-04-15T03:00:00'));
    expect(effectiveToday(5)).toBe('2026-04-14');
  });

  it('returns previous day at 00:00 (midnight)', () => {
    vi.setSystemTime(new Date('2026-04-15T00:00:00'));
    expect(effectiveToday(5)).toBe('2026-04-14');
  });

  it('returns same day at exact threshold hour', () => {
    vi.setSystemTime(new Date('2026-04-15T05:00:00'));
    expect(effectiveToday(5)).toBe('2026-04-15');
  });

  it('custom newDayHour=0 (UTC midnight) → always same calendar day', () => {
    vi.setSystemTime(new Date('2026-04-15T00:00:00'));
    expect(effectiveToday(0)).toBe('2026-04-15');
  });

  it('custom newDayHour=8 → 07:59 still counts as yesterday', () => {
    vi.setSystemTime(new Date('2026-04-15T07:59:00'));
    expect(effectiveToday(8)).toBe('2026-04-14');
  });

  it('custom newDayHour=8 → 08:00 counts as new day', () => {
    vi.setSystemTime(new Date('2026-04-15T08:00:00'));
    expect(effectiveToday(8)).toBe('2026-04-15');
  });

  it('no argument → uses default 5am threshold', () => {
    vi.setSystemTime(new Date('2026-04-15T04:59:00'));
    expect(effectiveToday()).toBe('2026-04-14');
    vi.setSystemTime(new Date('2026-04-15T05:00:00'));
    expect(effectiveToday()).toBe('2026-04-15');
  });
});
