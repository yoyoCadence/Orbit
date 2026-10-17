/**
 * @vitest-environment jsdom
 */
/**
 * placeContext.test.js — HW-107：位置情境（opt-in、只存本機、粗略座標）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlaceContext,
  distanceMeters,
  getCoarsePosition,
  loadPlaceContext,
  resolvePlaceLabel,
  roundCoord,
  savePlaceContext,
} from '../../pwa/js/platform/placeContext.js';
import {
  mountPlaceHint,
  resetPlaceHintCache,
  suggestTasksForPlace,
} from '../../pwa/js/ui/placeHint.js';

const HOME = { lat: 25.033, lng: 121.565 };
const WORK = { lat: 25.047, lng: 121.517 };

let getCurrentPosition;

function mockGeolocation(coords = { latitude: 25.03312345, longitude: 121.56498765 }) {
  getCurrentPosition = vi.fn((resolve) => resolve({ coords }));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
}

beforeEach(() => {
  localStorage.clear();
  resetPlaceHintCache();
  document.body.innerHTML = '<div id="place-hint" hidden></div>';
  mockGeolocation();
});

describe('座標與距離', () => {
  it('roundCoord 保留 3 位小數（約 110 公尺）', () => {
    expect(roundCoord(25.03312345)).toBe(25.033);
    expect(roundCoord(-121.56789)).toBe(-121.568);
  });

  it('distanceMeters 與已知距離相符', () => {
    expect(distanceMeters(HOME, HOME)).toBe(0);
    // 台北 101 附近到台北車站附近約 5 公里
    expect(distanceMeters(HOME, WORK)).toBeGreaterThan(4500);
    expect(distanceMeters(HOME, WORK)).toBeLessThan(5500);
  });

  it('resolvePlaceLabel 取半徑內最近的標籤，否則為 outside', () => {
    expect(resolvePlaceLabel({ lat: 25.0331, lng: 121.5651 }, { home: HOME, work: WORK })).toBe('home');
    expect(resolvePlaceLabel(WORK, { home: HOME, work: WORK })).toBe('work');
    expect(resolvePlaceLabel({ lat: 24.0, lng: 120.0 }, { home: HOME })).toBe('outside');
    expect(resolvePlaceLabel({ lat: NaN, lng: 1 }, { home: HOME })).toBe('outside');
  });
});

describe('getCoarsePosition', () => {
  it('以低精度請求，並在離開模組前就四捨五入', async () => {
    await expect(getCoarsePosition()).resolves.toEqual({ lat: 25.033, lng: 121.565 });
    expect(getCurrentPosition.mock.calls[0][2]).toEqual(
      expect.objectContaining({ enableHighAccuracy: false }),
    );
  });

  it('權限被拒時 reject', async () => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail(new Error('denied'));
    await expect(getCoarsePosition()).rejects.toThrow('denied');
  });
});

describe('本機設定', () => {
  it('預設未啟用、沒有任何位置', () => {
    expect(loadPlaceContext('owner-1')).toEqual({ enabled: false, places: {} });
  });

  it('只保存粗略座標，且各 owner 互不影響', () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: { lat: 25.03312345, lng: 121.56498765 } } });

    expect(loadPlaceContext('owner-1')).toEqual({ enabled: true, places: { home: HOME } });
    expect(loadPlaceContext('owner-2')).toEqual({ enabled: false, places: {} });
    const raw = Object.keys(localStorage).map(key => localStorage.getItem(key)).join('');
    expect(raw).not.toContain('25.03312345');
  });

  it('可移除單一位置，也可全部清除', () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: HOME, work: WORK } });
    savePlaceContext('owner-1', { places: { work: null } });
    expect(loadPlaceContext('owner-1').places).toEqual({ home: HOME });

    clearPlaceContext('owner-1');
    expect(loadPlaceContext('owner-1')).toEqual({ enabled: false, places: {} });
  });
});

describe('suggestTasksForPlace', () => {
  const tasks = [
    { id: 'a', name: '深度學習', impactType: 'task', taskNature: 'growth', category: 'focus' },
    { id: 'b', name: '記帳', impactType: 'task', taskNature: 'maintenance', category: 'instant' },
    { id: 'c', name: '散步', impactType: 'recovery', taskNature: 'recovery', category: 'focus' },
    { id: 'd', name: '遊戲', impactType: 'entertainment', taskNature: 'entertainment', category: 'instant' },
  ];

  it('依位置挑選，且永遠不建議娛樂', () => {
    expect(suggestTasksForPlace('home', tasks).map(t => t.id)).toEqual(['b', 'c']);
    expect(suggestTasksForPlace('work', tasks).map(t => t.id)).toEqual(['a']);
    expect(suggestTasksForPlace('outside', tasks).map(t => t.id)).toEqual(['b']);
    expect(suggestTasksForPlace('unknown', tasks)).toEqual([]);
  });
});

describe('mountPlaceHint', () => {
  const slot = () => document.getElementById('place-hint');
  const tasks = [{ id: 'b', name: '記帳 <b>', impactType: 'task', taskNature: 'maintenance', category: 'instant' }];

  it('未啟用時不讀取位置、不顯示', async () => {
    savePlaceContext('owner-1', { enabled: false, places: { home: HOME } });
    await expect(mountPlaceHint(slot(), { ownerId: 'owner-1', tasks })).resolves.toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(slot().hidden).toBe(true);
  });

  it('啟用但沒有保存任何位置時不讀取位置', async () => {
    savePlaceContext('owner-1', { enabled: true });
    await mountPlaceHint(slot(), { ownerId: 'owner-1', tasks });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('啟用且有位置時顯示標籤與跳脫過的任務名稱', async () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: HOME } });
    await expect(mountPlaceHint(slot(), { ownerId: 'owner-1', tasks })).resolves.toBe('home');
    expect(slot().hidden).toBe(false);
    expect(slot().textContent).toBe('📍 在家 · 適合：記帳 <b>');
    expect(slot().innerHTML).toContain('&lt;b&gt;');
  });

  it('10 分鐘內重新 render 不重複讀取位置', async () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: HOME } });
    let now = 1_000_000;
    await mountPlaceHint(slot(), { ownerId: 'owner-1', tasks, now: () => now });
    now += 5 * 60 * 1000;
    await mountPlaceHint(slot(), { ownerId: 'owner-1', tasks, now: () => now });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    now += 6 * 60 * 1000;
    await mountPlaceHint(slot(), { ownerId: 'owner-1', tasks, now: () => now });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('取得位置期間首頁已重新 render（slot 已移除）時不寫入', async () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: HOME } });
    const detached = slot();
    detached.remove();
    await expect(mountPlaceHint(detached, { ownerId: 'owner-1', tasks })).resolves.toBeNull();
  });

  it('定位被拒時什麼都不顯示', async () => {
    savePlaceContext('owner-1', { enabled: true, places: { home: HOME } });
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail(new Error('denied'));
    await expect(mountPlaceHint(slot(), { ownerId: 'owner-1', tasks })).resolves.toBeNull();
    expect(slot().hidden).toBe(true);
  });
});
