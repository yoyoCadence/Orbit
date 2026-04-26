/**
 * leaderboard.test.js
 *
 * 測試排行榜純函數（calcGrowthRate、isNewUser）與 renderLeaderboard DOM 渲染。
 * 環境：jsdom（需要 DOM API 支援渲染測試）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks（必須在 import 目標模組前 hoisted）──────────────────────────

const mockState = vi.hoisted(() => ({
  user: { id: 'me', name: 'Alice', mode: 'normal' },
  tasks: [],
  sessions: [],
}));

vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));

// Mock getLevelInfo so leaderboard tests don't depend on engine.js formula details
vi.mock('../../pwa/js/leveling.js', () => ({
  getLevelInfo: vi.fn(() => ({ level: 5, currentXP: 0, needed: 200, percent: 0, totalXP: 0 })),
}));

// Supabase mock — configure per-test in beforeEach
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom   = vi.hoisted(() => vi.fn(() => ({ select: mockSelect })));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  calcGrowthRate,
  isNewUser,
  renderLeaderboard,
} from '../../pwa/js/pages/leaderboard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns ISO string for N days ago */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Returns ISO string for N weeks ago */
function weeksAgo(n) {
  return daysAgo(n * 7);
}

function makeRow(overrides = {}) {
  return {
    user_id:     'user-1',
    name:        'Bob',
    mode:        'normal',
    total_xp:    500,
    week_xp:     100,
    streak_days: 5,
    created_at:  weeksAgo(10), // established user (>14 days)
    ...overrides,
  };
}

// ─── calcGrowthRate ───────────────────────────────────────────────────────────

describe('calcGrowthRate', () => {
  it('totalXP=0, weekXP=0 → null (avgWeekXP < 1)', () => {
    expect(calcGrowthRate(0, 0, weeksAgo(4))).toBeNull();
  });

  it('very low totalXP → null (avgWeekXP < 1 threshold)', () => {
    // weeksActive ≥ 1, totalXP=0 → avgWeekXP=0 < 1
    expect(calcGrowthRate(0, 50, weeksAgo(10))).toBeNull();
  });

  it('just created (createdAt=now), totalXP=100, weekXP=100 → 100%', () => {
    // weeksActive = max(1, ~0) = 1 → avgWeekXP = 100/1 = 100 → 100%
    const rate = calcGrowthRate(100, 100, new Date().toISOString());
    expect(rate).toBe(100);
  });

  it('totalXP=500, weekXP=100, active ~10 weeks → avgWeekXP=50 → 200%', () => {
    // weeksActive ≈ 10 → avgWeekXP ≈ 50 → rate ≈ 200
    const rate = calcGrowthRate(500, 100, weeksAgo(10));
    expect(rate).toBeGreaterThan(180); // allow slight rounding
    expect(rate).toBeLessThanOrEqual(200);
  });

  it('weekXP=0 (this week did nothing) → rate=0%', () => {
    const rate = calcGrowthRate(1000, 0, weeksAgo(10));
    expect(rate).toBe(0);
  });

  it('invalid createdAt string → does not throw (NaN handled by max(1, NaN)=1)', () => {
    expect(() => calcGrowthRate(100, 50, 'not-a-date')).not.toThrow();
  });

  it('weekXP > totalXP (data anomaly) → does not throw, returns a number', () => {
    const result = calcGrowthRate(100, 999, weeksAgo(10));
    expect(typeof result === 'number' || result === null).toBe(true);
  });
});

// ─── isNewUser ────────────────────────────────────────────────────────────────

describe('isNewUser', () => {
  it('createdAt=today → true (days ≈ 0 < 14)', () => {
    expect(isNewUser(new Date().toISOString())).toBe(true);
  });

  it('createdAt=13 days ago → true', () => {
    expect(isNewUser(daysAgo(13))).toBe(true);
  });

  it('createdAt=14 days ago → false (exactly 14 days, not <14)', () => {
    // days = 14.something → not < 14
    expect(isNewUser(daysAgo(14.1))).toBe(false);
  });

  it('createdAt=30 days ago → false', () => {
    expect(isNewUser(daysAgo(30))).toBe(false);
  });

  it('invalid createdAt string → does not throw', () => {
    expect(() => isNewUser('invalid')).not.toThrow();
  });
});

// ─── renderLeaderboard ────────────────────────────────────────────────────────

describe('renderLeaderboard — Supabase error', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('shows loading state then fallback when Supabase throws', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('無法載入排行榜');
  });
});

