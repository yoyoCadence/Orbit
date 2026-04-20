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

  it('locks non-free themes for free users', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('[data-theme-id="light"][data-locked]')).not.toBeNull();
    expect(c.querySelector('[data-theme-id="wabi"][data-locked]')).not.toBeNull();
    expect(c.querySelector('[data-theme-id="emerald"][data-locked]')).toBeNull();
  });

  it('locked theme cards do not call applyTheme when clicked', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    const locked = c.querySelector('[data-theme-id="github"][data-locked]');
    locked.click();
    expect(mockApplyTheme).not.toHaveBeenCalled();
  });

  it('Pro user sees all themes unlocked', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('[data-locked]')).toBeNull();
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
  it('shows lock button (not toggle) for free users', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#random-theme-toggle')).toBeNull();
    expect(c.querySelector('#random-theme-lock')).not.toBeNull();
  });

  it('toggle is checked when Pro user has getRandomThemeEnabled true', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.getRandomThemeEnabled.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#random-theme-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);
  });

  it('turning ON calls saveRandomThemeEnabled(true), saveRandomThemeDate(""), and applyRandomThemeForToday()', () => {
    mockStorage.isProUser.mockReturnValue(true);
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
    mockStorage.isProUser.mockReturnValue(true);
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

describe('renderSettings: Pro section content', () => {
  it('free user sees feature grid with hidden-benefits teaser', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-feat-grid')).not.toBeNull();
    expect(c.querySelector('#pro-card').textContent).toContain('還有 Pro 專屬隱藏福利');
  });

  it('free user does not see pro-active-banner', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-active-banner')).toBeNull();
  });

  it('trial user sees trial countdown bar', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(true);
    mockStorage.getTrialDaysRemaining.mockReturnValue(10);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-trial-status')).not.toBeNull();
    expect(c.querySelector('#pro-card').textContent).toContain('10');
  });

  it('Pro user sees pro-active-banner with active teaser', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-active-banner')).not.toBeNull();
    expect(c.querySelector('.pro-feat-teaser--active')).not.toBeNull();
    expect(c.querySelector('.pro-feat-teaser--active').textContent).toContain('更多功能持續釋出中');
  });

  it('Pro user does not see hidden-benefits teaser (that is for free users)', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#pro-card').textContent).not.toContain('還有 Pro 專屬隱藏福利');
  });

  it('Pro user sees termination info: 終身方案 when no expiry', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockStorage.getProExpiry.mockReturnValue(null);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-active-sub').textContent).toContain('終身方案');
  });
});

// ─── Streak unlock teaser in Pro section (SUB-16) ─────────────────────────────

describe('renderSettings: streak unlock progress in Pro section', () => {
  it('free user sees streak unlock progress bar', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, streakDays: 20, streakUnlockUsed: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.streak-unlock-row')).not.toBeNull();
    expect(c.textContent).toContain('20/45');
  });

  it('free user with streakUnlockUsed=true does not see the bar', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, streakDays: 60, streakUnlockUsed: true };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });

  it('trial user does not see streak unlock progress bar', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(true);
    mockStorage.getTrialDaysRemaining.mockReturnValue(10);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, streakDays: 5, streakUnlockUsed: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });

  it('Pro user does not see streak unlock progress bar', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, streakDays: 5, streakUnlockUsed: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.streak-unlock-row')).toBeNull();
  });
});

// ─── Focus Timer Pro settings (SUB-12) ───────────────────────────────────────

describe('renderSettings: Focus Timer Pro settings card', () => {
  it('Pro user sees focus timer Pro settings card', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, focusSoundEnabled: true };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle')).not.toBeNull();
    expect(c.querySelector('#focus-default-min-select')).not.toBeNull();
  });

  it('trial user sees focus timer Pro settings card', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(true);
    mockStorage.getTrialDaysRemaining.mockReturnValue(10);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle')).not.toBeNull();
  });

  it('free user does not see focus timer Pro settings card', () => {
    mockStorage.isProUser.mockReturnValue(false);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle')).toBeNull();
    expect(c.querySelector('#focus-default-min-select')).toBeNull();
  });

  it('sound toggle reflects focusSoundEnabled=false', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, focusSoundEnabled: false };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle').checked).toBe(false);
  });

  it('default minutes select reflects saved focusDefaultMinutes', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    mockState.user = { name: 'T', mode: 'normal', isPublic: false, focusDefaultMinutes: 25 };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-default-min-select').value).toBe('25');
  });
});
