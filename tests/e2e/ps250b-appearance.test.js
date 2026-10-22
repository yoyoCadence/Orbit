/**
 * PS-250B: choosing a style and characters in Edit Mode, and the fallback to
 * the precached default characters when a chosen one cannot load (offline and
 * never downloaded). The failed loads are simulated by aborting the requests.
 */
import { expect, test } from '@playwright/test';
import { GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const TOON = 'assets/personal-space/v2/characters/toon';

// page.route does not see requests a service worker makes, so keep it out:
// the aborted requests stand for "offline and not in the cache".
test.use({ serviceWorkers: 'block' });

test.describe('PS-250B character style and choice', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [], [], { ...GUEST_USER, totalXP: 5000 });
  });

  test('draws the chosen characters, and the default when one cannot load', async ({ page }) => {
    // The fox was never downloaded and the device is offline: its requests fail.
    await page.route(/\/characters\/toon\/companion\/fox-/, route => route.abort('internetdisconnected'));
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('.orbit-window-protagonist')).toHaveAttribute('src', /\/toon\/protagonist\/office-/);

    await page.locator('[data-orbit-open-world]').click();
    await page.locator('[data-personal-space-v2] [data-v2-mode="edit"]').first().click();
    await page.locator('[data-v2-appearance="protagonist"][data-value="artist"]').click();
    await page.locator('[data-v2-appearance="companion"][data-value="fox"]').click();
    await expect(page.locator('[data-v2-appearance="companion"][data-value="fox"]')).toHaveAttribute('aria-pressed', 'true');

    const protagonist = page.locator('[data-personal-space-v2] .orbit-window-protagonist');
    const companion = page.locator('[data-personal-space-v2] .orbit-window-companion');
    await expect(protagonist).toHaveAttribute('src', new RegExp(`${TOON}/protagonist/artist-`));
    // The fox fails, so the poster shows the precached Orbit instead.
    await expect(companion).toHaveAttribute('src', new RegExp(`${TOON}/companion/orbit-`));
    await expect.poll(() => companion.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => protagonist.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);

    // The choice is kept on this device: the home Orbit Window draws the artist too.
    await page.locator('[data-personal-space-v2] [data-v2-mode="full-world"]').first().click();
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('.orbit-window-protagonist')).toHaveAttribute('src', new RegExp(`${TOON}/protagonist/artist-`));
    await expect(page.locator('.orbit-window-companion')).toHaveAttribute('src', new RegExp(`${TOON}/companion/orbit-`));
  });

  test('switches to the pixel style with the same characters, and back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-orbit-open-world]').click();
    await page.locator('[data-personal-space-v2] [data-v2-mode="edit"]').first().click();
    await page.locator('[data-v2-appearance="protagonist"][data-value="sporty"]').click();
    await page.locator('[data-v2-appearance="style"][data-value="pixel"]').click();

    // PS-250D: the pixel room, and the pixel version of the chosen character.
    const protagonist = page.locator('[data-personal-space-v2] .orbit-window-protagonist');
    await expect(protagonist).toHaveAttribute('src', /characters\/pixel\/protagonist\/sporty-/);
    await expect(page.locator('[data-personal-space-v2] .orbit-window-background')).toHaveAttribute('src', /workspace\/pixel\//);
    // The pixel images themselves load (a fallback would have swapped the src).
    const loadedPixel = locator => locator.evaluate(image => (
      image.complete && image.naturalWidth > 0 && image.getAttribute('src').includes('/pixel/')
    ));
    await expect.poll(() => loadedPixel(protagonist)).toBe(true);
    await expect.poll(() => loadedPixel(page.locator('[data-personal-space-v2] .orbit-window-background'))).toBe(true);
    await expect(page.locator('[data-v2-appearance="protagonist"]')).toHaveCount(7);

    // The classic pixel office worker is an option of its own.
    await page.locator('[data-v2-appearance="protagonist"][data-value="default"]').click();
    await expect(protagonist).toHaveAttribute('src', /characters\/protagonist\/player-default-/);

    await page.locator('[data-v2-appearance="style"][data-value="toon"]').click();
    await expect(protagonist).toHaveAttribute('src', new RegExp(`${TOON}/protagonist/office-`));
    await expect(page.locator('[data-v2-appearance="protagonist"][data-value="office"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('draws the chosen room style, on home too, and the default room when it cannot load (PS-250E2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-orbit-open-world]').click();
    await page.locator('[data-personal-space-v2] [data-v2-mode="edit"]').first().click();
    await page.locator('[data-v2-appearance="room"][data-value="nordic"]').click();
    await expect(page.locator('[data-v2-appearance="room"][data-value="nordic"]')).toHaveAttribute('aria-pressed', 'true');
    const room = page.locator('[data-personal-space-v2] .orbit-window-background');
    await expect(room).toHaveAttribute('src', /workspace\/styles\/nordic\/background(-night)?\.webp$/);
    await expect.poll(() => room.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    // The thumbnail of each room loads too.
    const thumbnails = page.locator('[data-v2-appearance="room"] img');
    await expect(thumbnails).toHaveCount(5);
    for (const thumbnail of await thumbnails.all()) {
      await thumbnail.scrollIntoViewIfNeeded();
      await expect.poll(() => thumbnail.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    }

    // Home draws it too.
    await page.locator('[data-personal-space-v2] [data-v2-mode="full-world"]').first().click();
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    const home = page.locator('[data-orbit-window] .orbit-window-background');
    await expect(home).toHaveAttribute('src', /workspace\/styles\/nordic\/background(-night)?\.webp$/);
    await expect.poll(() => home.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);

    // A room style that cannot load falls back to the default room.
    await page.route(/\/workspace\/styles\//, route => route.abort());
    const styleRequest = page.waitForRequest(/\/workspace\/styles\/nordic\//);
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await styleRequest;
    await expect(home).toHaveAttribute('src', /workspace\/backgrounds\/building-formal-workstation-room-v2(-night)?\.webp$/);
    await expect.poll(() => home.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  });
});
