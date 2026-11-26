// @vitest-environment jsdom
/**
 * settings.test.js
 *
 * DOM 測試：renderSettings 渲染與事件綁定。
 * mock state / storage / app.js（避免 init() 副作用）/ auth.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  user:  { id: 'user-1', name: 'Tester', mode: 'normal', isPublic: false },
  tasks: [],
  sessions: [],
  energy: { currentEnergy: 80, maxEnergy: 100, lastResetDate: '' },
  dailyPlan: [],
}));

const mockStorage = vi.hoisted(() => ({
  getUser:               vi.fn(() => mockState.user),
  getTasks:              vi.fn(() => mockState.tasks),
  getSessions:           vi.fn(() => mockState.sessions),
  getEnergy:             vi.fn(() => mockState.energy),
  getDailyPlan:          vi.fn(() => mockState.dailyPlan),
  getTheme:              vi.fn(() => 'dark-purple'),
  getUiSkin:             vi.fn(() => 'classic'),
  getBgImage:            vi.fn(() => null),
  saveUser:              vi.fn(),
  saveUserLocal:         vi.fn(),
  clearLeaderboardOptOutPending: vi.fn(),
  saveTasks:             vi.fn(),
  saveTheme:             vi.fn(),
  saveUiSkin:            vi.fn(),
  saveBgImage:           vi.fn(),
  clearAll:              vi.fn(),
  getRandomThemeEnabled: vi.fn(() => false),
  saveRandomThemeEnabled:vi.fn(),
  getRandomThemeDate:    vi.fn(() => ''),
  saveRandomThemeDate:   vi.fn(),
  isProUser:             vi.fn(() => false),
  isPaidProUser:         vi.fn(() => false),
  isTrialUser:           vi.fn(() => false),
  getTrialProgressPercent: vi.fn(() => null),
  getTrialDaysRemaining: vi.fn(() => 0),
  getProExpiry:          vi.fn(() => null),
  syncFromRemote:        vi.fn(() => Promise.resolve()),
}));

const mockApplyTheme        = vi.hoisted(() => vi.fn());
const mockApplyUiSkin       = vi.hoisted(() => vi.fn());
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
// PRO-014L2: SUB-16 needs an account; tests default to signed in.
const presence = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => presence.signedIn }));
vi.mock('../../pwa/js/theme.js', () => ({
  applyTheme:              mockApplyTheme,
  applyUiSkin:             mockApplyUiSkin,
  applyBgImage:            vi.fn(),
  removeBgImage:           vi.fn(),
  applyRandomThemeForToday: mockApplyRandomTheme,
}));
vi.mock('../../pwa/js/auth.js', () => ({
  getSession: vi.fn(() => Promise.resolve({ user: { email: 'test@example.com' } })),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../../pwa/js/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  uid:   () => 'test-uid-' + Math.random().toString(36).slice(2),
  today: () => '2026-04-11',
}));
vi.mock('../../pwa/js/leveling.js', () => ({
  getLevelInfo: vi.fn(() => ({ level: 1, percent: 0, currentXP: 0, needed: 120 })),
  getTitle:     vi.fn(() => '初心者'),
}));
// PRO-014E2: the name rule and messages are real; only the write and the cache
// clear are stubbed.
const mockSavePublicSettings = vi.hoisted(() => vi.fn());
const mockClearLeaderboardCache = vi.hoisted(() => vi.fn());
vi.mock('../../pwa/js/leaderboardPublic.js', async (importOriginal) => ({
  ...(await importOriginal()),
  savePublicSettings: mockSavePublicSettings,
  clearLeaderboardCacheV2: mockClearLeaderboardCache,
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
  localStorage.clear();
  mockState.user  = { id: 'user-1', name: 'Tester', mode: 'normal', isPublic: false };
  mockState.tasks = [];
  mockState.sessions = [];
  mockState.energy = { currentEnergy: 80, maxEnergy: 100, lastResetDate: '' };
  mockState.dailyPlan = [];
  vi.clearAllMocks();
  mockStorage.getUser.mockImplementation(() => mockState.user);
  mockStorage.getTasks.mockImplementation(() => mockState.tasks);
  mockStorage.getSessions.mockImplementation(() => mockState.sessions);
  mockStorage.getEnergy.mockImplementation(() => mockState.energy);
  mockStorage.getDailyPlan.mockImplementation(() => mockState.dailyPlan);
  mockStorage.syncFromRemote.mockResolvedValue(undefined);
  mockStorage.getTheme.mockReturnValue('dark-purple');
  mockStorage.getUiSkin.mockReturnValue('classic');
  mockStorage.getBgImage.mockReturnValue(null);
  mockStorage.isProUser.mockReturnValue(false);
  mockStorage.isPaidProUser.mockReturnValue(false);
  mockStorage.isTrialUser.mockReturnValue(false);
  mockStorage.getTrialDaysRemaining.mockReturnValue(0);
  mockStorage.getProExpiry.mockReturnValue(null);
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

  it('renders Liquid Galss as a selectable new style theme', () => {
    const c = makeContainer();
    renderSettings(c);
    const card = c.querySelector('[data-theme-id="liquid-galss"]');
    expect(THEMES_NEW.some(t => t.id === 'liquid-galss')).toBe(true);
    expect(card).not.toBeNull();
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

describe('renderSettings: UI skin toggle', () => {
  it('shows Classic UI by default', () => {
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#ui-skin-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
  });

  it('shows Modern UI when saved skin is modern', () => {
    mockStorage.getUiSkin.mockReturnValue('modern');
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#ui-skin-toggle').checked).toBe(true);
  });

  it('switching UI skin to Modern calls applyUiSkin("modern")', () => {
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#ui-skin-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(mockApplyUiSkin).toHaveBeenCalledWith('modern');
  });

  it('switching UI skin back to Classic calls applyUiSkin("classic")', () => {
    mockStorage.getUiSkin.mockReturnValue('modern');
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#ui-skin-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(mockApplyUiSkin).toHaveBeenCalledWith('classic');
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

  it('shows a stored emoji as text and keeps an icon image URL inside src (AUDIT-001)', () => {
    const iconImg = 'data:image/png;base64,AAAA" onerror="window.__xss=1';
    mockState.tasks = [
      makeTask({ id: 'e', emoji: '<img src=x onerror="window.__xss=1">' }),
      makeTask({ id: 'i', name: '圖示', iconImg }),
    ];
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('[onerror]')).toBeNull();
    expect(c.querySelector('.log-emoji').textContent).toBe('<img src=x onerror="window.__xss=1">');
    expect(c.querySelector('img.log-icon-img').getAttribute('src')).toBe(iconImg);
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

describe('renderSettings: leaderboard opt-in and public name (PRO-014E2)', () => {
  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const toggleTo = (c, checked) => {
    const toggle = c.querySelector('#public-toggle');
    toggle.checked = checked;
    toggle.dispatchEvent(new Event('change'));
  };
  const typeName = (c, value) => {
    const input = c.querySelector('#lb-name-input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  afterEach(() => {
    presence.signedIn = true;
  });

  it('shows opt-in toggle unchecked by default', () => {
    const c = makeContainer();
    renderSettings(c);
    const toggle = c.querySelector('#public-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
    expect(c.querySelector('#lb-settings-desc').textContent).toContain('目前不公開');
  });

  it('asks a guest to sign in instead of offering the toggle', () => {
    presence.signedIn = false;
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#public-toggle')).toBeNull();
    expect(c.querySelector('#lb-settings-guest').textContent).toContain('登入帳號後才能加入排行榜');
  });

  it('turning on without a public name asks for one first, blank, and saves nothing yet', () => {
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    expect(mockSavePublicSettings).not.toHaveBeenCalled();
    expect(c.querySelector('#public-toggle').checked).toBe(false);
    const input = c.querySelector('#lb-name-input');
    expect(input).not.toBeNull();
    // Never the account name: that may be a real name.
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(mockState.user.isPublic).toBe(false);
  });

  it.each([
    ['', '請輸入公開名稱'],
    ['   ', '請輸入公開名稱'],
    [`${String.fromCodePoint(0xfe0f)}Owl`, '開頭和結尾不能是空白'],
    [`Owl ${String.fromCodePoint(0xfe0f)}`, '開頭和結尾不能是空白'],
    ['a'.repeat(21), '最多 20 個字'],
    [`Owl${String.fromCodePoint(0x200b)}`, '看不見的字元'],
  ])('refuses %j before asking the server', (name, message) => {
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, name);
    c.querySelector('#lb-name-save').click();
    expect(mockSavePublicSettings).not.toHaveBeenCalled();
    expect(c.querySelector('#lb-name-error').textContent).toContain(message);
    const input = c.querySelector('#lb-name-input');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('lb-name-error');
    typeName(c, 'Owl');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(c.querySelector('#lb-name-error').textContent).toBe('');
  });

  it('drops spaces a phone keyboard left at either end instead of refusing', async () => {
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Night Owl', isPublic: true });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, '  Night Owl ');
    c.querySelector('#lb-name-save').click();
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { displayName: 'Night Owl', isPublic: true });
    await flush();
  });

  it('a second tap on the toggle keeps what was typed', () => {
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, 'Half typed');
    toggleTo(c, true);
    expect(c.querySelector('#lb-name-input').value).toBe('Half typed');
  });

  it('saves the name and joins in one write, then updates only the local copy', async () => {
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Night Owl', isPublic: true });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, 'Night Owl');
    c.querySelector('#lb-name-save').click();
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { displayName: 'Night Owl', isPublic: true });
    await flush();
    expect(mockState.user.isPublic).toBe(true);
    expect(mockState.user.displayName).toBe('Night Owl');
    expect(mockStorage.saveUserLocal).toHaveBeenCalledWith(mockState.user);
    // The user's own choice supersedes an opt-out kept from an older version.
    expect(mockStorage.clearLeaderboardOptOutPending).toHaveBeenCalledWith('user-1');
    // The whole-profile push no longer carries these fields.
    expect(mockStorage.saveUser).not.toHaveBeenCalled();
    expect(mockClearLeaderboardCache).toHaveBeenCalled();
    expect(c.querySelector('#lb-name-editor')).toBeNull();
    expect(c.querySelector('#public-toggle').checked).toBe(true);
    expect(c.querySelector('#lb-current-name').textContent).toBe('Night Owl');
  });

  it('saves on Enter, but not on the Enter that ends an IME composition', async () => {
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: '夜貓', isPublic: true });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, '夜貓');
    const input = c.querySelector('#lb-name-input');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(mockSavePublicSettings).not.toHaveBeenCalled();
    // Safari: the Enter that picks a candidate has isComposing false, keyCode 229.
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }));
    expect(mockSavePublicSettings).not.toHaveBeenCalled();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { displayName: '夜貓', isPublic: true });
    await flush();
  });

  it('joins with the name already on the server, without asking again', async () => {
    mockState.user = { ...mockState.user, displayName: 'Night Owl' };
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Night Owl', isPublic: true });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    expect(c.querySelector('#lb-name-editor')).toBeNull();
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { isPublic: true });
    await flush();
    expect(mockState.user.isPublic).toBe(true);
  });

  it('leaving keeps the public name for next time', async () => {
    mockState.user = { ...mockState.user, isPublic: true, displayName: 'Night Owl' };
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Night Owl', isPublic: false });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, false);
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { isPublic: false });
    await flush();
    expect(mockState.user.isPublic).toBe(false);
    expect(mockState.user.displayName).toBe('Night Owl');
    expect(c.querySelector('#public-toggle').checked).toBe(false);
  });

  it('renames without touching is_public', async () => {
    mockState.user = { ...mockState.user, isPublic: true, displayName: 'Night Owl' };
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Early Bird', isPublic: true });
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#lb-name-edit').click();
    expect(c.querySelector('#lb-name-input').value).toBe('Night Owl');
    typeName(c, 'Early Bird');
    c.querySelector('#lb-name-save').click();
    expect(mockSavePublicSettings).toHaveBeenCalledWith('user-1', { displayName: 'Early Bird' });
    await flush();
    expect(c.querySelector('#lb-current-name').textContent).toBe('Early Bird');
    // A rename is no choice about joining: an opt-out kept from an older
    // version still has to be sent.
    expect(mockStorage.clearLeaderboardOptOutPending).not.toHaveBeenCalled();
  });

  it('leaving also supersedes a kept opt-out', async () => {
    mockState.user = { ...mockState.user, isPublic: true, displayName: 'Night Owl' };
    mockSavePublicSettings.mockResolvedValueOnce({ displayName: 'Night Owl', isPublic: false });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, false);
    await flush();
    expect(mockStorage.clearLeaderboardOptOutPending).toHaveBeenCalledWith('user-1');
  });

  it('offers to set a name when public without one (set by an older version)', () => {
    mockState.user = { ...mockState.user, isPublic: true, displayName: null };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#lb-settings-desc').textContent).toContain('還沒有公開名稱');
    c.querySelector('#lb-name-edit').click();
    expect(c.querySelector('#lb-name-save').textContent).toContain('加入排行榜');
  });

  it('shows the server\'s name-rule refusal and changes nothing locally', async () => {
    mockSavePublicSettings.mockRejectedValueOnce({ code: '23514', message: 'violates check constraint' });
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, 'Night Owl');
    c.querySelector('#lb-name-save').click();
    await flush();
    expect(mockState.user.isPublic).toBe(false);
    expect(mockState.user.displayName).toBeUndefined();
    expect(mockStorage.saveUserLocal).not.toHaveBeenCalled();
    expect(c.querySelector('#lb-name-input').value).toBe('Night Owl');
    expect(c.querySelector('#lb-name-error').textContent).toContain('不符合規則');
    expect(c.querySelector('#public-toggle').checked).toBe(false);
  });

  it('puts the toggle back and says so when the network fails', async () => {
    mockState.user = { ...mockState.user, displayName: 'Night Owl' };
    mockSavePublicSettings.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    await flush();
    expect(mockState.user.isPublic).toBe(false);
    expect(c.querySelector('#public-toggle').checked).toBe(false);
    expect(c.querySelector('#lb-settings-error').textContent).toContain('請確認網路連線');
  });

  it('disables the card while a write is out and ignores a second change', async () => {
    mockState.user = { ...mockState.user, displayName: 'Night Owl' };
    const pending = deferred();
    mockSavePublicSettings.mockReturnValueOnce(pending.promise);
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    const toggle = c.querySelector('#public-toggle');
    expect(toggle.disabled).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(mockSavePublicSettings).toHaveBeenCalledTimes(1);
    pending.resolve({ displayName: 'Night Owl', isPublic: true });
    await flush();
    expect(c.querySelector('#public-toggle').disabled).toBe(false);
    expect(c.querySelector('#public-toggle').checked).toBe(true);
  });

  it('drops an answer that arrives after the account changed', async () => {
    mockState.user = { ...mockState.user, displayName: 'Night Owl' };
    const pending = deferred();
    mockSavePublicSettings.mockReturnValueOnce(pending.promise);
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    mockState.user = { id: 'user-2', name: 'Other', mode: 'normal', isPublic: false };
    pending.resolve({ displayName: 'Night Owl', isPublic: true });
    await flush();
    expect(mockState.user.isPublic).toBe(false);
    expect(mockState.user.displayName).toBeUndefined();
    expect(mockStorage.saveUserLocal).not.toHaveBeenCalled();
  });

  it('starts fresh when Settings is entered again, but keeps the draft across re-renders', () => {
    const c = makeContainer();
    renderSettings(c);
    toggleTo(c, true);
    typeName(c, 'Half typed');
    // A re-render within the page (here: the UI skin toggle) keeps it.
    const skin = c.querySelector('#ui-skin-toggle');
    skin.checked = !skin.checked;
    skin.dispatchEvent(new Event('change'));
    expect(c.querySelector('#lb-name-input').value).toBe('Half typed');
    renderSettings(c);
    expect(c.querySelector('#lb-name-editor')).toBeNull();
  });

  it('escapes the public name', () => {
    mockState.user = { ...mockState.user, isPublic: true, displayName: '<img src=x onerror=alert(1)>' };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#leaderboard-card img')).toBeNull();
    expect(c.querySelector('#lb-current-name').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('renderSettings: version number', () => {
  it('displays APP_VERSION in account card', async () => {
    const { APP_VERSION } = await import('../../pwa/js/version.js');
    const c = makeContainer();
    renderSettings(c);
    expect(c.textContent).toContain(APP_VERSION);
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

describe('renderSettings: manual cloud sync', () => {
  it('refreshes canonical state and reconciles V2 without queueing a reveal', async () => {
    const remote = {
      user: { id: 'synced-owner', name: 'Synced', mode: 'normal', isPublic: false, totalXP: 300 },
      tasks: [{ id: 'synced-task', name: 'Synced task', emoji: '🎯', value: 'A' }],
      sessions: [{
        id: 'synced-session',
        taskId: 'synced-task',
        date: '2026-07-17',
        completedAt: '2026-07-17T10:00:00.000Z',
        result: 'complete',
        durationMinutes: 30,
        impactType: 'task',
        taskNature: 'growth',
        value: 'A',
        resistance: 1.2,
        finalXP: 50,
        isProductiveXP: true,
      }],
      energy: { currentEnergy: 64, maxEnergy: 100, lastResetDate: '2026-07-17' },
      dailyPlan: ['synced-task'],
    };
    mockStorage.getUser.mockReturnValue(remote.user);
    mockStorage.getTasks.mockReturnValue(remote.tasks);
    mockStorage.getSessions.mockReturnValue(remote.sessions);
    mockStorage.getEnergy.mockReturnValue(remote.energy);
    mockStorage.getDailyPlan.mockReturnValue(remote.dailyPlan);
    window.showToast = vi.fn();
    const c = makeContainer();
    renderSettings(c);

    c.querySelector('#sync-btn').click();

    await vi.waitFor(() => expect(mockStorage.syncFromRemote).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mockState.user).toBe(remote.user));
    expect(mockState).toMatchObject(remote);

    const { loadPersonalSpaceV2State } = await import('../../pwa/js/personalSpace/v2/store.js');
    const v2State = loadPersonalSpaceV2State(remote.user.id);
    expect(v2State.rewardLedger.length).toBeGreaterThan(0);
    expect(v2State.pendingRewardReveals).toEqual([]);
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
    mockStorage.isPaidProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('.pro-active-banner')).not.toBeNull();
    expect(c.querySelector('.pro-feat-teaser--active')).not.toBeNull();
    expect(c.querySelector('.pro-feat-teaser--active').textContent).toContain('更多功能持續釋出中');
  });

  it('Pro user does not see hidden-benefits teaser (that is for free users)', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockStorage.isPaidProUser.mockReturnValue(true);
    mockStorage.isTrialUser.mockReturnValue(false);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#pro-card').textContent).not.toContain('還有 Pro 專屬隱藏福利');
  });

  it('Pro user sees termination info: 終身方案 when no expiry', () => {
    mockStorage.isPaidProUser.mockReturnValue(true);
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

  it('guest sees that the streak unlock needs an account, not a progress bar', () => {
    presence.signedIn = false;
    try {
      mockStorage.isProUser.mockReturnValue(false);
      mockStorage.isTrialUser.mockReturnValue(false);
      mockState.user = { name: 'T', mode: 'normal', isPublic: false, streakDays: 50, streakUnlockUsed: false };
      const c = makeContainer();
      renderSettings(c);
      expect(c.querySelector('.streak-unlock-guest')).not.toBeNull();
      expect(c.textContent).toContain('需要登入帳號');
      expect(c.querySelector('.streak-unlock-fill')).toBeNull();
      expect(c.textContent).not.toContain('45/45');
    } finally {
      presence.signedIn = true;
    }
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
    mockStorage.isProUser.mockReturnValue(true);
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

// ─── BUG-125/127: the S-task daily limit counts the app's day ──────────────
// A day starts at newDayHour (default 05:00), as for Sessions and the plan.

describe('renderSettings: S-task daily limit (BUG-125, BUG-127)', () => {
  const zoneBefore = process.env.TZ;
  const LIMIT = '今日已新增 2 個 S 級任務（每日上限）。';

  /** The clock and time zone of this device. */
  function at(zone, iso) {
    process.env.TZ = zone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    vi.setSystemTime(new Date(iso));
  }

  beforeEach(() => {
    window.alert = vi.fn();
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:00 on 2026-04-11 in Taipei.
    at('Asia/Taipei', '2026-04-11T02:00:00Z');
  });
  afterEach(() => {
    vi.useRealTimers();
    if (zoneBefore === undefined) delete process.env.TZ;
    else process.env.TZ = zoneBefore;
  });

  /** Add an S task in the task modal. */
  function addSTask(c) {
    c.querySelector('#add-task-btn').click();
    const modal = document.querySelector('.modal-overlay');
    modal.querySelector('#tm-name').value = '新的 S 級任務';
    modal.querySelector('#tm-nature').value = 'growth';
    modal.querySelector('#tm-nature').dispatchEvent(new window.Event('change'));
    modal.querySelector('#tm-value').value = 'S';
    modal.querySelector('#tm-value').dispatchEvent(new window.Event('change'));
    modal.querySelector('#tm-reason').value = '原因';
    modal.querySelector('#tm-success-criteria').value = '標準';
    modal.querySelector('#tm-save').click();
    // A blocked save leaves the modal open.
    document.querySelector('.modal-overlay')?.remove();
  }

  const sTask = (id, createdAt) => makeTask({ id, value: 'S', taskNature: 'growth', createdAt });

  function settingsWith(tasks) {
    mockState.tasks = tasks;
    const c = makeContainer();
    renderSettings(c);
    return c;
  }

  it('counts a task pulled from the cloud (a timestamp) by its day here', () => {
    // 06:30 on the 11th in Taipei (the 10th in UTC).
    const c = settingsWith([sTask('cloud', '2026-04-10T22:30:00.123456+00:00'), sTask('local', '2026-04-11')]);
    addSTask(c);
    expect(window.alert).toHaveBeenCalledWith(LIMIT);
    expect(mockState.tasks).toHaveLength(2);
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
  });

  it('does not count a task added on another day here, whatever its UTC date', () => {
    // 12:00 on the 11th in Los Angeles.
    at('America/Los_Angeles', '2026-04-11T19:00:00Z');
    const c = settingsWith([
      // 23:30 on the 10th in Los Angeles, though already the 11th in UTC.
      sTask('yesterday', '2026-04-11T06:30:00.000001+00:00'),
      // 08:00 on the 11th in Los Angeles: today.
      sTask('today', '2026-04-11T15:00:00.654321+00:00'),
      sTask('unreadable', 'not a date'),
      sTask('none', undefined),
    ]);
    addSTask(c);
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks).toHaveLength(5);
    expect(mockState.tasks[4]).toMatchObject({ name: '新的 S 級任務', value: 'S' });
  });

  it('counts a task dated here by that date, west of UTC too', () => {
    at('America/Los_Angeles', '2026-04-11T19:00:00Z');
    // Read as a time, '2026-04-11' is UTC midnight: the 10th in Los Angeles.
    const c = settingsWith([sTask('local', '2026-04-11'), sTask('today', '2026-04-11T15:00:00.654321+00:00')]);
    addSTask(c);
    expect(window.alert).toHaveBeenCalledWith(LIMIT);
    expect(mockState.tasks).toHaveLength(2);
  });

  it('dates a new task by the app\'s day, not the UTC date', () => {
    // 06:30 on the 11th in Taipei; UTC is still on the 10th.
    at('Asia/Taipei', '2026-04-10T22:30:00Z');
    const c = settingsWith([]);
    addSTask(c);
    expect(mockState.tasks[0].createdAt).toBe('2026-04-11');
    // Its day is its creation date; the changed-into-S mark is for edits only.
    expect(mockState.tasks[0]).not.toHaveProperty('sSince');
    // 01:30 on the 12th, before the new-day hour: still the 11th's day.
    at('Asia/Taipei', '2026-04-11T17:30:00Z');
    addSTask(c);
    expect(mockState.tasks[1].createdAt).toBe('2026-04-11');
  });

  it('keeps counting the night before until the new-day hour (BUG-127)', () => {
    // 23:00 on the 10th in Taipei: two S tasks.
    at('Asia/Taipei', '2026-04-10T15:00:00Z');
    const c = settingsWith([]);
    addSTask(c);
    addSTask(c);
    expect(mockState.tasks.map(t => t.createdAt)).toEqual(['2026-04-10', '2026-04-10']);
    // 00:30 on the 11th: still the 10th's day, so a third is not added.
    at('Asia/Taipei', '2026-04-10T16:30:00Z');
    addSTask(c);
    expect(window.alert).toHaveBeenCalledWith(LIMIT);
    expect(mockState.tasks).toHaveLength(2);
    // 05:30 on the 11th: a new day.
    window.alert.mockClear();
    at('Asia/Taipei', '2026-04-10T21:30:00Z');
    addSTask(c);
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks[2].createdAt).toBe('2026-04-11');
  });

  it('counts a cloud task from before the new-day hour as the day before (BUG-127)', () => {
    // 02:00 on the 11th in Taipei: still the 10th's day.
    at('Asia/Taipei', '2026-04-10T18:00:00Z');
    const c = settingsWith([
      sTask('evening', '2026-04-10T14:00:00.000001+00:00'),   // 22:00 on the 10th
      sTask('night', '2026-04-10T17:00:00.000001+00:00'),     // 01:00 on the 11th
    ]);
    addSTask(c);
    expect(window.alert).toHaveBeenCalledWith(LIMIT);
  });

  it('uses the user\'s own new-day hour (BUG-127)', () => {
    // A day that starts at midnight: at 02:00 on the 11th it is the 11th.
    mockState.user.newDayHour = 0;
    at('Asia/Taipei', '2026-04-10T18:00:00Z');
    const c = settingsWith([
      sTask('evening', '2026-04-10T14:00:00.000001+00:00'),   // the 10th
      sTask('night', '2026-04-10T17:00:00.000001+00:00'),     // the 11th
    ]);
    addSTask(c);
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks[2].createdAt).toBe('2026-04-11');
  });

  it('does not count the built-in tasks', () => {
    // A new account's built-in S task is dated today (createDefaultTasks).
    const c = settingsWith([{ ...sTask('builtin', '2026-04-11'), isDefault: true }, sTask('local', '2026-04-11')]);
    addSTask(c);
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks).toHaveLength(3);
  });

  /** Edit a task into S (advanced mode edits any task). */
  function editIntoS(c, id) {
    c.querySelector(`[data-edit="${id}"]`).click();
    const modal = document.querySelector('.modal-overlay');
    modal.querySelector('#tm-nature').value = 'growth';
    modal.querySelector('#tm-nature').dispatchEvent(new window.Event('change'));
    modal.querySelector('#tm-value').value = 'S';
    modal.querySelector('#tm-value').dispatchEvent(new window.Event('change'));
    modal.querySelector('#tm-reason').value = '原因';
    modal.querySelector('#tm-success-criteria').value = '標準';
    modal.querySelector('#tm-save').click();
    document.querySelector('.modal-overlay')?.remove();
  }

  it('counts a task changed into S as one added today (BUG-127)', () => {
    mockState.user.mode = 'advanced';
    const old = id => makeTask({ id, value: 'A', createdAt: '2026-03-01' });
    const c = settingsWith([old('a1'), old('a2'), old('a3')]);
    editIntoS(c, 'a1');
    editIntoS(c, 'a2');
    expect(mockState.tasks.map(t => [t.value, t.sSince, t.createdAt])).toEqual([
      ['S', '2026-04-11', '2026-03-01'],
      ['S', '2026-04-11', '2026-03-01'],
      ['A', undefined, '2026-03-01'],
    ]);
    // A third is the limit, by edit or by adding.
    editIntoS(c, 'a3');
    expect(window.alert).toHaveBeenLastCalledWith(LIMIT);
    expect(mockState.tasks[2].value).toBe('A');
    window.alert.mockClear();
    addSTask(c);
    expect(window.alert).toHaveBeenLastCalledWith(LIMIT);
    expect(mockState.tasks).toHaveLength(3);
    // The next day it can be changed.
    window.alert.mockClear();
    at('Asia/Taipei', '2026-04-12T02:00:00Z');
    editIntoS(c, 'a3');
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks[2]).toMatchObject({ value: 'S', sSince: '2026-04-12' });
  });

  it('does not stop a change into S on a day with room, and keeps the day through later edits', () => {
    mockState.user.mode = 'advanced';
    const c = settingsWith([sTask('today', '2026-04-11'), makeTask({ id: 'a1', value: 'A', createdAt: '2026-03-01' })]);
    editIntoS(c, 'a1');
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockState.tasks[1]).toMatchObject({ value: 'S', sSince: '2026-04-11' });
    // Renamed the next day: still S, still counted for the 11th, not again.
    at('Asia/Taipei', '2026-04-12T02:00:00Z');
    c.querySelector('[data-edit="a1"]').click();
    document.querySelector('.modal-overlay #tm-name').value = '改名';
    document.querySelector('.modal-overlay #tm-save').click();
    expect(mockState.tasks[1]).toMatchObject({ name: '改名', value: 'S', sSince: '2026-04-11' });
    // Changed back to A: the mark goes with it.
    c.querySelector('[data-edit="a1"]').click();
    const modal = document.querySelector('.modal-overlay');
    modal.querySelector('#tm-value').value = 'A';
    modal.querySelector('#tm-value').dispatchEvent(new window.Event('change'));
    window.confirm = vi.fn(() => true);
    modal.querySelector('#tm-save').click();
    expect(mockState.tasks[1].value).toBe('A');
    expect(mockState.tasks[1]).not.toHaveProperty('sSince');
  });

  it('keeps the date of an edited task, which the daily limit does not stop', () => {
    mockState.user.mode = 'advanced';
    // Two S tasks already added today: editing one of them is still allowed.
    const c = settingsWith([
      { ...sTask('cloud', '2026-04-10T17:30:00.123456+00:00'), reason: '原因', successCriteria: '標準' },
      sTask('local-1', '2026-04-11'),
      sTask('local-2', '2026-04-11'),
    ]);
    c.querySelector('[data-edit="cloud"]').click();
    const modal = document.querySelector('.modal-overlay');
    modal.querySelector('#tm-name').value = '改過的名字';
    modal.querySelector('#tm-save').click();
    expect(window.alert).not.toHaveBeenCalled();
    expect(mockStorage.saveTasks).toHaveBeenCalledTimes(1);
    expect(mockState.tasks[0]).toMatchObject({ name: '改過的名字', createdAt: '2026-04-10T17:30:00.123456+00:00' });
    expect(mockState.tasks).toHaveLength(3);
  });
});

