// Cross-day launch flow: daily report → morning state modal → app.
//
// This path had zero coverage before BUG-105: the shared fixture in support/
// seed.js pins newDayHour:0 *and* lastResetDate:TODAY so the report modal never
// appears, which is right for the other suites but meant the whole branch was
// never executed. A user got permanently stuck here — the modals have no close
// button, no backdrop dismiss and no timeout, so any throw inside their click
// handler strands the app across restarts.
//
// The fixture below keeps newDayHour:0 (so effectiveToday() equals today() at
// any hour, including CI runs before 05:00 local) but backdates the energy
// reset, which is what actually triggers the cross-day branch.

import { test, expect } from '@playwright/test';
import { INSTANT_TASK, FOCUS_TASK, mockSupabase } from './support/seed.js';

const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv');
})();

const CROSS_DAY_USER = {
  id: 'e2e-user', name: 'E2E Tester', totalXP: 120,
  streakDays: 3, lastStreakDate: YESTERDAY, lastWeeklyBonusDate: '',
  morningState: 'normal', mode: 'normal', isPublic: false,
  createdAt: '2026-01-01', newDayHour: 0,
};

async function seedCrossDayLaunch(page) {
  // Seed only when absent: addInitScript re-runs on reload, and a reload is
  // exactly how we assert the "already asked today" flag stuck.
  await page.addInitScript(({ user, tasks, energy }) => {
    const P = 'yoyo_';
    const seed = (key, value) => {
      if (!localStorage.getItem(P + key)) localStorage.setItem(P + key, JSON.stringify(value));
    };
    seed('user', user);
    seed('tasks', tasks);
    seed('sessions', []);
    seed('energy', energy);
  }, {
    user: CROSS_DAY_USER,
    tasks: [INSTANT_TASK, FOCUS_TASK],
    energy: { currentEnergy: 90, maxEnergy: 100, lastResetDate: YESTERDAY },
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
  await seedCrossDayLaunch(page);
});

test('cross-day launch walks report → morning state → usable app', async ({ page }) => {
  await page.goto('/index.html');

  const report = page.locator('#daily-report-modal');
  await expect(report).toHaveCount(1);

  await report.locator('#rpt-next-btn').click();

  const morning = page.locator('#morning-modal');
  await expect(morning).toHaveCount(1);
  await expect(report).toHaveCount(0);

  await morning.locator('.morning-btn[data-state="good"]').click();

  await expect(morning).toHaveCount(0);
  await expect(page.locator('#main-app')).toBeVisible();
  await expect(page.locator('#hdr-energy-text')).toHaveText('100');

  // The "already asked today" flag advanced, so a relaunch must not re-prompt.
  await page.reload();
  await expect(page.locator('#daily-report-modal')).toHaveCount(0);
  await expect(page.locator('#morning-modal')).toHaveCount(0);
});

test('morning modal closes and warns when the device cannot store the choice', async ({ page }) => {
  await page.goto('/index.html');

  await page.locator('#daily-report-modal #rpt-next-btn').click();
  await expect(page.locator('#morning-modal')).toHaveCount(1);

  // Exhaust the quota at exactly the moment of the click — the original bug.
  await page.evaluate(() => {
    const orig = window.Storage.prototype.setItem;
    window.Storage.prototype.setItem = function (key, value) {
      if (key === 'yoyo_user') {
        const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err;
      }
      return orig.call(this, key, value);
    };
  });

  await page.locator('#morning-modal .morning-btn[data-state="tired"]').click();

  // Must not freeze: modal gone, app reachable, and the failure is visible.
  await expect(page.locator('#morning-modal')).toHaveCount(0);
  await expect(page.locator('#main-app')).toBeVisible();
  await expect(page.locator('.toast')).toBeVisible();
});

test('neither modal survives a sign-out that happens while it is open', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#daily-report-modal')).toHaveCount(1);

  await page.evaluate(() => window.signOut());

  await expect(page.locator('#daily-report-modal')).toHaveCount(0);
  await expect(page.locator('#morning-modal')).toHaveCount(0);
  await expect(page.locator('#login-screen')).toBeVisible();
  // Static shell overlay must survive the cleanup.
  await expect(page.locator('#focus-duration-picker')).toHaveCount(1);
});
