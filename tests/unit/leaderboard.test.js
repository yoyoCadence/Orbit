// @vitest-environment jsdom
/**
 * leaderboard.test.js
 *
 * 測試排行榜純函數（calcGrowthRate、isNewUser）與 renderLeaderboard DOM 渲染。
 * 環境：jsdom（需要 DOM API 支援渲染測試）
 *
 * PRO-014E2: the board reads get_leaderboard() (migration 018). Its rows carry
 * display_name, avatar_path, joined_on, is_me and is_pro, and never user_id.
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

// Supabase mock — configure per-test in beforeEach. `from` must stay unused:
// the board no longer reads leaderboard_view or any table.
const mockRpc    = vi.hoisted(() => vi.fn());
const mockFrom   = vi.hoisted(() => vi.fn());
const mockCreateSignedUrl = vi.hoisted(() => vi.fn());
const mockStorageFrom = vi.hoisted(() => vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl })));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: { rpc: mockRpc, from: mockFrom, storage: { from: mockStorageFrom } },
}));

// INFRA-110: the page treats an account as signed in when the Supabase client
// has a session stored under its default key (as the real client does).
import { SUPABASE_URL } from '../../pwa/js/config.js';
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const signIn = () => localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: 'expired', expires_at: 1 }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  calcGrowthRate,
  isNewUser,
  renderLeaderboard,
} from '../../pwa/js/pages/leaderboard.js';
import { clearLeaderboardCacheV2 } from '../../pwa/js/leaderboardPublic.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns ISO string for N days ago */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Returns ISO string for N weeks ago */
function weeksAgo(n) {
  return daysAgo(n * 7);
}

/** get_leaderboard() gives the UTC join date, e.g. '2026-11-01'. */
function joinedDaysAgo(n) {
  return daysAgo(n).slice(0, 10);
}

function makeRow(overrides = {}) {
  return {
    display_name: 'Bob',
    avatar_path:  null,
    mode:         'normal',
    total_xp:     500,
    week_xp:      100,
    streak_days:  5,
    joined_on:    joinedDaysAgo(70), // established user (>14 days)
    is_me:        false,
    is_pro:       false,
    ...overrides,
  };
}

const CACHE_KEY = 'yoyo_leaderboardCacheV2';

function effectiveDateForTest(newDayHour = 5) {
  const d = new Date();
  if (d.getHours() < newDayHour) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv');
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
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
    signIn();
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed-avatar-url' }, error: null });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('shows loading state then fallback when the RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('無法載入排行榜');
  });
});

describe('renderLeaderboard — guest (INFRA-110)', () => {
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

  it('asks a guest to sign in, without calling the RPC or showing a cached list', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ownerId: 'me',
      rows: [makeRow({ display_name: 'Cached Bob' })],
      refreshedAt: new Date().toISOString(),
      refreshDate: effectiveDateForTest(),
    }));
    await renderLeaderboard(container);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(container.querySelector('.lb-guest').textContent).toContain('登入帳號後才能看排行榜');
    expect(container.innerHTML).not.toContain('Cached Bob');
  });

  it('keeps a signed-in account whose token expired offline on its cached list', async () => {
    // getSession() would try to refresh and report no session while offline;
    // the stored session still says the account is signed in.
    signIn();
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ownerId: 'me',
      rows: [makeRow({ display_name: 'Cached Bob' })],
      refreshedAt: new Date().toISOString(),
      refreshDate: effectiveDateForTest(),
    }));
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('Cached Bob');
    expect(container.querySelector('.lb-guest')).toBeNull();
  });

  it('reads the key the app Supabase client itself stores its session under', async () => {
    // The real client (this file mocks it), so a storageKey or storage option
    // added there later would fail here instead of hiding the board.
    const { supabase } = await vi.importActual('../../pwa/js/supabase.js');
    expect(supabase.auth.storageKey).toBe(SESSION_KEY);
  });

  it('runs the query when storage cannot be read', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    mockRpc.mockResolvedValueOnce({ data: [makeRow({ display_name: 'Bob' })], error: null });
    try {
      await renderLeaderboard(container);
    } finally {
      getItem.mockRestore();
    }
    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard');
    expect(container.innerHTML).toContain('Bob');
  });
});

