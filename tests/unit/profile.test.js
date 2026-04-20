/**
 * profile.test.js
 *
 * DOM 測試：renderProfile 渲染與事件綁定。
 * 涵蓋本次新增功能：
 *   - XP 表格 title 欄（#13）
 *   - 等級稱號完整自訂 — getAllTemplates、模板選擇、
 *     showTemplateEditor 模態框（#15）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  user: {
    name: 'Tester',
    totalXP: 500,
    streakDays: 5,
    titleTemplate: 'rpg',
    customTitle: '',
    customTemplates: {},
    createdAt: '2026-01-01',
    avatar: null,
  },
  sessions: [],
  energy: { currentEnergy: 80, maxEnergy: 100 },
}));

const mockStorage = vi.hoisted(() => ({
  saveUser:    vi.fn(),
  isProUser:   vi.fn(() => false),
  isTrialUser: vi.fn(() => false),
}));

// Prevent CDN import failure in Node
vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

vi.mock('../../pwa/js/state.js',   () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage }));

// Dynamic import in profile.js: import('../app.js').then(({ updateHeader }) => updateHeader())
vi.mock('../../pwa/js/app.js', () => ({ updateHeader: vi.fn() }));

import { renderProfile } from '../../pwa/js/pages/profile.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function freshUser(overrides = {}) {
  return {
    name: 'Tester',
    totalXP: 500,
    streakDays: 5,
    titleTemplate: 'rpg',
    customTitle: '',
    customTemplates: {},
    createdAt: '2026-01-01',
    avatar: null,
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.user     = freshUser();
  mockState.sessions = [];
  mockState.energy   = { currentEnergy: 80, maxEnergy: 100 };
  window.navigate    = vi.fn();
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Basic rendering ──────────────────────────────────────────────────────────

describe('renderProfile: basic rendering', () => {
  it('renders user name', () => {
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('Tester');
  });

  it('renders total XP in stats grid', () => {
    mockState.user.totalXP = 1234;
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('1234');
  });

  it('renders streak days', () => {
    mockState.user.streakDays = 12;
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('12');
  });

  it('returns early (no crash) when state.user is null', () => {
    mockState.user = null;
    const c = makeContainer();
    expect(() => renderProfile(c)).not.toThrow();
    mockState.user = freshUser();
  });
});

// ─── XP table: title column (#13) ────────────────────────────────────────────

describe('renderProfile: XP table title column', () => {
  it('renders xp-table-title elements', () => {
    const c = makeContainer();
    renderProfile(c);
    const titleCells = c.querySelectorAll('.xp-table-title');
    expect(titleCells.length).toBeGreaterThan(0);
  });

  it('title cells are not empty strings', () => {
    const c = makeContainer();
    renderProfile(c);
    c.querySelectorAll('.xp-table-title').forEach(cell => {
      expect(cell.textContent.trim().length).toBeGreaterThan(0);
    });
  });

  it('XP table has 3 columns per row: level / title / xp', () => {
    const c = makeContainer();
    renderProfile(c);
    const rows = c.querySelectorAll('.xp-table-row');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      expect(row.querySelector('.xp-table-lv')).not.toBeNull();
      expect(row.querySelector('.xp-table-title')).not.toBeNull();
      expect(row.querySelector('.xp-table-xp')).not.toBeNull();
    });
  });

  it('uses customTitle in XP table when set', () => {
    mockState.user.customTitle = '天才少年';
    const c = makeContainer();
    renderProfile(c);
    // Every title cell should show the custom title
    const titleCells = c.querySelectorAll('.xp-table-title');
    titleCells.forEach(cell => {
      expect(cell.textContent).toBe('天才少年');
    });
  });

  it('uses template title in XP table when customTitle is empty', () => {
    mockState.user = freshUser({ titleTemplate: 'business', customTitle: '' });
    const c = makeContainer();
    renderProfile(c);
    // At least one cell should contain a business template title
    const text = c.querySelector('.xp-table-title').textContent;
    // business tier titles include '實習生', '助理', etc.
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─── Template picker: built-in templates (#15) ───────────────────────────────

describe('renderProfile: template picker', () => {
  it('renders a button for each built-in template', () => {
    const c = makeContainer();
    renderProfile(c);
    const btns = c.querySelectorAll('.title-tmpl-btn');
    expect(btns.length).toBe(3);
  });

  it('marks the active template button with class "active"', () => {
    mockState.user.titleTemplate = 'kny';
    const c = makeContainer();
    renderProfile(c);
    const active = c.querySelector('.title-tmpl-btn.active');
    expect(active).not.toBeNull();
    expect(active.dataset.template).toBe('kny');
  });

  it('free user sees all template buttons locked', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderProfile(c);
    const locked = c.querySelectorAll('.title-tmpl-btn[data-locked]');
    expect(locked.length).toBe(3);
    expect(c.querySelectorAll('.title-tmpl-edit-btn').length).toBe(0);
    expect(document.getElementById('add-template-btn')).toBeNull();
  });

  it('free user clicking a locked template navigates to settings Pro section', () => {
    mockStorage.isProUser.mockReturnValue(false);
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-template="business"]').click();
    expect(window.navigate).toHaveBeenCalledWith('settings');
    expect(mockState.user.titleTemplate).toBe('rpg'); // unchanged
  });

  it('Pro user: clicking a template button updates user.titleTemplate and saves', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-template="business"]').click();
    expect(mockState.user.titleTemplate).toBe('business');
    expect(mockStorage.saveUser).toHaveBeenCalled();
  });

  it('Pro user: clicking a template button clears customTitle', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user.customTitle = '舊稱號';
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-template="kny"]').click();
    expect(mockState.user.customTitle).toBe('');
  });

  it('Pro user: renders edit (✏️) button for each template', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelectorAll('.title-tmpl-edit-btn').length).toBe(3);
  });

  it('custom template also appears in template list', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user.customTemplates = {
      custom_123: { name: '我的英雄', icon: '🦸', tiers: [[1, '見習英雄']] },
    };
    const c = makeContainer();
    renderProfile(c);
    const btns = c.querySelectorAll('.title-tmpl-btn');
    expect(btns.length).toBe(4);
    expect(Array.from(btns).some(b => b.textContent.includes('我的英雄'))).toBe(true);
  });
});

// ─── Template editor modal: open / add new (#15) ────────────────────────────

describe('renderProfile: add template modal', () => {
  it('"新增自訂主題" button exists for Pro user', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    expect(document.getElementById('add-template-btn')).not.toBeNull();
  });

  it('clicking "新增自訂主題" opens the editor modal', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    expect(document.getElementById('template-editor-modal')).not.toBeNull();
  });

  it('new-template modal has empty name and icon fields', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    const modal = document.getElementById('template-editor-modal');
    expect(modal.querySelector('#tmpl-name').value).toBe('');
    expect(modal.querySelector('#tmpl-icon').value).toBe('');
  });

  it('saving a new template stores it in user.customTemplates', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    const modal = document.getElementById('template-editor-modal');

    modal.querySelector('#tmpl-name').value = '英雄之路';
    modal.querySelector('#tmpl-icon').value = '🦸';
    // fill the first tier input
    modal.querySelector('[data-tier="100"]').value = '超級英雄';

    modal.querySelector('#tmpl-save-btn').click();

    const keys = Object.keys(mockState.user.customTemplates);
    expect(keys.length).toBe(1);
    const saved = mockState.user.customTemplates[keys[0]];
    expect(saved.name).toBe('英雄之路');
    expect(saved.icon).toBe('🦸');
  });

  it('saving a new template auto-selects it', () => {
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    const modal = document.getElementById('template-editor-modal');

    modal.querySelector('#tmpl-name').value = '新主題';
    modal.querySelector('#tmpl-save-btn').click();

    const newKey = Object.keys(mockState.user.customTemplates)[0];
    expect(mockState.user.titleTemplate).toBe(newKey);
  });

  it('save with empty name shows alert and does not save', () => {
    mockStorage.isProUser.mockReturnValue(true);
    window.alert = vi.fn();
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    document.getElementById('template-editor-modal').querySelector('#tmpl-save-btn').click();
    expect(window.alert).toHaveBeenCalled();
    expect(Object.keys(mockState.user.customTemplates).length).toBe(0);
  });

  it('closing modal by ✕ removes the modal', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('add-template-btn').click();
    const modal = document.getElementById('template-editor-modal');
    modal.querySelector('#tmpl-modal-close').click();
    expect(document.getElementById('template-editor-modal')).toBeNull();
  });
});

// ─── Template editor modal: edit existing (#15) ─────────────────────────────

describe('renderProfile: edit template modal', () => {
  it('clicking ✏️ on a built-in template opens the editor', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="rpg"]').click();
    expect(document.getElementById('template-editor-modal')).not.toBeNull();
  });

  it('edit modal pre-fills template name and icon', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="rpg"]').click();
    const modal = document.getElementById('template-editor-modal');
    expect(modal.querySelector('#tmpl-name').value).toBe('RPG 冒險者');
    expect(modal.querySelector('#tmpl-icon').value).toBe('⚔️');
  });

  it('editing a built-in template creates a custom override with the same key', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="rpg"]').click();
    const modal = document.getElementById('template-editor-modal');

    modal.querySelector('#tmpl-name').value = 'RPG 改版';
    modal.querySelector('#tmpl-save-btn').click();

    expect(mockState.user.customTemplates).toHaveProperty('rpg');
    expect(mockState.user.customTemplates.rpg.name).toBe('RPG 改版');
  });

  it('delete button is only visible for custom templates', () => {
    mockStorage.isProUser.mockReturnValue(true);
    // Built-in template: no delete button
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="rpg"]').click();
    expect(document.querySelector('#tmpl-delete-btn')).toBeNull();
    document.getElementById('template-editor-modal').remove();

    // Add a custom template and open its editor
    mockState.user.customTemplates = {
      custom_abc: { name: '自訂', icon: '✨', tiers: [[1, 'A']] },
    };
    renderProfile(c);
    c.querySelector('[data-edit-template="custom_abc"]').click();
    expect(document.querySelector('#tmpl-delete-btn')).not.toBeNull();
  });

  it('deleting a custom template removes it from user.customTemplates', () => {
    mockStorage.isProUser.mockReturnValue(true);
    window.confirm = vi.fn(() => true);
    mockState.user.customTemplates = {
      custom_abc: { name: '自訂', icon: '✨', tiers: [[1, 'A']] },
    };
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="custom_abc"]').click();
    document.querySelector('#tmpl-delete-btn').click();

    expect(mockState.user.customTemplates).not.toHaveProperty('custom_abc');
    expect(mockStorage.saveUser).toHaveBeenCalled();
  });

  it('deleting the active custom template falls back to rpg', () => {
    mockStorage.isProUser.mockReturnValue(true);
    window.confirm = vi.fn(() => true);
    mockState.user.titleTemplate   = 'custom_abc';
    mockState.user.customTemplates = {
      custom_abc: { name: '自訂', icon: '✨', tiers: [[1, 'A']] },
    };
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="custom_abc"]').click();
    document.querySelector('#tmpl-delete-btn').click();

    expect(mockState.user.titleTemplate).toBe('rpg');
  });

  it('cancelling delete confirm does not remove template', () => {
    mockStorage.isProUser.mockReturnValue(true);
    window.confirm = vi.fn(() => false);
    mockState.user.customTemplates = {
      custom_abc: { name: '自訂', icon: '✨', tiers: [[1, 'A']] },
    };
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="custom_abc"]').click();
    document.querySelector('#tmpl-delete-btn').click();

    expect(mockState.user.customTemplates).toHaveProperty('custom_abc');
  });
});

// ─── Custom title override ────────────────────────────────────────────────────

describe('renderProfile: custom title input', () => {
  it('custom title input reflects user.customTitle', () => {
    mockState.user.customTitle = '龍之傳承者';
    const c = makeContainer();
    renderProfile(c);
    const input = document.getElementById('custom-title-input');
    expect(input.value).toBe('龍之傳承者');
  });

  it('saving custom title updates user.customTitle', () => {
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('custom-title-input').value = '新稱號';
    document.getElementById('custom-title-save').click();
    expect(mockState.user.customTitle).toBe('新稱號');
    expect(mockStorage.saveUser).toHaveBeenCalled();
  });

  it('clear button appears only when customTitle is set', () => {
    mockState.user.customTitle = '';
    const c = makeContainer();
    renderProfile(c);
    expect(document.getElementById('custom-title-clear')).toBeNull();

    document.body.innerHTML = '';
    mockState.user.customTitle = '有稱號';
    const c2 = makeContainer();
    renderProfile(c2);
    expect(document.getElementById('custom-title-clear')).not.toBeNull();
  });

  it('clicking clear resets customTitle to empty string', () => {
    mockState.user.customTitle = '待清除';
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('custom-title-clear').click();
    expect(mockState.user.customTitle).toBe('');
    expect(mockStorage.saveUser).toHaveBeenCalled();
  });
});

// ─── Habit Heatmap ────────────────────────────────────────────────────────────

describe('renderProfile: habit heatmap', () => {
  it('renders heatmap grid', () => {
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.hm-grid')).not.toBeNull();
  });

  it('free user sees upgrade note', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.hm-upgrade-btn')).not.toBeNull();
  });

  it('Pro user does not see upgrade note', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.hm-upgrade-btn')).toBeNull();
  });

  it('colours active days based on XP', () => {
    const today = new Date().toLocaleDateString('sv');
    mockState.sessions = [
      { date: today, finalXP: 120, isProductiveXP: true },
    ];
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.hm-3,.hm-4')).not.toBeNull();
  });

  it('respects newDayHour: session from calendar-yesterday shows as today when newDayHour is in the future', () => {
    // newDayHour=23 means "new day starts at 23:00". Since current time is < 23, effective today = yesterday.
    // A session from yesterday (calendar) should appear as the last heatmap cell (today effective).
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('sv');
    mockState.user = freshUser({ newDayHour: 23 });
    mockState.sessions = [{ date: yesterdayStr, finalXP: 80, isProductiveXP: true }];
    const c = makeContainer();
    renderProfile(c);
    // hm-today marks the effective-today cell; it should have level ≥ 2 (XP=80 → level 2)
    const todayCell = c.querySelector('.hm-today');
    expect(todayCell).not.toBeNull();
    expect(todayCell.classList.contains('hm-0')).toBe(false);
  });
});

// ─── Advanced Dashboard (SUB-11) ─────────────────────────────────────────────

describe('renderProfile: advanced dashboard', () => {
  it('free user sees upgrade button, not the metrics grid', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.dashboard-grid')).toBeNull();
    expect(c.textContent).toContain('升級 Pro 解鎖');
  });

  it('Pro user sees dashboard-grid metrics', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.dashboard-grid')).not.toBeNull();
  });

  it('Pro user sees four time-bar-row elements', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelectorAll('.time-bar-row').length).toBe(4);
  });

  it('Pro user sees milestone prediction section', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user = freshUser({ streakDays: 3 });
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('里程碑');
  });

  it('Pro user with streak >= 365 sees 已達成所有里程碑', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user = freshUser({ streakDays: 365 });
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('已達成所有里程碑');
  });

  it('dashboard metrics show 0% completion rate with no sessions', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.sessions = [];
    const c = makeContainer();
    renderProfile(c);
    const metrics = c.querySelectorAll('.dash-metric-val');
    expect(metrics[0].textContent).toBe('0%');
  });

  it('dashboard completion rate reflects complete sessions', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const today = new Date().toLocaleDateString('sv');
    mockState.sessions = [
      { date: today, impactType: 'task', value: 'A', result: 'complete',
        isProductiveXP: true, finalXP: 60, durationMinutes: 30,
        completedAt: today + 'T10:00:00Z' },
      { date: today, impactType: 'task', value: 'A', result: 'invalid',
        isProductiveXP: false, finalXP: 0, durationMinutes: 5,
        completedAt: today + 'T11:00:00Z' },
    ];
    const c = makeContainer();
    renderProfile(c);
    const metrics = c.querySelectorAll('.dash-metric-val');
    expect(metrics[0].textContent).toBe('50%');
  });
});

// ─── Streak unlock progress (SUB-16) ─────────────────────────────────────────

describe('renderProfile: streak unlock progress', () => {
  it('free user with no streak sees progress bar at 0/60', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = freshUser({ streakDays: 0, streakUnlockUsed: false });
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.streak-unlock-row')).not.toBeNull();
    expect(c.textContent).toContain('0/60');
  });

  it('free user with 30-day streak shows 30/60', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = freshUser({ streakDays: 30, streakUnlockUsed: false });
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('30/60');
    const fill = c.querySelector('.streak-unlock-fill');
    expect(fill.style.width).toBe('50%');
  });

  it('free user with streak >= 60 shows 60/60 and 100% fill', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = freshUser({ streakDays: 75, streakUnlockUsed: false });
    const c = makeContainer();
    renderProfile(c);
    expect(c.textContent).toContain('60/60');
    const fill = c.querySelector('.streak-unlock-fill');
    expect(fill.style.width).toBe('100%');
  });

  it('user who already received streak unlock does not see progress bar', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = freshUser({ streakDays: 60, streakUnlockUsed: true });
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });

  it('Pro user does not see streak unlock progress bar', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = freshUser({ streakDays: 10, streakUnlockUsed: false });
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });

  it('trial user does not see streak unlock progress bar', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(true);
    mockState.user = freshUser({ streakDays: 10, streakUnlockUsed: false });
    const c = makeContainer();
    renderProfile(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });
});

describe('renderProfile: createdAt null safety', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('createdAt: null → daysActive stat shows a number (not NaN)', () => {
    mockState.user = freshUser({ createdAt: null });
    const c = makeContainer();
    renderProfile(c);
    // daysActive is the 4th .stat-value (totalXP / totalSessions / activeDays / daysActive)
    const statValues = c.querySelectorAll('.stat-value');
    const daysActiveEl = statValues[3];
    expect(daysActiveEl).not.toBeNull();
    expect(daysActiveEl.textContent).not.toContain('NaN');
    expect(Number(daysActiveEl.textContent)).toBeGreaterThanOrEqual(1);
  });

  it('createdAt: undefined → daysActive stat shows a number (not NaN)', () => {
    const u = freshUser();
    delete u.createdAt;
    mockState.user = u;
    const c = makeContainer();
    renderProfile(c);
    const statValues = c.querySelectorAll('.stat-value');
    expect(statValues[3].textContent).not.toContain('NaN');
  });
});
