/**
 * PS-249A — the Orbit Window under overlays, in a real browser.
 *
 * jsdom cannot run CSS animations, so these check what the unit tests cannot:
 * the reveal animations really pause while held and restart afterwards, and
 * the major banner disappears while the Orbit Window is off screen.
 */

import { test, expect } from '@playwright/test';
import {
  FOCUS_TASK,
  GUEST_USER,
  mockSupabase,
  seedStorage,
} from './support/seed.js';

const V2_STATE_KEY = 'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user';
const REVEAL_ANIMATIONS = [
  'orbit-reward-rise',
  'orbit-character-celebrate',
  'orbit-companion-approach',
  'orbit-medium-reveal',
  'orbit-major-reveal',
];

function revealAnimations(orbit) {
  return orbit.evaluate((root, names) => root.getAnimations({ subtree: true })
    .filter(animation => names.includes(animation.animationName))
    .map(animation => ({
      name: animation.animationName,
      playState: animation.playState,
      currentTime: animation.currentTime,
    })), REVEAL_ANIMATIONS);
}

test.describe('PS-249A Orbit Window 被蓋住時', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  });

  test('佐證 sheet 開著時 reveal 與場景暫停，關閉後從頭重播', async ({ page }) => {
    test.setTimeout(40000);
    const orbit = page.locator('[data-orbit-window]');
    const runtimeHost = orbit.locator('[data-orbit-runtime-host]');
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready', { timeout: 10000 });

    await orbit.locator('[data-orbit-main-quest]').click();
    await page.locator('.focus-skip-btn').click();
    await page.locator('.skip-dur-btn[data-min="30"]').click();
    await page.locator('#skip-yes').click();
    await expect(orbit).toHaveClass(/is-revealing/);
    await expect(page.locator('#proof-skip')).toBeVisible({ timeout: 5000 });

    // Held: every reveal animation is paused (the medium frame's ::after
    // included) and stays where it stopped; the scene is suspended.
    await expect(orbit).toHaveClass(/is-reveal-held/);
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'suspended');
    const held = await revealAnimations(orbit);
    expect(held.map(animation => animation.name)).toEqual(
      expect.arrayContaining(['orbit-companion-approach', 'orbit-medium-reveal']),
    );
    expect(held.every(animation => animation.playState === 'paused')).toBe(true);
    // Longer than the whole 4.2 s medium reveal: it must not be consumed.
    await page.waitForTimeout(4500);
    const stillHeld = await revealAnimations(orbit);
    expect(stillHeld.map(animation => animation.currentTime))
      .toEqual(held.map(animation => animation.currentTime));
    await expect(orbit).toHaveClass(/is-revealing/);
    const waiting = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), V2_STATE_KEY);
    expect(waiting.pendingRewardReveals).toHaveLength(1);

    // Record the animations the moment the hold ends: polling from the test
    // could come after the 1.4 s Companion animation has finished again.
    await orbit.evaluate((root, names) => {
      const observer = new MutationObserver(() => {
        if (root.classList.contains('is-reveal-held')) return;
        observer.disconnect();
        window.__ps249aReleased = root.getAnimations({ subtree: true })
          .filter(animation => names.includes(animation.animationName))
          .map(animation => ({
            name: animation.animationName,
            playState: animation.playState,
            currentTime: animation.currentTime,
          }));
      });
      observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    }, REVEAL_ANIMATIONS);
    await page.locator('#proof-skip').click();
    await expect(page.locator('.pro-sheet-overlay')).toHaveCount(0);
    await expect(orbit).not.toHaveClass(/is-reveal-held/);
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready');

    // Replayed from the start rather than resumed.
    const released = await page.evaluate(() => window.__ps249aReleased);
    expect(released.map(animation => animation.name).sort())
      .toEqual(held.map(animation => animation.name).sort());
    released.forEach(animation => {
      expect(animation.playState).toBe('running');
      expect(animation.currentTime).toBe(0);
    });

    await expect(orbit).not.toHaveClass(/is-revealing/, { timeout: 6000 });
    const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), V2_STATE_KEY);
    expect(persisted.pendingRewardReveals).toEqual([]);
  });

  test('major 橫幅在 Orbit Window 捲出畫面時隱藏，計時暫停', async ({ page }) => {
    test.setTimeout(40000);
    await page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      state.pendingRewardReveals = [{
        id: 'reveal:e2e-ps249a-major',
        kind: 'major',
        direction: 'settlement',
        title: '世界里程碑',
        lines: ['e2e'],
      }];
      localStorage.setItem(key, JSON.stringify(state));
    }, V2_STATE_KEY);
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    const orbit = page.locator('[data-orbit-window]');
    const banner = orbit.locator('.orbit-window-major-reveal');
    await expect(orbit).toHaveAttribute('data-reveal-kind', 'major');
    await expect(banner).toBeVisible();

    // Scroll the Orbit Window just past the top of the scrolling content.
    await page.evaluate(() => {
      const content = document.getElementById('content');
      const spacer = document.createElement('div');
      spacer.style.height = '2400px';
      content.appendChild(spacer);
      const window = document.querySelector('[data-orbit-window]');
      const offset = window.getBoundingClientRect().bottom - content.getBoundingClientRect().top;
      content.scrollTop += offset + 40;
    });
    await expect(orbit).toHaveClass(/is-reveal-held/);
    await expect(banner).toBeHidden();
    // Longer than the 6 s major reveal.
    await page.waitForTimeout(6500);
    await expect(orbit).toHaveClass(/is-revealing/);

    await page.evaluate(() => { document.getElementById('content').scrollTop = 0; });
    await expect(orbit).not.toHaveClass(/is-reveal-held/);
    await expect(banner).toBeVisible();
    await expect(orbit).not.toHaveClass(/is-revealing/, { timeout: 8000 });
    const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), V2_STATE_KEY);
    expect(persisted.pendingRewardReveals.map(reveal => reveal.id)).not.toContain('reveal:e2e-ps249a-major');
  });
});
