/**
 * ui001-app-icon.test.js — UI-001
 *
 * The home-screen icon: the manifest lists full-bleed "any" icons and a
 * separate maskable one, and index.html links a 180×180 apple-touch-icon
 * (iOS uses it for the home screen). iOS and Android cut their own shape, so
 * every icon must be an opaque square: a transparent corner turns black on
 * iOS (the old icon had rounded, transparent corners).
 */

import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/seed.js';

test.use({ serviceWorkers: 'block' });

/** Natural size and the alpha of the four corner pixels and the centre. */
function measure(page, src) {
  return page.evaluate(async url => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const w = img.naturalWidth - 1;
    const h = img.naturalHeight - 1;
    const alpha = [[0, 0], [w, 0], [0, h], [w, h], [w >> 1, h >> 1]]
      .map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
    return { width: img.naturalWidth, height: img.naturalHeight, alpha };
  }, src);
}

test('manifest and apple-touch-icon point at opaque square icons of the stated sizes', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await page.evaluate(async href => (await fetch(href)).json(), manifestHref);
  expect(manifest.icons.map(icon => [icon.sizes, icon.purpose])).toEqual([
    ['192x192', 'any'],
    ['512x512', 'any'],
    ['512x512', 'maskable'],
  ]);

  const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const icons = [
    ...manifest.icons.map(icon => ({ src: icon.src, size: Number(icon.sizes.split('x')[0]) })),
    { src: appleHref, size: 180 },
  ];
  for (const { src, size } of icons) {
    const result = await measure(page, src);
    expect(result, src).toEqual({ width: size, height: size, alpha: [255, 255, 255, 255, 255] });
  }
});
