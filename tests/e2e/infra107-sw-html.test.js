/**
 * infra107-sw-html.test.js — INFRA-107
 *
 * The app is served under `/Orbit/` on GitHub Pages. Every page load, at the
 * root or at `index.html` (the installed app's start page), gets the HTML the
 * service worker cached with its code (user decision, 2026-10-23), also with
 * a query and offline. A new version shows its HTML after the worker that
 * brought it takes over (the 「新版本已就緒」 banner).
 *
 * Served by `support/pagesServer.js` (max-age=600, ETags), with no Playwright
 * routing: routing turns the HTTP cache off.
 */

import { test, expect } from '@playwright/test';
import { GUEST_USER, seedStorage } from './support/seed.js';
import { readPwaFile, startPagesServer } from './support/pagesServer.js';

const BASE = '/Orbit/';
const NEXT_CACHE = 'orbit-e2e-next';
const ENTRY_POINTS = [BASE, `${BASE}index.html`];
const NEXT_MARK = '<meta name="e2e-version" content="next">';

// Reduced motion stops the scene's animation loop: in headless software WebGL
// it keeps the browser too busy to run a service worker update (INFRA-105).
async function openApp(page, url) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, [], [], GUEST_USER);
  await page.goto(url);
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
}

async function waitForPrecache(page) {
  const cacheName = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
  });
  expect(cacheName).toBeTruthy();
  await expect.poll(() => cacheKeys(page, cacheName), { timeout: 20_000 })
    .toEqual(expect.arrayContaining(ENTRY_POINTS));
  return cacheName;
}

function cacheKeys(page, cacheName) {
  return page.evaluate(async name => {
    const cache = await window.caches.open(name);
    return (await cache.keys()).map(request => {
      const url = new URL(request.url);
      return url.pathname + url.search;
    });
  }, cacheName);
}

// The page loads asked of the server (not the worker's own install fetches).
const pageLoads = urls => urls.filter(url => url === BASE || url.startsWith(`${BASE}?`) || url.startsWith(`${BASE}index.html`));

test.describe('INFRA-107 service worker page loads', () => {
  let pages;

  test.beforeEach(async () => {
    // The HTML is served as if the browser's copy were already more than 10
    // minutes old, so a network-first page load would see the server's copy
    // rather than the HTTP cache's (INFRA-105).
    pages = await startPagesServer({
      base: BASE,
      cacheControl: path => (path.endsWith('.html') ? 'max-age=0' : 'max-age=600'),
    });
  });

  test.afterEach(async () => {
    await pages.close();
  });

  test('both entry points get the HTML cached with the running version, until the next one takes over', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, `${pages.origin}${BASE}`);
    await waitForPrecache(page);

    // index.html changes on the server, but no new worker comes with it: both
    // entry points keep this version's HTML, without asking the server.
    const html = await readPwaFile('/index.html');
    pages.files.set(`${BASE}index.html`, html.replace('</head>', `${NEXT_MARK}\n</head>`));
    let start = pages.urls.length;
    for (const entry of ENTRY_POINTS) {
      await page.goto(`${pages.origin}${entry}`);
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
      await expect(page.locator('meta[name="e2e-version"]'), entry).toHaveCount(0);
    }
    expect(pageLoads(pages.urls.slice(start))).toEqual([]);

    // The next version: a new worker installs, takes over and offers the reload.
    pages.files.set(`${BASE}sw.js`, (await readPwaFile('/sw.js')).replace(/const CACHE = '[^']*';/, `const CACHE = '${NEXT_CACHE}';`));
    pages.files.set(`${BASE}js/version.js`, "export const APP_VERSION = 'v-e2e-next';\n");
    const updateStart = pages.log.length;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => page.evaluate(() => window.caches.keys()), { timeout: 30_000 }).toEqual([NEXT_CACHE]);
    await expect(page.locator('#update-banner')).toContainText('新版本已就緒');
    // Its install fetched the new HTML; the page loads below are its cache.
    expect(pages.log.slice(updateStart)).toContainEqual({ path: `${BASE}index.html`, status: 200 });
    start = pages.urls.length;
    for (const entry of ENTRY_POINTS) {
      await page.goto(`${pages.origin}${entry}`);
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
      await expect(page.locator('meta[name="e2e-version"]'), entry).toHaveCount(1);
      expect(await page.evaluate(async base => (await import(`${base}js/version.js`)).APP_VERSION, BASE)).toBe('v-e2e-next');
    }
    expect(pageLoads(pages.urls.slice(start))).toEqual([]);
  });

  test('a page load with a query, and one offline, get the cached page', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, `${pages.origin}${BASE}`);
    const cacheName = await waitForPrecache(page);

    // A query (an auth redirect adds one) is ignored and never kept.
    const start = pages.urls.length;
    await page.goto(`${pages.origin}${BASE}?from=e2e`);
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    expect(pageLoads(pages.urls.slice(start))).toEqual([]);
    expect((await cacheKeys(page, cacheName)).filter(key => key.includes('?'))).toEqual([]);

    // With the network down the installed app's start page, query and all, still opens.
    pages.offline = true;
    await page.goto(`${pages.origin}${BASE}index.html?from=offline`);
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
  });
});
