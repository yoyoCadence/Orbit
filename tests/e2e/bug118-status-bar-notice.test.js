/**
 * bug118-status-bar-notice.test.js — BUG-118
 *
 * A home-screen icon added before v1.41.14 still opens with the translucent
 * status bar (iOS stores the style with the icon), so iOS keeps blurring the
 * top. The app cannot change that; it tells the user what will (first a full
 * relaunch, then a new icon checked before the old one is removed), and says
 * nothing to anyone else.
 *
 * Chromium is not an iOS home-screen app: `navigator.standalone` and the top
 * safe area (`--sat`, from env(safe-area-inset-top)) are set here the way an
 * old icon on an iPhone reports them.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');
const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const KEY = 'orbit_status_bar_notice';

// The test serves style.css with an iOS top inset; a service worker would answer
// reloads from its cache instead, which page.route does not see.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function setUp(page, { standalone = true, safeTop = 59, supabase = 'mock', user = GUEST_USER } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (supabase === 'mock') await mockSupabase(page);
  // The top inset an iPhone reports under a translucent status bar (0 under `default`).
  await page.route('**/assets/style.css*', route => route.fulfill({
    status: 200, contentType: 'text/css', body: `${css}\n:root { --sat: ${safeTop}px; }\n`,
  }));
  if (standalone) {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'standalone', { configurable: true, get: () => true });
    });
  }
  await seedStorage(page, [FOCUS_TASK], [], user);
}

async function open(page, how = 'goto') {
  if (how === 'reload') await page.reload();
  else await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

const notice = page => page.locator('#status-bar-notice');
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);

test('an old icon is asked to relaunch, then to add a new icon; each banner stays closed', async ({ page }) => {
  await setUp(page);

  await open(page);
  await expect(notice(page)).toHaveAttribute('data-step', 'relaunch');
  await expect(notice(page)).toContainText('完全關閉 Orbit');
  await expect(notice(page).locator('details')).toHaveCount(0);
  expect(await stored(page)).toEqual({ relaunchAskedAtMs: expect.any(Number) });

  // The update banner reloads inside the app: not a launch, same request.
  await open(page, 'reload');
  await expect(notice(page)).toHaveAttribute('data-step', 'relaunch');
  await notice(page).locator('.sbn-close').click();
  await expect(notice(page)).toBeHidden();
  await open(page, 'reload');
  await expect(notice(page)).toBeHidden();

  // A later launch that is still translucent: add a new icon first. The steps
  // and what a guest's old icon holds are behind 「怎麼做」.
  await open(page);
  await expect(notice(page)).toHaveAttribute('data-step', 'readd');
  await expect(notice(page).locator('ol')).toBeHidden();
  await notice(page).locator('summary').click();
  const steps = notice(page).locator('ol li');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toContainText(new URL(page.url()).origin);
  await expect(steps.nth(1)).toContainText('加入主畫面');
  await expect(steps.nth(3)).toContainText('移除');
  await expect(notice(page).locator('.sbn-warning')).toContainText('訪客模式的所有資料');

  // Reloads keep the step this icon has reached.
  await open(page, 'reload');
  await expect(notice(page)).toHaveAttribute('data-step', 'readd');
  await notice(page).locator('.sbn-close').click();
  await expect(notice(page)).toBeHidden();
  for (const how of ['reload', 'goto']) {
    await open(page, how);
    await expect(notice(page)).toBeHidden();
  }
  expect(await stored(page)).toEqual({
    relaunchAskedAtMs: expect.any(Number),
    relaunchDismissedAtMs: expect.any(Number),
    readdShownAtMs: expect.any(Number),
    readdDismissedAtMs: expect.any(Number),
  });
});

test('a signed-in old icon gets the account text even before (or without) getSession()', async ({ page }) => {
  // Offline with an expired access token: getSession() retries the refresh for
  // about 25 s and then returns no session (BUG-116), so the app never sets
  // its session during this test. The stored session says who is signed in.
  const user = { ...GUEST_USER, id: '00000000-0000-4000-8000-000000000118' };
  await setUp(page, { supabase: 'offline', user });
  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.addInitScript(([key, userId, noticeKey]) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({
        access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 60,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'bug118@example.test' },
      }));
    }
    if (!localStorage.getItem(noticeKey)) localStorage.setItem(noticeKey, JSON.stringify({ relaunchAskedAtMs: 1 }));
  }, [SESSION_KEY, user.id, KEY]);

  await open(page);
  await expect(notice(page)).toHaveAttribute('data-step', 'readd');
  await expect(notice(page).locator('.sbn-warning')).toContainText('佐證照片');
  await expect(notice(page).locator('ol li').nth(2)).toContainText('用同一個帳號登入');
  await expect(notice(page)).not.toContainText('訪客模式');
  await page.waitForTimeout(1500);
  await expect(notice(page)).not.toContainText('訪客模式');
});

test('an icon with the opaque status bar sees nothing and keeps what was closed', async ({ page }) => {
  await setUp(page, { safeTop: 0 });
  const closed = { relaunchAskedAtMs: 1, readdShownAtMs: 2, readdDismissedAtMs: 3 };
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [KEY, closed]);
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await stored(page)).toEqual(closed);
});

test('a browser tab and an iPad see nothing, even with a top inset', async ({ page }) => {
  await setUp(page, { standalone: false });
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await stored(page)).toBeNull();

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, get: () => true });
  });
  await open(page);
  await expect(notice(page)).toBeHidden();
  expect(await stored(page)).toBeNull();
});
