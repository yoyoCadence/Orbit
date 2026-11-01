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
