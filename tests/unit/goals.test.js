/**
 * goals.test.js
 *
 * 測試 renderGoals 的 DOM 渲染邏輯：
 * - session 分組顯示
 * - XP / 精力顯示邏輯
 * - result icon 對應
 * - XSS 防護
 * 環境：jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  sessions: [],
}));

const mockStorage = vi.hoisted(() => ({
  isProUser:  vi.fn(() => false),
  isTrialUser: vi.fn(() => false),
}));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: {
      getSession:        vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

vi.mock('../../pwa/js/state.js',   () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage, db: {} }));

vi.mock('../../pwa/js/utils.js', () => ({
  today:      () => '2026-04-16',
  formatTime: () => '10:00',
  formatDate: (d) => {
    if (d === '2026-04-16') return '今天';
    if (d === '2026-04-15') return '昨天';
    return d;
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { renderGoals } from '../../pwa/js/pages/goals.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id:              's-1',
    taskId:          'task-1',
    taskName:        '深度學習',
    date:            '2026-04-16',
    completedAt:     '2026-04-16T10:00:00Z',
    result:          'complete',
    finalXP:         40,
    energyGain:      0,
    durationMinutes: 30,
    impactType:      'task',
    value:           'A',
    isProductiveXP:  true,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let container;

beforeEach(() => {
  mockState.sessions = [];
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.removeChild(container);
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('renderGoals — 無 session', () => {
  it('顯示 .empty-state', () => {
    renderGoals(container);
    expect(container.querySelector('.empty-state')).not.toBeNull();
  });

  it('不顯示任何 .date-group', () => {
    renderGoals(container);
    expect(container.querySelectorAll('.date-group').length).toBe(0);
  });
});

// ─── Session 分組 ─────────────────────────────────────────────────────────────

describe('renderGoals — 分組', () => {
  it('兩筆不同日 session → 兩個 .date-group', () => {
    mockState.sessions = [
      makeSession({ id: 's-1', date: '2026-04-16' }),
      makeSession({ id: 's-2', date: '2026-04-15' }),
    ];
    renderGoals(container);
    expect(container.querySelectorAll('.date-group').length).toBe(2);
  });

  it('同日兩筆 session → 一個 .date-group', () => {
    mockState.sessions = [
      makeSession({ id: 's-1', date: '2026-04-16' }),
      makeSession({ id: 's-2', date: '2026-04-16', taskName: '運動' }),
    ];
    renderGoals(container);
    expect(container.querySelectorAll('.date-group').length).toBe(1);
  });
});

// ─── Result icon ──────────────────────────────────────────────────────────────

describe('renderGoals — result icon', () => {
  it('result=instant → 顯示「✓」icon', () => {
    mockState.sessions = [makeSession({ result: 'instant' })];
    renderGoals(container);
    const icon = container.querySelector('.log-result-icon');
    expect(icon.textContent).toBe('✓');
  });

  it('result=complete → 顯示「✅」icon', () => {
    mockState.sessions = [makeSession({ result: 'complete' })];
    renderGoals(container);
    expect(container.querySelector('.log-result-icon').textContent).toBe('✅');
  });

  it('result=invalid → 顯示「❌」icon', () => {
    mockState.sessions = [makeSession({ result: 'invalid', finalXP: 0, isProductiveXP: false })];
    renderGoals(container);
    expect(container.querySelector('.log-result-icon').textContent).toBe('❌');
  });
});

// ─── XP 顯示邏輯 ──────────────────────────────────────────────────────────────

describe('renderGoals — .log-xp 顯示', () => {
  it('finalXP > 0 → 顯示「+N XP」', () => {
    mockState.sessions = [makeSession({ finalXP: 37, energyGain: 0 })];
    renderGoals(container);
    expect(container.querySelector('.log-xp').textContent.trim()).toBe('+37 XP');
  });

  it('finalXP=0, energyGain=10 → 顯示「+10 ⚡」', () => {
    mockState.sessions = [makeSession({ finalXP: 0, energyGain: 10, result: 'instant' })];
    renderGoals(container);
    expect(container.querySelector('.log-xp').textContent.trim()).toBe('+10 ⚡');
  });

  it('result=invalid, finalXP=0, energyGain=0 → 顯示「0 XP」', () => {
    mockState.sessions = [makeSession({ finalXP: 0, energyGain: 0, result: 'invalid', isProductiveXP: false })];
    renderGoals(container);
    expect(container.querySelector('.log-xp').textContent.trim()).toBe('0 XP');
  });

  it('result=instant, finalXP=0, energyGain=0 → 顯示空字串', () => {
    mockState.sessions = [makeSession({ finalXP: 0, energyGain: 0, result: 'instant' })];
    renderGoals(container);
    expect(container.querySelector('.log-xp').textContent.trim()).toBe('');
  });
});

// ─── 分鐘數顯示 ───────────────────────────────────────────────────────────────

describe('renderGoals — 分鐘數', () => {
  it('durationMinutes=30 → 顯示「· 30m」', () => {
    mockState.sessions = [makeSession({ durationMinutes: 30 })];
    renderGoals(container);
    expect(container.querySelector('.log-time').textContent).toContain('30m');
  });

  it('durationMinutes=0 → 不顯示分鐘數', () => {
    mockState.sessions = [makeSession({ durationMinutes: 0 })];
    renderGoals(container);
    expect(container.querySelector('.log-time').textContent).not.toContain('m');
  });
});

// ─── 每日 XP 合計 ─────────────────────────────────────────────────────────────

describe('renderGoals — 每日 XP 合計', () => {
  it('同日兩筆 session → date-group-xp 顯示合計', () => {
    mockState.sessions = [
      makeSession({ id: 's-1', finalXP: 30 }),
      makeSession({ id: 's-2', finalXP: 20 }),
    ];
    renderGoals(container);
    const xpEl = container.querySelector('.date-group-xp');
    expect(xpEl.textContent).toContain('50');
  });

  it('date-group-xp 也顯示完成次數', () => {
    mockState.sessions = [
      makeSession({ id: 's-1' }),
      makeSession({ id: 's-2', taskName: '運動' }),
    ];
    renderGoals(container);
    expect(container.querySelector('.date-group-xp').textContent).toContain('2 次');
  });
});

// ─── XSS 防護 ─────────────────────────────────────────────────────────────────

describe('renderGoals — XSS escaping', () => {
  it('taskName 含 <script> → escHtml 正確轉義，不插入原始標籤', () => {
    mockState.sessions = [makeSession({ taskName: '<script>alert(1)</script>' })];
    renderGoals(container);
    expect(container.innerHTML).not.toContain('<script>alert(1)</script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('taskName 含雙引號 → 安全顯示（文字節點中雙引號不需轉義）', () => {
    // In text nodes, " is safe and browsers normalize &quot; back to ".
    // Verify the task name is displayed correctly without breaking the DOM.
    mockState.sessions = [makeSession({ taskName: 'task "A"' })];
    renderGoals(container);
    expect(container.querySelector('.log-name').textContent).toBe('task "A"');
    // Ensure the outer HTML structure is intact (no broken tags)
    expect(container.querySelector('.log-item')).not.toBeNull();
  });
});

// ─── 免費版歷史限制 ───────────────────────────────────────────────────────────

describe('renderGoals — 免費版歷史限制', () => {
  beforeEach(() => { mockStorage.isProUser.mockReturnValue(false); });
  afterEach(()  => { mockStorage.isProUser.mockReturnValue(true); });

  it('近期 session（今天）— 免費版可見，不顯示 history-lock-card', () => {
    mockState.sessions = [makeSession({ date: '2026-04-16' })];
    renderGoals(container);
    expect(container.querySelector('.date-group')).not.toBeNull();
    expect(container.querySelector('.history-lock-card')).toBeNull();
  });

  it('31 天前 session — 免費版隱藏並顯示 history-lock-card', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const dateStr = oldDate.toLocaleDateString('sv');
    mockState.sessions = [makeSession({ id: 's-old', date: dateStr })];
    renderGoals(container);
    expect(container.querySelector('.history-lock-card')).not.toBeNull();
    expect(container.querySelectorAll('.date-group').length).toBe(0);
  });

  it('Pro 用戶 — 31 天前 session 可見，無 history-lock-card', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const dateStr = oldDate.toLocaleDateString('sv');
    mockState.sessions = [makeSession({ id: 's-old', date: dateStr })];
    renderGoals(container);
    expect(container.querySelector('.date-group')).not.toBeNull();
    expect(container.querySelector('.history-lock-card')).toBeNull();
  });
});
