/**
 * review.test.js
 *
 * 測試 renderReview 的週視圖 + 月視圖 + 切換行為。
 * 環境：jsdom
 *
 * 注意事項：
 * - 週視圖的日期以 UTC（toISOString().slice(0,10)）計算，非本地日期。
 *   測試 sessions 的 date 欄位以此對齊。
 * - 月視圖的 _viewYear / _viewMonth 為模組層級狀態，以當前日期初始化。
 * - _viewMode、_viewYear、_viewMonth 在測試間持續存在；
 *   每個 beforeEach 透過 window._reviewSetMode('week') 重置。
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  user:     { name: 'Tester', streakDays: 5, mode: 'normal' },
  tasks:    [],
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

// Mock utils — today() returns real local date so month calendar aligns with
// the module's _viewYear/_viewMonth (both initialized from new Date())
vi.mock('../../pwa/js/utils.js', () => ({
  today:          () => new Date().toLocaleDateString('sv'),
  effectiveToday: () => new Date().toLocaleDateString('sv'),
  formatTime:     () => '10:00',
  formatDate:     (d) => d,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { renderReview } from '../../pwa/js/pages/review.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today as UTC YYYY-MM-DD — matches how week view builds its date list. */
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/** Returns local YYYY-MM-DD for the current month, day d. */
function localMonthDate(day) {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function makeSession(overrides = {}) {
  return {
    id:              's-1',
    taskId:          'task-1',
    taskName:        '深度學習',
    date:            utcToday(),
    completedAt:     new Date().toISOString(),
    result:          'complete',
    finalXP:         60,
    durationMinutes: 45,
    impactType:      'task',
    value:           'A',
    isProductiveXP:  true,
    ...overrides,
  };
}

function makeTask(overrides = {}) {
  return {
    id:              'task-1',
    name:            '深度學習',
    value:           'A',
    difficulty:      0.7,
    resistance:      1.2,
    taskNature:      'growth',
    emoji:           '🧠',
    successCriteria: '完成交付',
    valueConfidence: 100,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let container;

beforeEach(() => {
  mockState.sessions = [];
  mockState.tasks    = [];
  mockState.user     = { name: 'Tester', streakDays: 5, mode: 'normal' };
  mockStorage.isProUser.mockReturnValue(true); // existing tests predate Pro gating

  container = document.createElement('div');
  document.body.appendChild(container);

  // Reset module-level _viewMode to 'week'
  if (typeof window._reviewSetMode === 'function') {
    window._reviewSetMode('week');
  }
  renderReview(container);
});

afterEach(() => {
  document.body.removeChild(container);
});

// ─── Toggle ───────────────────────────────────────────────────────────────────

describe('Toggle', () => {
  it('預設渲染週視圖 — section-title 含「週回顧」', () => {
    expect(container.querySelector('.section-title').textContent).toContain('週回顧');
  });

  it('點擊「月視圖」按鈕 → 切換到月視圖', () => {
    window._reviewSetMode('month');
    expect(container.querySelector('.section-title').textContent).toContain('月視圖');
  });

  it('從月視圖切回週視圖 → section-title 含「週回顧」', () => {
    window._reviewSetMode('month');
    window._reviewSetMode('week');
    expect(container.querySelector('.section-title').textContent).toContain('週回顧');
  });
});

// ─── 週視圖 ───────────────────────────────────────────────────────────────────

describe('週視圖 — 無 session', () => {
  it('本週成長 XP = 0', () => {
    const statVals = container.querySelectorAll('.review-stat-val');
    expect(statVals[0].textContent.trim()).toBe('0');
  });

  it('有效天數 = 0', () => {
    const statVals = container.querySelectorAll('.review-stat-val');
    expect(statVals[1].textContent.trim()).toContain('0');
  });

  it('所有任務可信 → 顯示「所有任務標籤可信 ✓」', () => {
    // tasks=[], no calibrate tasks
    expect(container.innerHTML).toContain('所有任務標籤可信 ✓');
  });

  it('最常完成任務區塊顯示空狀態提示', () => {
    expect(container.innerHTML).toContain('本週尚無完成任務');
  });
});

describe('週視圖 — 有 session', () => {
  beforeEach(() => {
    mockState.sessions = [makeSession({ finalXP: 60, value: 'A', isProductiveXP: true })];
    renderReview(container);
  });

  it('本週成長 XP 正確累加', () => {
    const statVals = container.querySelectorAll('.review-stat-val');
    expect(statVals[0].textContent.trim()).toBe('60');
  });

  it('最常完成任務出現在列表', () => {
    expect(container.innerHTML).toContain('深度學習');
    expect(container.querySelectorAll('.top-task-row').length).toBeGreaterThan(0);
  });
});

describe('週視圖 — 任務價值分佈', () => {
  it('只有 B 任務 → B 佔 100%', () => {
    mockState.sessions = [
      makeSession({ value: 'B', finalXP: 50, isProductiveXP: true }),
    ];
    renderReview(container);
    const distRows = container.querySelectorAll('.dist-row');
    // Find the B row
    const bRow = [...distRows].find(r => r.querySelector('.badge-b'));
    expect(bRow).not.toBeNull();
    expect(bRow.querySelector('.dist-pct').textContent).toBe('100%');
  });
});

describe('週視圖 — 無效次數', () => {
  it('invalid session → 無效次數計數正確', () => {
    mockState.sessions = [
      makeSession({ result: 'invalid', isProductiveXP: false, finalXP: 0 }),
      makeSession({ id: 's-2', result: 'invalid', isProductiveXP: false, finalXP: 0 }),
    ];
    renderReview(container);
    // The third .time-dist-val is the invalid count
    const vals = container.querySelectorAll('.time-dist-val');
    expect(vals[2].textContent.trim()).toBe('2');
  });
});

describe('週視圖 — 待校準任務', () => {
  it('confidence < 80 的任務出現在校準列表', () => {
    // S task: taskNature='maintenance' → -20, plus session with avgDur=5 < 10 → -20
    // Total: 100 - 20 - 20 = 60 < 80 ✓
    mockState.tasks = [makeTask({
      id: 'task-calib', name: '需校準任務', value: 'S',
      taskNature: 'maintenance', successCriteria: null, resistance: 1.0,
    })];
    mockState.sessions = [{
      id: 's-calib', taskId: 'task-calib', date: utcToday(),
      completedAt: new Date().toISOString(),
      result: 'complete', durationMinutes: 5, // avgDur < 10 → another -20
      finalXP: 0, energyGain: 0, impactType: 'task',
      value: 'S', isProductiveXP: true,
    }];
    renderReview(container);
    expect(container.querySelectorAll('.calibrate-row').length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('需校準任務');
  });

  it('所有任務可信 → 顯示「所有任務標籤可信 ✓」', () => {
    mockState.tasks = [makeTask({ value: 'A', successCriteria: '明確標準' })];
    renderReview(container);
    expect(container.innerHTML).toContain('所有任務標籤可信 ✓');
  });
});

// ─── 月視圖 ───────────────────────────────────────────────────────────────────

describe('月視圖 — 基本渲染', () => {
  beforeEach(() => {
    window._reviewSetMode('month');
  });

  it('無 session → 本月成長 XP = 0', () => {
    const statVals = container.querySelectorAll('.review-stat-val');
    expect(statVals[0].textContent.trim()).toBe('0');
  });

  it('當前月或未來月 → 「›」按鈕 disabled', () => {
    const nextBtn = container.querySelector('.month-nav-btn:last-of-type');
    expect(nextBtn).not.toBeNull();
    expect(nextBtn.disabled).toBe(true);
  });

  it('月視圖標題顯示月份標籤', () => {
    const label = container.querySelector('.month-nav-label');
    expect(label).not.toBeNull();
    expect(label.textContent.length).toBeGreaterThan(0);
  });
});

describe('月視圖 — 日曆格', () => {
  beforeEach(() => {
    window._reviewSetMode('month');
  });

  it('leading empties 數量對齊本月第一天星期', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDOW = new Date(year, month, 1).getDay(); // 0=Sun
    const expected = (firstDOW + 6) % 7; // Mon-first

    const empties = container.querySelectorAll('.cal-cell-empty');
    expect(empties.length).toBe(expected);
  });

  it('今日格子有 cal-cell-today 樣式', () => {
    const today = document.querySelector('.cal-cell-today');
    expect(today).not.toBeNull();
  });

  it('未來日期格子有 cal-dot-future 樣式', () => {
    // At least some future dots should exist (unless today is last day of month)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() < daysInMonth) {
      const futureDots = container.querySelectorAll('.cal-dot-future');
      expect(futureDots.length).toBeGreaterThan(0);
    }
  });
});

describe('月視圖 — 導航', () => {
  beforeEach(() => {
    window._reviewSetMode('month');
  });

  // Navigation tests accumulate a net -2 deficit on _viewMonth:
  //   test 1: _reviewPrevMonth()      → -1
  //   test 2: _reviewPrevMonth()      → -1
  //   test 3: prev then next          →  0
  // Compensate with two nextMonth calls so subsequent describes see the original month.
  afterAll(() => {
    if (typeof window._reviewNextMonth === 'function') {
      window._reviewNextMonth();
      window._reviewNextMonth();
    }
  });

  it('點擊「‹」按鈕 → monthLabel 改變（切換到上月）', () => {
    const before = container.querySelector('.month-nav-label').textContent;
    window._reviewPrevMonth();
    const after = container.querySelector('.month-nav-label').textContent;
    expect(after).not.toBe(before);
  });

  it('切換到過去月份後 → 「›」按鈕可點擊（not disabled）', () => {
    window._reviewPrevMonth();
    const nextBtn = container.querySelector('.month-nav-btn:last-of-type');
    expect(nextBtn.disabled).toBe(false);
  });

  it('切換到上月後再切回 → monthLabel 恢復原值', () => {
    const before = container.querySelector('.month-nav-label').textContent;
    window._reviewPrevMonth();
    window._reviewNextMonth();
    const after = container.querySelector('.month-nav-label').textContent;
    expect(after).toBe(before);
  });
});

describe('月視圖 — 最長連勝', () => {
  it('4 天有效 + 1 天中斷 + 3 天有效 → bestStreak=4', () => {
    // Use local dates for month-view sessions
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // Need at least 8 days; use days 1-8 if month has them
    if (daysInMonth < 8) { return; } // skip on extremely short months

    // Build sessions for days 1-4 and 6-8 (day 5 is a gap)
    const sessions = [];
    for (let d = 1; d <= 4; d++) {
      sessions.push(makeSession({
        id: `s-d${d}`, date: localMonthDate(d),
        finalXP: 60, value: 'A', isProductiveXP: true,
      }));
    }
    for (let d = 6; d <= 8; d++) {
      sessions.push(makeSession({
        id: `s-d${d}`, date: localMonthDate(d),
        finalXP: 60, value: 'A', isProductiveXP: true,
      }));
    }
    mockState.sessions = sessions;
    window._reviewSetMode('month');

    const statVals = container.querySelectorAll('.review-stat-val');
    // statVals[2] is bestStreak
    expect(statVals[2].textContent.trim()).toBe('4');
  });
});

describe('月視圖 — 本月最常完成任務', () => {
  it('本月有 session → 顯示任務名稱', () => {
    mockState.sessions = [
      makeSession({ id: 's-m1', date: localMonthDate(1), taskName: '運動', result: 'complete' }),
      makeSession({ id: 's-m2', date: localMonthDate(2), taskName: '運動', result: 'complete' }),
    ];
    window._reviewSetMode('month');
    expect(container.innerHTML).toContain('運動');
    expect(container.querySelectorAll('.top-task-row').length).toBeGreaterThan(0);
  });
});

describe('月視圖 — 免費版歷史限制', () => {
  beforeEach(() => {
    mockStorage.isProUser.mockReturnValue(false);
    window._reviewSetMode('month');
  });

  it('目前月份（monthsAgo=0）— 免費版可看，不顯示 history-lock-card', () => {
    expect(container.querySelector('.history-lock-card')).toBeNull();
  });

  it('鎖定月份 — 顯示 history-lock-card', () => {
    // Navigate back FREE_MONTHS times to reach a locked month
    for (let i = 0; i < 3; i++) window._reviewPrevMonth();
    expect(container.querySelector('.history-lock-card')).not.toBeNull();
  });

  it('鎖定月份 — prevMonth 按鈕不再繼續往前導航', () => {
    for (let i = 0; i < 3; i++) window._reviewPrevMonth();
    const labelBefore = container.querySelector('.month-nav-label').textContent;
    window._reviewPrevMonth(); // should be blocked
    const labelAfter = container.querySelector('.month-nav-label').textContent;
    expect(labelAfter).toBe(labelBefore);
  });

  afterAll(() => {
    // Restore navigation to current month for subsequent tests
    for (let i = 0; i < 3; i++) window._reviewNextMonth();
  });
});
