/**
 * infra105-sw-update.test.js — INFRA-105
 *
 * A new version deployed while the browser still holds the old files in its
 * HTTP cache (GitHub Pages: max-age=600) must not be cached by the new service
 * worker: its install revalidates every SHELL file. Unchanged files only cost
 * a 304. Since INFRA-107 a cached module is never refreshed in the background;
 * one not cached is fetched from the server, not the HTTP cache.
 *
 * `pwa/server.cjs` answers `no-store`, which cannot show the problem, so this
 * test serves `pwa/` with `max-age=600` and ETags (`support/pagesServer.js`).
 * It uses no Playwright routing: routing turns the HTTP cache off.
 */

import { test, expect } from '@playwright/test';
import { GUEST_USER, seedStorage } from './support/seed.js';
import { readPwaFile, startPagesServer } from './support/pagesServer.js';

const NEXT_CACHE = 'orbit-e2e-next';

// Reduced motion stops the scene's animation loop: in headless software WebGL
// it keeps the browser too busy to run a service worker update.
async function openApp(page, origin) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, [], [], GUEST_USER);
  await page.goto(`${origin}/`);
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
}

function cachedText(page, cacheName, path) {
  return page.evaluate(async ([name, url]) => {
    const response = await (await window.caches.open(name)).match(url);
    return response ? response.text() : null;
  }, [cacheName, path]);
}

test.describe('INFRA-105 service worker update', () => {
  let pages;

  test.beforeEach(async () => {
    pages = await startPagesServer();
  });

  test.afterEach(async () => {
    await pages.close();
  });

  test('a new version caches its own code, not the browser\'s cached old copy', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, pages.origin);
    const firstCache = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
    });
    expect(firstCache).toBeTruthy();
    await expect.poll(() => cachedText(page, firstCache, '/js/version.js'), { timeout: 20_000 })
      .toContain('export const APP_VERSION');

    // The next version, deployed while the old files are still fresh in the
    // browser's HTTP cache.
    pages.files.set('/sw.js', (await readPwaFile('/sw.js')).replace(/const CACHE = '[^']*';/, `const CACHE = '${NEXT_CACHE}';`));
    pages.files.set('/js/version.js', "export const APP_VERSION = 'v-e2e-next';\n");
    pages.files.set('/assets/style.css', `${await readPwaFile('/assets/style.css')}\n/* e2e-next */\n`);
    const updateStart = pages.log.length;

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await expect.poll(() => page.evaluate(() => window.caches.keys()), { timeout: 30_000 }).toEqual([NEXT_CACHE]);

    expect(await cachedText(page, NEXT_CACHE, '/js/version.js')).toContain('v-e2e-next');
    expect(await cachedText(page, NEXT_CACHE, '/assets/style.css')).toContain('/* e2e-next */');
    // Every SHELL file was asked for again; an unchanged one cost a 304.
    const during = pages.log.slice(updateStart);
    expect(during).toContainEqual({ path: '/js/version.js', status: 200 });
    expect(during).toContainEqual({ path: '/js/app.js', status: 304 });
    expect(during).toContainEqual({ path: '/index.html', status: 304 });

    // After a reload the app runs the new code from the new cache.
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    expect(await page.evaluate(async () => (await import('/js/version.js')).APP_VERSION)).toBe('v-e2e-next');
  });

  test('a cached module stays this version\'s; one not cached comes from the server (INFRA-107)', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, pages.origin);
    const cacheName = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
    });
    await expect.poll(() => cachedText(page, cacheName, '/js/timeBand.js'), { timeout: 20_000 })
      .toContain('getTimeBand');

    // Changed on the server, still fresh in the HTTP cache. A reload and a
    // fetch get this version's copy, and nothing asks the server for it: the
    // next version's code comes with the next worker, never in the background.
    const original = await readPwaFile('/js/timeBand.js');
    pages.files.set('/js/timeBand.js', `${original}\n// e2e-next\n`);
    const start = pages.log.length;
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    expect(await page.evaluate(() => fetch('/js/timeBand.js').then(response => response.text()))).not.toContain('// e2e-next');
    expect(pages.log.slice(start).filter(entry => entry.path === '/js/timeBand.js')).toEqual([]);
    expect(await cachedText(page, cacheName, '/js/timeBand.js')).not.toContain('// e2e-next');

    // A module missing from the cache is fetched from the server rather than
    // the HTTP cache's still-fresh old copy, and kept.
    await page.evaluate(([name, url]) => window.caches.open(name).then(cache => cache.delete(url)), [cacheName, '/js/timeBand.js']);
    expect(await page.evaluate(() => fetch('/js/timeBand.js').then(response => response.text()))).toContain('// e2e-next');
    expect(pages.log.slice(start)).toContainEqual({ path: '/js/timeBand.js', status: 200 });
    await expect.poll(() => cachedText(page, cacheName, '/js/timeBand.js')).toContain('// e2e-next');
  });
});
