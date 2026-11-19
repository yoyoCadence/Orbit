/**
 * hw112d-stale-account-tab.test.js — HW-112D (b)
 *
 * Two tabs of the same browser: the second switches the stored account while
 * the first still shows the previous one. Completing a task in the first tab
 * must not write its data under the other account (nor change what it shows);
 * the user is told to reload. (A home-screen app has one window, so this only
 * happens in a browser.)
 */

import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, mockSupabase, seedStorage } from './support/seed.js';

const OTHER = { ...GUEST_USER, id: 'e2e-other-account', name: '另一個帳號' };
const OTHER_TASK = { ...INSTANT_TASK, id: 'other-task', name: '別人的任務' };

test('a tab whose account was switched in another tab saves nothing and says to reload', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await seedStorage(page, [INSTANT_TASK]);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

  // The other tab (a page of the same origin that does not boot the app).
  const other = await context.newPage();
  await other.goto('/manifest.json');
  await other.evaluate(([user, task]) => {
    localStorage.setItem('yoyo_user', JSON.stringify(user));
    localStorage.setItem('yoyo_sessions', '[]');
    localStorage.setItem('yoyo_tasks', JSON.stringify([task]));
  }, [OTHER, OTHER_TASK]);
  await other.close();

  // Completing a task here: nothing is committed.
  await page.locator('.task-card .task-name').first().click();
  await page.waitForSelector('.plan-card', { timeout: 5000 });
  await page.locator('.plan-card').first().click();
  await expect(page.locator('.toast').filter({ hasText: '另一個分頁已切換帳號' })).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.xp-float')).toHaveCount(0);
  await expect(page.locator('.log-item')).toHaveCount(0);

  const stored = () => page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem('yoyo_user')).id,
    sessions: JSON.parse(localStorage.getItem('yoyo_sessions')),
    tasks: JSON.parse(localStorage.getItem('yoyo_tasks')).map(task => task.id),
  }));
  expect(await stored()).toEqual({ user: OTHER.id, sessions: [], tasks: ['other-task'] });

  // Reloading shows the stored account.
  await page.reload();
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  await expect(page.locator('#header')).toContainText('另一個帳號');
  await expect(page.locator('.task-card').first()).toContainText('別人的任務');
});
