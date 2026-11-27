// @vitest-environment jsdom
/**
 * settingsControls.test.js — TEST-009: the Settings page's other controls.
 * Pro info popovers and plan sheet, preferences (focus sound, default
 * minutes, new-day hour, advanced mode), the task list expander, the task
 * window's rules (S reason and criteria, A confirmation, nature and value,
 * XP preview, emoji and icon), exports for free and Pro, manual sync errors,
 * the proof-photo buttons and clearing the local cache.
 * Same mocks as settings.test.js.
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

// The proof-photo actions and the exports are their own modules (tested there):
// here only what the page asks of them.
const proof = vi.hoisted(() => ({
  stats: { count: 0, kb: 0 },
  clearDeviceProofs: vi.fn(() => ({ cleared: 0, kept: 0 })),
  deleteAllProofs: vi.fn(() => Promise.resolve({ ok: true, local: 0, cloud: 0 })),
}));
vi.mock('../../pwa/js/platform/proofLocal.js', () => ({
  accountProofStats: () => proof.stats,
  clearDeviceProofs: proof.clearDeviceProofs,
  deleteAllProofs: proof.deleteAllProofs,
}));
const exportsMock = vi.hoisted(() => ({ exportSessionsCSV: vi.fn(), showReportPicker: vi.fn() }));
vi.mock('../../pwa/js/export.js', () => exportsMock);

import { renderSettings } from '../../pwa/js/pages/settings.js';

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

const change = (el, value) => {
  if (el.type === 'checkbox') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new window.Event('change'));
};

// ─── Pro: info popovers and the plan sheet ──────────────────────────────────

describe('Pro feature info popovers', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('explains a feature under its button, kept inside the screen, and closes on the next click', () => {
    vi.useFakeTimers();
    const c = makeContainer();
    renderSettings(c);
    const buttons = c.querySelectorAll('.pro-feat-info-btn');
    expect(buttons).toHaveLength(4);
    // A button at the left edge: the popover does not go off screen.
    buttons[3].getBoundingClientRect = () => ({ left: 0, width: 20, bottom: 100 });
    buttons[3].click();
    const pop = document.getElementById('pro-feat-popover');
    expect(pop.querySelector('.pro-feat-pop-title').textContent).toBe('📤 CSV 匯出');
    expect(pop.querySelector('.pro-feat-pop-body').textContent).toContain('一鍵匯出所有打卡紀錄為 CSV');
    expect(pop.style.left).toBe('12px');
    expect(pop.style.top).toBe('108px');

    // Another button replaces it, at the right edge kept inside too; on a
    // scrolled page it sits under the button, not under the top of the page.
    buttons[0].getBoundingClientRect = () => ({ left: window.innerWidth - 10, width: 20, bottom: 50 });
    const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 300 });
    try {
      buttons[0].click();
    } finally {
      if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
      else delete window.scrollY;
    }
    expect(document.querySelectorAll('#pro-feat-popover')).toHaveLength(1);
    const next = document.getElementById('pro-feat-popover');
    expect(next.querySelector('.pro-feat-pop-title').textContent).toBe('∞ 完整歷史紀錄');
    expect(next.style.left).toBe(`${window.innerWidth - 240 - 12}px`);
    expect(next.style.top).toBe('358px');

    // A click anywhere closes it (once the opening click has passed).
    vi.advanceTimersByTime(0);
    document.body.click();
    expect(next.classList.contains('pro-feat-popover-out')).toBe(true);
    vi.advanceTimersByTime(179);
    expect(next.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(next.isConnected).toBe(false);
  });
});

describe('Pro plan sheet', () => {
  beforeEach(() => { window.showToast = vi.fn(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the three plans once, and a plan says payments are coming, then closes', () => {
    vi.useFakeTimers();
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#pro-view-all').click();
    c.querySelector('#pro-view-all').click();
    expect(document.querySelectorAll('#pro-sheet-overlay')).toHaveLength(1);
    const plans = [...document.querySelectorAll('.pro-sheet-plan')];
    expect(plans.map(p => p.dataset.plan)).toEqual(['yearly', 'monthly', 'lifetime']);
    expect(plans.map(p => p.querySelector('.pro-sheet-plan-price').textContent))
      .toEqual(['NT$699/年', 'NT$99/月', 'NT$1,999 一次']);

    // Inside the sheet: stays open.
    document.getElementById('pro-sheet').click();
    expect(document.getElementById('pro-sheet-overlay').classList.contains('pro-sheet-overlay-out')).toBe(false);

    document.querySelector('.pro-sheet-plan-btn[data-plan="monthly"]').click();
    expect(window.showToast).toHaveBeenCalledWith('金流整合即將上線，敬請期待！');
    expect(document.getElementById('pro-sheet').classList.contains('pro-sheet-out')).toBe(true);
    vi.advanceTimersByTime(279);
    expect(document.getElementById('pro-sheet-overlay')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById('pro-sheet-overlay')).toBeNull();
  });

  it('closes when the dimmed area around it is clicked', () => {
    vi.useFakeTimers();
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#pro-view-all').click();
    const overlay = document.getElementById('pro-sheet-overlay');
    overlay.click();
    expect(overlay.classList.contains('pro-sheet-overlay-out')).toBe(true);
    vi.advanceTimersByTime(280);
    expect(overlay.isConnected).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('the yearly subscribe button says payments are coming', () => {
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#pro-subscribe-yearly').click();
    expect(window.showToast).toHaveBeenCalledWith('金流整合即將上線，敬請期待！');
  });
});

describe('going to the Pro card from a locked control', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('scrolls the page to the Pro card and flashes it once the scroll ends', () => {
    vi.useFakeTimers();
    const content = document.createElement('div');
    content.id = 'content';
    content.scrollTo = vi.fn();
    document.body.appendChild(content);
    const c = document.createElement('div');
    content.appendChild(c);
    renderSettings(c);
    c.querySelector('#export-csv-btn').click();
    expect(exportsMock.exportSessionsCSV).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    const card = document.getElementById('pro-card');
    expect(content.scrollTo).toHaveBeenCalledWith({ top: card.offsetTop - 16, behavior: 'smooth' });
    expect(card.classList.contains('pro-card-highlight')).toBe(false);
    content.dispatchEvent(new window.Event('scrollend'));
    expect(card.classList.contains('pro-card-highlight')).toBe(true);
    // Shown once, for 2 s: the flag is used up, and the fallback does not flash again.
    expect(sessionStorage.getItem('orbit_pro_highlight')).toBeNull();
    vi.advanceTimersByTime(1999);
    expect(card.classList.contains('pro-card-highlight')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(card.classList.contains('pro-card-highlight')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(card.classList.contains('pro-card-highlight')).toBe(false);
    // Later scrolls of the page do not flash it again.
    content.dispatchEvent(new window.Event('scrollend'));
    expect(card.classList.contains('pro-card-highlight')).toBe(false);
  });

  it('flashes it after 600 ms when the browser sends no scroll end', () => {
    vi.useFakeTimers();
    const content = document.createElement('div');
    content.id = 'content';
    content.scrollTo = vi.fn();
    document.body.appendChild(content);
    const c = document.createElement('div');
    content.appendChild(c);
    renderSettings(c);
    c.querySelector('#export-pdf-btn').click();
    expect(exportsMock.showReportPicker).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50 + 599);
    const card = document.getElementById('pro-card');
    expect(card.classList.contains('pro-card-highlight')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(card.classList.contains('pro-card-highlight')).toBe(true);
  });
});

describe('exports for Pro', () => {
  it('runs the CSV export and opens the report picker', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#export-csv-btn').textContent).toBe('📊 匯出 CSV');
    c.querySelector('#export-csv-btn').click();
    c.querySelector('#export-pdf-btn').click();
    expect(exportsMock.exportSessionsCSV).toHaveBeenCalledTimes(1);
    expect(exportsMock.showReportPicker).toHaveBeenCalledTimes(1);
  });
});

// ─── Preferences ────────────────────────────────────────────────────────────

describe('preferences', () => {
  it('saves the focus sound, the default focus minutes and the new-day hour', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user = { ...mockState.user, focusSoundEnabled: true, focusDefaultMinutes: null };
    const c = makeContainer();
    renderSettings(c);
    change(c.querySelector('#focus-sound-toggle'), false);
    expect(mockState.user.focusSoundEnabled).toBe(false);
    change(c.querySelector('#focus-default-min-select'), '45');
    expect(mockState.user.focusDefaultMinutes).toBe(45);
    change(c.querySelector('#focus-default-min-select'), '');
    expect(mockState.user.focusDefaultMinutes).toBeNull();
    expect(c.querySelector('#new-day-hour-select').value).toBe('5');
    change(c.querySelector('#new-day-hour-select'), '0');
    expect(mockState.user.newDayHour).toBe(0);
    expect(mockStorage.saveUser).toHaveBeenCalledTimes(4);
    expect(mockStorage.saveUser).toHaveBeenLastCalledWith(mockState.user);
  });

  it('has the focus sound on until it is turned off', () => {
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle').checked).toBe(true);
    expect(c.querySelector('#focus-default-min-select').value).toBe('');
  });

  it('shows the saved choices when the page opens', () => {
    mockStorage.isProUser.mockReturnValue(true);
    mockState.user = { ...mockState.user, focusSoundEnabled: false, focusDefaultMinutes: 90, newDayHour: 3 };
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#focus-sound-toggle').checked).toBe(false);
    expect(c.querySelector('#focus-default-min-select').value).toBe('90');
    expect(c.querySelector('#new-day-hour-select').value).toBe('3');
  });

  it('saves nothing without a user (a page left open after signing out)', () => {
    window.confirm = vi.fn(() => true);
    mockStorage.isProUser.mockReturnValue(true);
    const c = makeContainer();
    renderSettings(c);
    mockState.user = null;
    change(c.querySelector('#focus-sound-toggle'), false);
    change(c.querySelector('#focus-default-min-select'), '25');
    change(c.querySelector('#new-day-hour-select'), '2');
    change(c.querySelector('#mode-toggle'), true);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockStorage.saveUser).not.toHaveBeenCalled();
  });

  it('switches back to normal mode without asking', () => {
    window.confirm = vi.fn(() => true);
    mockState.user.mode = 'advanced';
    const c = makeContainer();
    renderSettings(c);
    change(c.querySelector('#mode-toggle'), false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockState.user.mode).toBe('normal');
    expect(c.querySelector('#mode-warning').classList.contains('hidden')).toBe(true);
  });
});

describe('task list', () => {
  it('shows the first tasks and the rest behind 展開全部', () => {
    mockState.tasks = Array.from({ length: 9 }, (_, i) => makeTask({ id: `t${i}`, name: `任務 ${i}` }));
    const c = makeContainer();
    renderSettings(c);
    const extra = c.querySelector('#tasks-extra');
    const shown = [...c.querySelectorAll('#tasks-list [data-del]')].filter(b => !extra.contains(b));
    expect(shown.map(b => b.dataset.del)).toEqual(['t0', 't1', 't2', 't3']);
    expect(extra.querySelectorAll('[data-del]')).toHaveLength(5);
    expect(extra.classList.contains('hidden')).toBe(true);
    expect(c.querySelector('#tasks-expand-btn').textContent).toBe('展開全部（共 9 項）');
    c.querySelector('#tasks-expand-btn').click();
    expect(extra.classList.contains('hidden')).toBe(false);
    expect(c.querySelector('#tasks-expand-row')).toBeNull();
  });

  it('has no expander when every task fits', () => {
    mockState.tasks = Array.from({ length: 4 }, (_, i) => makeTask({ id: `t${i}` }));
    const c = makeContainer();
    renderSettings(c);
    expect(c.querySelector('#tasks-expand-btn')).toBeNull();
    expect(c.querySelector('#tasks-extra')).toBeNull();
  });
});

describe('background and tour', () => {
  it('opens the file picker from 上傳圖片, and 移除背景 removes the background', async () => {
    const { removeBgImage } = await import('../../pwa/js/theme.js');
    mockStorage.getBgImage.mockReturnValue('data:image/jpeg;base64,AAAA');
    const c = makeContainer();
    renderSettings(c);
    const picker = vi.fn();
    c.querySelector('#bg-input').addEventListener('click', picker);
    c.querySelector('#bg-upload-btn').click();
    expect(picker).toHaveBeenCalledTimes(1);
    mockStorage.getBgImage.mockReturnValue(null);
    c.querySelector('#bg-clear-btn').click();
    expect(removeBgImage).toHaveBeenCalledTimes(1);
    expect(c.querySelector('#bg-clear-btn')).toBeNull();
  });

  it('restarts the tour', () => {
    window.startTour = vi.fn();
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#tour-btn').click();
    expect(window.startTour).toHaveBeenCalledTimes(1);
  });
});

// ─── Manual sync: what each failure says ────────────────────────────────────

describe('manual cloud sync failures', () => {
  beforeEach(() => { window.showToast = vi.fn(); });

  it.each([
    ['cooldown:42', '請等待 42 秒後再試'],
    ['ratelimit', '1 小時內最多同步 3 次，請稍後再試'],
    ['unauthenticated', '請先登入才能同步資料'],
    ['Failed to fetch', '同步失敗，請確認網路連線'],
  ])('%s → %s, and the button works again', async (message, toast) => {
    mockStorage.syncFromRemote.mockRejectedValueOnce(new Error(message));
    const c = makeContainer();
    renderSettings(c);
    const btn = c.querySelector('#sync-btn');
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('同步中…');
    expect(btn.classList.contains('btn-syncing')).toBe(true);
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith(toast));
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↻ 從雲端同步資料');
    expect(btn.classList.contains('btn-syncing')).toBe(false);
  });

  it('asks to sign in without a user, and does not sync', () => {
    const c = makeContainer();
    renderSettings(c);
    mockState.user = null;
    c.querySelector('#sync-btn').click();
    expect(window.showToast).toHaveBeenCalledWith('請先登入才能同步資料');
    expect(mockStorage.syncFromRemote).not.toHaveBeenCalled();
  });

  it('ignores a second tap while it is syncing', async () => {
    let finish;
    mockStorage.syncFromRemote.mockImplementationOnce(() => new Promise((_, reject) => { finish = reject; }));
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#sync-btn').click();
    c.querySelector('#sync-btn').click();
    expect(mockStorage.syncFromRemote).toHaveBeenCalledTimes(1);
    finish(new Error('ratelimit'));
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledTimes(1));
  });
});

// ─── Proof photos, sign out and the local cache ─────────────────────────────

describe('proof-photo buttons', () => {
  beforeEach(() => {
    window.showToast = vi.fn();
    proof.stats = { count: 3, kb: 120 };
    proof.clearDeviceProofs.mockReturnValue({ cleared: 3, kept: 0 });
  });

  it('a signed-in account clears this device only, after saying the cloud keeps them', () => {
    window.confirm = vi.fn(() => true);
    const c = makeContainer();
    renderSettings(c);
    const btn = c.querySelector('#proof-clear-btn');
    expect(btn.textContent).toBe('🗑 清除這台裝置的佐證照片（3 張，約 120 KB，與下載的副本）');
    btn.click();
    expect(window.confirm.mock.calls[0][0]).toContain('雲端的備份會保留');
    expect(window.confirm.mock.calls[0][0]).toContain('拍的 3 張，約 120 KB');
    expect(proof.clearDeviceProofs).toHaveBeenCalledWith('user-1', mockState.sessions, { signedIn: true });
    expect(window.showToast).toHaveBeenCalledWith('已清除這台裝置的佐證照片（3 張與下載的副本）');
    // The page is drawn again with what is left.
    expect(c.querySelector('#proof-clear-btn')).not.toBe(btn);
  });

  it('says how many it kept because they are not uploaded yet', () => {
    window.confirm = vi.fn(() => true);
    proof.clearDeviceProofs.mockReturnValue({ cleared: 1, kept: 2 });
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#proof-clear-btn').click();
    expect(window.showToast).toHaveBeenCalledWith('已清除 1 張；2 張還沒確定上傳的先保留');
  });

  it('warns a guest that their photos have no cloud copy', () => {
    presence.signedIn = false;
    window.confirm = vi.fn(() => true);
    try {
      const c = makeContainer();
      renderSettings(c);
      expect(c.querySelector('#proof-delete-all-btn')).toBeNull();
      expect(c.querySelector('#proof-clear-btn').textContent).toBe('🗑 刪除佐證照片（3 張，約 120 KB）');
      c.querySelector('#proof-clear-btn').click();
      expect(window.confirm.mock.calls[0][0]).toContain('訪客的照片沒有雲端備份，刪除後無法復原');
      expect(proof.clearDeviceProofs).toHaveBeenCalledWith('user-1', mockState.sessions, { signedIn: false });
      expect(window.showToast).toHaveBeenCalledWith('已清除 3 張佐證照片');
    } finally {
      presence.signedIn = true;
    }
  });

  it('a guest with no photos has nothing to clear', () => {
    presence.signedIn = false;
    proof.stats = { count: 0, kb: 0 };
    window.confirm = vi.fn(() => true);
    try {
      const c = makeContainer();
      renderSettings(c);
      const btn = c.querySelector('#proof-clear-btn');
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toBe('🗑 刪除佐證照片（這台裝置沒有）');
      btn.disabled = false;
      btn.click();
      expect(window.confirm).not.toHaveBeenCalled();
      expect(proof.clearDeviceProofs).not.toHaveBeenCalled();
    } finally {
      presence.signedIn = true;
    }
  });

  it('keeps everything when the question is cancelled', () => {
    window.confirm = vi.fn(() => false);
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#proof-clear-btn').click();
    expect(proof.clearDeviceProofs).not.toHaveBeenCalled();
  });

  it('deletes every photo, cloud included, only after asking twice', async () => {
    proof.deleteAllProofs.mockResolvedValueOnce({ ok: true, local: 3, cloud: 5 });
    window.confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#proof-delete-all-btn').click();
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(proof.deleteAllProofs).not.toHaveBeenCalled();

    window.confirm = vi.fn(() => true);
    const btn = c.querySelector('#proof-delete-all-btn');
    btn.click();
    expect(window.confirm.mock.calls[1][0]).toContain('刪除後無法復原');
    expect(btn.disabled).toBe(true);
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith('已刪除所有佐證照片（雲端 5 張）'));
    expect(proof.deleteAllProofs).toHaveBeenCalledWith('user-1', mockState.sessions);
    // The page was drawn again: a fresh, enabled button.
    expect(c.querySelector('#proof-delete-all-btn')).not.toBe(btn);
    expect(c.querySelector('#proof-delete-all-btn').disabled).toBe(false);
  });

  it('says to try again online when the cloud copies are not all deleted', async () => {
    proof.deleteAllProofs.mockResolvedValueOnce({ ok: false, local: 3, cloud: 1 });
    window.confirm = vi.fn(() => true);
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#proof-delete-all-btn').click();
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith('雲端的佐證照片還沒全部刪除：連上網路後再按一次'));
  });

  it('does not redraw a page that was left while deleting', async () => {
    let finish;
    proof.deleteAllProofs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    window.confirm = vi.fn(() => true);
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#proof-delete-all-btn').click();
    // The router reuses the container for another page.
    c.innerHTML = '<div id="other-page">首頁</div>';
    finish({ ok: true, local: 0, cloud: 2 });
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith('已刪除所有佐證照片（雲端 2 張）'));
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
  });
});

describe('sign out and the local cache', () => {
  it('signs out', () => {
    window.signOut = vi.fn();
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#signout-btn').click();
    expect(window.signOut).toHaveBeenCalledTimes(1);
  });

  it('clears the local cache only when confirmed', () => {
    window.confirm = vi.fn(() => false);
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#reset-btn').click();
    expect(window.confirm).toHaveBeenCalledWith('清除本機快取？重新登入後資料會從雲端自動還原。');
    expect(mockStorage.clearAll).not.toHaveBeenCalled();
    window.confirm = vi.fn(() => true);
    c.querySelector('#reset-btn').click();
    expect(mockStorage.clearAll).toHaveBeenCalledTimes(1);
  });
});

// ─── The task window ────────────────────────────────────────────────────────

describe('task window', () => {
  beforeEach(() => {
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => { vi.useRealTimers(); });

  function openNew() {
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#add-task-btn').click();
    return { c, modal: document.querySelector('.modal-overlay') };
  }
  const $ = (modal, sel) => modal.querySelector(sel);
  const enabledValues = modal => [...$(modal, '#tm-value').options].filter(o => !o.disabled).map(o => o.value);

  it('focuses the name, and needs one to save', () => {
    vi.useFakeTimers();
    const { modal } = openNew();
    vi.advanceTimersByTime(80);
    expect(document.activeElement).toBe($(modal, '#tm-name'));
    $(modal, '#tm-name').value = '   ';
    $(modal, '#tm-save').click();
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
    expect(modal.isConnected).toBe(true);
  });

  it('previews the XP of the chosen value, difficulty and resistance', () => {
    const { modal } = openNew();
    // New tasks start at B, medium difficulty, low resistance: 20 × 1.2 × 0.7 × 1.0.
    expect($(modal, '#tm-xp-preview').textContent).toBe('預估 XP：+17（完成）/ +10（部分完成）');
    change($(modal, '#tm-value'), 'S');
    // 20 × 3.2 × 0.7 × 1.0
    expect($(modal, '#tm-xp-preview').textContent).toBe('預估 XP：+45（完成）/ +27（部分完成）');
    change($(modal, '#tm-difficulty'), '1.0');
    expect($(modal, '#tm-xp-preview').textContent).toBe('預估 XP：+64（完成）/ +38（部分完成）');
    change($(modal, '#tm-resistance'), '1.4');
    expect($(modal, '#tm-xp-preview').textContent).toBe('預估 XP：+90（完成）/ +54（部分完成）');
    change($(modal, '#tm-nature'), 'entertainment');
    expect($(modal, '#tm-xp-preview').textContent).toBe('此任務不提供 XP');
  });

  it('allows only the values that fit the nature, and shows the S fields only for S', () => {
    const { modal } = openNew();
    expect(enabledValues(modal)).toEqual(['S', 'A', 'B', 'D']);
    change($(modal, '#tm-value'), 'S');
    expect($(modal, '#tm-s-fields').style.display).toBe('');
    // Maintenance cannot be S: the value falls back to B.
    change($(modal, '#tm-nature'), 'maintenance');
    expect(enabledValues(modal)).toEqual(['A', 'B', 'D']);
    expect($(modal, '#tm-value').value).toBe('B');
    expect($(modal, '#tm-s-fields').style.display).toBe('none');
    // Entertainment is always D.
    change($(modal, '#tm-nature'), 'entertainment');
    expect(enabledValues(modal)).toEqual(['D']);
    expect($(modal, '#tm-value').value).toBe('D');
    // Back to growth: everything again, the value kept.
    change($(modal, '#tm-nature'), 'growth');
    expect(enabledValues(modal)).toEqual(['S', 'A', 'B', 'D']);
    expect($(modal, '#tm-value').value).toBe('D');
  });

  it('opens an edited task with the values its nature allows', () => {
    mockState.user.mode = 'advanced';
    mockState.tasks = [
      makeTask({ id: 'fun', taskNature: 'entertainment', value: 'D' }),
      makeTask({ id: 'chore', taskNature: 'maintenance', value: 'B' }),
    ];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-edit="fun"]').click();
    let modal = document.querySelector('.modal-overlay');
    expect($(modal, '.modal-title').textContent).toBe('編輯任務');
    expect(enabledValues(modal)).toEqual(['D']);
    expect($(modal, '#tm-save').textContent).toBe('儲存變更');
    modal.remove();
    c.querySelector('[data-edit="chore"]').click();
    modal = document.querySelector('.modal-overlay');
    expect(enabledValues(modal)).toEqual(['A', 'B', 'D']);
    expect($(modal, '#tm-value').value).toBe('B');
  });

  it('does not ask again when an A task is edited', () => {
    mockState.user.mode = 'advanced';
    mockState.tasks = [makeTask({ id: 'a', value: 'A' })];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-edit="a"]').click();
    document.querySelector('.modal-overlay #tm-name').value = '改名';
    document.querySelector('.modal-overlay #tm-save').click();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockState.tasks[0]).toMatchObject({ id: 'a', name: '改名', value: 'A' });
    expect(mockStorage.saveTasks).toHaveBeenCalledWith(mockState.tasks, 'user-1');
  });

  it('asks before making a new task A, and keeps the window open when cancelled', () => {
    window.confirm = vi.fn(() => false);
    const { modal } = openNew();
    $(modal, '#tm-name').value = '讀書';
    change($(modal, '#tm-value'), 'A');
    $(modal, '#tm-save').click();
    expect(window.confirm.mock.calls[0][0]).toContain('確認設為 A 級？');
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
    window.confirm = vi.fn(() => true);
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ name: '讀書', value: 'A', dailyXpCap: 200 });
    expect(mockStorage.saveTasks).toHaveBeenCalledWith(mockState.tasks, 'user-1');
    expect(modal.isConnected).toBe(false);
  });

  it('needs a reason and a success standard for S, and growth as its nature', () => {
    const { modal } = openNew();
    $(modal, '#tm-name').value = '寫論文';
    change($(modal, '#tm-value'), 'S');
    $(modal, '#tm-reason').value = '原因';
    $(modal, '#tm-save').click();
    expect(window.alert).toHaveBeenLastCalledWith('S 級任務必須填寫「原因」與「成功標準」。');
    // A nature that cannot be S (the list already prevents it).
    $(modal, '#tm-success-criteria').value = '標準';
    $(modal, '#tm-nature').value = 'obligation';
    $(modal, '#tm-save').click();
    expect(window.alert).toHaveBeenLastCalledWith('S 級任務的性質必須是「成長」。');
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
    $(modal, '#tm-nature').value = 'growth';
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({
      value: 'S', reason: '原因', successCriteria: '標準', requiresReasonIfS: true, dailyXpCap: 300,
    });
    expect(mockStorage.saveTasks).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['focus', '0.4', 0], ['focus', '0.7', 15], ['focus', '1.0', 25], ['instant', '1.0', 0],
  ])('a %s task of difficulty %s needs %i effective minutes', (category, difficulty, minutes) => {
    const { modal } = openNew();
    $(modal, '#tm-name').value = 'x';
    change($(modal, '#tm-category'), category);
    change($(modal, '#tm-difficulty'), difficulty);
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ category, difficulty: Number(difficulty), minEffectiveMinutes: minutes });
  });

  it.each([
    ['growth', 'B', 'task', 100], ['recovery', 'B', 'recovery', 100], ['entertainment', 'D', 'entertainment', 0],
  ])('a %s task is saved as %s with impact %s and a daily cap of %i', (nature, value, impactType, cap) => {
    const { modal } = openNew();
    $(modal, '#tm-name').value = 'x';
    change($(modal, '#tm-nature'), nature);
    expect($(modal, '#tm-value').value).toBe(value);
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ taskNature: nature, value, impactType, dailyXpCap: cap });
  });

  it('keeps an edited task\'s own cooldown and cap', () => {
    mockState.user.mode = 'advanced';
    mockState.tasks = [makeTask({ id: 'mine', value: 'B', cooldownMinutes: 45, dailyXpCap: 60, valueConfidence: 70 })];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-edit="mine"]').click();
    document.querySelector('.modal-overlay #tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ id: 'mine', cooldownMinutes: 45, dailyXpCap: 60, valueConfidence: 70 });
    expect(mockState.tasks).toHaveLength(1);
    expect(mockStorage.saveTasks).toHaveBeenCalledWith(mockState.tasks, 'user-1');
  });

  it('picks an emoji, and shows each field\'s tip on ⓘ', () => {
    const { modal } = openNew();
    // (jsdom's selectors do not match an emoji in an attribute value.)
    const rocket = [...modal.querySelectorAll('.emoji-option')].find(b => b.dataset.emoji === '🚀');
    rocket.click();
    expect(rocket.classList.contains('selected')).toBe(true);
    expect(modal.querySelectorAll('.emoji-option.selected')).toHaveLength(1);
    expect($(modal, '#tm-emoji-preview').textContent).toBe('🚀');
    expect($(modal, '#tm-icon-preview').textContent.trim()).toBe('🚀');
    const tip = $(modal, '#tm-difficulty-tip');
    expect(tip.classList.contains('hidden')).toBe(true);
    $(modal, '.info-btn[data-tip="difficulty"]').click();
    expect(tip.classList.contains('hidden')).toBe(false);
    $(modal, '.info-btn[data-tip="difficulty"]').click();
    expect(tip.classList.contains('hidden')).toBe(true);
    $(modal, '#tm-name').value = '火箭';
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ emoji: '🚀', iconImg: null });
  });

  it('an edited task with a photo icon can go back to its emoji', () => {
    mockState.user.mode = 'advanced';
    mockState.tasks = [makeTask({ id: 'pic', value: 'B', emoji: '🎸', iconImg: 'data:image/jpeg;base64,AAAA' })];
    const c = makeContainer();
    renderSettings(c);
    // Saved as it is, the photo icon is kept.
    c.querySelector('[data-edit="pic"]').click();
    document.querySelector('.modal-overlay #tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ emoji: '🎸', iconImg: 'data:image/jpeg;base64,AAAA' });
    expect(mockStorage.saveTasks).toHaveBeenLastCalledWith(mockState.tasks, 'user-1');
    c.querySelector('[data-edit="pic"]').click();
    const modal = document.querySelector('.modal-overlay');
    expect($(modal, '#tm-emoji-section').style.display).toBe('none');
    $(modal, '#tm-icon-clear-btn').click();
    expect($(modal, '#tm-icon-preview').textContent).toBe('🎸');
    expect($(modal, '#tm-emoji-section').style.display).toBe('');
    expect($(modal, '#tm-icon-clear-btn').style.display).toBe('none');
    $(modal, '#tm-save').click();
    expect(mockState.tasks[0]).toMatchObject({ emoji: '🎸', iconImg: null });
  });

  it('closes with ✕ or a click outside, saving nothing', () => {
    const first = openNew();
    $(first.modal, '#tm-close').click();
    expect(first.modal.isConnected).toBe(false);
    first.c.querySelector('#add-task-btn').click();
    const second = document.querySelector('.modal-overlay');
    $(second, '.modal-box').click();
    expect(second.isConnected).toBe(true);
    second.click();
    expect(second.isConnected).toBe(false);
    expect(mockStorage.saveTasks).not.toHaveBeenCalled();
  });
});

// ─── BUG-129..132 ───────────────────────────────────────────────────────────

describe('a finished sync on a page left meanwhile (BUG-129)', () => {
  it('does not draw Settings over the page shown now', async () => {
    window.showToast = vi.fn();
    let finish;
    mockStorage.syncFromRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#sync-btn').click();
    // The router reuses the container for another page.
    c.innerHTML = '<div id="other-page">首頁</div>';
    finish();
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith('資料已更新'));
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
  });

  it('draws Settings again when it is still shown', async () => {
    window.showToast = vi.fn();
    const c = makeContainer();
    renderSettings(c);
    const btn = c.querySelector('#sync-btn');
    btn.click();
    await vi.waitFor(() => expect(window.showToast).toHaveBeenCalledWith('資料已更新'));
    expect(c.querySelector('#sync-btn')).not.toBe(btn);
    expect(c.querySelector('#sync-btn').disabled).toBe(false);
  });
});

describe('the edit window shows a stored emoji and icon as data (BUG-130)', () => {
  it('as text and inside src, like the task list (AUDIT-001)', () => {
    mockState.user.mode = 'advanced';
    const iconImg = 'data:image/png;base64,AAAA" onerror="window.__xss=1';
    mockState.tasks = [
      makeTask({ id: 'e', emoji: '<img src=x onerror="window.__xss=1">' }),
      makeTask({ id: 'i', iconImg }),
    ];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-edit="e"]').click();
    let modal = document.querySelector('.modal-overlay');
    expect(modal.querySelector('[onerror]')).toBeNull();
    expect(modal.querySelector('#tm-icon-preview').textContent.trim()).toBe('<img src=x onerror="window.__xss=1">');
    expect(modal.querySelector('#tm-emoji-preview').textContent).toBe('<img src=x onerror="window.__xss=1">');
    modal.remove();
    c.querySelector('[data-edit="i"]').click();
    modal = document.querySelector('.modal-overlay');
    expect(modal.querySelector('[onerror]')).toBeNull();
    expect(modal.querySelector('#tm-icon-preview img').getAttribute('src')).toBe(iconImg);
  });
});

describe('the daily XP cap after an edit (BUG-131)', () => {
  function editValue(c, id, nature, value) {
    c.querySelector(`[data-edit="${id}"]`).click();
    const modal = document.querySelector('.modal-overlay');
    change(modal.querySelector('#tm-nature'), nature);
    change(modal.querySelector('#tm-value'), value);
    modal.querySelector('#tm-reason').value = '原因';
    modal.querySelector('#tm-success-criteria').value = '標準';
    modal.querySelector('#tm-save').click();
  }

  beforeEach(() => {
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    mockState.user.mode = 'advanced';
  });

  it('takes the new value\'s cap when the value changes', () => {
    mockState.tasks = [makeTask({ id: 't', taskNature: 'growth', value: 'B', dailyXpCap: 100 })];
    const c = makeContainer();
    renderSettings(c);
    editValue(c, 't', 'entertainment', 'D');
    expect(mockState.tasks[0]).toMatchObject({ value: 'D', dailyXpCap: 0 });
    // Back to B: it earns XP again.
    editValue(c, 't', 'growth', 'B');
    expect(mockState.tasks[0]).toMatchObject({ value: 'B', dailyXpCap: 100 });
    editValue(c, 't', 'growth', 'S');
    expect(mockState.tasks[0]).toMatchObject({ value: 'S', dailyXpCap: 300 });
    editValue(c, 't', 'growth', 'A');
    expect(mockState.tasks[0]).toMatchObject({ value: 'A', dailyXpCap: 200 });
  });

  it('keeps a task\'s own cap while its value stays', () => {
    mockState.tasks = [makeTask({ id: 't', value: 'B', dailyXpCap: 1 })];
    const c = makeContainer();
    renderSettings(c);
    editValue(c, 't', 'growth', 'B');
    expect(mockState.tasks[0]).toMatchObject({ value: 'B', dailyXpCap: 1 });
  });

  it('gives a B task left at D\'s cap of 0 its cap back when it is edited', () => {
    mockState.tasks = [makeTask({ id: 't', value: 'B', dailyXpCap: 0 })];
    const c = makeContainer();
    renderSettings(c);
    editValue(c, 't', 'growth', 'B');
    expect(mockState.tasks[0]).toMatchObject({ value: 'B', dailyXpCap: 100 });
  });

  it('gives a task with no cap its value\'s cap', () => {
    mockState.tasks = [makeTask({ id: 't', value: 'A', dailyXpCap: undefined })];
    const c = makeContainer();
    renderSettings(c);
    editValue(c, 't', 'growth', 'A');
    expect(mockState.tasks[0]).toMatchObject({ value: 'A', dailyXpCap: 200 });
  });
});

describe('the XP preview for natures that earn none (BUG-132)', () => {
  it('shows none for a stored entertainment task whose value is not D', () => {
    mockState.user.mode = 'advanced';
    mockState.tasks = [makeTask({ id: 'en', taskNature: 'entertainment', impactType: 'entertainment', value: 'B' })];
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('[data-edit="en"]').click();
    expect(document.querySelector('.modal-overlay #tm-xp-preview').textContent).toBe('此任務不提供 XP');
  });

  it('promises no XP for recovery (it gives energy) or entertainment, whatever the value', () => {
    const c = makeContainer();
    renderSettings(c);
    c.querySelector('#add-task-btn').click();
    const modal = document.querySelector('.modal-overlay');
    const preview = () => modal.querySelector('#tm-xp-preview').textContent;
    expect(preview()).toBe('預估 XP：+17（完成）/ +10（部分完成）');
    change(modal.querySelector('#tm-nature'), 'recovery');
    expect(modal.querySelector('#tm-value').value).toBe('B');
    expect(preview()).toBe('此任務不提供 XP，完成後回能');
    change(modal.querySelector('#tm-value'), 'A');
    expect(preview()).toBe('此任務不提供 XP，完成後回能');
    // Recovery gives energy whatever the value (calcEnergyGain), D included.
    change(modal.querySelector('#tm-value'), 'D');
    expect(preview()).toBe('此任務不提供 XP，完成後回能');
    change(modal.querySelector('#tm-nature'), 'entertainment');
    expect(preview()).toBe('此任務不提供 XP');
    change(modal.querySelector('#tm-nature'), 'obligation');
    change(modal.querySelector('#tm-value'), 'B');
    expect(preview()).toBe('預估 XP：+17（完成）/ +10（部分完成）');
  });
});
