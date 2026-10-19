/**
 * @vitest-environment jsdom
 */
/**
 * pro014qDevReset.test.js — PRO-014Q S0：開發者面板的「還原」改為完整清理。
 *
 * 模擬會把假值寫進真實的 user，`saveUser()` 再把它排成 pending profile（備份
 * 存在時上雲被擋住）。舊的「還原」只把備份寫回本機 user、刪除備份，pending
 * 留著，下次啟動就被 `loadFromRemote()` 推上 `profiles`。這裡用真實的 storage、
 * 設定頁與 V2 controller 驗證：確認後刪除備份、所有 pending profile、本機 user、
 * projection 與所有帳號的 V2 state，之後任何帳號載入都不會 upsert 模擬值。
 *
 * B1：遊客的 profile 只存在本機，沒有雲端可以重新載入。沒有 Supabase session、
 * 且備份就是目前本機 user 的備份時，把備份寫回本機 user，其餘照樣清除。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ upserts: [], sessionUserId: null }));

vi.mock('../../pwa/js/supabase.js', () => {
  const chain = table => {
    const self = {
      select: () => self,
      eq: () => self,
      in: () => self,
      order: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({
        data: table === 'profiles' ? { user_id: captured.sessionUserId, name: 'Real', total_xp: 0 } : null,
        error: null,
      }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      upsert: payload => {
        captured.upserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: () => self,
      insert: () => Promise.resolve({ error: null }),
      delete: () => self,
    };
    return self;
  };
  return {
    supabase: {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      from: table => chain(table),
      auth: {
        getSession: () => Promise.resolve({
          data: { session: captured.sessionUserId ? { user: { id: captured.sessionUserId } } : null },
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve({}),
      },
    },
  };
});

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
  resetProEntitlementStorageState,
} from '../../pwa/js/platform/proEntitlement.js';
import { db, storage } from '../../pwa/js/storage.js';
import { DEV_RESET_CONFIRM, DEV_RESET_CONFIRM_GUEST, renderSettings } from '../../pwa/js/pages/settings.js';
import { reconcileAndSavePersonalSpaceV2 } from '../../pwa/js/personalSpace/v2/controller.js';
import {
  canOwnerClaimLegacyPersonalSpaceState,
  removeAllPersonalSpaceV2States,
} from '../../pwa/js/personalSpace/v2/store.js';

const OWNER_A = 'owner-a';
const OWNER_B = 'owner b/2';
const BRIDGE = 'orbit_platform_bridge_v1';
const V2_KEY = owner => `${BRIDGE}:personal-space-state-v2:${encodeURIComponent(owner)}`;
const LEGACY_CLAIM_KEY = `${BRIDGE}:personal-space-state-v2:legacy-claim`;
const LEGACY_STATE_KEY = `${BRIDGE}:personal-space-state`;
const SIMULATED_XP = 999_999;

let reload;

function seedUser(extra = {}) {
  const user = { id: OWNER_A, name: 'Tester', totalXP: 120, newDayHour: 5, ...extra };
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

/** Start a Pro simulation on A, then record profile changes while it runs. */
function simulateAndQueuePending() {
  seedUser();
  clickDev('dev-pro-paid');
  expect(localStorage.getItem(FLAG_DEV_BACKUP)).not.toBeNull();
  // Another account simulated on this device and left its pending behind; the
  // backup blocks the upsert, so saveUser() only queues it.
  storage.saveUser({ id: OWNER_B, name: 'Other', totalXP: SIMULATED_XP, isPro: true });
  storage.saveUser({ ...storage.getUser(), id: OWNER_A, totalXP: SIMULATED_XP });
  // The owner-less key a v1.21 pre-release could leave.
  localStorage.setItem('yoyo_profileSyncPending', JSON.stringify({
    ownerId: OWNER_A,
    value: { id: OWNER_A, totalXP: SIMULATED_XP, isPro: true },
  }));
  localStorage.setItem(V2_KEY(OWNER_A), JSON.stringify({ version: 2 }));
  localStorage.setItem(V2_KEY(OWNER_B), JSON.stringify({ version: 2 }));
  localStorage.setItem(LEGACY_CLAIM_KEY, JSON.stringify({ ownerId: OWNER_A, claimedAt: '2026-07-17T00:00:00.000Z' }));
  localStorage.setItem(LEGACY_STATE_KEY, JSON.stringify({ version: 1, spentGold: 3 }));
}

/** Click 還原 and wait for the async session check to reach the dialog (and the reload). */
async function reset({ confirmed }) {
  const confirm = vi.fn(() => confirmed);
  vi.stubGlobal('confirm', confirm);
  reload.mockClear();
  clickDev('dev-reset');
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  if (confirmed) await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  return confirm;
}

