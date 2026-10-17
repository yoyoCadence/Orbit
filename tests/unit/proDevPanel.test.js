/**
 * @vitest-environment jsdom
 */
/**
 * proDevPanel.test.js — PRO-014M：開發者面板的 Pro 狀態切換在兩種 source 下都有效。
 *
 * 用**真實的 storage 與 proEntitlement 模組**渲染設定頁，點擊面板按鈕後以
 * `storage.isProUser()` 等真實判定斷言結果；只 mock supabase、副作用模組與
 * `location.reload()`。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => {
      const self = {
        select: () => self, eq: () => Promise.resolve({ error: null }),
        update: () => self, insert: () => self, upsert: () => self, delete: () => self,
        in: () => self, order: () => self,
        single: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({}),
    },
  },
}));

vi.mock('../../pwa/js/theme.js', () => ({
  applyTheme: vi.fn(),
  applyUiSkin: vi.fn(),
  applyRandomThemeForToday: vi.fn(),
  renderBg: vi.fn(),
  initLiquidGlassReflection: vi.fn(),
}));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ toast: vi.fn(), confirmModal: vi.fn() }));

import { state } from '../../pwa/js/state.js';
import { FLAG_DEV_BACKUP, FLAG_PRO_ENTITLEMENT } from '../../pwa/js/flags.js';
import {
  clearLocalProEntitlementOverride,
  enableServerProEntitlementLocally,
  readProEntitlementSnapshot,
  resetProEntitlementStorageState,
} from '../../pwa/js/platform/proEntitlement.js';
import { storage } from '../../pwa/js/storage.js';
import { renderSettings } from '../../pwa/js/pages/settings.js';

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;

let reload;
let showToast;

function seedUser(extra = {}) {
  const user = { id: OWNER, name: 'Tester', totalXP: 0, newDayHour: 5, ...extra };
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  state.user = user;
  state.sessions = [];
  state.tasks = [];
  return user;
}

function clickDev(id) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderSettings(container);
  const button = container.querySelector(`#${id}`);
  expect(button, `#${id} should render in dev mode`).not.toBeNull();
  button.click();
  return container;
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  clearLocalProEntitlementOverride();
  reload = vi.fn();
  showToast = vi.fn();
  vi.stubGlobal('location', { ...window.location, hostname: 'localhost', reload });
  window.showToast = showToast;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server source', () => {
  beforeEach(() => {
    enableServerProEntitlementLocally();
  });

  it('付費：寫入 owner-scoped projection，判定為終身付費', () => {
    seedUser();
    clickDev('dev-pro-paid');

    expect(storage.isProUser()).toBe(true);
    expect(storage.isPaidProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(false);
    expect(storage.getProExpiry()).toBeNull();
    expect(readProEntitlementSnapshot().ownerId).toBe(OWNER);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('試用：projection 帶 trialEndsAt，剩餘 14 天且不算付費', () => {
    seedUser();
    clickDev('dev-pro-trial');

    expect(storage.isProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(true);
    expect(storage.isPaidProUser()).toBe(false);
    expect(storage.getTrialDaysRemaining()).toBe(14);
  });

  it('免費：覆蓋既有的付費 projection 為非 Pro', () => {
    seedUser();
    clickDev('dev-pro-paid');
    clickDev('dev-pro-free');

    expect(storage.isProUser()).toBe(false);
    expect(readProEntitlementSnapshot().isActive).toBe(false);
  });

  it('不寫入 server source 不讀的 profile Pro 欄位', () => {
    seedUser();
    clickDev('dev-pro-paid');

    const user = storage.getUser();
    expect(user.isPro).toBeUndefined();
    expect(user.proExpiresAt).toBeUndefined();
    expect(user.trialStartedAt).toBeUndefined();
  });

  it('建立 dev backup，讓 refresh 與 profile 上雲暫停', () => {
    seedUser();
    clickDev('dev-pro-paid');

    expect(JSON.parse(localStorage.getItem(FLAG_DEV_BACKUP)).id).toBe(OWNER);
  });

  it('切換到其他帳號時不沿用模擬的 projection', () => {
    seedUser();
    clickDev('dev-pro-paid');
    expect(storage.isProUser()).toBe(true);

    seedUser({ id: 'owner-2' });
    expect(storage.isProUser()).toBe(false);
  });

  it('沒有 owner id 時不建立覆蓋，也不重新載入', () => {
    seedUser({ id: undefined });
    clickDev('dev-pro-paid');

    expect(showToast).toHaveBeenCalled();
    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('還原：移除 backup 與模擬的 projection，回到 fail closed', () => {
    seedUser();
    clickDev('dev-pro-paid');
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).not.toBeNull();
    clickDev('dev-reset');

    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(storage.isProUser()).toBe(false);
  });

  it('面板顯示目前的 entitlement source', () => {
    seedUser();
    const container = clickDev('dev-pro-free');
    expect(container.textContent).toContain('server source');
  });
});

describe('legacy source（預設）', () => {
  it('付費：沿用 profile 欄位覆蓋，不寫 projection', () => {
    seedUser();
    clickDev('dev-pro-paid');

    expect(storage.getUser().isPro).toBe(true);
    expect(storage.isProUser()).toBe(true);
    expect(storage.isPaidProUser()).toBe(true);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
  });

  it('試用：沿用 trialStartedAt 覆蓋，剩餘 14 天', () => {
    seedUser();
    clickDev('dev-pro-trial');

    expect(storage.isTrialUser()).toBe(true);
    expect(storage.getTrialDaysRemaining()).toBe(14);
    expect(Date.now() - Date.parse(storage.getUser().trialStartedAt)).toBeLessThan(DAY + 1000);
  });

  it('免費：清掉 profile Pro 欄位', () => {
    seedUser({ isPro: true });
    clickDev('dev-pro-free');

    expect(storage.isProUser()).toBe(false);
  });
});