describe('renderLeaderboard — empty data', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    signIn();
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed-avatar-url' }, error: null });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('shows empty-state message when rows=[]', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
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
    signIn();
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed-avatar-url' }, error: null });
    mockState.user = { id: 'me', name: 'Alice', mode: 'normal' };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders user name in week tab', async () => {
    const rows = [makeRow({ display_name: 'Bob', week_xp: 200 })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('Bob');
    expect(container.innerHTML).toContain('本週XP');
  });

  it('uses same-day cache without querying Supabase again', async () => {
    const rows = [makeRow({ display_name: 'Cached Bob', week_xp: 200 })];
    const today = effectiveDateForTest();
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ownerId: 'me',
      rows,
      refreshedAt: new Date().toISOString(),
      refreshDate: today,
    }));

    await renderLeaderboard(container);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain('Cached Bob');
    expect(container.innerHTML).toContain('每日 05:00');
  });

  it('does not overwrite content when leaderboard async result resolves after navigation away', async () => {
    const pending = deferred();
    mockRpc.mockReturnValueOnce(pending.promise);
    container.dataset.route = 'leaderboard';

    const renderPromise = renderLeaderboard(container);
    expect(container.innerHTML).toContain('排行榜');

    container.dataset.route = 'home';
    container.innerHTML = '<div>Home stays here</div>';
    pending.resolve({ data: [makeRow({ display_name: 'Late Bob' })], error: null });
    await renderPromise;

    expect(container.innerHTML).toContain('Home stays here');
    expect(container.innerHTML).not.toContain('Late Bob');
  });

  it('renders signed avatar image from leaderboard avatar path', async () => {
    const rows = [makeRow({ display_name: 'Bob', avatar_path: 'user-1/avatar.png' })];
    mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://signed.example/avatar.png' }, error: null });
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });

    await renderLeaderboard(container);

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/avatar.png', 60 * 60 * 24 * 7);
    const img = container.querySelector('.lb-avatar img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://signed.example/avatar.png');
  });

  it('falls back to initial when avatar signing fails', async () => {
    const rows = [makeRow({ display_name: 'Bob', avatar_path: 'user-1/avatar.png' })];
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });

    await renderLeaderboard(container);

    expect(container.querySelector('.lb-avatar img')).toBeNull();
    expect(container.querySelector('.lb-avatar').textContent).toContain('B');
  });

  it('falls back to stale cache when Supabase refresh fails', async () => {
    const rows = [makeRow({ display_name: 'Stale Bob', week_xp: 200 })];
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ownerId: 'me',
      rows,
      refreshedAt: new Date(Date.now() - 86400000).toISOString(),
      refreshDate: '2000-01-01',
    }));
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    await renderLeaderboard(container);

    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard');
    expect(container.innerHTML).toContain('Stale Bob');
    expect(container.innerHTML).toContain('目前顯示快取資料');
  });

  it('escapes HTML in user names', async () => {
    const rows = [makeRow({ display_name: '<script>alert(1)</script>' })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('new user (< 14 days) excluded from growth tab ranking', async () => {
    const newUserRow = makeRow({
      display_name: 'Newbie',
      joined_on:    joinedDaysAgo(5),
      week_xp:      999,
      total_xp:     999,
    });
    const oldUserRow = makeRow({
      display_name: 'Veteran',
      joined_on:    joinedDaysAgo(140),
      week_xp:      50,
      total_xp:     1000,
    });
    mockRpc.mockResolvedValueOnce({ data: [newUserRow, oldUserRow], error: null });
    await renderLeaderboard(container);

    // Switch to growth tab
    const growthBtn = container.querySelector('[data-tab="growth"]');
    expect(growthBtn).not.toBeNull();
    growthBtn.click();

    // Veteran appears, Newbie does not (isNewUser → excluded)
    expect(container.innerHTML).toContain('Veteran');
    expect(container.innerHTML).not.toContain('Newbie');
  });

  it('my own row has lb-row-me class (is_me from the server)', async () => {
    const rows = [makeRow({ display_name: 'Alice', is_me: true }), makeRow({ display_name: 'Bob' })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    const myRows = container.querySelectorAll('.lb-row-me');
    expect(myRows).toHaveLength(1);
    expect(myRows[0].textContent).toContain('Alice');
    expect(myRows[0].querySelector('.lb-you')).not.toBeNull();
  });

  it('never marks a row as mine from anything but is_me', async () => {
    // A row with the caller's id (an old cache shape) is not the caller's row.
    const rows = [makeRow({ display_name: 'Bob', user_id: 'me', is_me: false })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.querySelector('.lb-row-me')).toBeNull();
  });

  it('tab switching: week → growth → week', async () => {
    const rows = [makeRow({ joined_on: joinedDaysAgo(140) })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
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
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);
    expect(container.querySelector('[data-tab="total"]')).not.toBeNull();
  });

  it('切換到累積XP tab → sub-label 顯示「累積XP」', async () => {
    const rows = [makeRow({ total_xp: 1200, week_xp: 50 })];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);

    container.querySelector('[data-tab="total"]').click();
    expect(container.innerHTML).toContain('累積XP');
    expect(container.innerHTML).toContain('1200');

    // reset to week
    container.querySelector('[data-tab="week"]').click();
  });

  it('累積XP tab 依 total_xp 降冪排列', async () => {
    const rows = [
      makeRow({ display_name: 'Low',  total_xp: 100,  week_xp: 200 }),
      makeRow({ display_name: 'High', total_xp: 5000, week_xp: 10  }),
    ];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await renderLeaderboard(container);

    container.querySelector('[data-tab="total"]').click();
    const names = [...container.querySelectorAll('.lb-name')].map(el => el.textContent.trim());
    expect(names[0]).toContain('High'); // 5000 XP ranked first
    expect(names[1]).toContain('Low');

    // reset to week
    container.querySelector('[data-tab="week"]').click();
  });
});

describe('renderLeaderboard — get_leaderboard() rows (PRO-014E2)', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    signIn();
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed-avatar-url' }, error: null });
    mockState.user = { id: 'me', name: 'Alice', mode: 'normal' };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('ignores a same-day cache of leaderboard_view rows, then drops it after a refresh', async () => {
    localStorage.setItem('yoyo_leaderboardCache', JSON.stringify({
      rows: [{ user_id: 'u1', name: 'Account Name', mode: 'normal', total_xp: 1, week_xp: 1 }],
      refreshedAt: new Date().toISOString(),
      refreshDate: effectiveDateForTest(),
    }));
    mockRpc.mockResolvedValueOnce({ data: [makeRow({ display_name: 'Public Bob' })], error: null });

    await renderLeaderboard(container);

    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard');
    expect(container.innerHTML).toContain('Public Bob');
    expect(container.innerHTML).not.toContain('Account Name');
    expect(localStorage.getItem('yoyo_leaderboardCache')).toBeNull();
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(cache.ownerId).toBe('me');
    expect(cache.refreshDate).toBe(effectiveDateForTest());
    expect(cache.rows.map(r => r.display_name)).toEqual(['Public Bob']);
  });

  it('never shows another account\'s cached rows, even from today (is_me is per caller)', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ownerId: 'someone-else',
      rows: [makeRow({ display_name: 'Their Row', is_me: true })],
      refreshedAt: new Date().toISOString(),
      refreshDate: effectiveDateForTest(),
    }));
    mockRpc.mockResolvedValueOnce({ data: [makeRow({ display_name: 'Fresh Bob' })], error: null });

    await renderLeaderboard(container);

    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard');
    expect(container.innerHTML).not.toContain('Their Row');
    expect(container.querySelector('.lb-row-me')).toBeNull();
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).ownerId).toBe('me');
  });

  it('drops an answer that arrives after the account changed: not cached, not shown', async () => {
    const pending = deferred();
    mockRpc.mockReturnValueOnce(pending.promise);
    container.dataset.route = 'leaderboard';

    const renderPromise = renderLeaderboard(container);
    // Signed out (clearAll ran) and another account signed in meanwhile.
    mockState.user = { id: 'other', name: 'Other', mode: 'normal' };
    pending.resolve({ data: [makeRow({ display_name: 'Previous Me', is_me: true })], error: null });
    await renderPromise;

    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(container.innerHTML).not.toContain('Previous Me');
  });

  it('shows, but does not cache, rows from a request that a saved name overtook', async () => {
    const pending = deferred();
    mockRpc.mockReturnValueOnce(pending.promise);
    container.dataset.route = 'leaderboard';

    const renderPromise = renderLeaderboard(container);
    clearLeaderboardCacheV2(); // settings saved a new name meanwhile
    pending.resolve({ data: [makeRow({ display_name: 'Old Name', is_me: true })], error: null });
    await renderPromise;

    expect(container.innerHTML).toContain('Old Name');
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('never reads a table or view', async () => {
    mockRpc.mockResolvedValueOnce({ data: [makeRow()], error: null });
    await renderLeaderboard(container);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('shows the initial without signing anything when avatar_path is NULL', async () => {
    mockRpc.mockResolvedValueOnce({ data: [makeRow({ display_name: 'Bob', avatar_path: null })], error: null });
    await renderLeaderboard(container);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(container.querySelector('.lb-avatar img')).toBeNull();
    expect(container.querySelector('.lb-avatar').textContent.trim()).toBe('B');
  });

  it('keeps a character outside the BMP whole in the initial', async () => {
    mockRpc.mockResolvedValueOnce({ data: [makeRow({ display_name: '🐢慢慢來' })], error: null });
    await renderLeaderboard(container);
    expect(container.querySelector('.lb-avatar').textContent.trim()).toBe('🐢');
  });

  it('lists only rows in the viewer\'s own mode', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [makeRow({ display_name: 'Normal Bob' }), makeRow({ display_name: 'Advanced Eve', mode: 'advanced' })],
      error: null,
    });
    await renderLeaderboard(container);
    expect(container.innerHTML).toContain('Normal Bob');
    expect(container.innerHTML).not.toContain('Advanced Eve');
  });

  it('ranks the week tab by week_xp', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [makeRow({ display_name: 'Slow', week_xp: 10 }), makeRow({ display_name: 'Fast', week_xp: 300 })],
      error: null,
    });
    await renderLeaderboard(container);
    const names = [...container.querySelectorAll('.lb-name')].map(el => el.textContent.trim());
    expect(names).toEqual(['Fast', 'Slow']);
  });
});
