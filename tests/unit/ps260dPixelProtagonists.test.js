/**
 * ps260dPixelProtagonists.test.js — PS-260D: the pixel versions of the ten
 * themed protagonists (art-pipeline/ps260-sets/process_pixel_sets.py).
 *
 * Each is the PS-250D treatment of the committed PS-260A sprite, so it has
 * the PS-250D pixel canvas and every pose and facing of the Q style. None is
 * precached; the picker offers them since PS-260E.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getWorkspaceAssetManifestPaths } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const pixel = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'pixel-outputs.json'), 'utf8'));
const sets = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'outputs.json'), 'utf8'));
const ps250d = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-pixel', 'outputs.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const DIR = 'assets/personal-space/v2/characters/pixel/protagonist';

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('PS-260D pixel protagonists', () => {
  it('covers every themed protagonist, pose and facing of the Q style', () => {
    expect(pixel.protagonist.ids).toEqual(sets.protagonist.ids.map(entry => entry.id));
    expect(pixel.protagonist.poses).toEqual(sets.protagonist.poses);
    expect(pixel.protagonist.facings).toEqual(sets.protagonist.facings);
    const expected = pixel.protagonist.ids.flatMap(id => pixel.protagonist.poses.flatMap(pose =>
      pixel.protagonist.facings.map(facing => `${DIR}/${id}-${pose}-${facing}.png`)));
    expect(Object.keys(pixel.files).sort()).toEqual(expected.sort());
  });

  it('ships each as the hashed PNG on the PS-250D canvas', () => {
    const reference = pngSize(`${DIR}/office-idle-left.png`);
    expect(reference).toEqual({ width: 368, height: 368 });
    for (const [path, entry] of Object.entries(pixel.files)) {
      expect(existsSync(join(PWA, path)), path).toBe(true);
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
      expect(pngSize(path), path).toEqual(reference);
    }
  });

  it('uses the PS-250D reduction: the same scale, grid, palette size and contact shadow', () => {
    expect(pixel.scale).toBe(ps250d.scale);
    expect(pixel.protagonist.grid * pixel.scale).toBe(368);
    expect(pixel.protagonist.colours).toBe(ps250d.encoding.colours.protagonist);
    expect(pixel.protagonist.contactShadow).toBe(true);
  });

  it('is made from the committed Q-style sprites: re-run process_pixel_sets.py after a re-render', () => {
    for (const [path, entry] of Object.entries(pixel.files)) {
      const name = path.slice(DIR.length + 1).replace(/\.png$/, '.webp');
      expect(entry.source.path, path).toBe(`assets/personal-space/v2/characters/toon/protagonist/${name}`);
      expect(entry.source.sha256, path).toBe(sets.files[entry.source.path].sha256);
    }
  });

  it('keeps each one small (PS-250D: up to 7 KB; these up to about 8 KB) and precaches none', () => {
    const sizes = Object.values(pixel.files).map(entry => entry.bytes);
    expect(Math.max(...sizes)).toBeLessThan(12_000);
    expect(sizes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThanOrEqual(900_000);
    const paths = new Set(Object.keys(pixel.files));
    expect(SHELL.filter(path => paths.has(path))).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(path => paths.has(path))).toEqual([]);
  });
});
