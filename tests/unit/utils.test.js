/**
 * utils.test.js
 *
 * 測試 today() 與 effectiveToday() 的本地時間正確性。
 * 因 today() 依賴 Date，測試中用 vi.setSystemTime() 控制時鐘。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  today, effectiveToday, formatDate, uid, sortSessionsNewestFirst, mergeSessionsById,
} from '../../pwa/js/utils.js';

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

// ─── TEST-014 ────────────────────────────────────────────────────────────────

describe('formatDate()', () => {
  it('今天與昨天以本機日期判斷，其餘顯示月日與星期', () => {
    vi.setSystemTime(new Date('2026-04-15T14:00:00'));
    expect(formatDate('2026-04-15')).toBe('今天');
    expect(formatDate('2026-04-14')).toBe('昨天');
    expect(formatDate('2026-04-13')).toBe(new Date('2026-04-13T00:00:00')
      .toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }));
    expect(formatDate('2026-04-16')).not.toMatch(/今天|昨天/);
  });

  it('BUG-145：傳入的「今天」（有效日）優先於日曆日期', () => {
    // 02:00, before newDayHour: the calendar says the 15th, the effective day is the 14th.
    vi.setSystemTime(new Date('2026-04-15T02:00:00'));
    const effective = effectiveToday(5);
    expect(effective).toBe('2026-04-14');
    expect(formatDate('2026-04-14', effective)).toBe('今天');
    expect(formatDate('2026-04-13', effective)).toBe('昨天');
    expect(formatDate('2026-04-15', effective)).not.toMatch(/今天|昨天/);
  });

  it('跨月與跨年的昨天', () => {
    expect(formatDate('2026-02-28', '2026-03-01')).toBe('昨天');
    expect(formatDate('2025-12-31', '2026-01-01')).toBe('昨天');
    expect(formatDate('2024-02-29', '2024-03-01')).toBe('昨天');
  });
});

describe('uid()', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('有 crypto.randomUUID 時用它', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'from-crypto' });
    expect(uid()).toBe('from-crypto');
  });

  it('沒有 randomUUID 時產生 v4 格式的 id', () => {
    vi.stubGlobal('crypto', {});
    const ids = new Set(Array.from({ length: 50 }, () => uid()));
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(ids.size).toBe(50);
  });

  it('沒有 crypto 時也能產生', () => {
    vi.stubGlobal('crypto', undefined);
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('sortSessionsNewestFirst() 與 mergeSessionsById()', () => {
  it('同一時間的紀錄依 id 排序（固定順序）', () => {
    const at = '2026-04-15T10:00:00Z';
    const sorted = sortSessionsNewestFirst([
      { id: 'a', completedAt: at }, { id: 'c', completedAt: at }, { id: 'b', completedAt: at },
    ]);
    expect(sorted.map(s => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('沒有 id 的雲端紀錄略過；本機的備註與圖示優先，_syncPending 拿掉', () => {
    const merged = mergeSessionsById(
      [{ completedAt: '2026-04-15T10:00:00Z' },
        { id: 's1', completedAt: '2026-04-15T09:00:00Z', note: 'remote', taskIconImg: 'r.png' }],
      [{ id: 's1', note: 'local', taskIconImg: null, _syncPending: true }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 's1', note: 'local', taskIconImg: 'r.png' });
    expect(merged[0]).not.toHaveProperty('_syncPending');
  });
});
