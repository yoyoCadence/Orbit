/**
 * proSettingsProjection.test.js — PRO-014C：設定頁 Pro 區塊在 `server` source
 * 下的真實組合。
 *
 * 為什麼要獨立一個檔：`settings.test.js` 把 `isProUser()`／`isPaidProUser()`／
 * `isTrialUser()` 各自 mock 成獨立的回傳值，所以它**測不到**真實的 server-source
 * 組合 —— 例如「projection 是有效付費、但 legacy profile 沒有 isPro」。PR #150
 * 驗收就是在這個縫裡找到 blocker：那時 isProUser() 讀 projection、
 * isPaidProUser() 仍讀 profile，付費使用者會被顯示成尚未訂閱。
 *
 * 這個檔用**真實的 storage 模組**（只 mock supabase 與副作用模組），把 projection
 * 寫進 localStorage 後渲染整個設定頁，斷言實際出現在 DOM 裡的東西。
 *
 * 環境：jsdom。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../../pwa/js/platform/notifications.js', () => ({
  getNotificationPermission: () => 'default',
  requestNotificationPermission: vi.fn(),
  isNotificationSupported: () => false,
}));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));
vi.mock('../../pwa/js/platform/share.js', () => ({ shareOrCopy: vi.fn() }));
vi.mock('../../pwa/js/platform/purchases.js', () => ({
  startProPurchase: vi.fn(), isPurchaseSupported: () => false,
}));

import { state } from '../../pwa/js/state.js';
import {
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';
import { storage } from '../../pwa/js/storage.js';
import { renderSettings } from '../../pwa/js/pages/settings.js';

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();

/** A profile with NO Pro fields — the state a real account has under `server`. */
function seedNonProProfile(extra = {}) {
  const user = { id: OWNER, name: 'Tester', totalXP: 0, newDayHour: 5, ...extra };
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  state.user = user;
  state.sessions = [];
  state.tasks = [];
}

function projection({ expiresAt = null, trialEndsAt = null, isActive = true }) {
  writeProEntitlementSnapshot({
    ownerId: OWNER, isActive, expiresAt, trialEndsAt, fetchedAtMs: Date.now(),
  });
}

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderSettings(container);
  return container;
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  document.body.innerHTML = '';
  enableServerProEntitlementLocally();
});

describe('server source + 有效付費 projection', () => {
  it('顯示 Pro active banner 與正確期限，不顯示訂閱方案', () => {
    seedNonProProfile();
    const expiresAt = iso(Date.now() + 30 * DAY);
    projection({ expiresAt });

    // 這正是 PR #150 驗收抓到的組合：projection 說付費，profile 沒有 isPro。
    expect(storage.isProUser()).toBe(true);
    expect(storage.isPaidProUser()).toBe(true);
    expect(storage.getProExpiry()).toBe(expiresAt);

    const c = render();
    expect(c.querySelector('.pro-active-banner')).not.toBeNull();
    expect(c.querySelector('.pro-active-sub').textContent)
      .toContain(new Date(expiresAt).toLocaleDateString('zh-TW'));
    expect(c.querySelector('.pro-trial-status')).toBeNull();
  });

  it('終身付費（無到期日）顯示「終身方案」', () => {
    seedNonProProfile();
    projection({ expiresAt: null, trialEndsAt: null });

    expect(storage.isPaidProUser()).toBe(true);
    expect(storage.getProExpiry()).toBeNull();

    const c = render();
    expect(c.querySelector('.pro-active-sub').textContent).toContain('終身方案');
  });

  it('已到期的 projection 不顯示 active banner', () => {
    seedNonProProfile();
    projection({ expiresAt: iso(Date.now() - DAY) });

    expect(storage.isProUser()).toBe(false);
    expect(storage.isPaidProUser()).toBe(false);
    expect(render().querySelector('.pro-active-banner')).toBeNull();
  });
});

