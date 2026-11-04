// Pure helpers for scripts/vendor-pixi.mjs, shared with the tests that check the
// vendored files (tests/unit/pixiUnsafeEval.test.js).

export function normalizeVendoredText(content) {
  return `${content.replace(/[ \t]+$/gm, '').trimEnd()}\n`;
}

// INFRA-114: Pixi builds its shader, uniform and UBO sync code with
// `new Function`, which the page's CSP refuses without 'unsafe-eval'. The
// unsafe-eval add-on replaces those generators on the classes' prototypes.
// Pixi ships it only as a classic script that reads a global `PIXI`, so it is
// wrapped here: it runs once, with the vendored ES module's exports as its
// `PIXI` (the same class objects, so the patches reach the classes the app
// uses), and sets no global. It patches only its own bundled copy of
// ParticleBuffer, so the real one gets the same replacement afterwards (as the
// package's ESM entry `pixi.js/unsafe-eval` does); otherwise ParticleContainer
// would still eval.
export function wrapUnsafeEval(source, version) {
  const body = normalizeVendoredText(source).replace(/\n\/\/# sourceMappingURL=\S+\n$/, '\n');
  const expected = ['this.PIXI=this.PIXI||{}', 'Object.assign(this.PIXI,unsafe_eval_js)', 'h.generateParticleUpdatePolyfill='];
  if (!expected.every(part => body.includes(part))) {
    throw new Error('pixi.js unsafe-eval build changed shape; review the wrapper in scripts/vendor-pixi.mjs');
  }
  return [
    `// PixiJS ${version} unsafe-eval add-on (dist/packages/unsafe-eval.min.js), vendored by`,
    '// scripts/vendor-pixi.mjs. Do not edit by hand. License: pwa/vendor/pixi.LICENSE.txt',
    "// INFRA-114: lets Pixi run under a CSP without 'unsafe-eval'. The classic build reads",
    '// a global PIXI; here it gets the exports of ./pixi.js instead and sets no global.',
    "import * as pixi from './pixi.js';",
    '',
    'const PIXI = { ...pixi };',
    '(function () {',
    body.trimEnd(),
    '}).call({ PIXI });',
    '// Its own ParticleBuffer copy is patched above; patch the one the app would use.',
    'Object.assign(pixi.ParticleBuffer.prototype, { generateParticleUpdate: PIXI.generateParticleUpdatePolyfill });',
    '',
  ].join('\n');
}

