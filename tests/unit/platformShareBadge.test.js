/**
 * platformShareBadge.test.js — TEST-004: the Web Share and App Badge adapters
 * (pwa/js/platform/share.js, badge.js). Both are silent where the platform
 * has no API: nothing throws and the result says why nothing happened.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBadge, scheduleLocalReminder, setBadge, supportsBadge } from '../../pwa/js/platform/badge.js';
import {
  buildGrowthShareText,
  shareContent,
  shareGrowthCard,
  supportsNativeShare,
} from '../../pwa/js/platform/share.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('share.js', () => {
  it('shares natively where navigator.share exists', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    expect(supportsNativeShare()).toBe(true);
    await expect(shareContent({ text: 'hi' })).resolves.toEqual({ shared: true, reason: 'native-share' });
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('reports why a share did not happen', async () => {
    vi.stubGlobal('navigator', {});
    expect(supportsNativeShare()).toBe(false);
    await expect(shareContent({ text: 'hi' })).resolves.toEqual({ shared: false, reason: 'unsupported' });

    // The person closed the share sheet.
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn(() => Promise.reject(abort)) });
    await expect(shareContent({})).resolves.toEqual({ shared: false, reason: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn(() => Promise.reject({})) });
    await expect(shareContent({})).resolves.toEqual({ shared: false, reason: 'share-failed' });
  });

  it('builds the growth text: name, level, total, streak and today only when there is one', () => {
    expect(buildGrowthShareText({
      name: '小明', level: 7, title: '探索者', streakDays: 12, totalXP: 3456, todayXP: 80,
    })).toBe('🌱 小明 — Lv.7 探索者\n⭐ 累積 3456 XP  🔥 12 天連勝\n今日 +80 XP\n#Orbit成長日誌');
    expect(buildGrowthShareText({ level: 1, title: '新手', streakDays: 0, totalXP: 0, todayXP: 0 }))
      .toBe('🌱 Orbit 使用者 — Lv.1 新手\n⭐ 累積 0 XP  剛起步\n#Orbit成長日誌');
    // Called without stats (an older caller): no throw.
    expect(buildGrowthShareText()).toContain('Orbit 使用者');
  });

  it('shares the growth card natively, or copies it where sharing is unavailable', async () => {
    const stats = { name: 'A', level: 2, title: 'T', streakDays: 1, totalXP: 10, todayXP: 0 };
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    await expect(shareGrowthCard(stats)).resolves.toEqual({ shared: true, reason: 'native-share' });
    expect(share).toHaveBeenCalledWith({ title: 'Orbit 成長紀錄', text: buildGrowthShareText(stats) });

    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareGrowthCard(stats)).resolves.toEqual({ shared: true, reason: 'clipboard' });
    expect(writeText).toHaveBeenCalledWith(buildGrowthShareText(stats));

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } });
    await expect(shareGrowthCard(stats)).resolves.toEqual({ shared: false, reason: 'clipboard-denied' });
    // No clipboard at all (an insecure page) counts as denied too.
    vi.stubGlobal('navigator', {});
    await expect(shareGrowthCard(stats)).resolves.toEqual({ shared: false, reason: 'clipboard-denied' });
  });
});

describe('badge.js', () => {
  it('sets a count, a dot, or clears the badge', async () => {
    const setAppBadge = vi.fn(() => Promise.resolve());
    const clearAppBadge = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });
    expect(supportsBadge()).toBe(true);
    await setBadge(3);
    expect(setAppBadge).toHaveBeenLastCalledWith(3);
    await setBadge();
    expect(setAppBadge).toHaveBeenLastCalledWith(undefined);
    await setBadge(0);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
    await clearBadge();
    expect(clearAppBadge).toHaveBeenCalledTimes(2);
  });

  it('does nothing where badges are unsupported or refused', async () => {
    vi.stubGlobal('navigator', {});
    expect(supportsBadge()).toBe(false);
    await expect(setBadge(1)).resolves.toBeUndefined();
    vi.stubGlobal('navigator', { setAppBadge: vi.fn(() => Promise.reject(new Error('denied'))) });
    await expect(setBadge(1)).resolves.toBeUndefined();
  });

  it('shows a local reminder after the delay, only with permission', () => {
    vi.useFakeTimers();
    const shown = [];
    class FakeNotification {
      static permission = 'granted';

      constructor(title, options) { shown.push([title, options]); }
    }
    vi.stubGlobal('Notification', FakeNotification);
    scheduleLocalReminder({ title: '休息一下', body: '專注 25 分鐘了', delayMs: 1000 });
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([['休息一下', { body: '專注 25 分鐘了' }]]);
    scheduleLocalReminder();
    vi.advanceTimersByTime(0);
    expect(shown.at(-1)).toEqual(['Orbit', { body: '' }]);

    FakeNotification.permission = 'denied';
    scheduleLocalReminder({ delayMs: 0 });
    vi.advanceTimersByTime(0);
    expect(shown).toHaveLength(2);
  });

  it('ignores a platform without notifications, or one that refuses to construct them', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Notification', undefined);
    expect(() => scheduleLocalReminder({ delayMs: 0 })).not.toThrow();
    // Android Chrome: `new Notification()` throws; only the service worker may show one.
    vi.stubGlobal('Notification', class {
      static permission = 'granted';

      constructor() { throw new TypeError('Illegal constructor'); }
    });
    scheduleLocalReminder({ delayMs: 0 });
    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
  });
});
