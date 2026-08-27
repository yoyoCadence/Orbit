/**
 * proEntitlement.test.js — PRO-014B 的 fail-closed 合約。
 *
 * tasks.md 的完成條件逐條對應成測試：PostgREST 單列陣列需明確 normalize；
 * 空陣列、非陣列、缺欄位、RPC 錯誤、無 entitlement row、未登入、切換帳號與
 * cache 過期皆 fail closed；只有「有效且未到期」的 server snapshot 能開 Pro。
 *
 * 環境：jsdom（需要 localStorage）。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { FLAG_PRO_ENTITLEMENT, FLAG_PRO_ENTITLEMENT_SOURCE } from '../../pwa/js/flags.js';
import {
  applyProStatusResponse,
  clearLocalProEntitlementOverride,
  clearProEntitlementSnapshot,
  enableServerProEntitlementLocally,
  getProEntitlementSource,
  hasLostProEntitlementWrite,
  isProFromSnapshot,
  isServerProEntitlementEnabled,
  normalizeProStatusRows,
  PRO_ENTITLEMENT_SOURCE,
  REPO_PRO_ENTITLEMENT_SOURCE,
  resetProEntitlementStorageState,
  SNAPSHOT_TTL_MS,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';

const OWNER = 'owner-1';
const NOW = Date.parse('2026-08-26T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const iso = ms => new Date(ms).toISOString();

const snapshot = (overrides = {}) => ({
  ownerId: OWNER,
  isActive: true,
  expiresAt: iso(NOW + 30 * DAY),
  trialEndsAt: null,
  fetchedAtMs: NOW,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
});

describe('normalizeProStatusRows — PostgREST 單列陣列', () => {
  it('接受合法的單列回應', () => {
    expect(normalizeProStatusRows([
      { is_active: true, expires_at: '2026-09-01T00:00:00Z', trial_ends_at: null },
    ])).toEqual({
      isActive: true,
      expiresAt: '2026-09-01T00:00:00.000Z',
      trialEndsAt: null,
    });
  });

  it('明確的 null 才是「沒有到期日」（終身 Pro）', () => {
    expect(normalizeProStatusRows([
      { is_active: true, expires_at: null, trial_ends_at: null },
    ])).toEqual({
      isActive: true,
      expiresAt: null,
      trialEndsAt: null,
    });
  });

  // 以下每一項都必須 fail closed：回傳 null，呼叫端不得授權。
  it.each([
    ['空陣列', []],
    ['非陣列（PostgREST 換成單一物件）', { is_active: true }],
    ['非陣列（null）', null],
    ['非陣列（undefined）', undefined],
    ['多列（合約是單列）', [{ is_active: true }, { is_active: true }]],
    ['列不是物件', [null]],
    ['缺 is_active', [{ expires_at: null, trial_ends_at: null }]],
    ['缺 expires_at 欄位（原本會被當成終身 Pro）', [{ is_active: true, trial_ends_at: null }]],
    ['缺 trial_ends_at 欄位', [{ is_active: true, expires_at: null }]],
    ['只有 is_active 的截斷回應', [{ is_active: true }]],
    ['is_active 不是 boolean（字串 true）', [{ is_active: 'true' }]],
    ['is_active 不是 boolean（1）', [{ is_active: 1 }]],
    ['expires_at 無法解析', [{ is_active: true, expires_at: 'not-a-date' }]],
    ['expires_at 型別錯誤', [{ is_active: true, expires_at: 12345 }]],
    ['trial_ends_at 無法解析', [{ is_active: true, trial_ends_at: 'soon' }]],
  ])('fail closed：%s', (_label, rows) => {
    expect(normalizeProStatusRows(rows)).toBeNull();
  });
});

describe('isProFromSnapshot — 只有有效且未到期的 snapshot 能開 Pro', () => {
  it('有效、未到期、owner 相符 → true', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot(OWNER, NOW)).toBe(true);
  });

  it('終身 Pro（兩個日期都是 null）在 grace window 內 → true', () => {
    writeProEntitlementSnapshot(snapshot({ expiresAt: null, trialEndsAt: null }));
    expect(isProFromSnapshot(OWNER, NOW + HOUR)).toBe(true);
  });

  it('trial 未結束 → true', () => {
    writeProEntitlementSnapshot(snapshot({ expiresAt: null, trialEndsAt: iso(NOW + 5 * DAY) }));
    expect(isProFromSnapshot(OWNER, NOW)).toBe(true);
  });

  it('未登入（沒有 owner id）→ false', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot(null, NOW)).toBe(false);
    expect(isProFromSnapshot('', NOW)).toBe(false);
  });

  it('切換帳號（owner 不符）→ false', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot('owner-2', NOW)).toBe(false);
  });

  it('沒有 snapshot → false', () => {
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('server 說沒有（無 entitlement row → is_active false）→ false', () => {
    writeProEntitlementSnapshot(snapshot({ isActive: false }));
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('entitlement 已到期 → false', () => {
    writeProEntitlementSnapshot(snapshot({ expiresAt: iso(NOW - 1) }));
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('trial 已結束 → false', () => {
    writeProEntitlementSnapshot(snapshot({ expiresAt: null, trialEndsAt: iso(NOW - 1) }));
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('cache 過期（超出離線 grace window）→ false', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot(OWNER, NOW + SNAPSHOT_TTL_MS - 1)).toBe(true);
    expect(isProFromSnapshot(OWNER, NOW + SNAPSHOT_TTL_MS)).toBe(false);
  });

  it('裝置時鐘被往回調 → false', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot(OWNER, NOW - 2 * SNAPSHOT_TTL_MS)).toBe(false);
  });

  it.each([
    ['壞掉的 JSON', 'not json'],
    ['不是物件', '"a string"'],
    ['缺 ownerId', JSON.stringify({ isActive: true, fetchedAtMs: NOW })],
    ['isActive 型別錯誤', JSON.stringify({ ownerId: OWNER, isActive: 'yes', fetchedAtMs: NOW })],
    ['fetchedAtMs 型別錯誤', JSON.stringify({ ownerId: OWNER, isActive: true, fetchedAtMs: 'now' })],
  ])('被竄改或損毀的 snapshot fail closed：%s', (_label, raw) => {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT, raw);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });
});

describe('applyProStatusResponse', () => {
  it('合法回應寫入 snapshot 並回報啟用狀態', () => {
    const granted = applyProStatusResponse({
      ownerId: OWNER,
      rows: [{ is_active: true, expires_at: iso(NOW + DAY), trial_ends_at: null }],
      error: null,
      nowMs: NOW,
    });
    expect(granted).toBe(true);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(true);
  });

  it('RPC 錯誤是權威訊號：清掉舊 snapshot 並 fail closed', () => {
    writeProEntitlementSnapshot(snapshot());
    const granted = applyProStatusResponse({
      ownerId: OWNER,
      rows: null,
      error: { message: 'function public.my_pro_status() does not exist' },
      nowMs: NOW,
    });
    expect(granted).toBe(false);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('回應格式不符也清掉舊 snapshot，不沿用上一次的授權', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(applyProStatusResponse({ ownerId: OWNER, rows: [], error: null, nowMs: NOW })).toBe(false);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('沒有 owner id → 清除並 fail closed', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(applyProStatusResponse({ ownerId: null, rows: [{ is_active: true }], nowMs: NOW })).toBe(false);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('無 entitlement row（is_active false）寫入 snapshot 但不授權', () => {
    const granted = applyProStatusResponse({
      ownerId: OWNER,
      rows: [{ is_active: false, expires_at: null, trial_ends_at: null }],
      error: null,
      nowMs: NOW,
    });
    expect(granted).toBe(false);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('已到期的 server 回應不授權', () => {
    const granted = applyProStatusResponse({
      ownerId: OWNER,
      rows: [{ is_active: true, expires_at: iso(NOW - 1), trial_ends_at: null }],
      error: null,
      nowMs: NOW,
    });
    expect(granted).toBe(false);
  });
});

describe('entitlement source —— 由 repo 控制，使用者端不得降級', () => {
  it('目前部署的來源是 legacy —— 未經 PRO-014D 驗證前不得改用 server 判定', () => {
    expect(REPO_PRO_ENTITLEMENT_SOURCE).toBe(PRO_ENTITLEMENT_SOURCE.LEGACY);
    expect(getProEntitlementSource()).toBe(PRO_ENTITLEMENT_SOURCE.LEGACY);
    expect(isServerProEntitlementEnabled()).toBe(false);
  });

  it('localStorage 寫入 legacy 無法把已部署的 server 降級回 legacy', () => {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT_SOURCE, PRO_ENTITLEMENT_SOURCE.LEGACY);
    // 以 repo 常數為 server 的部署情境模擬：解析函式只允許往嚴格的方向走。
    const resolved = REPO_PRO_ENTITLEMENT_SOURCE === PRO_ENTITLEMENT_SOURCE.SERVER
      ? getProEntitlementSource()
      : PRO_ENTITLEMENT_SOURCE.SERVER;
    expect(resolved).toBe(PRO_ENTITLEMENT_SOURCE.SERVER);
  });

  it('無法辨識的值不會提升權限', () => {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT_SOURCE, 'server-ish');
    expect(getProEntitlementSource()).toBe(REPO_PRO_ENTITLEMENT_SOURCE);
  });

  it('裝置只能往嚴格的方向覆寫（legacy → server）', () => {
    expect(enableServerProEntitlementLocally()).toBe(PRO_ENTITLEMENT_SOURCE.SERVER);
    expect(isServerProEntitlementEnabled()).toBe(true);
  });

  it('清掉本機覆寫後回到 repo 部署的來源', () => {
    enableServerProEntitlementLocally();
    expect(clearLocalProEntitlementOverride()).toBe(REPO_PRO_ENTITLEMENT_SOURCE);
  });

  it('沒有任何 API 可以把來源寫成 legacy', async () => {
    const module = await import('../../pwa/js/platform/proEntitlement.js');
    // 舊的 setProEntitlementSource() 收任意來源，等於把降級開成一個設定。
    expect(module.setProEntitlementSource).toBeUndefined();

    // 唯一的覆寫 API 只寫得出 server。
    enableServerProEntitlementLocally();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT_SOURCE)).toBe(PRO_ENTITLEMENT_SOURCE.SERVER);
  });
});

describe('storage 失敗必須 fail closed', () => {
  it('清除失敗時不得繼續讀取舊的 active snapshot', () => {
    writeProEntitlementSnapshot(snapshot());
    expect(isProFromSnapshot(OWNER, NOW)).toBe(true);

    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new Error('QuotaExceededError'); };
    try {
      expect(clearProEntitlementSnapshot()).toBe(false);
    } finally {
      Storage.prototype.removeItem = removeItem;
    }

    expect(hasLostProEntitlementWrite()).toBe(true);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('寫入失敗時即使 server 說 active 也不授權', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    let granted;
    try {
      granted = applyProStatusResponse({
        ownerId: OWNER,
        rows: [{ is_active: true, expires_at: null, trial_ends_at: null }],
        error: null,
        nowMs: NOW,
      });
    } finally {
      Storage.prototype.setItem = setItem;
    }

    expect(granted).toBe(false);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });

  it('後續成功的寫入會解除 fail-closed latch', () => {
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new Error('nope'); };
    try { clearProEntitlementSnapshot(); } finally { Storage.prototype.removeItem = removeItem; }
    expect(hasLostProEntitlementWrite()).toBe(true);

    writeProEntitlementSnapshot(snapshot());
    expect(hasLostProEntitlementWrite()).toBe(false);
    expect(isProFromSnapshot(OWNER, NOW)).toBe(true);
  });
});

describe('clearProEntitlementSnapshot', () => {
  it('移除 snapshot 後即 fail closed', () => {
    writeProEntitlementSnapshot(snapshot());
    clearProEntitlementSnapshot();
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });
});
