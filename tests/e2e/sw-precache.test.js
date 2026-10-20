/**
 * sw-precache.test.js — PS-211A
 *
 * The service worker precaches every image the Orbit Window poster can show
 * and Pixi. After it installs, an offline reload still shows a complete poster
 * (here in a non-default state with rain) and the runtime reaches ready from the
 * cached Pixi. The page itself still fetches Pixi only when the runtime mounts.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, TODAY, mockSupabase, seedStorage } from './support/seed.js';

const SW_SOURCE = readFileSync(new URL('../../pwa/sw.js', import.meta.url), 'utf8');
const PRECACHED = [...SW_SOURCE.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)]
  .map(match => match[1])
  .filter(path => path.startsWith('assets/personal-space/') || path === 'vendor/pixi.js');
const V2_STATE_KEY = 'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user';

// A completed recovery Session today puts the protagonist and Companion in `rest`.
const RECOVERY_SESSION = {
  id: 'session-recovery', taskId: 'task-focus', date: TODAY,
  completedAt: new Date().toISOString(), result: 'complete',
  impactType: 'recovery', taskNature: 'recovery', value: 'D',
  durationMinutes: 30, finalXP: 0,
};

async function waitForPrecache(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => {
    const name = (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
    if (!name) return [];
    const cache = await window.caches.open(name);
    return (await cache.keys()).map(request => new URL(request.url).pathname.slice(1));
  }), { timeout: 20_000 }).toEqual(expect.arrayContaining(PRECACHED));
}

test.describe('PS-211A service worker precache', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45_000);
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('precaches the poster art and Pixi, and an offline reload shows a complete poster', async ({ page, context }) => {
    expect(PRECACHED).toHaveLength(23);
    await seedStorage(page, [FOCUS_TASK], [RECOVERY_SESSION], { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await waitForPrecache(page);

    const cached = await page.evaluate(async () => {
      const name = (await window.caches.keys()).find(key => key.startsWith('orbit-v'));
      return (await (await window.caches.open(name)).keys()).map(request => new URL(request.url).pathname);
    });
    expect(cached.filter(path => path.includes('/idle-window/'))).toEqual([]);

    // Rain is a stored world state; the recovery Session makes both actors rest.
    await page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...state, weather: 'rain' }));
    }, V2_STATE_KEY);

    // Offline, and with every art / Pixi network request aborted: context.route
    // also sees the service worker's own fetches (setOffline alone does not),
    // so only files already in the precache can load.
    await context.setOffline(true);
    await context.route(/\/assets\/personal-space\/|\/vendor\/pixi\.js$/, route => route.abort());
    try {
      await page.reload();
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
      const orbit = page.locator('[data-orbit-window]');
      await expect(orbit.locator('.orbit-window-weather')).toHaveAttribute('data-weather', 'rain');
      await expect(orbit.locator('.orbit-window-protagonist')).toHaveAttribute('data-player-state', 'rest');
      await expect(orbit.locator('.orbit-window-companion')).toHaveAttribute('data-companion-state', 'rest');
      await expect.poll(() => orbit.evaluate(root => [...root.querySelectorAll('.orbit-window-poster img')]
        .filter(image => !image.complete || image.naturalWidth === 0)
        .map(image => image.getAttribute('src'))), { timeout: 8000 }).toEqual([]);
      await expect(orbit.locator('[data-orbit-runtime-host]'))
        .toHaveAttribute('data-runtime-status', 'ready', { timeout: 15_000 });
    } finally {
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      await context.setOffline(false);
    }
  });

  test('the page itself does not fetch Pixi when no Orbit Window mounts', async ({ page }) => {
    const pageRequests = [];
    page.on('request', request => {
      if (!request.serviceWorker()) pageRequests.push(new URL(request.url()).pathname);
    });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/#goals');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('[data-orbit-window]')).toHaveCount(0);
    // The service worker downloads Pixi for its precache; the page does not.
    await waitForPrecache(page);
    expect(pageRequests.filter(path => path.endsWith('/vendor/pixi.js'))).toEqual([]);
  });
});
