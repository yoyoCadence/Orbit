/**
 * @vitest-environment jsdom
 */
/**
 * hw113DailyPlanDate.test.js — HW-113：今日計畫與 Sessions 用同一個 effective date。
 *
 * 修正前，今日計畫以日曆日（`today()`）存取，Sessions 與 V2 快照以 `newDayHour`
 * 切日：
 *   - 00:00 到 `newDayHour` 之間，effective date 還是昨天，計畫卻已經消失；
 *   - 這段時間內儲存（新增、移除、排序），整份昨天的計畫被蓋上新的日曆日，
 *     到了 `newDayHour` 之後變成「今天」的計畫。
 * 這裡用真實的 storage 與固定時鐘驗證兩者對齊，以及 day watcher 還沒重設時，
 * 編輯不會把昨天的計畫帶進今天。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/supabase.js', () => ({ supabase: {} }));

import { storage } from '../../pwa/js/storage.js';

/** Local wall-clock time on 2026-10-{day}. */
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute);

function seedUser(newDayHour) {
  const user = { id: 'owner-a', name: 'Tester', totalXP: 0 };
  if (newDayHour !== undefined) user.newDayHour = newDayHour;
  localStorage.setItem('yoyo_user', JSON.stringify(user));
}

const storedPlan = () => JSON.parse(localStorage.getItem('yoyo_dailyPlan'));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HW-113 daily plan uses the effective date', () => {
  it('keeps the plan after midnight until the new-day hour', () => {
    seedUser(5);
    vi.setSystemTime(at(19, 22));
    storage.saveDailyPlan(['a', 'b']);

    vi.setSystemTime(at(20, 0, 30));
    expect(storage.getDailyPlan()).toEqual(['a', 'b']);

    vi.setSystemTime(at(20, 4, 59));
    expect(storage.getDailyPlan()).toEqual(['a', 'b']);

    vi.setSystemTime(at(20, 5));
    expect(storage.getDailyPlan()).toEqual([]);
  });

  it('a save after midnight stays on the effective day instead of moving to the next calendar day', () => {
    seedUser(5);
    vi.setSystemTime(at(20, 0, 30));
    storage.saveDailyPlan(['a']);

    expect(storedPlan().date).toBe('2026-10-19');
    vi.setSystemTime(at(20, 9));
    expect(storage.getDailyPlan()).toEqual([]);
  });

  it('follows the user\'s new-day hour and defaults to 05:00 like dayCycle', () => {
    seedUser(0);
    vi.setSystemTime(at(20, 0, 30));
    storage.saveDailyPlan(['a']);
    expect(storedPlan().date).toBe('2026-10-20');

    seedUser(undefined);
    vi.setSystemTime(at(20, 4));
    storage.saveDailyPlan(['b']);
    expect(storedPlan().date).toBe('2026-10-19');

    localStorage.removeItem('yoyo_user');
    vi.setSystemTime(at(20, 4));
    expect(storage.getDailyPlan()).toEqual(['b']);
  });
});

describe('HW-113 edits never carry a stale plan into the new day', () => {
  it('keeps the in-memory plan while it belongs to the current effective day', () => {
    seedUser(5);
    vi.setSystemTime(at(19, 22));
    storage.saveDailyPlan(['a']);
    const inMemory = ['a'];

    vi.setSystemTime(at(20, 1));
    expect(storage.currentDailyPlan(inMemory)).toBe(inMemory);
  });

  it('starts from an empty plan once the stored plan belongs to an earlier day', () => {
    seedUser(5);
    vi.setSystemTime(at(19, 22));
    storage.saveDailyPlan(['a', 'b']);

    // The app stayed open past 05:00; dayCycle's minute watcher has not reset yet.
    vi.setSystemTime(at(20, 5, 0));
    expect(storage.currentDailyPlan(['a', 'b'])).toEqual([]);
  });

  it('keeps the in-memory plan when nothing was stored yet', () => {
    seedUser(5);
    vi.setSystemTime(at(20, 9));
    const inMemory = [];
    expect(storage.currentDailyPlan(inMemory)).toBe(inMemory);
  });
});
