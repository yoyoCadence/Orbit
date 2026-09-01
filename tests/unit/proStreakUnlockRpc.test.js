/**
 * PRO-014L client contract: the browser sends no streak/expiry inputs and only
 * mirrors a strict `grant_streak_unlock()` server response.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
const profileUpdates = vi.hoisted(() => []);
const updateResult = vi.hoisted(() => ({ error: null }));
const sessionUserId = vi.hoisted(() => ({ current: 'owner-1' }));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
    from: (table) => {
      const self = {
        select: () => self,
        eq: () => Promise.resolve(updateResult),
        update: (payload) => {
          if (table === 'profiles') profileUpdates.push(payload);
          return self;
        },
        single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: sessionUserId.current
            ? { user: { id: sessionUserId.current } }
            : null,
        },
      }),
    },
  },
}));

import {
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
} from '../../pwa/js/platform/proEntitlement.js';
import { db, storage } from '../../pwa/js/storage.js';

const OWNER = 'owner-1';
const SERVER_EXPIRES_AT = '2026-10-01T12:34:56.000Z';
const SERVER_GRANTED_AT = '2026-09-01T12:34:56.000Z';

function rpcRow(overrides = {}) {
  return [{
    status: 'granted',
    granted: true,
    is_active: true,
    expires_at: SERVER_EXPIRES_AT,
    granted_at: SERVER_GRANTED_AT,
    ...overrides,
  }];
}

function seedUser(extra = {}) {
  localStorage.setItem('yoyo_user', JSON.stringify({ id: OWNER, streakDays: 45, ...extra }));
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  rpcMock.mockReset();
  profileUpdates.length = 0;
  updateResult.error = null;
  sessionUserId.current = OWNER;
  seedUser();
});

describe('grantStreakUnlock —— 無參數 server 授權', () => {
  it('只呼叫無參數 RPC，expiry 完整採用 server 回傳值', async () => {
    rpcMock.mockResolvedValueOnce({ data: rpcRow(), error: null });

    const response = await db.grantStreakUnlock(OWNER);

    expect(rpcMock).toHaveBeenCalledWith('grant_streak_unlock');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      ok: true,
      ownerChanged: false,
      result: {
        status: 'granted',
        granted: true,
        isActive: true,
        expiresAt: SERVER_EXPIRES_AT,
        grantedAt: SERVER_GRANTED_AT,
      },
    });
    expect(profileUpdates).toEqual([{
      is_pro: true,
      pro_expires_at: SERVER_EXPIRES_AT,
      streak_unlock_used: true,
    }]);
    expect(JSON.parse(localStorage.getItem('yoyo_user'))).toMatchObject({
      isPro: true,
      proExpiresAt: SERVER_EXPIRES_AT,
      streakUnlockUsed: true,
    });
  });

  it('already_granted 只修復相容狀態，不假裝成新領取', async () => {
    rpcMock.mockResolvedValueOnce({
      data: rpcRow({ status: 'already_granted', granted: false, is_active: false }),
      error: null,
    });

    const response = await db.grantStreakUnlock(OWNER);

    expect(response.result.granted).toBe(false);
    expect(profileUpdates).toEqual([{
      is_pro: false,
      pro_expires_at: SERVER_EXPIRES_AT,
      streak_unlock_used: true,
    }]);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).streakUnlockUsed).toBe(true);
  });

  it('not_eligible 不寫入 profile 或本機 Pro 欄位', async () => {
    rpcMock.mockResolvedValueOnce({
      data: rpcRow({
        status: 'not_eligible', granted: false, is_active: false,
        expires_at: null, granted_at: null,
      }),
      error: null,
    });

    const response = await db.grantStreakUnlock(OWNER);

    expect(response.ok).toBe(true);
    expect(profileUpdates).toEqual([]);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).isPro).toBeUndefined();
  });

  it('server source 成功後刷新 projection，gate 立即生效', async () => {
    enableServerProEntitlementLocally();
    rpcMock
      .mockResolvedValueOnce({ data: rpcRow(), error: null })
      .mockResolvedValueOnce({
        data: [{
          is_active: true,
          expires_at: SERVER_EXPIRES_AT,
          trial_ends_at: null,
        }],
        error: null,
      });

    await db.grantStreakUnlock(OWNER);

    expect(rpcMock.mock.calls).toEqual([
      ['grant_streak_unlock'],
      ['my_pro_status'],
    ]);
    expect(storage.isProUser()).toBe(true);
  });
});

describe('grantStreakUnlock —— fail closed', () => {
  it('owner 不符或未登入時不呼叫 RPC', async () => {
    sessionUserId.current = 'owner-2';
    await expect(db.grantStreakUnlock(OWNER)).resolves.toEqual({
      ok: false, ownerChanged: true, result: null,
    });
    expect(rpcMock).not.toHaveBeenCalled();

    sessionUserId.current = null;
    await expect(db.grantStreakUnlock(OWNER)).resolves.toEqual({
      ok: false, ownerChanged: true, result: null,
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ['空陣列', []],
    ['多列', [...rpcRow(), ...rpcRow()]],
    ['裸物件', rpcRow()[0]],
    ['未知 status', rpcRow({ status: 'surprise' })],
    ['granted 布林矛盾', rpcRow({ granted: false })],
    ['缺少 grant timestamp', rpcRow({ granted_at: null })],
    ['grant 沒有 expiry', rpcRow({ expires_at: null })],
    ['無效 timestamp', rpcRow({ expires_at: 'tomorrow-ish' })],
  ])('%s → 不接受、不寫入', async (_label, data) => {
    rpcMock.mockResolvedValueOnce({ data, error: null });

    await expect(db.grantStreakUnlock(OWNER)).resolves.toEqual({
      ok: false, ownerChanged: false, result: null,
    });
    expect(profileUpdates).toEqual([]);
  });

  it('RPC error／離線與 legacy 寫回失敗都不會錯授權或阻斷 server 成功', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    expect((await db.grantStreakUnlock(OWNER)).ok).toBe(false);
    expect(profileUpdates).toEqual([]);

    rpcMock.mockResolvedValueOnce({ data: rpcRow(), error: null });
    updateResult.error = { message: 'offline' };
    const successfulClaim = await db.grantStreakUnlock(OWNER);
    expect(successfulClaim.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).proExpiresAt).toBe(SERVER_EXPIRES_AT);
  });
});
