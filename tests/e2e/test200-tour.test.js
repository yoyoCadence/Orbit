// TEST-200: the onboarding tour in a real browser.
//
// tour.js is unit-tested in jsdom, which has no layout: whether each spotlight
// target is really on screen, not under the header or the bottom bar, and not
// covered by anything else, was never checked (BUG-152 was a phone layout bug).
// A new guest goes through setup and the morning state, then the whole tour,
// at a small phone, a phone and a desktop size (the installed PWA is portrait
// only: manifest.json).
//
// BUG-205 (found here): completing the practice task opened the proof-photo
// sheet, which covered the bottom bar the next two steps point at and stayed
// after the tour; skipping at step 2 or 3 left its cards on Home, dead to a
// tap; and the stored plan kept its id.

import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/seed.js';

const TOUR_TASK = '[data-task-id="tour-task"]';

const SIZES = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function newGuest(page, size = SIZES[1]) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await mockSupabase(page);
  await page.goto('/index.html');
  await page.locator('[data-action="continueAsGuest"]').click();
  await page.locator('#setup-name').fill('Tour');
  await page.locator('#setup-form button[type="submit"]').click();
  // The tour waits for the morning state (BUG-152).
  await expect(page.locator('.tour-tooltip')).toHaveCount(0);
  await page.locator('#morning-modal .morning-btn[data-state="good"]').click();
  await expect(page.locator('.tour-counter')).toHaveText('1 / 6');
}

/**
 * The spotlit target, as the user sees it: on screen, inside #content when it
 * lives there (not under the header or the bottom bar), the topmost thing at
 * its centre once the tour's own layers are set aside, and not under the tip.
 */
async function checkSpotlight(page, selector) {
  const result = await page.evaluate(sel => {
    const target = document.querySelector(sel);
    if (!target) return { missing: true };
    const box = target.getBoundingClientRect();
    const tip = document.querySelector('.tour-tooltip').getBoundingClientRect();
    const spot = document.querySelector('.tour-spot')?.getBoundingClientRect();
    const content = target.closest('#content')?.getBoundingClientRect() ?? null;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const top = document.elementsFromPoint(cx, cy)
      .find(el => !el.closest('.tour-backdrop, .tour-spot, .tour-tooltip'));
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      onScreen: box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
      inContent: !content || (box.top >= content.top && box.bottom <= content.bottom),
      uncovered: Boolean(top && (top === target || target.contains(top))),
      coveredBy: top && !(top === target || target.contains(top)) ? (top.className || top.id || top.tagName) : null,
      spotOnTarget: Boolean(spot && overlaps(spot, box)),
      tipOnScreen: tip.top >= 0 && tip.left >= 0 && tip.bottom <= window.innerHeight && tip.right <= window.innerWidth,
      tipClear: !overlaps(tip, box),
    };
  }, selector);
  expect(result, selector).toEqual({
    onScreen: true, inContent: true, uncovered: true, coveredBy: null,
    spotOnTarget: true, tipOnScreen: true, tipClear: true,
  });
}

const stored = page => page.evaluate(() => ({
  plan: JSON.parse(localStorage.getItem('yoyo_dailyPlan') || 'null')?.taskIds ?? [],
  tasks: JSON.parse(localStorage.getItem('yoyo_tasks') || '[]').map(t => t.id),
  done: localStorage.getItem('yoyo_tourDone'),
}));

