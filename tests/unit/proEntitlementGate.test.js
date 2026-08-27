/**
 * proEntitlementGate.test.js — PRO-014B 的整合面：`storage.isProUser()` 與
 * `db.refreshProEntitlement()`。
 *
 * 兩件事必須同時成立：
 *   1. 預設的 legacy source 下，production 行為完全沒變，而且不會呼叫尚未
 *      存在的 `my_pro_status()` RPC。
 *   2. server source 下，判定只看受信任的 snapshot —— profile 裡那些 client
 *      可以自己改寫的 `isPro` / `proExpiresAt` / `trialStartedAt` 不再算數。
 *
 * 環境：jsdom（需要 localStorage）；supabase 全 mock。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
const sessionUserId = vi.hoisted(() => ({ current: 'owner-1' }));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
    from: () => {
      const self = {
        select: () => self,
        eq: () => self,
        update: () => Promise.resolve({ error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: sessionUserId.current ? { user: { id: sessionUserId.current } } : null,
        },
      }),
    },
  },
}));

import { FLAG_PRO_ENTITLEMENT } from '../../pwa/js/flags.js';
import {
  isProFromSnapshot,
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';
import { db, storage } from '../../pwa/js/storage.js';

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;

/** A profile that the legacy gate would read as Pro — and that a user can write themselves. */
function seedLegacyProUser(id = OWNER) {
  localStorage.setItem('yoyo_user', JSON.stringify({
    id,
    isPro: true,
    proExpiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    trialStartedAt: new Date().toISOString(),
  }));
}

const activeRow = () => [{
  is_active: true,
  expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
  trial_ends_at: null,
}];

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  rpcMock.mockReset();
  sessionUserId.current = OWNER;
});

describe('legacy source（預設）', () => {
  it('沿用 profile 欄位判定，行為與 cutover 前相同', () => {
    seedLegacyProUser();
    expect(storage.isProUser()).toBe(true);
  });

  it('不呼叫 RPC —— migration 011 尚未套用，production 不該打不存在的 function', async () => {
    seedLegacyProUser();
    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('server source', () => {
  beforeEach(() => {
    enableServerProEntitlementLocally();
  });

  it('不再信任 profile 裡可被 client 改寫的 Pro 欄位', () => {
    seedLegacyProUser();
    expect(storage.isProUser()).toBe(false);
  });

  it('有效的 server snapshot 才開 Pro', async () => {
    seedLegacyProUser();
    rpcMock.mockResolvedValueOnce({ data: activeRow(), error: null });

    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('my_pro_status');
    expect(storage.isProUser()).toBe(true);
  });

  it('RPC 錯誤 fail closed 並清掉既有 snapshot', async () => {
    seedLegacyProUser();
    rpcMock.mockResolvedValueOnce({ data: activeRow(), error: null });
    await db.refreshProEntitlement(OWNER);
    expect(storage.isProUser()).toBe(true);

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(storage.isProUser()).toBe(false);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('未登入時清除 snapshot 且不呼叫 RPC', async () => {
    seedLegacyProUser();
    writeProEntitlementSnapshot({
      ownerId: OWNER, isActive: true, expiresAt: null, trialEndsAt: null, fetchedAtMs: Date.now(),
    });
    sessionUserId.current = null;

    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('session owner 與請求的 owner 不符時清除 snapshot 且不呼叫 RPC', async () => {
    seedLegacyProUser();
    sessionUserId.current = 'owner-2';

    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('切換帳號後，前一位 owner 的 snapshot 不會被沿用', async () => {
    seedLegacyProUser();
    rpcMock.mockResolvedValueOnce({ data: activeRow(), error: null });
    await db.refreshProEntitlement(OWNER);
    expect(storage.isProUser()).toBe(true);

    seedLegacyProUser('owner-2');
    expect(storage.isProUser()).toBe(false);
  });

  it('網路失敗（throw）保留既有 snapshot，讓離線 grace window 生效', async () => {
    seedLegacyProUser();
    rpcMock.mockResolvedValueOnce({ data: activeRow(), error: null });
    await db.refreshProEntitlement(OWNER);

    rpcMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(storage.isProUser()).toBe(true);
  });

  it('登出（clearAll）清除 snapshot', async () => {
    seedLegacyProUser();
    rpcMock.mockResolvedValueOnce({ data: activeRow(), error: null });
    await db.refreshProEntitlement(OWNER);
    expect(isProFromSnapshot(OWNER)).toBe(true);

    storage.clearAll();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(isProFromSnapshot(OWNER)).toBe(false);
  });

  it('guest（沒有 owner id）永遠不是 Pro', () => {
    localStorage.setItem('yoyo_user', JSON.stringify({ isPro: true }));
    expect(storage.isProUser()).toBe(false);
  });
});
