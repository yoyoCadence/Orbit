// @vitest-environment jsdom
/**
 * profileActions.test.js — TEST-011: the Profile page's actions that
 * profile.test.js does not reach, and BUG-138 (an avatar upload or a name
 * save outlives the page: its result stays with its own account, and Profile
 * is not drawn over another page). Same mocks as profile.test.js, with the
 * share sheet, toasts and the Pro card link mocked too.
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
  // Mirrors the real local-only write so tests can assert the localStorage cache
  saveUserLocal: vi.fn((u) => localStorage.setItem('yoyo_user', JSON.stringify(u))),
  saveUserAndSync: vi.fn(() => Promise.resolve()),
  isProUser:   vi.fn(() => false),
  isPaidProUser: vi.fn(() => false),
  isTrialUser: vi.fn(() => false),
}));

const mockDb = vi.hoisted(() => ({
  uploadAvatar: vi.fn(() => Promise.resolve({ path: 'user/avatar.jpg', url: 'signed-avatar-url' })),
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
vi.mock('../../pwa/js/storage.js', () => ({ storage: mockStorage, db: mockDb }));
// PRO-014L2: SUB-16 needs an account; tests default to signed in.
const presence = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => presence.signedIn }));

// Dynamic import in profile.js: import('../app.js').then(({ updateHeader }) => updateHeader())
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
const share = vi.hoisted(() => ({ shareGrowthCard: vi.fn(), supportsNativeShare: vi.fn(() => false) }));
vi.mock('../../pwa/js/platform/share.js', () => share);
const toasts = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => toasts);
const proNav = vi.hoisted(() => ({ goToProCard: vi.fn() }));
vi.mock('../../pwa/js/ui/proNav.js', () => proNav);

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

// ─── Helpers ────────────────────────────────────────────────────────────────

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

/** Let the photo be read at once; jsdom would read a real file. */
let realFileReader;
beforeEach(() => {
  realFileReader = window.FileReader;
  window.FileReader = class {
    readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,NEW' } }); }
  };
});
afterEach(() => { window.FileReader = realFileReader; });

