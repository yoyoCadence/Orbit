/**
 * infra114-no-eval.test.js — INFRA-114
 *
 * The page's CSP has no 'unsafe-eval'. Pixi 8 compiles shader, uniform and UBO
 * code with `new Function`; vendor/pixi-unsafe-eval.js (Pixi's add-on, wrapped
 * by scripts/vendor-pixi.mjs) replaces that before the renderer starts.
 *   - with the add-on the Orbit Window scene starts, with no violation and no
 *     global `PIXI`;
 *   - without it the browser refuses the eval and the scene falls back to the
 *     poster, so the policy really is enforced and the add-on is what makes
 *     the scene work.
 */

import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

async function openHome(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  await seedStorage(page, [FOCUS_TASK], [], GUEST_USER);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  return page.locator('[data-orbit-runtime-host]').first();
}

test.describe('INFRA-114 scene without unsafe-eval', () => {
  test('the scene starts under the policy, with the add-on and no global', async ({ page }) => {
    const policy = await page.request.get('/').then(response => response.text());
    expect(/script-src[^;]*'unsafe-eval'/.test(policy)).toBe(false);

    const host = await openHome(page);
    await expect(host).toHaveAttribute('data-runtime-status', 'ready', { timeout: 10_000 });
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
    expect(await page.evaluate(() => typeof window.PIXI)).toBe('undefined');
  });

  test('Pixi features beyond the current scene also run without eval', async ({ page }) => {
    // Not used by the scene today; kept so that adding them (e.g. particles for
    // weather) or upgrading Pixi cannot quietly need eval again. The add-on
    // patches only its own ParticleBuffer copy; the wrapper patches the real one.
    const host = await openHome(page);
    await expect(host).toHaveAttribute('data-runtime-status', 'ready', { timeout: 10_000 });
    const results = await page.evaluate(async () => {
      const pixi = await import('/vendor/pixi.js');
      await import('/vendor/pixi-unsafe-eval.js');
      const app = new pixi.Application();
      await app.init({ width: 64, height: 64, preference: 'webgl' });
      const cases = {
        text: () => app.stage.addChild(new pixi.Text({ text: 'Orbit' })),
        bitmapText: () => app.stage.addChild(new pixi.BitmapText({ text: 'x' })),
        blurFilter: () => {
          const shape = new pixi.Graphics().rect(0, 0, 10, 10).fill(0xff0000);
          shape.filters = [new pixi.BlurFilter()];
          app.stage.addChild(shape);
        },
        colorMatrixFilter: () => {
          const sprite = new pixi.Sprite(pixi.Texture.WHITE);
          sprite.filters = [new pixi.ColorMatrixFilter()];
          app.stage.addChild(sprite);
        },
        mesh: () => app.stage.addChild(new pixi.MeshPlane({ texture: pixi.Texture.WHITE })),
        renderTexture: () => {
          const target = pixi.RenderTexture.create({ width: 8, height: 8 });
          app.renderer.render({ container: new pixi.Graphics().rect(0, 0, 4, 4).fill(0xffffff), target });
        },
        particles: () => {
          const container = new pixi.ParticleContainer();
          container.addParticle(new pixi.Particle(pixi.Texture.WHITE));
          app.stage.addChild(container);
        },
      };
      const out = {};
      for (const [name, run] of Object.entries(cases)) {
        try {
          app.stage.removeChildren();
          run();
          app.render();
          out[name] = 'ok';
        } catch (error) {
          out[name] = `${error.name}: ${error.message}`;
        }
      }
      app.destroy(true);
      return out;
    });
    expect(results).toEqual({
      text: 'ok', bitmapText: 'ok', blurFilter: 'ok', colorMatrixFilter: 'ok',
      mesh: 'ok', renderTexture: 'ok', particles: 'ok',
    });
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test('without the add-on the eval is refused and the poster stays', async ({ page }) => {
    await page.route('**/vendor/pixi-unsafe-eval.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: 'export {};\n',
    }));

    const host = await openHome(page);
    await expect(host).toHaveAttribute('data-runtime-status', 'fallback', { timeout: 10_000 });
    await expect(page.locator('[data-orbit-window].is-runtime-fallback').first()).toBeVisible();
    const violations = await page.evaluate(() => window.__violations);
    expect(violations).toContainEqual({ directive: 'script-src', blocked: 'eval' });
  });
});
