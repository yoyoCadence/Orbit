/**
 * @vitest-environment jsdom
 */
/**
 * offlineSyncHints.test.js — HW-110：離線佇列可見、連線恢復時的提示。
 *
 * - getPendingSyncSummary() 只讀既有的 owner-scoped pending sidecar
 * - network.js 的連線狀態 adapter
 * - showSyncBanner() 的 offline 狀態與待同步數量
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({}),
  },
}));

import { getPendingSyncSummary } from '../../pwa/js/storage.js';
import {
  recordSessionDeletion,
  recordSessionDeletionRemoteConfirmed,
} from '../../pwa/js/platform/sessionDeletionLog.js';
import { isOnline, onConnectivityChange } from '../../pwa/js/platform/network.js';
import { showSyncBanner } from '../../pwa/js/ui/feedback.js';

const OWNER = 'owner-1';
const key = base => `yoyo_${base}:${encodeURIComponent(OWNER)}`;
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="sync-banner" class="hidden"></div>';
  setOnline(true);
});

describe('getPendingSyncSummary', () => {
  it('沒有 owner 或沒有待同步資料時為 0', () => {
    expect(getPendingSyncSummary(null).total).toBe(0);
    expect(getPendingSyncSummary(OWNER)).toEqual({
      sessions: 0, deletions: 0, tasks: false, profile: false, energy: false, total: 0,
    });
  });

  it('逐筆計算待同步的 Session，tasks／profile／Energy 各算一筆變更', () => {
    setJSON(key('sessionSyncPending'), { ownerId: OWNER, value: [{ id: 's1' }, { id: 's2' }] });
    setJSON(key('taskSyncPending'), { ownerId: OWNER, value: [], deletedIds: ['t1'] });
    setJSON(key('profileSyncPending'), { ownerId: OWNER, value: { id: OWNER } });
    setJSON(key('energySyncPending'), { ownerId: OWNER, value: { currentEnergy: 80 } });

    expect(getPendingSyncSummary(OWNER)).toEqual({
      sessions: 2, deletions: 0, tasks: true, profile: true, energy: true, total: 5,
    });
  });

  it('只計尚未被遠端確認的 Session 刪除', () => {
    recordSessionDeletion(OWNER, 's1', '2026-10-17T00:00:00.000Z');
    recordSessionDeletion(OWNER, 's2', '2026-10-17T00:00:00.000Z');
    recordSessionDeletionRemoteConfirmed(OWNER, 's2', '2026-10-17T00:01:00.000Z');

    const summary = getPendingSyncSummary(OWNER);
    expect(summary.deletions).toBe(1);
    expect(summary.total).toBe(1);
  });

  it('不計入其他 owner 的待同步資料', () => {
    setJSON(key('sessionSyncPending'), { ownerId: 'someone-else', value: [{ id: 's1' }] });
    setJSON(key('profileSyncPending'), { ownerId: 'someone-else', value: {} });

    expect(getPendingSyncSummary(OWNER).total).toBe(0);
  });
});

describe('network adapter', () => {
  it('isOnline() 反映 navigator.onLine', () => {
    setOnline(false);
    expect(isOnline()).toBe(false);
    setOnline(true);
    expect(isOnline()).toBe(true);
  });

  it('連線變化時通知，取消訂閱後不再通知', () => {
    const handler = vi.fn();
    const unsubscribe = onConnectivityChange(handler);

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(handler.mock.calls).toEqual([[false], [true]]);

    unsubscribe();
    window.dispatchEvent(new Event('offline'));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('showSyncBanner', () => {
  const banner = () => document.getElementById('sync-banner');

  it('offline 狀態顯示待同步數量', () => {
    showSyncBanner('offline', { pending: 3 });
    expect(banner().className).toBe('sync-offline');
    expect(banner().textContent).toContain('離線中');
    expect(banner().textContent).toContain('3 筆待同步');
  });

  it('offline 且沒有待同步時說明變更會先存本機', () => {
    showSyncBanner('offline');
    expect(banner().textContent).toContain('變更先存本機');
  });

  it('error 狀態附上待同步數量，沒有時維持原文案', () => {
    showSyncBanner('error', { pending: 2 });
    expect(banner().textContent).toBe('⚠️ 同步暫停，將於下次連線重試 · 2 筆待同步');
    showSyncBanner('error');
    expect(banner().textContent).toBe('⚠️ 同步暫停，將於下次連線重試');
  });
});