function pickAvatar() {
  const input = document.getElementById('avatar-input');
  Object.defineProperty(input, 'files', { value: [{ name: 'avatar.png' }], configurable: true });
  input.dispatchEvent(new window.Event('change'));
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

// ─── Avatar upload ──────────────────────────────────────────────────────────

describe('avatar upload', () => {
  it('opens the photo picker from the avatar', () => {
    const c = makeContainer();
    renderProfile(c);
    const picker = vi.fn();
    document.getElementById('avatar-input').addEventListener('click', picker);
    document.getElementById('avatar-wrap').click();
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('shows the photo at once, then keeps the uploaded one and says it synced', async () => {
    mockState.user = freshUser({ id: 'owner-a', avatar: 'old.png' });
    mockStorage.saveUserAndSync.mockResolvedValueOnce(true);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    expect(c.querySelector('img[alt="avatar"]').getAttribute('src')).toBe('data:image/png;base64,NEW');
    await flush();
    expect(mockState.user).toMatchObject({ avatar: 'signed-avatar-url', avatarPath: 'user/avatar.jpg' });
    expect(mockStorage.saveUserAndSync).toHaveBeenCalledWith(mockState.user);
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    expect(document.getElementById('avatar-sync-status').textContent).toBe('頭像已同步');
  });

  it('puts the old photo back when the upload fails', async () => {
    mockState.user = freshUser({ id: 'owner-a', avatar: 'old.png', avatarPath: 'owner-a/old.jpg' });
    mockDb.uploadAvatar.mockRejectedValueOnce(new Error('network'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    await flush();
    expect(mockState.user).toMatchObject({ avatar: 'old.png', avatarPath: 'owner-a/old.jpg' });
    expect(JSON.parse(localStorage.getItem('yoyo_user')).avatar).toBe('old.png');
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    const status = document.getElementById('avatar-sync-status');
    expect(status.textContent).toBe('頭像上傳失敗，請稍後再試');
    expect(status.classList.contains('error')).toBe(true);
    error.mockRestore();
  });

  it('does not draw Profile over the page shown when the upload ends (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    c.innerHTML = '<div id="other-page">首頁</div>';   // the router reused the container
    upload.resolve({ path: 'owner-a/avatar.jpg', url: 'signed-a' });
    await flush();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    // Still this account's: its avatar is kept.
    expect(mockState.user).toMatchObject({ avatar: 'signed-a', avatarPath: 'owner-a/avatar.jpg' });
  });

  it('leaves another account alone when the upload ends after an account switch (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    mockStorage.saveUserLocal.mockClear();
    // Signed out, and owner-b signed in, while A's upload was out.
    mockState.user = freshUser({ id: 'owner-b', name: 'B', avatar: 'b.png' });
    upload.resolve({ path: 'owner-a/avatar.jpg', url: 'signed-a' });
    await flush();
    expect(mockState.user).toMatchObject({ id: 'owner-b', avatar: 'b.png' });
    expect(mockState.user).not.toHaveProperty('avatarPath');
    expect(mockStorage.saveUserAndSync).not.toHaveBeenCalled();
    expect(mockStorage.saveUserLocal).not.toHaveBeenCalled();
  });

  it('does not put A\'s old photo into another account when A\'s upload fails (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a', avatar: 'a-old.png' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    mockState.user = freshUser({ id: 'owner-b', avatar: 'b.png' });
    upload.reject(new Error('network'));
    await flush();
    expect(mockState.user.avatar).toBe('b.png');
  });

  it('a sync that ends after an account switch leaves the new account alone (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    await flush();
    mockState.user = freshUser({ id: 'owner-b', avatar: 'b.png' });
    sync.reject(new Error('network'));
    await flush();
    expect(mockState.user.avatar).toBe('b.png');
  });

  it('a sync that succeeds after an account switch says nothing on the new account\'s page (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    await flush();
    mockState.user = freshUser({ id: 'owner-b', name: 'B' });
    sync.resolve(true);
    await flush();
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    expect(document.getElementById('avatar-sync-status').textContent).not.toBe('頭像已同步');
    expect(c.querySelector('#profile-name-display').textContent).not.toContain('B');
  });

  it('the same account, its user object replaced by a sync, still gets its photo (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    mockState.user = { ...mockState.user };   // loadStateFromStorage after a sync
    upload.resolve({ path: 'owner-a/avatar.jpg', url: 'signed-a' });
    await flush();
    expect(mockState.user).toMatchObject({ id: 'owner-a', avatar: 'signed-a' });
    expect(mockStorage.saveUserAndSync).toHaveBeenCalledWith(mockState.user);
  });
});

// ─── Name ───────────────────────────────────────────────────────────────────

