/**
 * hw112d-stale-account-tab.test.js — HW-112D (b)
 *
 * Two tabs of the same browser: the second switches the stored account while
 * the first still shows the previous one.
 * - The first tab reloads and shows the stored account (none of its memory is
 *   written under the other account), and says why.
 * - Before it hears of the switch (a frozen tab, the moment before the storage
 *   event), completing a task saves nothing and offers no proof photo.
 * (A home-screen app has one window, so this only happens in a browser.)
 */

import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, mockSupabase, seedStorage } from './support/seed.js';

const OTHER = { ...GUEST_USER, id: 'e2e-other-account', name: '另一個帳號' };
const OTHER_TASK = { ...INSTANT_TASK, id: 'other-task', name: '別人的任務' };

async function openApp(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await seedStorage(page, [INSTANT_TASK]);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

const switchAccount = ([user, task]) => {
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  localStorage.setItem('yoyo_sessions', '[]');
  localStorage.setItem('yoyo_tasks', JSON.stringify([task]));
};

const stored = page => page.evaluate(() => ({
  user: JSON.parse(localStorage.getItem('yoyo_user')).id,
  sessions: JSON.parse(localStorage.getItem('yoyo_sessions')),
  tasks: JSON.parse(localStorage.getItem('yoyo_tasks')).map(task => task.id),
}));

test('a tab whose account was switched in another tab reloads into the stored account', async ({ page, context }) => {
  await openApp(page);
  await expect(page.locator('#header')).toContainText('E2E Tester');

  // The other tab (a page of the same origin that does not boot the app).
  const other = await context.newPage();
  await other.goto('/manifest.json');
  await other.evaluate(switchAccount, [OTHER, OTHER_TASK]);
  await other.close();

  await expect(page.locator('#header')).toContainText('另一個帳號', { timeout: 8000 });
  await expect(page.locator('.task-card').first()).toContainText('別人的任務');
  await expect(page.locator('.toast').filter({ hasText: '另一個分頁切換了帳號，這裡已重新載入' })).toBeVisible();
  expect(await stored(page)).toEqual({ user: OTHER.id, sessions: [], tasks: ['other-task'] });
});

test('before it hears of the switch, completing a task saves nothing and offers no photo', async ({ page }) => {
  await openApp(page);
  // Written by this page itself, so no storage event: the moment before the
  // other tab's switch reaches this one.
  await page.evaluate(switchAccount, [OTHER, OTHER_TASK]);

  await page.locator('.task-card .task-name').first().click();
  await page.waitForSelector('.plan-card', { timeout: 5000 });
  await page.locator('.plan-card').first().click();
  await expect(page.locator('.toast').filter({ hasText: '另一個分頁已切換帳號' })).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.xp-float')).toHaveCount(0);
  await expect(page.locator('.log-item')).toHaveCount(0);
  // Nor is a proof photo offered for it (the sheet comes 700 ms after a commit).
  await page.waitForTimeout(1200);
  await expect(page.locator('.pro-sheet')).toHaveCount(0);
  expect(await stored(page)).toEqual({ user: OTHER.id, sessions: [], tasks: ['other-task'] });

  // Back in the foreground, it notices and reloads into the stored account.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#header')).toContainText('另一個帳號', { timeout: 8000 });
});
