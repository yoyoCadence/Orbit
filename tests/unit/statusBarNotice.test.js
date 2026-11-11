// BUG-118: what an old (translucent) home-screen icon is told on each launch.
import { describe, it, expect } from 'vitest';
import {
  STATUS_BAR_NOTICE_KEY,
  statusBarNoticeStep,
  dismissStatusBarNotice,
  readStatusBarNoticeState,
  writeStatusBarNoticeState,
  statusBarNoticeText,
} from '../../pwa/js/statusBarNotice.js';

const NOW = 1_800_000_000_000;
const base = { iosHomeScreen: true, safeTop: 59, portrait: true, navigationType: 'navigate', saved: null, nowMs: NOW };

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

  it('forgets everything once the status bar is opaque (top inset 0)', () => {
    const saved = { relaunchAskedAtMs: 1, readdDismissedAtMs: 2 };
    expect(statusBarNoticeStep({ ...base, safeTop: 0, saved })).toEqual({ step: 'none', next: null });
    expect(statusBarNoticeStep({ ...base, safeTop: Number.NaN, saved })).toEqual({ step: 'none', next: null });
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

  it('explains re-adding on a later launch that is still translucent, until closed', () => {
    for (const saved of [{ relaunchAskedAtMs: 1 }, { relaunchAskedAtMs: 1, relaunchDismissedAtMs: 2 }]) {
      for (const navigationType of ['navigate', 'back_forward', 'prerender']) {
        expect(statusBarNoticeStep({ ...base, navigationType, saved })).toEqual({ step: 'readd', next: saved });
      }
    }
    const closed = { relaunchAskedAtMs: 1, readdDismissedAtMs: 3 };
    expect(statusBarNoticeStep({ ...base, saved: closed })).toEqual({ step: 'none', next: closed });
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
  it('round-trips and removes on null', () => {
    const storage = memoryStorage();
    writeStatusBarNoticeState(storage, { relaunchAskedAtMs: 1 });
    expect(readStatusBarNoticeState(storage)).toEqual({ relaunchAskedAtMs: 1 });
    writeStatusBarNoticeState(storage, null);
    expect(storage.data.has(STATUS_BAR_NOTICE_KEY)).toBe(false);
  });

  it('reads broken JSON as null and ignores storage errors', () => {
    expect(readStatusBarNoticeState(memoryStorage({ [STATUS_BAR_NOTICE_KEY]: '{' }))).toBeNull();
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); } };
    expect(readStatusBarNoticeState(throwing)).toBeNull();
    expect(() => writeStatusBarNoticeState(throwing, { relaunchAskedAtMs: 1 })).not.toThrow();
    expect(() => writeStatusBarNoticeState(throwing, null)).not.toThrow();
  });
});

describe('statusBarNoticeText', () => {
  it('asks a relaunch in one line', () => {
    const text = statusBarNoticeText('relaunch', { signedIn: true, pendingSync: 0 });
    expect(text.title).toContain('重新開啟');
    expect(text.body).toHaveLength(1);
  });

  it('warns a guest that removing the icon removes the data', () => {
    const text = statusBarNoticeText('readd', { signedIn: false, pendingSync: 0 });
    expect(text.body.at(-1)).toContain('訪客模式的所有資料');
  });

  it('asks a signed-in user to wait for pending sync', () => {
    expect(statusBarNoticeText('readd', { signedIn: true, pendingSync: 3 }).body.join('\n')).toContain('還有 3 筆資料等待同步');
    expect(statusBarNoticeText('readd', { signedIn: true, pendingSync: 3 }).body.join('\n')).toContain('等同步完成再刪除');
  });

  it('never claims everything is synced: records can be added while the banner is up', () => {
    const text = statusBarNoticeText('readd', { signedIn: true, pendingSync: 0 }).body.join('\n');
    expect(text).not.toContain('已同步');
    expect(text).toContain('確認上方沒有「離線中」或「同步暫停」的提示');
  });

  it('warns a signed-in user that device-only data goes with the icon, synced or not', () => {
    for (const pendingSync of [0, 2]) {
      const last = statusBarNoticeText('readd', { signedIn: true, pendingSync }).body.at(-1);
      expect(last).toContain('佐證照片');
      expect(last).toContain('個人空間');
      expect(last).toContain('只存在這台裝置');
    }
  });
});