// ─── BUG-126: an image that cannot be used says so ──────────────────────────

describe('renderSettings: background and task icon images (BUG-126)', () => {
  const RealImage = window.Image;
  const RealFileReader = window.FileReader;
  const realGetContext = window.HTMLCanvasElement.prototype.getContext;
  const realToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
  let canvases;

  /** Images decode (or fail) like a browser's; jsdom does not decode them. */
  function images({ decodes = true, width = 1600, height = 1200 } = {}) {
    window.Image = class {
      set src(value) {
        this._src = value;
        this.width = width; this.height = height;
        setTimeout(() => (decodes ? this.onload?.() : this.onerror?.()), 0);
      }
      get src() { return this._src; }
    };
    canvases = [];
    window.HTMLCanvasElement.prototype.getContext = function () {
      canvases.push(this);
      return { drawImage: vi.fn() };
    };
    window.HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
      return `data:${type};q=${quality};${this.width}x${this.height}`;
    };
  }

  beforeEach(() => { window.showToast = vi.fn(); });
  afterEach(() => {
    window.Image = RealImage;
    window.FileReader = RealFileReader;
    window.HTMLCanvasElement.prototype.getContext = realGetContext;
    window.HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  });

  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  async function choose(input) {
    const file = new window.File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    await settle();
  }

  it('sets the background from a photo, square and at most 900 px', async () => {
    images();
    const c = makeContainer();
    renderSettings(c);
    await choose(c.querySelector('#bg-input'));
    const { applyBgImage } = await import('../../pwa/js/theme.js');
    expect(applyBgImage).toHaveBeenCalledWith('data:image/jpeg;q=0.72;900x900');
    expect(canvases).toHaveLength(1);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('says so when the background photo cannot be decoded', async () => {
    images({ decodes: false });
    const c = makeContainer();
    renderSettings(c);
    await choose(c.querySelector('#bg-input'));
    const { applyBgImage } = await import('../../pwa/js/theme.js');
    expect(window.showToast).toHaveBeenCalledWith('圖片處理失敗，請換一張照片');
    expect(applyBgImage).not.toHaveBeenCalled();
  });

  it('says so when the file cannot be read', async () => {
    images();
    window.FileReader = class {
      readAsDataURL() { setTimeout(() => this.onerror?.(), 0); }
    };
    const c = makeContainer();
    renderSettings(c);
    await choose(c.querySelector('#bg-input'));
    expect(window.showToast).toHaveBeenCalledWith('圖片處理失敗，請換一張照片');
  });

  it('says so when the photo decodes but cannot be drawn', async () => {
    images();
    window.HTMLCanvasElement.prototype.getContext = () => null;
    const c = makeContainer();
    renderSettings(c);
    await choose(c.querySelector('#bg-input'));
    const { applyBgImage } = await import('../../pwa/js/theme.js');
    expect(window.showToast).toHaveBeenCalledWith('圖片處理失敗，請換一張照片');
    expect(applyBgImage).not.toHaveBeenCalled();
  });

  it('says so when the device has no room for the background', async () => {
    images();
    const { applyBgImage } = await import('../../pwa/js/theme.js');
    applyBgImage.mockImplementationOnce(() => { throw new window.DOMException('full', 'QuotaExceededError'); });
    const c = makeContainer();
    renderSettings(c);
    await choose(c.querySelector('#bg-input'));
    expect(window.showToast).toHaveBeenCalledWith('這台裝置的空間不足，背景圖片沒有存下來');
  });

  it('uses a photo as the task icon, and keeps the emoji when it cannot be decoded', async () => {
    images({ width: 120, height: 300 });
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#add-task-btn').click();
    const modal = document.querySelector('.modal-overlay');
    await choose(modal.querySelector('#tm-icon-input'));
    expect(modal.querySelector('#tm-icon-preview img').getAttribute('src')).toBe('data:image/jpeg;q=0.82;120x120');
    expect(modal.querySelector('#tm-emoji-section').style.display).toBe('none');

    // Back to the emoji, then a photo that cannot be decoded.
    modal.querySelector('#tm-icon-clear-btn').click();
    images({ decodes: false });
    await choose(modal.querySelector('#tm-icon-input'));
    expect(window.showToast).toHaveBeenCalledWith('圖片處理失敗，請換一張照片');
    expect(modal.querySelector('#tm-icon-preview img')).toBeNull();
    expect(modal.querySelector('#tm-emoji-section').style.display).toBe('');
    modal.querySelector('#tm-name').value = '有圖示的任務';
    modal.querySelector('#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ name: '有圖示的任務', iconImg: null, emoji: '🎯' });
  });
});
