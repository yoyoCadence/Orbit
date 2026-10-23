/**
 * infra105-sw-update.test.js — INFRA-105
 *
 * A new version deployed while the browser still holds the old files in its
 * HTTP cache (GitHub Pages: max-age=600) must not be cached by the new service
 * worker: its install revalidates every SHELL file, and the background update
 * of JS / CSS revalidates too. Unchanged files only cost a 304.
 *
 * `pwa/server.cjs` answers `no-store`, which cannot show the problem, so this
 * test serves `pwa/` itself with `max-age=600` and ETags. It uses no Playwright
 * routing: routing turns the HTTP cache off.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { GUEST_USER, SUPABASE_STUB, seedStorage } from './support/seed.js';

const PWA_ROOT = new URL('../../pwa/', import.meta.url);
const NEXT_CACHE = 'orbit-e2e-next';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// A static server like GitHub Pages: max-age=600, ETags, 304 on a match.
// `files` replaces a path's content (the next version); `log` records each
// response.
async function startPagesServer() {
  const files = new Map([['/vendor/supabase.js', SUPABASE_STUB]]);
  const log = [];
  const server = createServer(async (request, response) => {
    let path = decodeURIComponent(request.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    let body = files.get(path);
    if (body === undefined) {
      try {
        body = await readFile(new URL(`.${path}`, PWA_ROOT));
      } catch {
        log.push({ path, status: 404 });
        response.writeHead(404);
        response.end();
        return;
      }
    }
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    const extension = path.slice(path.lastIndexOf('.'));
    const headers = {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Cache-Control': 'max-age=600',
      ETag: etag,
    };
    const status = request.headers['if-none-match'] === etag ? 304 : 200;
    log.push({ path, status });
    response.writeHead(status, headers);
    response.end(status === 304 ? undefined : body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    files,
    log,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

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
    const source = path => readFile(new URL(`.${path}`, PWA_ROOT), 'utf8');
    pages.files.set('/sw.js', (await source('/sw.js')).replace(/const CACHE = '[^']*';/, `const CACHE = '${NEXT_CACHE}';`));
    pages.files.set('/js/version.js', "export const APP_VERSION = 'v-e2e-next';\n");
    pages.files.set('/assets/style.css', `${await source('/assets/style.css')}\n/* e2e-next */\n`);
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

  test('the background update of a module fetches the server\'s copy', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, pages.origin);
    const cacheName = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
    });
    await expect.poll(() => cachedText(page, cacheName, '/js/timeBand.js'), { timeout: 20_000 })
      .toContain('getTimeBand');
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // Changed on the server, still fresh in the HTTP cache: the page gets the
    // cached copy at once, and the cache is updated from the server behind it.
    const original = await readFile(new URL('./js/timeBand.js', PWA_ROOT), 'utf8');
    pages.files.set('/js/timeBand.js', `${original}\n// e2e-next\n`);
    await page.evaluate(() => fetch('/js/timeBand.js').then(response => response.text()));
    await expect.poll(() => cachedText(page, cacheName, '/js/timeBand.js'), { timeout: 10_000 })
      .toContain('// e2e-next');
  });
});
