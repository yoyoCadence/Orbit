/**
 * proTrialRpc.test.js — PRO-014C：trial 改由受控 RPC 授權。
 *
 * 三組合約：
 *   1. `start_trial()` 是冪等的 —— 重複呼叫回傳相同 `trial_started_at`、不重設、
 *      不延長、不 raise。client 不得把重複呼叫當成錯誤路徑。
 *   2. client 不再自行決定 `is_pro` / `pro_expires_at` / `trial_started_at` 的值。
 *      唯一寫回 profile 的是 server 回傳的 `trial_started_at`，作為 legacy 相容層。
 *   3. 失敗語意分開：只有 owner 改變才允許中斷 boot；RPC 失敗必須是非致命的。
 *
 * 環境：jsdom（需要 localStorage）；supabase 全 mock。
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
      // update() must stay chainable: the real call is
      // `.from('profiles').update(payload).eq('user_id', id)`, and a mock that
      // resolves at update() would make the write-back throw while the payload
      // assertion still passed.
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
          session: sessionUserId.current ? { user: { id: sessionUserId.current } } : null,
        },
      }),
    },
  },
}));

import {
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';
import { db, storage } from '../../pwa/js/storage.js';

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;
const SERVER_STARTED_AT = '2026-08-01T09:30:00.000Z';

function seedUser(id = OWNER, extra = {}) {
  localStorage.setItem('yoyo_user', JSON.stringify({ id, ...extra }));
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  rpcMock.mockReset();
  profileUpdates.length = 0;
  updateResult.error = null;
  sessionUserId.current = OWNER;
});

describe('startTrial —— 授權來源是 server', () => {
  it('成功時寫回 server 回傳的 trial_started_at，且不碰 is_pro / pro_expires_at', async () => {
    seedUser();
    rpcMock.mockResolvedValueOnce({ data: SERVER_STARTED_AT, error: null });

    const result = await db.startTrial(OWNER);

    expect(rpcMock).toHaveBeenCalledWith('start_trial');
    expect(result).toEqual({ ok: true, ownerChanged: false, trialStartedAt: SERVER_STARTED_AT });

    // 唯一被寫回 profile 的欄位。
    expect(profileUpdates).toEqual([{ trial_started_at: SERVER_STARTED_AT }]);

    const user = JSON.parse(localStorage.getItem('yoyo_user'));
    expect(user.trialStartedAt).toBe(SERVER_STARTED_AT);
    expect(user.isPro).toBeUndefined();
    expect(user.proExpiresAt).toBeUndefined();
  });

  it('冪等：重複呼叫回傳同一個時間戳，不是錯誤路徑', async () => {
    seedUser();
    rpcMock
      .mockResolvedValueOnce({ data: SERVER_STARTED_AT, error: null })
      .mockResolvedValueOnce({ data: SERVER_STARTED_AT, error: null });

    const first = await db.startTrial(OWNER);
    const second = await db.startTrial(OWNER);

    expect(first.trialStartedAt).toBe(SERVER_STARTED_AT);
    expect(second).toEqual(first);
    expect(second.ok).toBe(true);
    expect(second.ownerChanged).toBe(false);
  });

  it('client 不自行計算時間 —— 寫入的值就是 server 給的，即使那是過去的時間', async () => {
    seedUser();
    const backdated = '2020-01-01T00:00:00.000Z';
    rpcMock.mockResolvedValueOnce({ data: backdated, error: null });

    await db.startTrial(OWNER);

    expect(profileUpdates).toEqual([{ trial_started_at: backdated }]);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).trialStartedAt).toBe(backdated);
  });
});

describe('startTrial —— 失敗語意', () => {
  it('owner 不符：回報 ownerChanged 且不呼叫 RPC', async () => {
    seedUser();
    sessionUserId.current = 'owner-2';

    const result = await db.startTrial(OWNER);

    expect(result).toEqual({ ok: false, ownerChanged: true, trialStartedAt: null });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(profileUpdates).toEqual([]);
  });

  it('未登入：回報 ownerChanged 且不呼叫 RPC', async () => {
    seedUser();
    sessionUserId.current = null;

    expect(await db.startTrial(OWNER)).toEqual({ ok: false, ownerChanged: true, trialStartedAt: null });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ['RPC 回傳 error', { data: null, error: { message: 'permission denied' } }],
    ['data 不是字串', { data: { trial_started_at: SERVER_STARTED_AT }, error: null }],
    ['data 無法解析成時間', { data: 'not-a-timestamp', error: null }],
    ['data 是 null', { data: null, error: null }],
  ])('%s → ok:false、ownerChanged:false，且不寫入任何欄位', async (_label, response) => {
    seedUser();
    rpcMock.mockResolvedValueOnce(response);

    const result = await db.startTrial(OWNER);

    expect(result).toEqual({ ok: false, ownerChanged: false, trialStartedAt: null });
    expect(profileUpdates).toEqual([]);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).trialStartedAt).toBeUndefined();
  });

  it('RPC throw（離線）→ ok:false、ownerChanged:false', async () => {
    seedUser();
    rpcMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    expect(await db.startTrial(OWNER))
      .toEqual({ ok: false, ownerChanged: false, trialStartedAt: null });
    expect(profileUpdates).toEqual([]);
  });

  it('相容層寫回失敗不影響本次 session —— 本機仍記錄 server 的時間', async () => {
    seedUser();
    rpcMock.mockResolvedValueOnce({ data: SERVER_STARTED_AT, error: null });
    updateResult.error = { message: 'network' };

    const result = await db.startTrial(OWNER);

    expect(result.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('yoyo_user')).trialStartedAt).toBe(SERVER_STARTED_AT);
  });
});

describe('trial 顯示面在兩種 source 下一致', () => {
  const startedAt = new Date(Date.now() - 5 * DAY).toISOString();
  const trialEndsAt = new Date(Date.now() + 10 * DAY).toISOString();

  it('legacy：由 profile 的 trialStartedAt ＋ 15 天推導', () => {
    seedUser(OWNER, { trialStartedAt: startedAt });
    expect(storage.isTrialUser()).toBe(true);
    expect(storage.getTrialDaysRemaining()).toBe(10);
  });

  it('server：由 projection 的 trialEndsAt 推導（不再用 client 的 15 天常數）', () => {
    seedUser(OWNER, { trialStartedAt: startedAt });
    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER, isActive: true, expiresAt: null, trialEndsAt, fetchedAtMs: Date.now(),
    });

    expect(storage.isTrialUser()).toBe(true);
    expect(storage.getTrialDaysRemaining()).toBe(10);
  });

  it('同一位使用者在兩種 source 下顯示相同天數', () => {
    seedUser(OWNER, { trialStartedAt: startedAt });
    const legacyDays = storage.getTrialDaysRemaining();

    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER, isActive: true, expiresAt: null, trialEndsAt, fetchedAtMs: Date.now(),
    });

    expect(storage.getTrialDaysRemaining()).toBe(legacyDays);
  });

  it('server source 下沒有 projection → 不顯示 trial（fail closed）', () => {
    seedUser(OWNER, { trialStartedAt: startedAt });
    enableServerProEntitlementLocally();

    expect(storage.isTrialUser()).toBe(false);
    expect(storage.getTrialDaysRemaining()).toBe(0);
  });

  it('server source 下的付費 projection（無 trialEndsAt）不算 trial', () => {
    seedUser();
    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
      trialEndsAt: null,
      fetchedAtMs: Date.now(),
    });

    expect(storage.isProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(false);
    expect(storage.getTrialDaysRemaining()).toBe(0);
  });

  it('已結束的 trial 在兩種 source 下都是 false', () => {
    const expired = new Date(Date.now() - 20 * DAY).toISOString();
    seedUser(OWNER, { trialStartedAt: expired });
    expect(storage.isTrialUser()).toBe(false);

    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER,
      isActive: true,
      expiresAt: null,
      trialEndsAt: new Date(Date.now() - DAY).toISOString(),
      fetchedAtMs: Date.now(),
    });
    expect(storage.isTrialUser()).toBe(false);
  });
});

describe('legacy 迴歸：相容層讓 production 行為不變', () => {
  it('trial 開始後 isProUser() 仍為 true —— 這正是相容層存在的理由', async () => {
    seedUser();
    expect(storage.isProUser()).toBe(false);

    rpcMock.mockResolvedValueOnce({ data: new Date().toISOString(), error: null });
    await db.startTrial(OWNER);

    expect(storage.isProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(true);
  });

  it('trial 使用者不再被當成付費使用者', async () => {
    seedUser();
    rpcMock.mockResolvedValueOnce({ data: new Date().toISOString(), error: null });
    await db.startTrial(OWNER);

    // 舊實作把 is_pro/pro_expires_at 一併寫成 true，讓試用者在設定頁被顯示為
    // 「已是 Pro 用戶．有效期至 …」，試用倒數 UI 因此永遠不會出現。
    expect(storage.isPaidProUser()).toBe(false);
    expect(storage.isTrialUser()).toBe(true);
    expect(storage.getProExpiry()).toBeNull();
  });
});
