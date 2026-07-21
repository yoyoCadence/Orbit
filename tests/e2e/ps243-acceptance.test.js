/**
 * ps243-acceptance.test.js
 *
 * Deterministic PS-243 browser acceptance gates. Every check here is a fixed,
 * reproducible desktop-Chromium result that runs as part of `npm run test:e2e`,
 * so the viewport / overflow / touch-target / keyboard-order / canvas / zoom
 * evidence in docs/ps-243-production-acceptance.md can be rebuilt from source
 * instead of a one-off manual Playwright session.
 *
 * These are NOT device gates: FPS, thermal, memory, real screen readers, iOS /
 * Android and installed-PWA behaviour stay human gates in the same document.
 */

import { test, expect } from '@playwright/test';
import {
  FOCUS_TASK,
  GUEST_USER,
  mockSupabase,
  seedStorage,
} from './support/seed.js';

// DOM order == expected keyboard/tab order: World → Project → Companion → Main Quest.
const ORBIT_ACTIONS = [
  '[data-orbit-open-world]',
  '[data-orbit-project]',
  '[data-orbit-companion]',
  '[data-orbit-main-quest]',
];

const VIEWPORTS = [
  { name: '320x568 small phone', width: 320, height: 568 },
  { name: '390x844 phone', width: 390, height: 844 },
  { name: '768x1024 tablet', width: 768, height: 1024 },
  { name: '1024x768 narrow desktop', width: 1024, height: 768 },
  { name: '844x390 landscape', width: 844, height: 390 },
];

const MIN_TOUCH_TARGET_PX = 44;

async function bootHome(page, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  const orbit = page.locator('[data-orbit-window]');
  await expect(orbit).toBeVisible();
  await expect(orbit.locator('[data-orbit-runtime-host]'))
    .toHaveAttribute('data-runtime-status', 'ready', { timeout: 8000 });
  return orbit;
}

function documentOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe('PS-243 acceptance baseline', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // totalXP high enough to exercise the full building-stage Orbit window.
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: no horizontal overflow, single canvas, scroll-reachable 44px actions`, async ({ page }) => {
      const orbit = await bootHome(page, viewport);

      const overflow = await documentOverflow(page);
      expect(overflow.scrollWidth,
        `${viewport.name} must not overflow horizontally`)
        .toBeLessThanOrEqual(overflow.clientWidth + 1);

      await expect(page.locator('canvas.orbit-window-canvas')).toHaveCount(1);

      // Honest claim: the four actions are scroll-reachable and each meets the
      // 44px touch-target minimum — NOT that all four sit in the first screen.
      for (const selector of ORBIT_ACTIONS) {
        const action = orbit.locator(selector);
        await expect(action).toHaveCount(1);
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box.height, `${selector} @ ${viewport.name} height`)
          .toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      }
    });
  }

  test('keyboard order is World → Project → Companion → Main Quest', async ({ page }) => {
    const orbit = await bootHome(page, { width: 390, height: 844 });

    await orbit.locator('[data-orbit-open-world]').focus();
    const order = [await matchedAction(page)];
    for (let step = 0; step < ORBIT_ACTIONS.length - 1; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await matchedAction(page));
    }

    expect(order).toEqual([
      'open-world', 'project', 'companion', 'main-quest',
    ]);
  });

  test('reduced motion is detected and orbit-window animations collapse to ~0', async ({ page }) => {
    await bootHome(page, { width: 390, height: 844 });

    expect(await page.evaluate(() =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    const durationMs = await page.locator('[data-orbit-main-quest]').evaluate(element => {
      const raw = window.getComputedStyle(element).animationDuration;
      return raw.trim().endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
    });
    expect(durationMs).toBeLessThanOrEqual(1);
  });

  test('200% zoom stress keeps one canvas, no overflow, and 44px actions', async ({ page }) => {
    await bootHome(page, { width: 1280, height: 720 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });

    const overflow = await documentOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    await expect(page.locator('canvas.orbit-window-canvas')).toHaveCount(1);

    for (const selector of ORBIT_ACTIONS) {
      const action = page.locator(selector);
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      expect(box.height, `${selector} @ 200% zoom height`)
        .toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }
  });
});

/** Returns the suffix of the orbit action the active element matches, or null. */
function matchedAction(page) {
  return page.evaluate(selectors => {
    const active = document.activeElement;
    const selector = selectors.find(candidate => active?.matches?.(candidate));
    return selector ? selector.replace('[data-orbit-', '').replace(']', '') : null;
  }, ORBIT_ACTIONS);
}
