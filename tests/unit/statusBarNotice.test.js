// BUG-118: what an old (translucent) home-screen icon is told on each launch.
import { describe, it, expect } from 'vitest';
import {
  STATUS_BAR_NOTICE_KEY,
  STATUS_BAR_NOTICE_MAX_WIDTH,
  statusBarNoticeStep,
  dismissStatusBarNotice,
  readStatusBarNoticeState,
  writeStatusBarNoticeState,
  statusBarNoticeText,
  statusBarSyncCheckText,
} from '../../pwa/js/statusBarNotice.js';

const NOW = 1_800_000_000_000;
const base = {
  iosHomeScreen: true, safeTop: 59, portrait: true, screenShortSide: 390,
  navigationType: 'navigate', saved: null, nowMs: NOW,
};
const URL_ = 'https://example.test/Orbit/';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    data,
  };
}

describe('statusBarNoticeStep', () => {
  it('shows nothing outside the iOS home-screen app and keeps what was stored', () => {
    const saved = { relaunchAskedAtMs: 1 };
    expect(statusBarNoticeStep({ ...base, iosHomeScreen: false, saved })).toEqual({ step: 'none', next: saved });
    expect(statusBarNoticeStep({ ...base, iosHomeScreen: false })).toEqual({ step: 'none', next: null });
  });

  it('does not decide in landscape, where the inset is 0 either way', () => {
    const saved = { relaunchAskedAtMs: 1 };
    expect(statusBarNoticeStep({ ...base, portrait: false, safeTop: 0, saved })).toEqual({ step: 'none', next: saved });
  });

  it('leaves iPads out by screen size, also in a narrow split-view window (BUG-117)', () => {
    expect(STATUS_BAR_NOTICE_MAX_WIDTH).toBe(475);
    expect(statusBarNoticeStep({ ...base, screenShortSide: 476 }).step).toBe('none');
    expect(statusBarNoticeStep({ ...base, screenShortSide: 820 }).step).toBe('none');
    expect(statusBarNoticeStep({ ...base, screenShortSide: Number.NaN }).step).toBe('none');
    expect(statusBarNoticeStep({ ...base, screenShortSide: 475 }).step).toBe('relaunch');
  });

  it('shows nothing under an opaque status bar and keeps what was closed', () => {
    const saved = { relaunchAskedAtMs: 1, readdShownAtMs: 2, readdDismissedAtMs: 3 };
    expect(statusBarNoticeStep({ ...base, safeTop: 0, saved })).toEqual({ step: 'none', next: saved });
    expect(statusBarNoticeStep({ ...base, safeTop: Number.NaN, saved })).toEqual({ step: 'none', next: saved });
  });

  it('asks for a relaunch the first time, on a launch or on the update reload', () => {
    for (const navigationType of ['navigate', 'reload']) {
      expect(statusBarNoticeStep({ ...base, navigationType })).toEqual({
        step: 'relaunch', next: { relaunchAskedAtMs: NOW },
      });
    }
  });

  it('repeats the relaunch request on in-app reloads until it is closed', () => {
    const asked = { relaunchAskedAtMs: 1 };
    expect(statusBarNoticeStep({ ...base, navigationType: 'reload', saved: asked }))
      .toEqual({ step: 'relaunch', next: asked });
    const closed = { relaunchAskedAtMs: 1, relaunchDismissedAtMs: 2 };
    expect(statusBarNoticeStep({ ...base, navigationType: 'reload', saved: closed }))
      .toEqual({ step: 'none', next: closed });
  });

  it('moves to re-adding on a later launch that is still translucent, and remembers it', () => {
    for (const saved of [{ relaunchAskedAtMs: 1 }, { relaunchAskedAtMs: 1, relaunchDismissedAtMs: 2 }]) {
      for (const navigationType of ['navigate', 'back_forward', 'prerender']) {
        expect(statusBarNoticeStep({ ...base, navigationType, saved }))
          .toEqual({ step: 'readd', next: { ...saved, readdShownAtMs: NOW } });
      }
    }
    const shown = { relaunchAskedAtMs: 1, readdShownAtMs: 5 };
    expect(statusBarNoticeStep({ ...base, saved: shown })).toEqual({ step: 'readd', next: shown });
  });

  it('keeps the re-add step on in-app reloads: it never goes back to asking for a relaunch', () => {
    const shown = { relaunchAskedAtMs: 1, readdShownAtMs: 5 };
    expect(statusBarNoticeStep({ ...base, navigationType: 'reload', saved: shown })).toEqual({ step: 'readd', next: shown });
    const closed = { relaunchAskedAtMs: 1, relaunchDismissedAtMs: 2, readdShownAtMs: 5, readdDismissedAtMs: 6 };
    for (const navigationType of ['reload', 'navigate']) {
      expect(statusBarNoticeStep({ ...base, navigationType, saved: closed })).toEqual({ step: 'none', next: closed });
    }
  });

  it('treats an unreadable stored value as nothing stored', () => {
    for (const saved of ['x', 5, { relaunchAskedAtMs: 'soon' }]) {
      expect(statusBarNoticeStep({ ...base, saved }).step).toBe('relaunch');
    }
  });
});

