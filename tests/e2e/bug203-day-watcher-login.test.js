// BUG-203: the cross-day watcher after an account's remote load fails.
//
// The fail-closed return (BUG-141) leaves the login screen up with the cached
// guest still in memory. The watcher must not mount the guest's report over
// it; the day is asked once the guest continues, together with BUG-201's
// re-ask of what the failure took down, never twice. Unit tests cover each
// side with the other mocked (appShell mocks dayCycle.js); this runs both.
//
// page.clock: `runFor` only while the login screen is up. Once the home page
// shows, Pixi's requestAnimationFrame runs on the fake clock and `runFor`
// stalls; `fastForward` jumps instead (#316 review).

import { test, expect } from '@playwright/test';
import { INSTANT_TASK, FOCUS_TASK } from './support/seed.js';

// A client that can be signed in from the test, and whose remote load fails
// while window.__failRemote is set.
const AUTH_STUB = `
export function createClient() {
  const result = () => Promise.resolve(window.__failRemote
    ? { data: null, error: { message: '500', code: '500' } }
    : { data: null, error: null });
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, order: () => q, update: () => q, delete: () => q,
      upsert: result, insert: result, in: result, single: result,
      then: (resolve, reject) => result().then(resolve, reject),
    };
    return q;
  };
  return {
    auth: {
      storageKey: 'sb-e2e-auth-token',
      storage: { removeItem: key => { localStorage.removeItem(key); return Promise.resolve(); } },
      getSession: () => Promise.resolve({ data: { session: window.__session ?? null } }),
      onAuthStateChange: cb => { window.__authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signUp: () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
      signOut: () => { window.__session = null; return Promise.resolve({ error: null }); },
    },
    from: () => chain(),
    rpc: () => result(),
  };
}
`;

const GUEST = {
  id: 'guest-1', name: 'Guest', totalXP: 0, streakDays: 0, lastStreakDate: '2026-11-25',
  lastWeeklyBonusDate: '', morningState: 'normal', mode: 'normal', isPublic: false,
  createdAt: '2026-01-01', newDayHour: 0,
};

const report = page => page.locator('#daily-report-modal');
const morning = page => page.locator('#morning-modal');

/** A cached guest opened at 23:56 on 11/26, energy last reset on `lastResetDate`. */
async function openGuest(page, lastResetDate) {
  await page.route('**/vendor/supabase.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: AUTH_STUB,
  }));
  await page.clock.install({ time: new Date('2026-11-26T23:56:00') });
  await page.addInitScript(({ user, tasks, energy }) => {
    if (localStorage.getItem('yoyo_user')) return;
    localStorage.setItem('yoyo_user', JSON.stringify(user));
    localStorage.setItem('yoyo_tasks', JSON.stringify(tasks));
    localStorage.setItem('yoyo_sessions', '[]');
    localStorage.setItem('yoyo_energy', JSON.stringify(energy));
  }, { user: GUEST, tasks: [INSTANT_TASK, FOCUS_TASK], energy: { currentEnergy: 90, maxEnergy: 100, lastResetDate } });
  await page.goto('/index.html');
  await expect(page.locator('#main-app')).toBeVisible();
}

/** An account with no cache here signs in, and its remote load fails. */
async function failAccountLoad(page) {
  await page.evaluate(async () => {
    window.__failRemote = true;
    window.__session = { user: { id: 'owner-a', email: 'a@example.test' }, access_token: 'e2e' };
    localStorage.setItem('sb-e2e-auth-token', '{}');
    await window.__authCb('SIGNED_IN', window.__session);
  });
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.evaluate(() => { window.__failRemote = false; });
}

async function continueAsGuest(page) {
  await page.locator('[data-action="continueAsGuest"]').click();
  await expect(page.locator('#main-app')).toBeVisible();
}

const ticks = async (page, n) => {
  for (let i = 0; i < n; i++) await page.clock.fastForward(61_000);
};

test.describe('BUG-203 cross-day watcher after a failed account load', () => {
  test('no report over the login screen; asked once after continuing as guest', async ({ page }) => {
    await openGuest(page, '2026-11-26');
    await expect(report(page)).toHaveCount(0);
    await failAccountLoad(page);

    await page.clock.runFor(6 * 60_000);                  // past midnight on the login screen
    await expect(report(page)).toHaveCount(0);
    await expect(page.locator('[data-action="continueAsGuest"]')).toBeVisible();

    await continueAsGuest(page);
    await ticks(page, 2);
    await expect(report(page)).toHaveCount(1);
    await page.locator('#rpt-next-btn').click();
    await expect(morning(page)).toHaveCount(1);
    await ticks(page, 3);
    await expect(report(page)).toHaveCount(0);
  });

  test('report taken down on 11/26, guest continues on 11/27: asked once, then the morning state', async ({ page }) => {
    await openGuest(page, '2026-11-25');
    await expect(report(page)).toHaveCount(1);
    await failAccountLoad(page);
    await expect(report(page)).toHaveCount(0);
    await page.clock.runFor(6 * 60_000);
    await expect(report(page)).toHaveCount(0);

    await continueAsGuest(page);
    await expect(report(page)).toHaveCount(1);             // BUG-201's, for the new day
    await ticks(page, 2);
    await expect(report(page)).toHaveCount(1);             // the watcher does not stack another
    await page.locator('#rpt-next-btn').click();
    await expect(morning(page)).toHaveCount(1);
    await ticks(page, 2);
    await expect(report(page)).toHaveCount(0);

    await page.locator('#morning-modal .morning-btn[data-state="good"]').click();
    await ticks(page, 2);
    await expect(page.locator('#daily-report-modal, #morning-modal')).toHaveCount(0);
    const energy = await page.evaluate(() => JSON.parse(localStorage.getItem('yoyo_energy')));
    expect(energy.lastResetDate).toBe('2026-11-27');
  });

  test('morning state taken down on 11/26, guest continues on 11/27: that day starts from its report (#316 review)', async ({ page }) => {
    await openGuest(page, '2026-11-25');
    await page.locator('#rpt-next-btn').click();
    await expect(morning(page)).toHaveCount(1);
    await failAccountLoad(page);
    await expect(morning(page)).toHaveCount(0);
    await page.clock.runFor(6 * 60_000);
    await expect(report(page)).toHaveCount(0);

    await continueAsGuest(page);
    await expect(report(page)).toHaveCount(1);
    await expect(morning(page)).toHaveCount(0);
    await page.locator('#rpt-next-btn').click();
    await expect(morning(page)).toHaveCount(1);
    await ticks(page, 2);
    await expect(report(page)).toHaveCount(0);
  });

  test('a report left open from 11/26 is replaced by 11/27\'s at midnight (#316 review)', async ({ page }) => {
    await openGuest(page, '2026-11-25');
    await expect(report(page)).toHaveCount(1);
    const before = await page.locator('#daily-report-modal .rpt-date').textContent();

    await page.clock.fastForward(6 * 60_000);              // left open past midnight
    await ticks(page, 1);

    await expect(report(page)).toHaveCount(1);
    await expect(page.locator('#daily-report-modal .rpt-date')).not.toHaveText(before);
  });
});
