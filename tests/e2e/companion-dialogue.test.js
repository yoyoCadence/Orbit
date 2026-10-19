/**
 * companion-dialogue.test.js — AI-204B (L2)
 *
 * The COMPANION card on the Orbit Window used to be one 9px line, so at common
 * widths every approved line was cut to half a sentence. L2 lets that card wrap
 * to two lines; the project card keeps its single line. This checks, in a real
 * browser, that all 8 approved lines fit within the two lines at the widths the
 * AI-204 proposal measured and at 200% zoom.
 */

import { test, expect } from '@playwright/test';
import { COMPANION_DIALOGUE } from '../../pwa/js/personalSpace/v2/content/companionDialogue.js';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const LINES = Object.values(COMPANION_DIALOGUE);
const CASES = [
  { name: '320 px', width: 320, height: 568 },
  { name: '360 px', width: 360, height: 780 },
  { name: '390 px', width: 390, height: 844 },
  { name: '414 px', width: 414, height: 896 },
  { name: '1024 px', width: 1024, height: 768 },
  { name: '200% zoom', width: 1280, height: 720, zoom: 2 },
];

test.describe('AI-204B Companion card shows the whole line', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
  });

  for (const viewport of CASES) {
    test(`${viewport.name}: every approved line fits in two lines`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
      await expect(page.locator('[data-orbit-companion]')).toBeVisible();
      if (viewport.zoom) {
        await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, viewport.zoom);
      }

      const results = await page.evaluate(lines => {
        const line = document.querySelector('[data-orbit-companion] > span:last-child');
        const lineHeight = parseFloat(window.getComputedStyle(line).lineHeight);
        return lines.map(text => {
          line.textContent = text;
          return {
            text,
            clipped: line.scrollHeight > line.clientHeight + 1
              || line.scrollWidth > line.clientWidth + 1,
            lines: Math.round(line.clientHeight / lineHeight),
          };
        });
      }, LINES);

      for (const result of results) {
        expect(result.clipped, `${result.text} is cut off`).toBe(false);
        expect(result.lines, `${result.text} line count`).toBeLessThanOrEqual(2);
      }

      const projectPhase = page.locator('[data-orbit-project] > span:nth-of-type(2)');
      await expect(projectPhase).toHaveCSS('white-space', 'nowrap');
    });
  }
});
