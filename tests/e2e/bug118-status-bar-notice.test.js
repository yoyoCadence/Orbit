/**
 * bug118-status-bar-notice.test.js — BUG-118
 *
 * A home-screen icon added before v1.41.14 still opens with the translucent
 * status bar (iOS stores the style with the icon), so iOS keeps blurring the
 * top. The app cannot change that; it tells the user what will (first a full
 * relaunch, then re-adding the icon), and says nothing to anyone else.
 *
 * Chromium is not an iOS home-screen app: `navigator.standalone` and the top
 * safe area (`--sat`, from env(safe-area-inset-top)) are set here the way an
 * old icon on an iPhone reports them.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');
const KEY = 'orbit_status_bar_notice';

// The test serves style.css with an iOS top inset; a service worker would answer
// reloads from its cache instead, which page.route does not see.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function setUp(page, { standalone = true, safeTop = 59 } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  // The top inset an iPhone reports under a translucent status bar (0 under `default`).
  await page.route('**/assets/style.css*', route => route.fulfill({
    status: 200, contentType: 'text/css', body: `${css}\n:root { --sat: ${safeTop}px; }\n`,
  }));
  if (standalone) {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'standalone', { configurable: true, get: () => true });
    });
  }
  await seedStorage(page, [FOCUS_TASK], [], GUEST_USER);
}

async function open(page, how = 'goto') {
  if (how === 'reload') await page.reload();
  else await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

const notice = page => page.locator('#status-bar-notice');
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);

test('an old icon is asked to relaunch, then to re-add, each until closed', async ({ page }) => {
  await setUp(page);

  await open(page);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveAttribute('data-step', 'relaunch');
  await expect(notice(page)).toContainText('完全關閉再打開');
  expect(await stored(page)).toEqual({ relaunchAskedAtMs: expect.any(Number) });

  // The update banner reloads inside the app: not a launch, same request.
  await open(page, 'reload');
  await expect(notice(page)).toHaveAttribute('data-step', 'relaunch');
  await notice(page).locator('.sbn-close').click();
  await expect(notice(page)).toBeHidden();
  await open(page, 'reload');
  await expect(notice(page)).toBeHidden();

  // A later launch that is still translucent: re-add the icon, and what
  // happens to a guest's data.
  await open(page);
  await expect(notice(page)).toHaveAttribute('data-step', 'readd');
  await expect(notice(page)).toContainText('加入主畫面');
  await expect(notice(page)).toContainText('訪客模式的所有資料');
  await open(page);
  await expect(notice(page)).toHaveAttribute('data-step', 'readd');
  await notice(page).locator('.sbn-close').click();
  await expect(notice(page)).toBeHidden();
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await stored(page)).toEqual({
    relaunchAskedAtMs: expect.any(Number),
    relaunchDismissedAtMs: expect.any(Number),
    readdDismissedAtMs: expect.any(Number),
  });
});

test('an icon with the opaque status bar sees nothing and forgets the notice', async ({ page }) => {
  await setUp(page, { safeTop: 0 });
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ relaunchAskedAtMs: 1 }));
  }, KEY);
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
});

test('a browser tab sees nothing, even with a top inset', async ({ page }) => {
  await setUp(page, { standalone: false });
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
});
