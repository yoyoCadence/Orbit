/**
 * AI-202B2 — the 12th Main Quest day's stage-up reveal, in a real browser.
 *
 * Eleven earlier Main Quest days are already seen (opening the app takes them
 * as seen); recording today's is the 12th: a Major reveal titled with the new
 * stage, the stage-up line, and nothing replayed after a reload.
 */

import { test, expect } from '@playwright/test';
import {
  FOCUS_TASK,
  GUEST_USER,
  mockSupabase,
  seedStorage,
} from './support/seed.js';

const V2_STATE_KEY = 'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user';
const PARTNER = '夥伴關係：合作夥伴';
const STAGE_UP_LINE = '我們一起走過的日子，又多了一些。';

function earlierMainQuestDays(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (count - index));
    return {
      id: `session-focus-${index + 1}`, taskId: FOCUS_TASK.id, date: date.toLocaleDateString('sv'),
      completedAt: date.toISOString(), result: 'complete',
      impactType: 'task', taskNature: 'growth', category: 'focus', value: 'A',
      durationMinutes: 30, finalXP: 50,
    };
  });
}

function storedState(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), V2_STATE_KEY);
}

test.describe('AI-202B2 夥伴關係階段提升的揭露', () => {
  test('第 12 個 Main Quest 日：Major、標題與台詞是新階段，重新載入不重播', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 341, height: 820 });
    await mockSupabase(page);
    await seedStorage(page, [FOCUS_TASK], earlierMainQuestDays(11), { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    const orbit = page.locator('[data-orbit-window]');
    const companion = orbit.locator('[data-orbit-companion]');
    await expect(companion).toHaveAttribute('data-relationship-stage', 'familiar');
    await expect(orbit).not.toHaveClass(/is-revealing/);

    await orbit.locator('[data-orbit-main-quest]').click();
    await page.locator('.focus-skip-btn').click();
    await page.locator('.skip-dur-btn[data-min="30"]').click();
    await page.locator('#skip-yes').click();
    await page.locator('#proof-skip').click();

    await expect(orbit).toHaveAttribute('data-reveal-kind', 'major');
    await expect(orbit.locator('.orbit-window-reward strong')).toHaveText(PARTNER);
    await expect(orbit.locator('.orbit-window-reward')).toContainText(PARTNER);
    const banner = orbit.locator('.orbit-window-major-reveal strong');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText(PARTNER);
    await expect(orbit).not.toContainText('世界里程碑已解鎖');
    await expect(companion.locator(':scope > span:last-child')).toHaveText(STAGE_UP_LINE);
    // The longer title stays on one line inside the banner at 341 px.
    const fits = await banner.evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(fits).toBe(true);

    await expect(orbit).not.toHaveClass(/is-revealing/, { timeout: 9000 });
    await expect(companion).toHaveAttribute('data-relationship-stage', 'partner');
    const seen = await storedState(page);
    expect(seen.pendingRewardReveals).toEqual([]);
    expect(seen.presentedMilestones).toEqual({
      projectCompleted: true, relationshipStage: 'partner', pending: null,
    });

    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    const reopened = page.locator('[data-orbit-window]');
    await expect(reopened.locator('[data-orbit-companion]')).toHaveAttribute('data-relationship-stage', 'partner');
    await expect(reopened).not.toHaveClass(/is-revealing/);
    await expect(reopened.locator('.orbit-window-major-reveal')).toHaveCount(0);
    // Only the last world change still names it.
    await expect(reopened.locator('.orbit-window-reward')).toHaveText(PARTNER);
    expect((await storedState(page)).pendingRewardReveals).toEqual([]);
  });
});
