// UI-001: render the app icons from pwa/assets/icon.svg.
//
//   npm run icons
//
// Writes, into pwa/assets/:
//   icon-192.png, icon-512.png  manifest icons, purpose "any" (full bleed)
//   icon-maskable-512.png       manifest icon, purpose "maskable": the art
//                               (<g id="art">) shrunk into the 80% safe zone
//   apple-touch-icon.png        180×180, what iOS puts on the home screen
// All are opaque squares: iOS and Android cut their own shape, and a
// transparent corner would show up black on iOS.
//
// Needs Chromium through Playwright. Where the browser Playwright expects is
// not installed, set CHROMIUM_PATH to a Chromium binary.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ASSETS = fileURLToPath(new URL('../pwa/assets/', import.meta.url));
const SOURCE = readFileSync(`${ASSETS}icon.svg`, 'utf8');
const MASKABLE_SCALE = 0.8;

const ART_OPEN = '<g id="art">';
if (!SOURCE.includes(ART_OPEN)) throw new Error('icon.svg needs a <g id="art"> group');

function maskable(svg) {
  const offset = (1024 * (1 - MASKABLE_SCALE)) / 2;
  return svg.replace(ART_OPEN, `<g id="art" transform="translate(${offset} ${offset}) scale(${MASKABLE_SCALE})">`);
}

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, svg: SOURCE },
  { file: 'icon-512.png', size: 512, svg: SOURCE },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable(SOURCE) },
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
