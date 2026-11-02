/**
 * pro014pRollover.test.js — PRO-014P：換日處理不把「Pro 狀態不明」當成「不是 Pro」，
 * 以及 BUG-115：保護卡 offer 屬於寫入它的帳號。
 *
 * 提案：docs/pro-014p-day-rollover-entitlement.md（方案 D，2026-11-01 核准）。
 *
 * 第一段是 `legacy` source 的特性測試：在重構前的程式碼上寫好、通過，重構後
 * 不改一字仍須通過。它鎖住 production 目前的換日結果（補卡、offer、SUB-16、
 * 連勝、`lastStreakDate`）。
 *
 * 環境：jsdom；真實的 storage／proEntitlement／dayCycle，只 mock 網路與畫面。
 */
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
    from: () => {
      const self = {
        select: () => self,
        eq: () => self,
        upsert: () => Promise.resolve({ error: null }),
        update: () => Promise.resolve({ error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'owner-1' } } } }),
    },
  },
}));
vi.mock('../../pwa/js/router.js', () => ({ renderPage: vi.fn(), currentHash: () => 'home' }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({
  showToast: toastMock,
  showXPFloat: vi.fn(),
  showSyncBanner: vi.fn(),
  showLevelUp: vi.fn(),
}));

import { FLAG_SHIELD_PENDING, FLAG_STREAK_UNLOCK_NEW } from '../../pwa/js/flags.js';
import { resetProEntitlementStorageState } from '../../pwa/js/platform/proEntitlement.js';
import { state } from '../../pwa/js/state.js';
import { processYesterdayStreak, eToday } from '../../pwa/js/dayCycle.js';

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  const d = new Date(`${eToday()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv');
}

const thisMonth = () => eToday().slice(0, 7);

/** Seeds the stored and in-memory user identically, as a cached boot does. */
function seedUser(fields) {
  const user = { id: OWNER, newDayHour: 5, ...fields };
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  state.user = { ...user };
  state.sessions = [];
}

const legacyPro = { isPro: true, proExpiresAt: null };
const legacyFree = { isPro: false, proExpiresAt: null, trialStartedAt: null };

function offer() {
  const raw = localStorage.getItem(FLAG_SHIELD_PENDING);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetProEntitlementStorageState();
  rpcMock.mockReset();
  toastMock.mockReset();
});

// ─── 1. legacy 特性測試（重構前寫好） ─────────────────────────────────────────

describe('legacy source：換日結果與重構前相同', () => {
  it('Pro、漏一天：連勝歸零、提供 offer、推進 lastStreakDate', () => {
    seedUser({ ...legacyPro, streakDays: 10, lastStreakDate: daysAgo(2),
      streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(0);
    expect(offer()?.prevStreak).toBe(10);
    expect(state.user.streakShieldCount).toBe(2);
    expect(state.user.lastStreakDate).toBe(eToday());
    expect(JSON.parse(localStorage.getItem('yoyo_user')).lastStreakDate).toBe(eToday());
  });

  it('Pro、月份變了：先補滿保護卡，offer 依補滿後的張數判斷', () => {
    seedUser({ ...legacyPro, streakDays: 5, lastStreakDate: daysAgo(3),
      streakShieldCount: 0, streakShieldResetMonth: '2000-01' });
    processYesterdayStreak();
    expect(state.user.streakShieldCount).toBe(2);
    expect(state.user.streakShieldResetMonth).toBe(thisMonth());
    expect(offer()?.prevStreak).toBe(5);
  });

  it('Pro、保護卡用完（同月）：沒有 offer', () => {
    seedUser({ ...legacyPro, streakDays: 10, lastStreakDate: daysAgo(2),
      streakShieldCount: 0, streakShieldResetMonth: thisMonth() });
    processYesterdayStreak();
    expect(offer()).toBeNull();
    expect(state.user.streakShieldCount).toBe(0);
  });

  it('Pro、歸零前連勝不到 2 天：沒有 offer', () => {
    seedUser({ ...legacyPro, streakDays: 1, lastStreakDate: daysAgo(2),
      streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(0);
    expect(offer()).toBeNull();
  });

  it('非 Pro：照常歸零，不補卡、沒有 offer', () => {
    seedUser({ ...legacyFree, streakDays: 10, lastStreakDate: daysAgo(2),
      streakShieldCount: 0, streakShieldResetMonth: '2000-01' });
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(0);
    expect(state.user.streakShieldCount).toBe(0);
    expect(state.user.streakShieldResetMonth).toBe('2000-01');
    expect(offer()).toBeNull();
  });

  it('昨天有啟動但不是有效日：連勝歸零（與 Pro 無關），沒有 offer', () => {
    seedUser({ ...legacyPro, streakDays: 7, lastStreakDate: daysAgo(1),
      streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(0);
    expect(offer()).toBeNull();
    expect(state.user.lastStreakDate).toBe(eToday());
  });

  it('同一天第二次：不再處理', () => {
    seedUser({ ...legacyPro, streakDays: 10, lastStreakDate: eToday(),
      streakShieldCount: 2, streakShieldResetMonth: '2000-01' });
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(10);
    expect(state.user.streakShieldResetMonth).toBe('2000-01');
  });

  it('SUB-16：非 Pro、連勝 45 天、未用過 → 發放並消耗', () => {
    seedUser({ ...legacyFree, streakDays: 45, streakUnlockUsed: false });
    const before = Date.now();
    processYesterdayStreak();
    expect(state.user.isPro).toBe(true);
    expect(Date.parse(state.user.proExpiresAt)).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(state.user.streakUnlockUsed).toBe(true);
    expect(sessionStorage.getItem(FLAG_STREAK_UNLOCK_NEW)).toBe('1');
  });

  it('SUB-16：已是 Pro 或已用過 → 不發放', () => {
    seedUser({ ...legacyPro, streakDays: 45, streakUnlockUsed: false });
    processYesterdayStreak();
    expect(state.user.streakUnlockUsed).toBe(false);
    expect(state.user.proExpiresAt).toBeNull();

    sessionStorage.clear();
    seedUser({ ...legacyFree, streakDays: 45, streakUnlockUsed: true, lastStreakDate: undefined });
    processYesterdayStreak();
    expect(state.user.isPro).toBe(false);
    expect(sessionStorage.getItem(FLAG_STREAK_UNLOCK_NEW)).toBeNull();
  });
});

// ─── 2. 狀態判斷：pro／not-pro／unknown ──────────────────────────────────────

const { db, storage } = await import('../../pwa/js/storage.js');
const {
  enableServerProEntitlementLocally,
  isProFromSnapshot,
  writeProEntitlementSnapshot,
} = await import('../../pwa/js/platform/proEntitlement.js');
const {
  PRO_ROLLOVER_PENDING_KEY,
  PRO_STATUS_UNKNOWN_MESSAGE,
  getProStatusFromSnapshot,
  getProRolloverStatus,
  readPendingProRollover,
  readShieldOffer,
  recordPendingProRollover,
  resolvePendingProRollover,
} = await import('../../pwa/js/proRollover.js');
const { FLAG_PRO_ENTITLEMENT } = await import('../../pwa/js/flags.js');

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

function snapshot(fields) {
  localStorage.setItem(FLAG_PRO_ENTITLEMENT, JSON.stringify({
    ownerId: OWNER, isActive: true, expiresAt: null, trialEndsAt: null, fetchedAtMs: NOW - 60_000, ...fields,
  }));
}

describe('getProStatusFromSnapshot()', () => {
  const cases = [
    ['剛取得的終身 Pro', {}, 'pro'],
    ['剛取得、付費未到期', { expiresAt: iso(NOW + DAY) }, 'pro'],
    ['剛取得、server 說不是 Pro', { isActive: false }, 'not-pro'],
    ['取得時就已過期', { expiresAt: iso(NOW - 3 * 60_000), fetchedAtMs: NOW - 60_000 }, 'not-pro'],
    ['取得後才到期（可能已續約）', { expiresAt: iso(NOW - 30_000), fetchedAtMs: NOW - 60_000 }, 'unknown'],
    ['試用在取得後才結束', { trialEndsAt: iso(NOW - 30_000), fetchedAtMs: NOW - 60_000 }, 'unknown'],
    ['超過 24 小時', { fetchedAtMs: NOW - DAY - 1 }, 'unknown'],
    ['時鐘倒退', { fetchedAtMs: NOW + DAY + 60_000 }, 'unknown'],
    ['別的帳號的 snapshot', { ownerId: 'someone-else' }, 'unknown'],
  ];

  it.each(cases)('%s → %s', (_label, fields, expected) => {
    snapshot(fields);
    expect(getProStatusFromSnapshot(OWNER, NOW)).toBe(expected);
    // `pro` 與 isProFromSnapshot() 永遠一致。
    expect(isProFromSnapshot(OWNER, NOW)).toBe(expected === 'pro');
  });

  it('沒有 snapshot、沒有 owner（訪客或已登出）→ unknown', () => {
    expect(getProStatusFromSnapshot(OWNER, NOW)).toBe('unknown');
    snapshot({});
    expect(getProStatusFromSnapshot(null, NOW)).toBe('unknown');
  });

  it('snapshot 寫入失敗後（latch）→ unknown', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    try {
      writeProEntitlementSnapshot({ ownerId: OWNER, isActive: true, fetchedAtMs: NOW });
    } finally {
      Storage.prototype.setItem = setItem;
    }
    // 沒有 latch 時這份 snapshot 會判為 not-pro；latch 讓它變成 unknown。
    snapshot({ isActive: false });
    expect(getProStatusFromSnapshot(OWNER, NOW)).toBe('unknown');
  });

  it('legacy source 永遠已知：依 isProUser()', () => {
    seedUser(legacyPro);
    expect(getProRolloverStatus(OWNER)).toBe('pro');
    seedUser(legacyFree);
    expect(getProRolloverStatus(OWNER)).toBe('not-pro');
  });
});

// ─── 3. server source 的換日與補做 ────────────────────────────────────────────

function staleSnapshot(fields = {}) {
  snapshot({ fetchedAtMs: NOW - DAY - 60_000, ...fields });
}

function proRefresh() {
  rpcMock.mockResolvedValueOnce({ data: [{ is_active: true, expires_at: null, trial_ends_at: null }], error: null, status: 200 });
  return db.refreshProEntitlement(OWNER);
}

function notProRefresh() {
  rpcMock.mockResolvedValueOnce({ data: [{ is_active: false, expires_at: null, trial_ends_at: null }], error: null, status: 200 });
  return db.refreshProEntitlement(OWNER);
}

describe('server source：狀態不明時的換日', () => {
  beforeEach(() => enableServerProEntitlementLocally());

  it('提案 §3：snapshot 剛取得時給 offer', () => {
    seedUser({ streakDays: 10, lastStreakDate: daysAgo(2), streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    snapshot({});
    processYesterdayStreak();
    expect(offer()).toEqual({ ownerId: OWNER, prevStreak: 10 });
    expect(localStorage.getItem(PRO_ROLLOVER_PENDING_KEY)).toBeNull();
  });

  it('提案 §3：snapshot 過期 → 連勝照常歸零、記錄待補做；refresh 後補上 offer', async () => {
    seedUser({ streakDays: 10, lastStreakDate: daysAgo(2), streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    staleSnapshot();
    processYesterdayStreak();
    expect(state.user.streakDays).toBe(0);
    expect(state.user.lastStreakDate).toBe(eToday());
    expect(offer()).toBeNull();
    expect(readPendingProRollover()).toEqual({ ownerId: OWNER, prevStreak: 10 });

    await proRefresh();
    expect(resolvePendingProRollover()).toBe(true);
    expect(offer()).toEqual({ ownerId: OWNER, prevStreak: 10 });
    expect(readPendingProRollover()).toBeNull();
    // 只補一次
    localStorage.removeItem(FLAG_SHIELD_PENDING);
    expect(resolvePendingProRollover()).toBe(false);
    expect(offer()).toBeNull();
  });

  it('狀態不明：不補卡，refresh 後補滿；沒有歸零的換日也記錄', async () => {
    seedUser({ streakDays: 3, lastStreakDate: daysAgo(1), streakShieldCount: 0, streakShieldResetMonth: '2000-01' });
    staleSnapshot();
    processYesterdayStreak();
    expect(state.user.streakShieldCount).toBe(0);
    expect(readPendingProRollover()).toEqual({ ownerId: OWNER, prevStreak: null });

    await proRefresh();
    resolvePendingProRollover();
    expect(state.user.streakShieldCount).toBe(2);
    expect(state.user.streakShieldResetMonth).toBe(thisMonth());
    expect(JSON.parse(localStorage.getItem('yoyo_user')).streakShieldCount).toBe(2);
  });

  it('refresh 說不是 Pro：清除紀錄，沒有 offer、不補卡', async () => {
    seedUser({ streakDays: 10, lastStreakDate: daysAgo(2), streakShieldCount: 2, streakShieldResetMonth: '2000-01' });
    staleSnapshot();
    processYesterdayStreak();
    await notProRefresh();
    expect(resolvePendingProRollover()).toBe(true);
    expect(offer()).toBeNull();
    expect(state.user.streakShieldResetMonth).toBe('2000-01');
    expect(readPendingProRollover()).toBeNull();
  });

  it('refresh 失敗（仍不明）：紀錄保留', async () => {
    seedUser({ streakDays: 10, lastStreakDate: daysAgo(2), streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    staleSnapshot();
    processYesterdayStreak();
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    await db.refreshProEntitlement(OWNER);
    expect(resolvePendingProRollover()).toBe(false);
    expect(readPendingProRollover()).toEqual({ ownerId: OWNER, prevStreak: 10 });
  });

  it('SUB-16：狀態不明時不發放、不消耗；狀態已知為非 Pro 時照常', async () => {
    seedUser({ streakDays: 45, streakUnlockUsed: false });
    staleSnapshot();
    processYesterdayStreak();
    expect(state.user.streakUnlockUsed).toBe(false);
    expect(state.user.isPro).toBeUndefined();
    expect(sessionStorage.getItem(FLAG_STREAK_UNLOCK_NEW)).toBeNull();

    await notProRefresh();
    state.user.lastStreakDate = undefined;           // 下一次換日，狀態已知為非 Pro
    processYesterdayStreak();
    expect(state.user.streakUnlockUsed).toBe(true);
  });

  it('SUB-16：snapshot 過期的付費使用者不會用掉一次性解鎖', () => {
    seedUser({ streakDays: 50, streakUnlockUsed: false, isPro: true, proExpiresAt: null });
    staleSnapshot();
    processYesterdayStreak();
    expect(state.user.streakUnlockUsed).toBe(false);
    expect(state.user.proExpiresAt).toBeNull();
  });

  it('跨日：第一天不明、第二天才確認 → 第一天的待補做補上，連勝照常評估', async () => {
    seedUser({ streakDays: 10, lastStreakDate: daysAgo(2), streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    staleSnapshot();
    processYesterdayStreak();                       // 「第一天」：不明，歸零並記錄
    expect(readPendingProRollover()?.prevStreak).toBe(10);

    state.user.lastStreakDate = daysAgo(1);          // 模擬隔天：昨天（第一天）有啟動
    state.sessions = [                               // 第一天是有效日
      { date: daysAgo(1), isProductiveXP: true, finalXP: 60, impactType: 'task', value: 'A', result: 'valid' },
    ];
    await proRefresh();
    processYesterdayStreak();                       // 「第二天」：先補做，再照常評估昨天
    expect(offer()).toEqual({ ownerId: OWNER, prevStreak: 10 });
    expect(state.user.lastStreakDate).toBe(eToday());
    expect(state.user.streakDays).toBe(1);          // 第一天的 Sessions 被評估：有效，連勝延續
    expect(readPendingProRollover()).toBeNull();
  });
});

describe('待補做紀錄', () => {
  beforeEach(() => enableServerProEntitlementLocally());

  it('同一個 owner：可得 offer 的歸零才取代；其他換日保留', () => {
    recordPendingProRollover(OWNER, 10);
    recordPendingProRollover(OWNER, null);
    expect(readPendingProRollover()?.prevStreak).toBe(10);
    recordPendingProRollover(OWNER, 1);
    expect(readPendingProRollover()?.prevStreak).toBe(10);
    recordPendingProRollover(OWNER, 4);
    expect(readPendingProRollover()?.prevStreak).toBe(4);
  });

  it('不同 owner：整筆取代，不繼承 prevStreak', () => {
    recordPendingProRollover('owner-a', 30);
    recordPendingProRollover('owner-b', null);
    expect(readPendingProRollover()).toEqual({ ownerId: 'owner-b', prevStreak: null });
  });

  it('owner 不符：不補做、不刪除（原 owner 回來時仍可補做）', async () => {
    recordPendingProRollover('owner-a', 30);
    seedUser({ streakShieldCount: 2, streakShieldResetMonth: thisMonth() });
    await proRefresh();
    expect(resolvePendingProRollover()).toBe(false);
    expect(readPendingProRollover()).toEqual({ ownerId: 'owner-a', prevStreak: 30 });
    expect(offer()).toBeNull();
  });

  it('登出（clearAll）不刪除紀錄', () => {
    recordPendingProRollover(OWNER, 10);
    storage.clearAll();
    expect(readPendingProRollover()).toEqual({ ownerId: OWNER, prevStreak: 10 });
  });

  it('legacy source 永遠不寫紀錄', () => {
    localStorage.removeItem('orbit_pro_entitlement_source');
    seedUser({ ...legacyFree, streakDays: 10, lastStreakDate: daysAgo(2) });
    processYesterdayStreak();
    expect(localStorage.getItem(PRO_ROLLOVER_PENDING_KEY)).toBeNull();
  });
});

// ─── 4. refresh：暫時性失敗不刪 snapshot ──────────────────────────────────────

describe('refreshProEntitlement()：暫時性失敗保留 snapshot', () => {
  beforeEach(async () => {
    enableServerProEntitlementLocally();
    seedUser({});
    await proRefresh();
    expect(storage.isProUser()).toBe(true);
  });

  it.each([
    ['網路失敗（status 0）', { status: 0, error: { message: 'TypeError: Failed to fetch' } }],
    ['408', { status: 408, error: { message: 'timeout' } }],
    ['429', { status: 429, error: { message: 'too many' } }],
    ['503', { status: 503, error: { message: 'unavailable' } }],
    ['JWT 錯誤 PGRST301', { status: 401, error: { code: 'PGRST301', message: 'JWT invalid' } }],
    ['JWT 錯誤 PGRST303', { status: 401, error: { code: 'PGRST303', message: 'JWT expired' } }],
  ])('%s：保留', async (_label, response) => {
    rpcMock.mockResolvedValueOnce({ data: null, ...response });
    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(storage.isProUser()).toBe(true);
  });

  it.each([
    ['401', { status: 401, error: { code: '42501', message: 'permission denied' } }],
    ['403', { status: 403, error: { code: '42501', message: 'forbidden' } }],
    ['RPC 不存在', { status: 404, error: { code: 'PGRST202', message: 'not found' } }],
  ])('%s：清除', async (_label, response) => {
    rpcMock.mockResolvedValueOnce({ data: null, ...response });
    await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
    expect(storage.isProUser()).toBe(false);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });
});

// ─── 5. BUG-115：保護卡 offer 屬於寫入它的帳號 ────────────────────────────────

describe('BUG-115：保護卡 offer 屬於寫入它的帳號', () => {
  it('另一個帳號看不到、也用不了', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId: 'owner-a', prevStreak: 30 }));
    seedUser({ ...legacyPro, id: 'owner-b', streakDays: 2, streakShieldCount: 2 });
    expect(readShieldOffer('owner-b')).toBeNull();
    window.useStreakShield();
    expect(state.user.streakDays).toBe(2);
    expect(state.user.streakShieldCount).toBe(2);
    expect(readShieldOffer('owner-a')).toEqual({ ownerId: 'owner-a', prevStreak: 30 });
  });

  it('寫入者本人可使用，用完即刪除', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId: OWNER, prevStreak: 12 }));
    seedUser({ ...legacyPro, streakDays: 0, streakShieldCount: 2 });
    window.useStreakShield();
    expect(state.user.streakDays).toBe(12);
    expect(state.user.streakShieldCount).toBe(1);
    expect(offer()).toBeNull();
  });

  it('登出後仍保留自己的 offer，重新登入可用', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId: OWNER, prevStreak: 12 }));
    storage.clearAll();
    expect(readShieldOffer(OWNER)).toEqual({ ownerId: OWNER, prevStreak: 12 });
  });

  it('升級前、沒有 owner 的 offer：登入中照常可用，登出時刪除', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ prevStreak: 8 }));
    expect(readShieldOffer(OWNER)).toEqual({ prevStreak: 8 });
    storage.clearAll();
    expect(localStorage.getItem(FLAG_SHIELD_PENDING)).toBeNull();
  });

  it('無法解析的 offer：看不到，登出時刪除', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, '{not json');
    expect(readShieldOffer(OWNER)).toBeNull();
    storage.clearAll();
    expect(localStorage.getItem(FLAG_SHIELD_PENDING)).toBeNull();
  });
});

// ─── 6. 使用保護卡：狀態不明時說明 ────────────────────────────────────────────

describe('useStreakShield()：狀態不明時顯示提示', () => {
  it('server source、snapshot 過期：提示，不改連勝', () => {
    enableServerProEntitlementLocally();
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId: OWNER, prevStreak: 12 }));
    seedUser({ streakDays: 0, streakShieldCount: 2 });
    staleSnapshot();
    window.useStreakShield();
    expect(toastMock).toHaveBeenCalledWith(PRO_STATUS_UNKNOWN_MESSAGE);
    expect(PRO_STATUS_UNKNOWN_MESSAGE).toBe('目前無法確認 Pro 狀態，連線後再試一次');
    expect(state.user.streakDays).toBe(0);
    expect(offer()).not.toBeNull();
  });

  it('已知不是 Pro：維持沒有提示', () => {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId: OWNER, prevStreak: 12 }));
    seedUser({ ...legacyFree, streakDays: 0, streakShieldCount: 2 });
    window.useStreakShield();
    expect(toastMock).not.toHaveBeenCalled();
    expect(state.user.streakDays).toBe(0);
  });
});
