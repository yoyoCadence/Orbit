/**
 * infra111-sw-image.test.js — INFRA-111
 *
 * Art that is not precached (other styles, characters, decorations) is kept by
 * the service worker the first time it is shown and served for the rest of the
 * version. After a release, the new worker must fetch such a file from the
 * server: GitHub Pages lets the browser keep its copy for 10 minutes, so the
 * HTTP cache may still hold the previous version's file, which would then stay
 * until the release after.
 *
 * Served by `support/pagesServer.js` (max-age=600, ETags), with no Playwright
 * routing: routing turns the HTTP cache off.
 */

import { test, expect } from '@playwright/test';
import { GUEST_USER, seedStorage } from './support/seed.js';
import { readPwaFile, startPagesServer } from './support/pagesServer.js';

const BASE = '/Orbit/';
const NEXT_CACHE = 'orbit-e2e-next';
// Not in the SHELL: cached the first time it is fetched.
const ART = `${BASE}assets/personal-space/v2/characters/toon/protagonist/hoodie-walk-right.webp`;
const NEXT_ART = 'next version of the art';

async function openApp(page, url) {
  // Reduced motion: see infra107-sw-html.test.js.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, [], [], GUEST_USER);
  await page.goto(url);
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
}

// The art as the page gets it (through the worker), and as the worker kept it.
const fetchArt = (page, cacheName) => page.evaluate(async ([url, name]) => {
  const served = await (await fetch(url)).text();
  const kept = await (await window.caches.open(name)).match(url);
  return { served, kept: kept ? await kept.text() : null };
}, [ART, cacheName]);

test.describe('INFRA-111 art that is not precached', () => {
  let pages;

  test.beforeEach(async () => {
    pages = await startPagesServer({ base: BASE });
  });

  test.afterEach(async () => {
    await pages.close();
  });

  test('after a release, the new worker keeps the server\'s file, not the HTTP cache\'s', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, `${pages.origin}${BASE}`);
    const cacheName = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
    });
    expect(cacheName).toBeTruthy();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // This version shows the art: it is now in the HTTP cache (fresh for 10
    // minutes) and in this version's cache.
    const first = await fetchArt(page, cacheName);
    expect(first.kept).toBe(first.served);
    expect(first.served).not.toBe(NEXT_ART);

    // The next version changes the art and the worker.
    pages.files.set(`${BASE}sw.js`, (await readPwaFile('/sw.js')).replace(/const CACHE = '[^']*';/, `const CACHE = '${NEXT_CACHE}';`));
    pages.files.set(ART, NEXT_ART);
    await page.goto(`${pages.origin}${BASE}`);
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.caches.keys()), { timeout: 30_000 }).toEqual([NEXT_CACHE]);

    // A new tab, controlled by the new worker, shows the art: it is the next
    // version's, and so is the copy the worker keeps for the rest of it.
    const tab = await page.context().newPage();
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.goto(`${pages.origin}${BASE}`);
    await tab.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    const start = pages.log.length;
    expect(await fetchArt(tab, NEXT_CACHE)).toEqual({ served: NEXT_ART, kept: NEXT_ART });
    expect(pages.log.slice(start)).toContainEqual({ path: ART, status: 200 });

    // Then it comes from that cache, without asking the server.
    const again = pages.log.length;
    expect((await fetchArt(tab, NEXT_CACHE)).served).toBe(NEXT_ART);
    expect(pages.log.slice(again).map(entry => entry.path)).not.toContain(ART);
    await tab.close();
  });
});
