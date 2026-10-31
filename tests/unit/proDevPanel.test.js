/**
 * @vitest-environment jsdom
 */
/**
 * proDevPanel.test.js — PRO-014Q Q6：開發者面板不再模擬等級與 Pro。
 *
 * 模擬會把假值寫進真實的 user，經由每一條保存 user 的路徑外流，所以 Q6 移除了
 * 「模擬等級」與「模擬 Pro」，改用固定的測試帳號（docs/pro-test-accounts.md）。
 * 面板只剩唯讀的會員狀態，以及舊版留下 backup 時的「清除殘留」。
 *
 * 用**真實的 storage 與 proEntitlement 模組**渲染設定頁；只 mock supabase、
 * 副作用模組與 `location.reload()`。
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

import { supabase } from '../../pwa/js/supabase.js';
import { state } from '../../pwa/js/state.js';
import { FLAG_DEV_BACKUP, FLAG_PRO_ENTITLEMENT } from '../../pwa/js/flags.js';
import {
  buildProEntitlementSnapshot,
  clearLocalProEntitlementOverride,
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';
import { db, storage } from '../../pwa/js/storage.js';
import { renderSettings } from '../../pwa/js/pages/settings.js';

const OWNER = 'owner-1';

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

function renderPanel() {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderSettings(container);
  return container;
}

function clickDev(id) {
  const container = renderPanel();
  const button = container.querySelector(`#${id}`);
  expect(button, `#${id} should render in dev mode`).not.toBeNull();
  button.click();
  return container;
}

/** What an older version left behind after a "付費 Pro" simulation under `server`. */
function seedLeftoverServerSimulation() {
  seedUser();
  localStorage.setItem(FLAG_DEV_BACKUP, JSON.stringify({ id: OWNER, name: 'Tester', totalXP: 0 }));
  writeProEntitlementSnapshot(buildProEntitlementSnapshot(OWNER, {
    isActive: true, expiresAt: null, trialEndsAt: null,
  }));
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

describe('PRO-014Q Q6：沒有模擬', () => {
  it.each(['legacy', 'server'])('%s source：面板沒有等級與 Pro 模擬，渲染也不寫入任何東西', source => {
    if (source === 'server') enableServerProEntitlementLocally();
    seedUser();
    const before = { ...localStorage };
    const container = renderPanel();

    for (const id of ['dev-level-input', 'dev-level-apply', 'dev-pro-free', 'dev-pro-trial', 'dev-pro-paid']) {
      expect(container.querySelector(`#${id}`), id).toBeNull();
    }
    expect(container.textContent).toContain(`${source} source`);
    expect(container.textContent).toContain('docs/pro-test-accounts.md');
    expect({ ...localStorage }).toEqual(before);
    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
  });

  it('沒有殘留時不顯示「清除殘留」', () => {
    seedUser();
    expect(renderPanel().querySelector('#dev-reset')).toBeNull();
  });
});

describe('PRO-014Q Q6：舊版留下的模擬資料', () => {
  beforeEach(() => {
    enableServerProEntitlementLocally();
  });

  it('殘留的 backup 照舊讓 profile 不上傳、模擬的 projection 不被 refresh 取代（fail closed），並顯示「清除殘留」', async () => {
    seedLeftoverServerSimulation();
    expect(storage.isProUser()).toBe(true);

    // A signed-in owner, so only the backup guard can be what stops both calls.
    const sessionSpy = vi.spyOn(db, '_session').mockResolvedValue({ user: { id: OWNER } });
    const fromSpy = vi.spyOn(supabase, 'from');
    try {
      await expect(db.upsertProfile(storage.getUser(), OWNER)).resolves.toBe(false);
      await expect(db.refreshProEntitlement(OWNER)).resolves.toBe(false);
      expect(fromSpy).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(storage.isProUser()).toBe(true);         // the leftover projection is still the one on disk
    } finally {
      sessionSpy.mockRestore();
      fromSpy.mockRestore();
    }

    const container = renderPanel();

    expect(container.querySelector('#dev-reset').textContent).toContain('清除殘留的模擬資料');
    expect(container.textContent).toContain('同步與 Pro 授權更新已暫停');
  });

  it('清除殘留：移除 backup 與模擬的 projection，回到 fail closed', async () => {
    seedLeftoverServerSimulation();
    vi.stubGlobal('confirm', vi.fn(() => true));
    clickDev('dev-reset');
    // The cleanup first checks for a Supabase session (PRO-014Q B1) before confirming.
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(storage.isProUser()).toBe(false);
  });
});

describe('全部 3D 資產（PS-250A）', () => {
  it('勾選框反映並切換「空間」的資產總覽，使用與 assetGallery.js 相同的 key', async () => {
    const { ASSET_GALLERY_FLAG } = await import('../../pwa/js/personalSpace/v2/ui/assetGallery.js');
    seedUser();
    localStorage.setItem(ASSET_GALLERY_FLAG, '1');
    document.body.innerHTML = '';
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderSettings(container);
    const box = container.querySelector('#dev-asset-gallery');
    expect(box.checked).toBe(true);

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(ASSET_GALLERY_FLAG)).toBeNull();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(ASSET_GALLERY_FLAG)).toBe('1');
  });
});