describe('changing the name', () => {
  function openName(c) {
    renderProfile(c);
    document.getElementById('profile-name-display').click();
    return document.getElementById('name-modal');
  }

  it('saves, says it synced, and closes after 800 ms', async () => {
    vi.useFakeTimers();
    try {
      mockState.user = freshUser({ id: 'owner-a' });
      mockStorage.saveUserAndSync.mockResolvedValueOnce(true);
      const c = makeContainer();
      const modal = openName(c);
      const input = modal.querySelector('#name-input');
      expect(input.value).toBe('Tester');
      input.value = '  新名字  ';
      modal.querySelector('#name-save-btn').click();
      expect(modal.querySelector('#name-save-btn').disabled).toBe(true);
      expect(modal.querySelector('#name-save-status').textContent).toBe('本機已儲存，同步中…');
      expect(mockState.user.name).toBe('新名字');
      await flush();
      expect(modal.querySelector('#name-save-status').textContent).toBe('✓ 同步完成');
      expect(c.querySelector('#profile-name-display').textContent).toContain('新名字');
      vi.advanceTimersByTime(800);
      expect(modal.isConnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says it is saved here when there is no account to sync to', async () => {
    mockStorage.saveUserAndSync.mockResolvedValueOnce(false);
    const c = makeContainer();
    const modal = openName(c);
    modal.querySelector('#name-input').value = '訪客';
    modal.querySelector('#name-save-btn').click();
    await flush();
    expect(modal.querySelector('#name-save-status').textContent).toBe('已儲存在此裝置，登入後可同步');
    expect(modal.querySelector('#name-save-btn').disabled).toBe(false);
    expect(modal.isConnected).toBe(true);
  });

  it('puts the old name back when the sync fails', async () => {
    mockState.user = freshUser({ id: 'owner-a', name: '舊名' });
    mockStorage.saveUserAndSync.mockRejectedValueOnce(new Error('network'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = makeContainer();
    const modal = openName(c);
    modal.querySelector('#name-input').value = '新名';
    modal.querySelector('#name-save-btn').click();
    await flush();
    expect(mockState.user.name).toBe('舊名');
    const status = modal.querySelector('#name-save-status');
    expect(status.textContent).toBe('同步失敗，請稍後再試');
    expect(status.classList.contains('error')).toBe(true);
    error.mockRestore();
  });

  it('ignores an empty name, and closes with ✕ or a tap outside', () => {
    const c = makeContainer();
    let modal = openName(c);
    modal.querySelector('#name-input').value = '   ';
    modal.querySelector('#name-save-btn').click();
    expect(mockStorage.saveUserAndSync).not.toHaveBeenCalled();
    modal.querySelector('.modal-box').click();
    expect(modal.isConnected).toBe(true);
    modal.querySelector('#name-modal-close').click();
    expect(modal.isConnected).toBe(false);
    modal = openName(c);
    modal.click();
    expect(modal.isConnected).toBe(false);
  });

  it('a sync that ends after an account switch closes the window and leaves the new account alone (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a', name: 'A' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const c = makeContainer();
    const modal = openName(c);
    modal.querySelector('#name-input').value = 'A2';
    modal.querySelector('#name-save-btn').click();
    mockState.user = freshUser({ id: 'owner-b', name: 'B' });
    sync.reject(new Error('network'));
    await flush();
    expect(mockState.user.name).toBe('B');
    expect(modal.isConnected).toBe(false);
  });

  it('a sync that succeeds after an account switch closes the window (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a', name: 'A' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const c = makeContainer();
    const modal = openName(c);
    modal.querySelector('#name-input').value = 'A2';
    modal.querySelector('#name-save-btn').click();
    mockState.user = freshUser({ id: 'owner-b', name: 'B' });
    sync.resolve(true);
    await flush();
    expect(modal.isConnected).toBe(false);
    expect(c.querySelector('#profile-name-display').textContent).not.toContain('B');
  });

  it('does not draw Profile over the page shown when the sync ends (BUG-138)', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const c = makeContainer();
    const modal = openName(c);
    modal.querySelector('#name-input').value = '新名';
    modal.querySelector('#name-save-btn').click();
    c.innerHTML = '<div id="other-page">首頁</div>';
    sync.resolve(true);
    await flush();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    expect(modal.querySelector('#name-save-status').textContent).toBe('✓ 同步完成');
  });
});

// ─── Share, XP table, Pro links ─────────────────────────────────────────────

describe('sharing the growth card', () => {
  it.each([
    [{ shared: false, reason: 'clipboard' }, '📋 已複製成長卡'],
    [{ shared: false, reason: 'error' }, '分享失敗，請重試'],
  ])('%o → %s', async (result, toast) => {
    share.shareGrowthCard.mockResolvedValueOnce(result);
    mockState.user = freshUser({ name: '分享者', streakDays: 4, totalXP: 500 });
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('share-growth-btn').click();
    await flush();
    expect(share.shareGrowthCard).toHaveBeenCalledWith(expect.objectContaining({ name: '分享者', streakDays: 4, totalXP: 500 }));
    expect(toasts.showToast).toHaveBeenCalledWith(toast);
  });

  it('says nothing when shared, or when the share sheet is closed', async () => {
    share.shareGrowthCard.mockResolvedValueOnce({ shared: true });
    share.shareGrowthCard.mockResolvedValueOnce({ shared: false, reason: 'AbortError' });
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('share-growth-btn').click();
    await flush();
    document.getElementById('share-growth-btn').click();
    await flush();
    expect(share.shareGrowthCard).toHaveBeenCalledTimes(2);
    expect(toasts.showToast).not.toHaveBeenCalled();
  });
});

describe('the XP table', () => {
  it('stops at Lv.100 when the levels shown do not end on a round ten', async () => {
    const { getLevelInfo } = await import('../../pwa/js/leveling.js');
    let totalXP = 0;
    while (getLevelInfo(totalXP).level < 5) totalXP += 1;
    mockState.user = freshUser({ totalXP });
    const c = makeContainer();
    renderProfile(c);
    let clicks = 0;
    while (c.querySelector('.xp-more-btn') && clicks < 20) { c.querySelector('.xp-more-btn').click(); clicks += 1; }
    const text = document.querySelector('#xp-table-rows').textContent;
    expect(text).toContain('Lv.100');
    expect(text).not.toContain('Lv.101');
    expect(text).not.toContain('Lv.104');
  });

  it('shows 10 more levels at a time, and its button goes at Lv.100', () => {
    mockState.user = freshUser({ totalXP: 0 });
    const c = makeContainer();
    renderProfile(c);
    const rows = () => document.querySelectorAll('#xp-table-rows > *').length;
    const before = rows();
    const more = c.querySelector('.xp-more-btn');
    more.click();
    expect(rows()).toBe(before + 10);
    let clicks = 1;
    while (c.querySelector('.xp-more-btn') && clicks < 20) { c.querySelector('.xp-more-btn').click(); clicks += 1; }
    expect(c.querySelector('.xp-more-btn')).toBeNull();
    expect(document.querySelector('#xp-table-rows').textContent).toContain('Lv.100');
    expect(document.querySelector('#xp-table-rows').textContent).not.toContain('Lv.101');
  });
});

describe('Pro links', () => {
  it('the heatmap and dashboard upsell buttons go to the Pro card', () => {
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('.hm-upgrade-btn').click();
    c.querySelector('.dash-upgrade-btn').click();
    expect(proNav.goToProCard).toHaveBeenCalledTimes(2);
  });
});

// ─── BUG-139: the rest of the windows the #293 review found ─────────────────

describe('saves that outlive the page, continued (BUG-139)', () => {
  async function header() {
    return (await import('../../pwa/js/ui/header.js')).updateHeader;
  }

  it('a photo picked for A and read after B signed in is not uploaded into B', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    let finishRead;
    window.FileReader = class {
      readAsDataURL() { finishRead = () => this.onload({ target: { result: 'data:image/png;base64,A' } }); }
    };
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    mockState.user = freshUser({ id: 'owner-b', avatar: 'b.png' });
    finishRead();
    await flush();
    expect(mockState.user.avatar).toBe('b.png');
    expect(mockDb.uploadAvatar).not.toHaveBeenCalled();
  });

  it('a photo read after the page changed does not draw Profile over it', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    let finishRead;
    window.FileReader = class {
      readAsDataURL() { finishRead = () => this.onload({ target: { result: 'data:image/png;base64,A' } }); }
    };
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    c.innerHTML = '<div id="other-page">首頁</div>';
    finishRead();
    await flush();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    // Still this account's photo.
    expect(mockState.user.avatar).toBe('signed-avatar-url');
  });

  it("\"not signed in\" after an account switch says nothing on the new account's page", async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    // The "uploading" note is written on the next frame, long before a switch.
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    mockState.user = freshUser({ id: 'owner-b', name: 'B' });
    renderProfile(c);   // B's Profile is shown now
    mockStorage.saveUserLocal.mockClear();
    upload.reject(new Error('Not authenticated'));
    await flush();
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    expect(document.getElementById('avatar-sync-status').textContent).toBe('');
    expect(mockStorage.saveUserLocal).not.toHaveBeenCalled();
  });

  it.each([
    ['not signed in', new Error('Not authenticated')],
    ['a failed upload', new Error('network')],
  ])('%s while another page is shown does not draw Profile over it', async (_, error) => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    c.innerHTML = '<div id="other-page">首頁</div>';
    upload.reject(error);
    await flush();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    quiet.mockRestore();
  });

  it('a failed name sync while another page is shown does not draw Profile over it', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const sync = deferred();
    mockStorage.saveUserAndSync.mockReturnValueOnce(sync.promise);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('profile-name-display').click();
    const modal = document.getElementById('name-modal');
    modal.querySelector('#name-input').value = '新名';
    modal.querySelector('#name-save-btn').click();
    c.innerHTML = '<div id="other-page">首頁</div>';
    sync.reject(new Error('network'));
    await flush();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    quiet.mockRestore();
  });

  it('a name saved from a window left open after a page change does not draw Profile over it', () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const c = makeContainer();
    renderProfile(c);
    document.getElementById('profile-name-display').click();
    c.innerHTML = '<div id="other-page">首頁</div>';   // swiped to Home
    const modal = document.getElementById('name-modal');
    modal.querySelector('#name-input').value = '新名';
    modal.querySelector('#name-save-btn').click();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    expect(mockState.user.name).toBe('新名');
  });

  it('the header shows the old photo again after a failed upload, and the old name after a failed sync', async () => {
    const updateHeader = await header();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockState.user = freshUser({ id: 'owner-a', avatar: 'old.png', name: '舊名' });
    mockDb.uploadAvatar.mockRejectedValueOnce(new Error('network'));
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    updateHeader.mockClear();
    await flush();
    expect(mockState.user.avatar).toBe('old.png');
    expect(updateHeader).toHaveBeenCalled();

    mockStorage.saveUserAndSync.mockRejectedValueOnce(new Error('network'));
    document.getElementById('profile-name-display').click();
    const modal = document.getElementById('name-modal');
    modal.querySelector('#name-input').value = '新名';
    modal.querySelector('#name-save-btn').click();
    updateHeader.mockClear();
    await flush();
    expect(mockState.user.name).toBe('舊名');
    expect(updateHeader).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('a sign-out during an upload ends it quietly', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    mockState.user = null;   // signed out
    upload.resolve({ path: 'owner-a/avatar.jpg', url: 'signed-a' });
    await flush();
    expect(mockState.user).toBeNull();
    expect(mockStorage.saveUserAndSync).not.toHaveBeenCalled();
  });

  it('a page container taken off the document is not drawn into', async () => {
    mockState.user = freshUser({ id: 'owner-a' });
    const upload = deferred();
    mockDb.uploadAvatar.mockReturnValueOnce(upload.promise);
    const c = makeContainer();
    renderProfile(c);
    pickAvatar();
    c.remove();
    upload.resolve({ path: 'owner-a/avatar.jpg', url: 'signed-a' });
    await flush();
    // Drawing a detached Profile would throw (its buttons are found by id).
    expect(mockState.user.avatar).toBe('signed-a');
  });
});