test.describe('TEST-200 onboarding tour', () => {
  for (const size of SIZES) {
    test(`${size.name} (${size.width}×${size.height}): every step points at something the user can see`, async ({ page }) => {
      await newGuest(page, size);

      await checkSpotlight(page, '#header');
      await page.locator('.tour-next').click();

      await expect(page.locator('.tour-counter')).toHaveText('2 / 6');
      await checkSpotlight(page, `.task-card${TOUR_TASK}`);
      await page.locator(`.task-card${TOUR_TASK}`).click();      // through the backdrop

      await expect(page.locator('.tour-counter')).toHaveText('3 / 6');
      await checkSpotlight(page, `#plan-list .plan-card${TOUR_TASK}`);
      await page.locator(`#plan-list .plan-card${TOUR_TASK}`).click();

      await expect(page.locator('.tour-counter')).toHaveText('4 / 6');
      await checkSpotlight(page, '#nav [data-page="review"]');   // BUG-205: no proof sheet over it
      await page.locator('.tour-next').click();

      await expect(page.locator('.tour-counter')).toHaveText('5 / 6');
      await checkSpotlight(page, '#nav [data-page="settings"]');
      await page.locator('.tour-next').click();

      await expect(page.locator('.tour-counter')).toHaveText('6 / 6');
      await page.locator('.tour-next').click();
      await expect(page.locator('.tour-tooltip, .tour-backdrop, .tour-spot')).toHaveCount(0);
      // Nothing left over the app (BUG-205: the proof sheet stayed).
      await page.waitForTimeout(1000);
      await expect(page.locator('.pro-sheet-overlay')).toHaveCount(0);

      expect(await stored(page)).toMatchObject({ done: '1', plan: [] });
      expect((await stored(page)).tasks).not.toContain('tour-task');
    });
  }

  test('skipped at step 3 (practice task in the plan): no card of it is left, and none after a reload', async ({ page }) => {
    await newGuest(page);
    await page.locator('.tour-next').click();
    await page.locator(`.task-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('3 / 6');

    await page.locator('.tour-skip').click();

    await expect(page.locator('.tour-tooltip')).toHaveCount(0);
    await expect(page.locator(TOUR_TASK)).toHaveCount(0);       // BUG-205: it stayed, dead to a tap
    await expect(page.locator('#plan-list .plan-empty')).toBeVisible();
    expect(await stored(page)).toMatchObject({ done: '1', plan: [] });

    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator(TOUR_TASK)).toHaveCount(0);
    await expect(page.locator('.tour-tooltip')).toHaveCount(0); // done: not again
  });

  test('skipped at step 2 (practice card shown): its card goes too', async ({ page }) => {
    await newGuest(page);
    await page.locator('.tour-next').click();
    await expect(page.locator(`.task-card${TOUR_TASK}`)).toBeVisible();

    await page.locator('.tour-skip').click();

    await expect(page.locator(TOUR_TASK)).toHaveCount(0);
    expect((await stored(page)).plan).toEqual([]);
  });

  test('restarted from Settings the same day after completing it: step 3 waits for the user again', async ({ page }) => {
    await newGuest(page);
    await page.locator('.tour-next').click();
    await page.locator(`.task-card${TOUR_TASK}`).click();
    // Tapped while step 2 still shows its success state (600 ms): counts.
    await page.locator(`#plan-list .plan-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('4 / 6');
    for (let i = 0; i < 3; i++) await page.locator('.tour-next').click();

    await page.evaluate(() => { window.location.hash = '#settings'; });
    await page.locator('#tour-btn').click();
    await page.locator('.tour-next').click();
    await page.locator(`.task-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('3 / 6');
    // Today's count from the first run is on the card already (BUG-205).
    await expect(page.locator(`#plan-list .plan-card${TOUR_TASK} .plan-count-badge`)).toHaveText('1');
    await page.waitForTimeout(1500);
    await expect(page.locator('.tour-counter')).toHaveText('3 / 6');

    await page.locator(`#plan-list .plan-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('4 / 6');
  });

  test('restarted from Settings after a reload: starts again at step 1 and runs to the end', async ({ page }) => {
    await newGuest(page);
    await page.locator('.tour-skip').click();
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible();

    await page.evaluate(() => { window.location.hash = '#settings'; });
    await page.locator('#tour-btn').click();
    await expect(page.locator('.tour-counter')).toHaveText('1 / 6');
    await page.locator('.tour-next').click();
    await page.locator(`.task-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('3 / 6');
    await page.locator(`#plan-list .plan-card${TOUR_TASK}`).click();
    await expect(page.locator('.tour-counter')).toHaveText('4 / 6');
    await checkSpotlight(page, '#nav [data-page="review"]');
  });
});
