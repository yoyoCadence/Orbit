/**
 * sw-precache.test.js — PS-211A
 *
 * The service worker precaches every image the Orbit Window poster can show
 * and Pixi. After it installs, an offline reload still shows a complete poster
 * (here in a non-default state with rain) and the runtime reaches ready from the
 * cached Pixi, by day and, with the night room (PS-250E1), at night. The page
 * itself still fetches Pixi only when the runtime mounts.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, TODAY, mockSupabase, seedStorage } from './support/seed.js';

const SW_SOURCE = readFileSync(new URL('../../pwa/sw.js', import.meta.url), 'utf8');
const PRECACHED = [...SW_SOURCE.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)]
  .map(match => match[1])
  .filter(path => path.startsWith('assets/personal-space/') || path === 'vendor/pixi.js');
const V2_STATE_KEY = 'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user';

const RECOVERY_TASK = {
  ...FOCUS_TASK, id: 'task-recovery', name: '散步', impactType: 'recovery',
  taskNature: 'recovery', value: 'D', emoji: '🚶',
};
// PS-250E1: the poster is checked at a fixed time of day, since the evening
// and the night show the night room. Both are today, so TODAY still holds.
function todayAt(hour) {
  const time = new Date(`${TODAY}T00:00:00`);
  time.setHours(hour);
  return time;
}

function sessionsBefore(now) {
  // A completed recovery Session today puts the protagonist and Companion in `rest`.
  const recovery = {
    id: 'session-recovery', taskId: RECOVERY_TASK.id, date: TODAY,
    completedAt: new Date(now.getTime() - 30 * 60_000).toISOString(), result: 'complete',
    impactType: 'recovery', taskNature: 'recovery', value: 'D',
    durationMinutes: 30, finalXP: 0,
  };
  // Four earlier days of A-value Focus Sessions finish Workspace Upgrade (100%),
  // so every phase's props render on the poster.
  const focus = [4, 3, 2, 1].map(daysAgo => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    return {
      id: `session-focus-${daysAgo}`, taskId: FOCUS_TASK.id, date: date.toLocaleDateString('sv'),
      completedAt: date.toISOString(), result: 'complete',
      impactType: 'task', taskNature: 'growth', category: 'focus', value: 'A',
      durationMinutes: 30, finalXP: 50,
    };
  });
  return [...focus, recovery];
}

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

  for (const { lighting, hour } of [{ lighting: 'day', hour: 12 }, { lighting: 'night', hour: 22 }]) {
    test(`precaches the poster art and Pixi, and an offline reload shows a complete poster (${lighting})`, async ({ page, context }) => {
      // 22 day images, the night room with 8 night props, the 6 decorations
      // by day and by night (PS-250F), and Pixi.
      expect(PRECACHED).toHaveLength(44);
      const now = todayAt(hour);
      await page.clock.setFixedTime(now);
      await seedStorage(page, [FOCUS_TASK, RECOVERY_TASK], sessionsBefore(now), { ...GUEST_USER, totalXP: 5000 });
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
        await expect(orbit).toHaveAttribute('data-project-progress', '100');
        await expect(orbit.locator('.orbit-window-poster img.orbit-window-prop:not(.orbit-window-decoration)'))
          .toHaveCount(7);
        // PS-250F: the six decorations, precached by day and by night.
        await expect(orbit.locator('.orbit-window-poster img.orbit-window-decoration')).toHaveCount(6);
        await expect(orbit.locator('.orbit-window-weather')).toHaveAttribute('data-weather', 'rain');
        await expect(orbit.locator('.orbit-window-protagonist')).toHaveAttribute('data-player-state', 'rest');
        await expect(orbit.locator('.orbit-window-companion')).toHaveAttribute('data-companion-state', 'rest');
        const roomAndProps = await orbit.evaluate(root => [
          root.querySelector('.orbit-window-background'),
          ...root.querySelectorAll('.orbit-window-prop'),
        ].map(image => image.getAttribute('src')));
        expect(roomAndProps.every(src => /-night\.(png|webp)$/.test(src))).toBe(lighting === 'night');
        expect(roomAndProps.some(src => /-night\.(png|webp)$/.test(src))).toBe(lighting === 'night');
        // The achievement frame is dimmed with the night room.
        expect(await orbit.locator('[data-achievement-photo]').evaluate(frame => frame.hasAttribute('data-night-dim')))
          .toBe(lighting === 'night');
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
  }

  test('on Home the page fetches Pixi only after the Orbit Window runtime starts mounting', async ({ page }) => {
    // Records when the runtime host first reports "loading" (mount() sets it just
    // before importing Pixi), to compare with when the page requested pixi.js.
    await page.addInitScript(() => {
      window.__runtimeLoadingAt = null;
      new MutationObserver(() => {
        const host = document.querySelector('[data-orbit-runtime-host]');
        if (window.__runtimeLoadingAt === null && host?.dataset.runtimeStatus === 'loading') {
          window.__runtimeLoadingAt = window.performance.now();
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-runtime-status'] });
    });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/');
    await expect(page.locator('[data-orbit-window] [data-orbit-runtime-host]'))
      .toHaveAttribute('data-runtime-status', 'ready', { timeout: 15_000 });
    const timing = await page.evaluate(() => ({
      loadingAt: window.__runtimeLoadingAt,
      domContentLoaded: window.performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
      pixiRequests: window.performance.getEntriesByType('resource')
        .filter(entry => new URL(entry.name).pathname.endsWith('/vendor/pixi.js'))
        .map(entry => entry.startTime),
    }));
    expect(timing.loadingAt).not.toBeNull();
    expect(timing.pixiRequests.length).toBeGreaterThan(0);
    // The observer callback runs a microtask after mount() sets "loading" and calls
    // import(), so allow a few ms; an initial-load fetch would start before
    // DOMContentLoaded, long before the deferred mount.
    for (const startTime of timing.pixiRequests) {
      expect(startTime).toBeGreaterThan(timing.domContentLoaded);
      expect(startTime).toBeGreaterThanOrEqual(timing.loadingAt - 5);
    }
  });

  test('legacy personal space still shows its idle-window art online', async ({ page }) => {
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
    await page.addInitScript(() => localStorage.setItem('orbit_personal_space_runtime', 'legacy'));
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    // Reload under the installed worker, so legacy art takes the use-time cache path.
    await waitForPrecache(page);
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(() => window.navigate('personalSpace'));
    await expect(page.locator('#content')).toContainText('Orbit Personal Space');
    const backgrounds = page.locator('img.space-idle-background');
    await expect(backgrounds.first()).toBeVisible({ timeout: 8000 });
    await expect.poll(() => backgrounds.evaluateAll(images => images
      .filter(image => !image.complete || image.naturalWidth === 0)
      .map(image => image.getAttribute('src'))), { timeout: 15_000 }).toEqual([]);
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
