/**
 * pixiUnsafeEval.test.js — INFRA-114
 *
 * The CSP has no 'unsafe-eval', so the scene runtime loads Pixi's unsafe-eval
 * add-on, vendored by scripts/vendor-pixi.mjs as an ES module that gives the
 * add-on's classic build the vendored pixi.js exports as its `PIXI`.
 * tests/e2e/infra114-no-eval.test.js shows it working in the browser; these
 * checks keep the vendored file, the runtime and the service worker in step.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wrapUnsafeEval } from '../../scripts/vendorPixiLib.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const vendored = read('pwa/vendor/pixi-unsafe-eval.js');
// Not in the package's "exports"; read it where scripts/vendor-pixi.mjs does.
const addOnSource = read('node_modules/pixi.js/dist/packages/unsafe-eval.min.js');

describe('INFRA-114 vendored Pixi unsafe-eval add-on', () => {
  it('is what scripts/vendor-pixi.mjs makes from the installed pixi.js', () => {
    const { version } = JSON.parse(read('node_modules/pixi.js/package.json'));
    expect(read('pwa/vendor/pixi.js')).toContain(`PixiJS - v${version}`);
    expect(vendored).toBe(wrapUnsafeEval(addOnSource, version));
  });

  it('refuses an add-on build of another shape instead of wrapping it blindly', () => {
    expect(() => wrapUnsafeEval('window.PIXI = {};', '0.0.0')).toThrow(/changed shape/);
  });

  it('finds every PIXI name it uses among the vendored pixi.js exports', async () => {
    const names = [...new Set([...addOnSource.matchAll(/PIXI\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]))];
    expect(names.length).toBeGreaterThan(10);
    const pixi = await import('../../pwa/vendor/pixi.js');
    expect(names.filter(name => !(name in pixi))).toEqual([]);
  });

  it('replaces the generators on the classes the app uses, without a global', async () => {
    const pixi = await import('../../pwa/vendor/pixi.js');
    const before = {
      shader: pixi.GlShaderSystem.prototype._generateShaderSync,
      uniforms: pixi.GlUniformGroupSystem.prototype._generateUniformsSync,
      ubo: pixi.GlUboSystem.prototype._generateUboSync,
    };
    await import('../../pwa/vendor/pixi-unsafe-eval.js');
    expect(pixi.GlShaderSystem.prototype._generateShaderSync).not.toBe(before.shader);
    expect(pixi.GlUniformGroupSystem.prototype._generateUniformsSync).not.toBe(before.uniforms);
    expect(pixi.GlUboSystem.prototype._generateUboSync).not.toBe(before.ubo);
    // Its own check for eval support is switched off.
    expect(() => pixi.AbstractRenderer.prototype._unsafeEvalCheck.call({})).not.toThrow();
    expect(globalThis.PIXI).toBeUndefined();
  });

  it('is loaded with Pixi by the runtime and precached with it', () => {
    const runtime = read('pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js');
    expect(runtime).toContain("'../../../../vendor/pixi-unsafe-eval.js'");
    expect(runtime).toMatch(/Promise\.all\(\[import\(PIXI_MODULE_PATH\), import\(PIXI_UNSAFE_EVAL_PATH\)\]\)/);
    const sw = read('pwa/sw.js');
    expect(sw).toContain("'./vendor/pixi.js',\n  './vendor/pixi-unsafe-eval.js',");
  });
});