// ─── The title-template editor across a page change (BUG-139) ───────────────

describe('the title-template editor left open across a page change', () => {
  beforeEach(() => { mockStorage.isProUser.mockReturnValue(true); });

  it('saves without drawing Profile over the page shown now', () => {
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="rpg"]').click();
    const modal = document.getElementById('template-editor-modal');
    c.innerHTML = '<div id="other-page">首頁</div>';   // swiped to Home
    modal.querySelector('#tmpl-name').value = 'RPG 改版';
    modal.querySelector('#tmpl-save-btn').click();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    expect(mockState.user.customTemplates.rpg.name).toBe('RPG 改版');
    expect(modal.isConnected).toBe(false);
  });

  it('deletes without drawing Profile over the page shown now', () => {
    window.confirm = vi.fn(() => true);
    mockState.user = freshUser({
      titleTemplate: 'custom_abc',
      customTemplates: { custom_abc: { name: '自訂', icon: '✨', tiers: [[1, 'A']] } },
    });
    const c = makeContainer();
    renderProfile(c);
    c.querySelector('[data-edit-template="custom_abc"]').click();
    const modal = document.getElementById('template-editor-modal');
    c.innerHTML = '<div id="other-page">首頁</div>';
    modal.querySelector('#tmpl-delete-btn').click();
    expect(c.innerHTML).toBe('<div id="other-page">首頁</div>');
    expect(mockState.user.customTemplates).not.toHaveProperty('custom_abc');
    expect(mockState.user.titleTemplate).toBe('rpg');
  });

  it('still draws Profile again when it is the page shown', () => {
    const c = makeContainer();
    renderProfile(c);
    const before = c.querySelector('#avatar-wrap');
    c.querySelector('[data-edit-template="rpg"]').click();
    document.getElementById('template-editor-modal').querySelector('#tmpl-save-btn').click();
    expect(c.querySelector('#avatar-wrap')).not.toBe(before);
  });
});