describe('renderLeaderboard — empty data', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('shows empty-state message when rows=[]', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('目前還沒有公開用戶');
  });
});

describe('renderLeaderboard — with data', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    vi.clearAllMocks();
    mockState.user = { id: 'me', name: 'Alice', mode: 'normal' };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders user name in week tab', async () => {
    const rows = [makeRow({ user_id: 'user-1', name: 'Bob', week_xp: 200 })];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('Bob');
    expect(container.innerHTML).toContain('本週XP');
  });

  it('uses same-day cache without querying Supabase again', async () => {
    const rows = [makeRow({ user_id: 'user-1', name: 'Cached Bob', week_xp: 200 })];
    const today = new Date().toLocaleDateString('sv');
    localStorage.setItem('yoyo_leaderboardCache', JSON.stringify({
      rows,
      refreshedAt: new Date().toISOString(),
      refreshDate: today,
    }));

    await renderLeaderboard(container);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain('Cached Bob');
    expect(container.innerHTML).toContain('每日 05:00');
  });

  it('falls back to stale cache when Supabase refresh fails', async () => {
    const rows = [makeRow({ user_id: 'user-1', name: 'Stale Bob', week_xp: 200 })];
    localStorage.setItem('yoyo_leaderboardCache', JSON.stringify({
      rows,
      refreshedAt: new Date(Date.now() - 86400000).toISOString(),
      refreshDate: '2000-01-01',
    }));
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    await renderLeaderboard(container);

    expect(mockFrom).toHaveBeenCalledWith('leaderboard_view');
    expect(container.innerHTML).toContain('Stale Bob');
    expect(container.innerHTML).toContain('目前顯示快取資料');
  });

  it('escapes HTML in user names', async () => {
    const rows = [makeRow({ name: '<script>alert(1)</script>' })];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('new user (< 14 days) excluded from growth tab ranking', async () => {
    const newUserRow = makeRow({
      user_id:    'new-1',
      name:       'Newbie',
      created_at: daysAgo(5),
      week_xp:    999,
      total_xp:   999,
    });
    const oldUserRow = makeRow({
      user_id:    'old-1',
      name:       'Veteran',
      created_at: weeksAgo(20),
      week_xp:    50,
      total_xp:   1000,
    });
    mockSelect.mockResolvedValueOnce({ data: [newUserRow, oldUserRow], error: null });
    await renderLeaderboard(container);

    // Switch to growth tab
    const growthBtn = container.querySelector('[data-tab="growth"]');
    expect(growthBtn).not.toBeNull();
    growthBtn.click();

    // Veteran appears, Newbie does not (isNewUser → excluded)
    expect(container.innerHTML).toContain('Veteran');
    expect(container.innerHTML).not.toContain('Newbie');
  });

  it('my own row has lb-row-me class', async () => {
    const rows = [makeRow({ user_id: 'me', name: 'Alice' })];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    const myRow = container.querySelector('.lb-row-me');
    expect(myRow).not.toBeNull();
  });

  it('tab switching: week → growth → week', async () => {
    const rows = [makeRow({ created_at: weeksAgo(20) })];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);

    // Click growth tab
    container.querySelector('[data-tab="growth"]').click();
    expect(container.innerHTML).toContain('成長率');

    // Click week tab
    container.querySelector('[data-tab="week"]').click();
    expect(container.innerHTML).toContain('本週XP');
  });

  it('累積XP tab button exists', async () => {
    const rows = [makeRow()];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.querySelector('[data-tab="total"]')).not.toBeNull();
  });

  it('切換到累積XP tab → sub-label 顯示「累積XP」', async () => {
    const rows = [makeRow({ total_xp: 1200, week_xp: 50 })];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);

    container.querySelector('[data-tab="total"]').click();
    expect(container.innerHTML).toContain('累積XP');
    expect(container.innerHTML).toContain('1200');

    // reset to week
    container.querySelector('[data-tab="week"]').click();
  });

  it('累積XP tab 依 total_xp 降冪排列', async () => {
    const rows = [
      makeRow({ user_id: 'low',  name: 'Low',  total_xp: 100,  week_xp: 200 }),
      makeRow({ user_id: 'high', name: 'High', total_xp: 5000, week_xp: 10  }),
    ];
    mockSelect.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);

    container.querySelector('[data-tab="total"]').click();
    const names = [...container.querySelectorAll('.lb-name')].map(el => el.textContent.trim());
    expect(names[0]).toContain('High'); // 5000 XP ranked first
    expect(names[1]).toContain('Low');

    // reset to week
    container.querySelector('[data-tab="week"]').click();
  });
});
