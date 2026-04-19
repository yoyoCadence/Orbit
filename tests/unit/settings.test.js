/**
 * settings.test.js
 *
 * DOM 測試：renderSettings 渲染與事件綁定。
 * mock state / storage / app.js（避免 init() 副作用）/ auth.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  user:  { name: 'Tester', mode: 'normal', isPublic: false },
  tasks: [],
  sessions: [],
  energy: { currentEnergy: 80, maxEnergy: 100, lastResetDate: '' },
}));

const mockStorage = vi.hoisted(() => ({
  getTheme:              vi.fn(() => 'dark-purple'),
  getBgImage:            vi.fn(() => null),
  saveUser:              vi.fn(),
  saveTasks:             vi.fn(),
  saveTheme:             vi.fn(),
  saveBgImage:           vi.fn(),
  clearAll:              vi.fn(),
  getRandomThemeEnabled: vi.fn(() => false),
  saveRandomThemeEnabled:vi.fn(),
  getRandomThemeDate:    vi.fn(() => ''),
  saveRandomThemeDate:   vi.fn(),
  isProUser:             vi.fn(() => false),
  isTrialUser:           vi.fn(() => false),
  getTrialDaysRemaining: vi.fn(() => 0),
  getProExpiry:          vi.fn(() => null),
}));

const mockApplyTheme        = vi.hoisted(() => vi.fn());
const mockApplyRandomTheme  = vi.hoisted(() => vi.fn());

// Mock supabase first to prevent CDN URL import failure in Node.js
vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: {
      getSession:       vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut:          vi.fn(() => Promise.resolve({})),
    },
    from: vi.fn(() => ({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockReturnThis(),
      upsert:  vi.fn().mockReturnThis(),
      delete:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      single:  vi.fn(() => Promise.resolve({ data: null, error: null })),
      order:   vi.fn().mockReturnThis(),
      in:      vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../../pwa/js/state.js',   () => ({ state: mockState }));
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage, db: {} }));
vi.mock('../../pwa/js/app.js', () => ({
  applyTheme:              mockApplyTheme,
  applyBgImage:            vi.fn(),
  removeBgImage:           vi.fn(),
  applyRandomThemeForToday: mockApplyRandomTheme,
  APP_VERSION:   'v1.2.0',
}));
vi.mock('../../pwa/js/auth.js', () => ({
  getSession: vi.fn(() => Promise.resolve({ user: { email: 'test@example.com' } })),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../../pwa/js/utils.js', () => ({
  uid:   () => 'test-uid-' + Math.random().toString(36).slice(2),
  today: () => '2026-04-11',
}));
vi.mock('../../pwa/js/leveling.js', () => ({
  getLevelInfo: vi.fn(() => ({ level: 1, percent: 0, currentXP: 0, needed: 120 })),
  getTitle:     vi.fn(() => '初心者'),
}));

import { renderSettings, THEMES, THEMES_NEW, THEMES_CREATIVE } from '../../pwa/js/pages/settings.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeTask(overrides = {}) {
  return {
    id: 'task-1', name: '深度學習', category: 'focus',
    impactType: 'task', taskNature: 'growth',
    value: 'A', difficulty: 0.7, resistance: 1.2,
    emoji: '🧠', isDefault: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.user  = { name: 'Tester', mode: 'normal', isPublic: false };
  mockState.tasks = [];
  vi.clearAllMocks();
  mockStorage.getTheme.mockReturnValue('dark-purple');
  mockStorage.getBgImage.mockReturnValue(null);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderSettings: theme grid', () => {
  it('renders all themes', () => {
    const c = makeContainer();
    renderSettings(c);
    const cards = c.querySelectorAll('.theme-card');
    expect(cards.length).toBe(THEMES.length + THEMES_NEW.length + THEMES_CREATIVE.length);
  });

  it('marks current theme as active', () => {
    mockStorage.getTheme.mockReturnValue('aurora-blue');
    const c = makeContainer();
    renderSettings(c);
    const active = c.querySelector('.theme-card.active');
    expect(active).not.toBeNull();
    expect(active.dataset.themeId).toBe('aurora-blue');
  });

  it('clicking a theme card calls applyTheme with the theme id', () => {
    const c = makeContainer();
    renderSettings(c);
    const card = c.querySelector('[data-theme-id="emerald"]');
    card.click();
    expect(mockApplyTheme).toHaveBeenCalledWith('emerald');
  });
});

describe('renderSettings: mode toggle', () => {
  it('shows normal mode by default', () => {
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('普通模式');
    const toggle = c.querySelector('#mode-toggle');
    expect(toggle.checked).toBe(false);
  });

  it('shows advanced mode when state.user.mode is advanced', () => {
    mockState.user.mode = 'advanced';
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('進階模式');
    expect(c.querySelector('#mode-toggle').checked).toBe(true);
  });

  it('switching to advanced mode calls storage.saveUser with mode advanced', () => {
    window.confirm = vi.fn(() => true);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#mode-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(mockStorage.saveUser).toHaveBeenCalled();
    expect(mockState.user.mode).toBe('advanced');
  });

  it('cancelling advanced mode prompt does not change mode', () => {
    window.confirm = vi.fn(() => false);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#mode-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(mockState.user.mode).toBe('normal');
    expect(mockStorage.saveUser).not.toHaveBeenCalled();
  });
});

describe('renderSettings: task list', () => {
  it('shows empty state when no tasks', () => {
    mockState.tasks = [];
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('還沒有任何任務');
  });

  it('renders task names in the list', () => {
    mockState.tasks = [makeTask({ name: '深度閱讀' })];
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('深度閱讀');
  });

  it('default tasks show lock icon in normal mode', () => {
    mockState.tasks = [makeTask({ isDefault: true })];
    mockState.user.mode = 'normal';
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('🔒');
  });

  it('default tasks show edit/delete in advanced mode', () => {
    mockState.tasks = [makeTask({ isDefault: true })];
    mockState.user.mode = 'advanced';
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('[data-edit="task-1"]')).not.toBeNull();
    expect(c.querySelector('[data-del="task-1"]')).not.toBeNull();
  });

  it('deleting a task calls storage.saveTasks', () => {
    window.confirm = vi.fn(() => true);
    mockState.tasks = [makeTask()];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-del="task-1"]').click();
    expect(mockStorage.saveTasks).toHaveBeenCalled();
    expect(mockState.tasks.length).toBe(0);
  });

  it('cancelling delete does not remove task', () => {
    window.confirm = vi.fn(() => false);
    mockState.tasks = [makeTask()];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-del="task-1"]').click();
    expect(mockState.tasks.length).toBe(1);
  });
});

describe('renderSettings: leaderboard opt-in', () => {
  it('shows opt-in toggle unchecked by default', () => {
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#public-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
  });

  it('toggling opt-in updates state.user.isPublic and calls saveUser', () => {
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#public-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(mockState.user.isPublic).toBe(true);
    expect(mockStorage.saveUser).toHaveBeenCalled();
  });
});

describe('renderSettings: version number', () => {
  it('displays APP_VERSION in account card', () => {
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain('v1.2.0');
  });
});

describe('renderSettings: sign out button', () => {
  it('sign out button exists and calls window.signOut', () => {
    window.signOut = vi.fn();
    const c = makeContainer();
    renderSettings(c);
    const btn = c.querySelector('#signout-btn');
    expect(btn).not.toBeNull();
    btn.click();
    expect(window.signOut).toHaveBeenCalled();
  });
});

describe('renderSettings: random theme toggle', () => {
  it('toggle is checked when getRandomThemeEnabled returns true', () => {
    mockStorage.getRandomThemeEnabled.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#random-theme-toggle');
    expect(toggle.checked).toBe(true);
  });

  it('turning ON calls saveRandomThemeEnabled(true), saveRandomThemeDate(""), and applyRandomThemeForToday()', () => {
    mockStorage.getRandomThemeEnabled.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#random-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(mockStorage.saveRandomThemeEnabled).toHaveBeenCalledWith(true);
    expect(mockStorage.saveRandomThemeDate).toHaveBeenCalledWith('');
    expect(mockApplyRandomTheme).toHaveBeenCalled();
  });

  it('turning OFF calls saveRandomThemeEnabled(false) and does not call applyRandomThemeForToday()', () => {
    mockStorage.getRandomThemeEnabled.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#random-theme-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(mockStorage.saveRandomThemeEnabled).toHaveBeenCalledWith(false);
    expect(mockApplyRandomTheme).not.toHaveBeenCalled();
  });
});