function pendingProfileKeys() {
  return Object.keys(localStorage).filter(key => key.startsWith('yoyo_profileSyncPending'));
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  clearLocalProEntitlementOverride();
  captured.upserts = [];
  captured.sessionUserId = null;
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, hostname: 'localhost', reload });
  window.showToast = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PRO-014Q S0 dev reset', () => {
  it('does nothing when the developer cancels the confirmation', async () => {
    simulateAndQueuePending();
    captured.sessionUserId = OWNER_A;
    const before = { ...localStorage };

    const confirm = await reset({ confirmed: false });

    expect(confirm).toHaveBeenCalledWith(DEV_RESET_CONFIRM);
    expect({ ...localStorage }).toEqual(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it('warns that simulated XP and streak changes are discarded while Sessions stay', () => {
    expect(DEV_RESET_CONFIRM).toContain('模擬期間獲得的 XP 與連勝變動會被捨棄');
    expect(DEV_RESET_CONFIRM).toContain('已記錄的 Session 會保留');
    expect(DEV_RESET_CONFIRM).toContain('開場 Gold 可能因此偏低');
  });

  it('discards every pending profile, the local user, the projection and all V2 states', async () => {
    enableServerProEntitlementLocally();
    simulateAndQueuePending();
    captured.sessionUserId = OWNER_A;
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).not.toBeNull();
    expect(pendingProfileKeys()).toHaveLength(3);

    const confirm = await reset({ confirmed: true });

    expect(confirm).toHaveBeenCalledWith(DEV_RESET_CONFIRM);
    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
    expect(pendingProfileKeys()).toEqual([]);
    expect(localStorage.getItem('yoyo_user')).toBeNull();
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(localStorage.getItem(V2_KEY(OWNER_A))).toBeNull();
    expect(localStorage.getItem(V2_KEY(OWNER_B))).toBeNull();
    // The claim shares the V2 prefix but must survive, and so must the legacy state.
    expect(JSON.parse(localStorage.getItem(LEGACY_CLAIM_KEY)).ownerId).toBe(OWNER_A);
    expect(JSON.parse(localStorage.getItem(LEGACY_STATE_KEY)).spentGold).toBe(3);
    expect(canOwnerClaimLegacyPersonalSpaceState(OWNER_B)).toBe(false);
  });

  it('leaves nothing for either account to push on its next remote load', async () => {
    simulateAndQueuePending();
    captured.sessionUserId = OWNER_A;
    await reset({ confirmed: true });

    for (const owner of [OWNER_A, OWNER_B]) {
      captured.sessionUserId = owner;
      await db.loadFromRemote(owner);
    }

    expect(captured.upserts.filter(entry => entry.table === 'profiles')).toEqual([]);
  });

  it('without the cleanup, the queued simulated profile would be pushed (baseline)', async () => {
    simulateAndQueuePending();
    // What the old reset did: drop only the backup.
    localStorage.removeItem(FLAG_DEV_BACKUP);
    captured.sessionUserId = OWNER_A;

    await db.loadFromRemote(OWNER_A);

    const pushed = captured.upserts.filter(entry => entry.table === 'profiles');
    expect(pushed).toHaveLength(1);
    expect(pushed[0].payload.total_xp).toBe(SIMULATED_XP);
  });
});

describe('PRO-014Q S0 dev reset for guests (B1)', () => {
  it('puts the guest\'s own backup back as the local user and still clears the rest', async () => {
    enableServerProEntitlementLocally();
    simulateAndQueuePending();
    // No Supabase session: OWNER_A is a guest whose profile exists only here.

    const confirm = await reset({ confirmed: true });

    expect(confirm).toHaveBeenCalledWith(DEV_RESET_CONFIRM_GUEST);
    const restored = JSON.parse(localStorage.getItem('yoyo_user'));
    expect(restored).toEqual({ id: OWNER_A, name: 'Tester', totalXP: 120, newDayHour: 5 });
    expect(storage.getUser().id).toBe(OWNER_A);
    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
    expect(pendingProfileKeys()).toEqual([]);
    expect(localStorage.getItem(FLAG_PRO_ENTITLEMENT)).toBeNull();
    expect(localStorage.getItem(V2_KEY(OWNER_A))).toBeNull();
    expect(localStorage.getItem(V2_KEY(OWNER_B))).toBeNull();
    expect(JSON.parse(localStorage.getItem(LEGACY_CLAIM_KEY)).ownerId).toBe(OWNER_A);
  });

  it('tells a guest the backup is written back instead of promising a cloud reload', () => {
    expect(DEV_RESET_CONFIRM_GUEST).toContain('遊客資料只存在這台裝置');
    expect(DEV_RESET_CONFIRM_GUEST).toContain('已記錄的 Session 會保留');
    expect(DEV_RESET_CONFIRM_GUEST).not.toContain('雲端');
  });

  it('does nothing for a guest who cancels', async () => {
    simulateAndQueuePending();
    const before = { ...localStorage };

    await reset({ confirmed: false });

    expect({ ...localStorage }).toEqual(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never restores a backup taken from another account', async () => {
    simulateAndQueuePending();
    // The local user changed after the backup was taken (for example a guest
    // set up after another account simulated on this device).
    storage.saveUserLocal({ id: OWNER_B, name: 'Other', totalXP: SIMULATED_XP });

    const confirm = await reset({ confirmed: true });

    expect(confirm).toHaveBeenCalledWith(DEV_RESET_CONFIRM);
    expect(localStorage.getItem('yoyo_user')).toBeNull();
    expect(localStorage.getItem(FLAG_DEV_BACKUP)).toBeNull();
  });

  it('never restores the backup for a signed-in user, even with matching ids', async () => {
    simulateAndQueuePending();
    captured.sessionUserId = OWNER_A;

    await reset({ confirmed: true });

    expect(localStorage.getItem('yoyo_user')).toBeNull();
  });
});

describe('PRO-014Q S0 V2 re-migration', () => {
  it('recomputes the opening Gold a clean device would get from the real XP', () => {
    const simulated = { id: OWNER_A, name: 'Tester', totalXP: SIMULATED_XP };
    const real = { ...simulated, totalXP: 0 };
    const finalize = user => reconcileAndSavePersonalSpaceV2({ user, sessions: [], authoritative: true })
      .state.economy.openingGold;

    const cleanGold = finalize(real);
    localStorage.clear();

    const simulatedGold = finalize(simulated);
    expect(simulatedGold).not.toBe(cleanGold);
    // Once finalized, the opening Gold is never recalculated.
    expect(finalize(real)).toBe(simulatedGold);

    removeAllPersonalSpaceV2States();

    expect(finalize(real)).toBe(cleanGold);
  });
});
