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
  clearProEntitlementSnapshot,
  DEFAULT_PRO_ENTITLEMENT_SOURCE,
  getProEntitlementSource,
  isProFromSnapshot,
  isServerProEntitlementEnabled,
  normalizeProStatusRows,
  PRO_ENTITLEMENT_SOURCE,
  setProEntitlementSource,
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

  it('把缺席的欄位視為 null（終身 Pro 沒有到期日）', () => {
    expect(normalizeProStatusRows([{ is_active: true }])).toEqual({
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
    ['缺 is_active', [{ expires_at: null }]],
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

describe('entitlement source flag', () => {
  it('預設是 legacy —— 未經 PRO-014D 驗證前不得改用 server 判定', () => {
    expect(DEFAULT_PRO_ENTITLEMENT_SOURCE).toBe(PRO_ENTITLEMENT_SOURCE.LEGACY);
    expect(getProEntitlementSource()).toBe(PRO_ENTITLEMENT_SOURCE.LEGACY);
    expect(isServerProEntitlementEnabled()).toBe(false);
  });

  it('無法辨識的值退回 legacy', () => {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT_SOURCE, 'server-ish');
    expect(getProEntitlementSource()).toBe(PRO_ENTITLEMENT_SOURCE.LEGACY);
  });

  it('可切換到 server 並被讀回', () => {
    setProEntitlementSource(PRO_ENTITLEMENT_SOURCE.SERVER);
    expect(isServerProEntitlementEnabled()).toBe(true);
  });

  it('拒絕未知的 source', () => {
    expect(() => setProEntitlementSource('trust-me')).toThrow(TypeError);
  });
});

describe('clearProEntitlementSnapshot', () => {
  it('移除 snapshot 後即 fail closed', () => {
    writeProEntitlementSnapshot(snapshot());
    clearProEntitlementSnapshot();
    expect(isProFromSnapshot(OWNER, NOW)).toBe(false);
  });
});
