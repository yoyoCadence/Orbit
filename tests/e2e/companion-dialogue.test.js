/**
 * companion-dialogue.test.js — AI-204B (L2)
 *
 * The COMPANION card on the Orbit Window used to be one 9px line, so at common
 * widths every approved line was cut to half a sentence. L2 lets that card wrap
 * to two lines; the project card keeps its single line. This checks, in a real
 * browser, that all 8 approved lines fit within the two lines at the widths the
 * AI-204 proposal measured and at 200% zoom, on Home and on the full page (both
 * use the same Orbit Window card).
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

// Puts each line into the card and reports whether it is cut off, and how many
// lines it needs without the clamp (so a sentence that grows past two lines
// fails even if a browser stops counting clamped lines in scrollHeight).
async function measureCompanionCard(page, scope) {
  return page.evaluate(({ scope, lines }) => {
    const line = document.querySelector(`${scope} [data-orbit-companion] > span:last-child`);
    const lineHeight = parseFloat(window.getComputedStyle(line).lineHeight);
    return lines.map(text => {
      line.textContent = text;
      const clipped = line.scrollHeight > line.clientHeight + 1
        || line.scrollWidth > line.clientWidth + 1;
      // An unclamped copy of the same width and font, out of the layout.
      const probe = line.cloneNode(true);
      probe.style.cssText = 'display:block;-webkit-line-clamp:none;line-clamp:none;white-space:normal;'
        + `position:absolute;visibility:hidden;width:${line.clientWidth}px`;
      line.parentElement.appendChild(probe);
      const naturalLines = Math.round(probe.scrollHeight / lineHeight);
      probe.remove();
      return { text, clipped, naturalLines };
    });
  }, { scope, lines: LINES });
}

function expectWholeLines(results, where) {
  for (const result of results) {
    expect(result.clipped, `${where}: ${result.text} is cut off`).toBe(false);
    expect(result.naturalLines, `${where}: ${result.text} line count`).toBeLessThanOrEqual(2);
  }
}

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

      expectWholeLines(await measureCompanionCard(page, '#content'), 'Home');
      const projectPhase = page.locator('[data-orbit-project] > span:nth-of-type(2)');
      await expect(projectPhase).toHaveCSS('white-space', 'nowrap');

      await page.locator('[data-orbit-open-world]').click();
      await expect(page.locator('[data-personal-space-v2] [data-orbit-companion]')).toBeVisible();
      expectWholeLines(await measureCompanionCard(page, '[data-personal-space-v2]'), 'Full page');
    });
  }
});

// AI-202B1: the label names the relationship stage. Every stage stays on one
// line, with at least 4 px to spare, down to the narrowest two-column card.
const STAGES = ['陌生觀察者', '熟悉夥伴', '合作夥伴', '信賴夥伴'];
const LABEL_CASES = [
  { name: '341 px', width: 341, height: 740 },
  { name: '360 px', width: 360, height: 780 },
  { name: '390 px', width: 390, height: 844 },
  { name: '414 px', width: 414, height: 896 },
  { name: '1024 px', width: 1024, height: 768 },
  { name: '200% zoom', width: 1280, height: 720, zoom: 2 },
];

async function measureStageLabels(page, scope) {
  return page.evaluate(({ scope, stages }) => {
    const label = document.querySelector(`${scope} [data-orbit-companion] > span:first-child`);
    const stage = label.querySelector('.orbit-window-relationship-stage');
    // Both in the same units, which CSS zoom scales.
    const available = label.getBoundingClientRect().width;
    return stages.map(name => {
      stage.textContent = name;
      label.style.width = 'max-content';
      const needed = label.getBoundingClientRect().width;
      label.style.width = '';
      const lineHeight = parseFloat(window.getComputedStyle(label).lineHeight)
        || parseFloat(window.getComputedStyle(label).fontSize) * 1.2;
      return { name, available, needed, lines: Math.round(label.scrollHeight / lineHeight) };
    });
  }, { scope, stages: STAGES });
}

test.describe('AI-202B1 the Companion label names the stage', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
  });

  test('shows the stored stage on Home and on the full page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('#content [data-orbit-companion] > span:first-child'))
      .toHaveText('COMPANION · 陌生觀察者');
    // A migrated legacy relationship is a floor for the stage.
    await page.evaluate(() => {
      const key = 'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user';
      const state = JSON.parse(localStorage.getItem(key));
      state.companion = { ...state.companion, legacyRelationshipPoints: 2 };
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('#content [data-orbit-companion]')).toHaveAttribute('data-relationship-stage', 'partner');
    await expect(page.locator('#content [data-orbit-companion] > span:first-child'))
      .toHaveText('COMPANION · 合作夥伴');
    await page.locator('[data-orbit-open-world]').click();
    await expect(page.locator('[data-personal-space-v2] [data-orbit-companion] > span:first-child'))
      .toHaveText('COMPANION · 合作夥伴');
  });

  for (const viewport of LABEL_CASES) {
    test(`${viewport.name}: every stage fits on one line`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
      await expect(page.locator('[data-orbit-companion]')).toBeVisible();
      if (viewport.zoom) {
        await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, viewport.zoom);
      }
      for (const result of await measureStageLabels(page, '#content')) {
        expect(result.lines, `${result.name} lines`).toBe(1);
        expect(result.available - result.needed, `${result.name} room`).toBeGreaterThanOrEqual(4);
      }
    });
  }
});