describe('dismissStatusBarNotice', () => {
  it('records which banner was closed', () => {
    const asked = { relaunchAskedAtMs: 1 };
    expect(dismissStatusBarNotice(asked, 'relaunch', NOW)).toEqual({ relaunchAskedAtMs: 1, relaunchDismissedAtMs: NOW });
    expect(dismissStatusBarNotice(asked, 'readd', NOW)).toEqual({ relaunchAskedAtMs: 1, readdDismissedAtMs: NOW });
    expect(dismissStatusBarNotice(null, 'readd', NOW)).toEqual({ relaunchAskedAtMs: NOW, readdDismissedAtMs: NOW });
  });
});

describe('stored state', () => {
  it('round-trips; null stores nothing', () => {
    const storage = memoryStorage();
    writeStatusBarNoticeState(storage, null);
    expect(storage.data.has(STATUS_BAR_NOTICE_KEY)).toBe(false);
    writeStatusBarNoticeState(storage, { relaunchAskedAtMs: 1 });
    expect(readStatusBarNoticeState(storage)).toEqual({ relaunchAskedAtMs: 1 });
    writeStatusBarNoticeState(storage, null);
    expect(readStatusBarNoticeState(storage)).toEqual({ relaunchAskedAtMs: 1 });
  });

  it('reads broken JSON as null and ignores storage errors', () => {
    expect(readStatusBarNoticeState(memoryStorage({ [STATUS_BAR_NOTICE_KEY]: '{' }))).toBeNull();
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
    expect(readStatusBarNoticeState(throwing)).toBeNull();
    expect(() => writeStatusBarNoticeState(throwing, { relaunchAskedAtMs: 1 })).not.toThrow();
  });
});

describe('statusBarNoticeText', () => {
  it('asks a relaunch in one line, Home-button iPhones included, with nothing to expand', () => {
    const text = statusBarNoticeText('relaunch', { signedIn: true, appUrl: URL_ });
    expect(text.title).toContain('完全關閉 Orbit');
    expect(text.summary).toContain('按兩下 Home 鍵');
    expect(text.steps).toEqual([]);
  });

  it('is conditional: iOS before 26.1 has no blur to fix', () => {
    for (const step of ['relaunch', 'readd']) {
      expect(statusBarNoticeText(step, { signedIn: false, appUrl: URL_ }).title).toMatch(/^頂部如果/);
    }
  });

  it('adds the new icon and checks it before the old one is removed', () => {
    for (const signedIn of [true, false]) {
      const { steps } = statusBarNoticeText('readd', { signedIn, appUrl: URL_ });
      expect(steps).toHaveLength(4);
      expect(steps[0]).toContain(URL_);
      expect(steps[0]).toContain('新版本已就緒');   // an older cached page would add the old style again
      expect(steps[1]).toContain('加入主畫面');
      expect(steps[2]).toContain('確認頂部不再模糊');
      expect(steps[3]).toContain('移除');
    }
    expect(statusBarNoticeText('readd', { signedIn: true, appUrl: URL_ }).steps[2]).toContain('紀錄都在');
  });

  it('says how to tell the icons apart and what to do if the new one is still blurred', () => {
    const { steps } = statusBarNoticeText('readd', { signedIn: false, appUrl: URL_ });
    expect(steps[2]).toContain('移除新的那個，在 Safari 重新整理後再加入一次');
    expect(steps[3]).toContain('打開後還會出現這個提示的那個');
  });

  it('has a signed-in user check the old icon\'s sync before removing it (records made offline live only there)', () => {
    const account = statusBarNoticeText('readd', { signedIn: true, appUrl: URL_ }).steps[3];
    expect(account).toContain('先在舊圖示連上網路打開');
    expect(account).toContain('「檢查同步」');
    expect(statusBarNoticeText('readd', { signedIn: false, appUrl: URL_ }).steps[3]).not.toContain('同步');
  });

  it('opens the App Switcher on both kinds of iPhone', () => {
    const { summary } = statusBarNoticeText('relaunch', { signedIn: false, appUrl: URL_ });
    expect(summary).toContain('從螢幕底部往上滑並停住');
    expect(summary).toContain('按兩下 Home 鍵');
  });

  it('never claims anything is synced; says what only this device holds', () => {
    const account = statusBarNoticeText('readd', { signedIn: true, appUrl: URL_ });
    expect(JSON.stringify(account)).not.toContain('已同步');
    for (const item of ['佐證照片', '背景圖片', '主題', '今天的計畫', '個人空間']) {
      expect(account.warning).toContain(item);
    }
    const guest = statusBarNoticeText('readd', { signedIn: false, appUrl: URL_ });
    expect(guest.warning).toContain('訪客模式的所有資料');
    expect(guest.steps[2]).not.toContain('登入');
  });
});

describe('statusBarSyncCheckText', () => {
  it('says the old icon can go only with an empty queue read online', () => {
    expect(statusBarSyncCheckText({ online: true, pending: 0 })).toEqual({
      ok: true, text: expect.stringContaining('可以移除了'),
    });
  });

  it('says to wait while anything is queued, online or not', () => {
    for (const online of [true, false]) {
      const check = statusBarSyncCheckText({ online, pending: 2 });
      expect(check.ok).toBe(false);
      expect(check.text).toContain('還有 2 筆資料還沒同步，先不要移除舊圖示');
      expect(check.text).toContain('完全關閉 Orbit 再打開');
    }
    expect(statusBarSyncCheckText({ online: false, pending: 2 }).text).toContain('目前離線');
  });

  it('does not clear an empty queue read offline (queued writes may still be coming)', () => {
    expect(statusBarSyncCheckText({ online: false, pending: 0 })).toEqual({
      ok: false, text: expect.stringContaining('目前離線'),
    });
  });
});
