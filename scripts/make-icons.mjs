// UI-203: render the app icons from art-pipeline/app-icon/icon.svg.
//
//   npm run icons
//
// Writes, into pwa/assets/:
//   icon-192.png, icon-512.png  manifest icons, purpose "any" (full bleed)
//   icon-maskable-512.png       manifest icon, purpose "maskable": the art
//                               (<g id="art">) shrunk into the 80% safe zone
//   apple-touch-icon.png        180×180, what iOS puts on the home screen
// All are opaque squares: iOS and Android cut their own shape, and a
// transparent corner would show up black on iOS. The source stays outside
// pwa/ so the site serves no SVG document of its own (INFRA-113).
//
// Needs Chromium through Playwright. Where the browser Playwright expects is
// not installed, set CHROMIUM_PATH to a Chromium binary. The same binary gives
// byte-identical files; another Chromium build may differ in anti-aliasing, so
// commit the PNGs only when the SVG changed. tests/e2e/ui203-app-icon.test.js
// checks the sizes, the opaque corners and the maskable safe zone.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ICON_SOURCE, maskableSvg } from './appIconLib.mjs';

const ASSETS = fileURLToPath(new URL('../pwa/assets/', import.meta.url));
const SOURCE = readFileSync(ICON_SOURCE, 'utf8');

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, svg: SOURCE },
  { file: 'icon-512.png', size: 512, svg: SOURCE },
  { file: 'icon-maskable-512.png', size: 512, svg: maskableSvg(SOURCE) },
  { file: 'apple-touch-icon.png', size: 180, svg: SOURCE },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, svg } of OUTPUTS) {
    await page.setViewportSize({ width: size, height: size });
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(`<!doctype html><html><body style="margin:0">${sized}</body></html>`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
    writeFileSync(`${ASSETS}${file}`, png);
    console.log(`${file}  ${size}×${size}  ${png.length} bytes`);
  }
} finally {
  await browser.close();
}