describe('server source + trial projection', () => {
  it('倒數天數與進度條都由 server contract 推導', () => {
    const startedAt = iso(Date.now() - 5 * DAY);
    const trialEndsAt = iso(Date.now() + 10 * DAY);
    seedNonProProfile({ trialStartedAt: startedAt });   // 相容層寫入的值
    projection({ trialEndsAt });

    expect(storage.isProUser()).toBe(true);
    expect(storage.isPaidProUser()).toBe(false);
    expect(storage.getTrialDaysRemaining()).toBe(10);
    expect(storage.getTrialProgressPercent()).toBe(33);   // 5/15

    const c = render();
    expect(c.querySelector('.pro-active-banner')).toBeNull();
    const status = c.querySelector('.pro-trial-status');
    expect(status).not.toBeNull();
    expect(status.querySelector('.pro-trial-days').textContent).toContain('10');
    expect(status.querySelector('.pro-trial-bar-fill').getAttribute('style')).toBe('width:33%');
  });

  // 舊寫法是 (15 - daysLeft) / 15。若 server 的 pro_trial_duration() 改成 30 天，
  // 那個算式會得出 -100%；現在改由真實起訖推導。
  it('server 的試用長度不是 15 天時，進度條仍然正確', () => {
    const startedAt = iso(Date.now() - 6 * DAY);
    const trialEndsAt = iso(Date.now() + 24 * DAY);       // 共 30 天
    seedNonProProfile({ trialStartedAt: startedAt });
    projection({ trialEndsAt });

    expect(storage.getTrialDaysRemaining()).toBe(24);
    expect(storage.getTrialProgressPercent()).toBe(20);   // 6/30

    const fill = render().querySelector('.pro-trial-bar-fill');
    expect(fill.getAttribute('style')).toBe('width:20%');
  });

  it('起始時間未知時省略進度條，倒數仍然顯示', () => {
    seedNonProProfile();                                  // 沒有 trialStartedAt
    projection({ trialEndsAt: iso(Date.now() + 10 * DAY) });

    expect(storage.getTrialProgressPercent()).toBeNull();

    const c = render();
    const status = c.querySelector('.pro-trial-status');
    expect(status).not.toBeNull();
    expect(status.querySelector('.pro-trial-days').textContent).toContain('10');
    expect(status.querySelector('.pro-trial-bar-fill')).toBeNull();
  });
});

describe('付費與試用資料同時存在時的顯示優先序', () => {
  it('付費未到期時以付費呈現，不顯示試用倒數', () => {
    seedNonProProfile({ trialStartedAt: iso(Date.now() - 5 * DAY) });
    projection({
      expiresAt: iso(Date.now() + 30 * DAY),
      trialEndsAt: iso(Date.now() + 10 * DAY),
    });

    expect(storage.isPaidProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(true);   // 試用本身仍在效期內

    const c = render();
    expect(c.querySelector('.pro-active-banner')).not.toBeNull();
    // 付費分支先 return，所以試用倒數不會被渲染。
    expect(c.querySelector('.pro-trial-status')).toBeNull();
  });

  it('付費已到期但試用仍有效時，回到試用呈現', () => {
    seedNonProProfile({ trialStartedAt: iso(Date.now() - 5 * DAY) });
    projection({
      expiresAt: iso(Date.now() - DAY),
      trialEndsAt: iso(Date.now() + 10 * DAY),
    });

    expect(storage.isProUser()).toBe(true);     // 試用讓它仍然 active
    expect(storage.isPaidProUser()).toBe(false);

    const c = render();
    expect(c.querySelector('.pro-active-banner')).toBeNull();
    expect(c.querySelector('.pro-trial-status')).not.toBeNull();
  });
});

describe('legacy source 不受影響', () => {
  it('沿用 profile 欄位，付費使用者仍看到 active banner', () => {
    localStorage.clear();
    resetProEntitlementStorageState();          // 不啟用 server source
    seedNonProProfile({ isPro: true, proExpiresAt: iso(Date.now() + 30 * DAY) });

    expect(storage.isPaidProUser()).toBe(true);
    expect(render().querySelector('.pro-active-banner')).not.toBeNull();
  });
});
