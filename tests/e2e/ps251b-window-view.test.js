/**
 * ps251b-window-view.test.js — PS-251B
 *
 * In the morning and the evening the poster draws a view outside the window
 * over the room. With the app open across 17:00 (T1), home and the Personal
 * Space page re-render once: the room turns to night and the view to evening,
 * keeping the focused control and an open detail panel (as at the AI-203B
 * reminder boundaries).
 */
import { expect, test } from '@playwright/test';
import { GUEST_USER, TODAY, mockSupabase, seedStorage } from './support/seed.js';

const VIEW = band => `assets/personal-space/v2/workspace/window/exterior-${band}.webp`;
const DAY_ROOM = /workspace\/backgrounds\/building-formal-workstation-room-v2\.webp$/;
const NIGHT_ROOM = /workspace\/backgrounds\/building-formal-workstation-room-v2-night\.webp$/;

function todayAt(hour, minute = 0, second = 0) {
  const time = new Date(`${TODAY}T00:00:00`);
  time.setHours(hour, minute, second);
  return time;
}

// Marks the Orbit Window drawn now, to tell whether a later one replaced it.
function markWindow(orbit) {
  return orbit.evaluate(root => { root.dataset.e2eDrawn = ''; });
}

test.use({ serviceWorkers: 'block' });

test.describe('PS-251B window view by time of day', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [], [], { ...GUEST_USER, totalXP: 5000 });
  });

  for (const { band, hour } of [{ band: 'morning', hour: 7 }, { band: 'evening', hour: 18 }]) {
    test(`draws the ${band} view over the room, under the furniture`, async ({ page }) => {
      await page.clock.setFixedTime(todayAt(hour));
      await page.goto('/');
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
      const poster = page.locator('[data-orbit-window] .orbit-window-poster');
      const view = poster.locator('img.orbit-window-exterior');
      await expect(view).toHaveAttribute('src', VIEW(band));
      await expect(poster.locator('.orbit-window-background')).toHaveAttribute('src', band === 'evening' ? NIGHT_ROOM : DAY_ROOM);
      await expect.poll(() => view.evaluate(image => image.complete && image.naturalWidth)).toBe(1536);
      // Covers the poster like the room, and is painted after it and before
      // the furniture: no z-index of its own, every prop has a positive one.
      const layout = await poster.evaluate(root => {
        const background = root.querySelector('.orbit-window-background');
        const exterior = root.querySelector('.orbit-window-exterior');
        const box = image => {
          const { x, y, width, height } = image.getBoundingClientRect();
          return [x, y, width, height];
        };
        return {
          boxes: [box(background), box(exterior)],
          zIndex: [background, exterior].map(image => window.getComputedStyle(image).zIndex),
          afterBackground: exterior.previousElementSibling === background,
          props: [...root.querySelectorAll('.orbit-window-prop')].map(image => Number(window.getComputedStyle(image).zIndex)),
        };
      });
      expect(layout.boxes[1]).toEqual(layout.boxes[0]);
      expect(layout.zIndex).toEqual(['auto', 'auto']);
      expect(layout.afterBackground).toBe(true);
      expect(layout.props.length).toBeGreaterThan(0);
      expect(layout.props.every(z => z > 0)).toBe(true);
    });
  }

  test('turns the room to night and the view to evening at 17:00 with the app open (T1)', async ({ page }) => {
    await page.clock.install({ time: todayAt(16, 59, 30) });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    // Home: the card is rebuilt once, keeping the focused control.
    let orbit = page.locator('[data-orbit-window]');
    await expect(orbit.locator('.orbit-window-background')).toHaveAttribute('src', DAY_ROOM);
    await expect(orbit.locator('.orbit-window-exterior')).toHaveCount(0);
    await markWindow(orbit);
    await orbit.locator('[data-orbit-open-world]').focus();
    await page.clock.fastForward('00:45');
    orbit = page.locator('[data-orbit-window]:not([data-e2e-drawn])');
    await expect(orbit.locator('.orbit-window-background')).toHaveAttribute('src', NIGHT_ROOM);
    await expect(orbit.locator('.orbit-window-exterior')).toHaveAttribute('src', VIEW('evening'));
    await expect(orbit.locator('[data-orbit-open-world]')).toBeFocused();
    // Nothing more to change until 21:00.
    await markWindow(orbit);
    await page.clock.fastForward('10:00');
    await expect(page.locator('[data-orbit-window]:not([data-e2e-drawn])')).toHaveCount(0);

    // The Personal Space page, with the Companion detail open across the next
    // boundary (21:00: the night has no view).
    await page.locator('[data-orbit-open-world]').click();
    const space = page.locator('[data-personal-space-v2]');
    await expect(space.locator('.orbit-window-exterior')).toHaveAttribute('src', VIEW('evening'));
    await space.locator('[data-v2-open-detail="companion"]').click();
    await expect(space.locator('[data-v2-detail="companion"] h2')).toBeFocused();
    await page.clock.fastForward(todayAt(21, 0, 30).getTime() - await page.evaluate(() => Date.now()));
    await expect(space.locator('.orbit-window-exterior')).toHaveCount(0);
    await expect(space.locator('.orbit-window-background')).toHaveAttribute('src', NIGHT_ROOM);
    await expect(space.locator('[data-v2-detail-panel]')).toBeVisible();
    await expect(space.locator('[data-v2-detail="companion"]')).toBeVisible();
    await expect(space.locator('[data-v2-detail="companion"] h2')).toBeFocused();
  });
});
