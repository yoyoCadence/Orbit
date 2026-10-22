/**
 * @vitest-environment jsdom
 *
 * ps250gPickerThumbnails.test.js — PS-250G: the Edit Mode picker shows each
 * room as a small thumbnail (art-pipeline/ps250-rooms/thumbnails.py) instead
 * of its full background, and every picture in it falls back to a precached
 * default when it cannot load (the page swaps in data-fallback-src).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getWorkspaceSceneAssets } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { renderAppearancePicker, ROOM_STYLES } from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const V2 = 'assets/personal-space/v2';
const record = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-rooms', 'thumbnails.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);

// Width and height of a lossy, lossless or extended WebP.
function webpSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.toString('ascii', 0, 4) + data.toString('ascii', 8, 12), path).toBe('RIFFWEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
}

function host(...args) {
  const element = document.createElement('div');
  element.innerHTML = renderAppearancePicker(...args);
  return element;
}

describe('PS-250G picker thumbnails', () => {
  it('ships one small thumbnail per room in each style, as recorded', () => {
    const onDisk = ['workspace/thumbnails', 'workspace/pixel/thumbnails'].flatMap(folder => (
      readdirSync(join(PWA, V2, ...folder.split('/'))).map(name => `${V2}/${folder}/${name}`)
    )).sort();
    expect(onDisk).toEqual(ROOM_STYLES.flatMap(({ id }) => [
      `${V2}/workspace/thumbnails/${id}.webp`,
      `${V2}/workspace/pixel/thumbnails/${id}.webp`,
    ]).sort());
    expect(Object.keys(record.files).sort()).toEqual(onDisk);
    for (const [path, entry] of Object.entries(record.files)) {
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
      expect(webpSize(path), path).toEqual({ width: 216, height: 144 });
      // A full background is 70–110 KB; the point is to download far less.
      expect(data.length, path).toBeLessThan(12_000);
      // Made from the room as it is now: re-run thumbnails.py after a re-render.
      const source = readFileSync(join(PWA, entry.source.path));
      expect(createHash('sha256').update(source).digest('hex'), entry.source.path).toBe(entry.source.sha256);
    }
    const sources = Object.values(record.files).map(entry => entry.source.path);
    expect(new Set(sources).size).toBe(sources.length);
    for (const { id } of ROOM_STYLES) {
      for (const style of ['toon', 'pixel']) {
        const thumbnail = `${V2}/workspace/${style === 'pixel' ? 'pixel/' : ''}thumbnails/${id}.webp`;
        expect(record.files[thumbnail].source.path, thumbnail)
          .toBe(getWorkspaceSceneAssets(0, {}, { appearance: { style } }, { roomStyle: id }).background);
      }
    }
  });

  it('shows the thumbnails, in the chosen character style, instead of the full backgrounds', () => {
    for (const [value, folder] of [[null, 'workspace/thumbnails'], [{ style: 'pixel' }, 'workspace/pixel/thumbnails']]) {
      const pictures = [...host(value, 'default', []).querySelectorAll('[data-v2-appearance="room"] img')];
      expect(pictures.map(image => image.getAttribute('src')))
        .toEqual(ROOM_STYLES.map(({ id }) => `${V2}/${folder}/${id}.webp`));
      for (const image of pictures) expect(record.files).toHaveProperty(image.getAttribute('src'));
    }
  });

  it('gives every picture a precached default to fall back to', () => {
    const defaults = getWorkspaceSceneAssets(0);
    const element = host({ style: 'pixel', protagonistId: 'artist', companionId: 'fox' }, 'nightowl', []);
    const fallbacks = kind => [...element.querySelectorAll(`[data-v2-appearance="${kind}"] img`)]
      .map(image => image.dataset.fallbackSrc);
    expect(fallbacks('room').every(src => src === defaults.background)).toBe(true);
    expect(fallbacks('protagonist').every(src => src === defaults.protagonist)).toBe(true);
    expect(fallbacks('companion').every(src => src === defaults.companion.path)).toBe(true);
    expect(fallbacks('decoration')).toEqual(getWorkspaceSceneAssets(100).decorations.map(entry => entry.path));
    // Every one of them is in the service worker's precache.
    for (const kind of ['room', 'protagonist', 'companion', 'decoration']) {
      for (const src of fallbacks(kind)) expect(SHELL).toContain(src);
    }
  });

  it('adds no fallback where the picture already is the default', () => {
    const element = host(null, 'default', []);
    const office = element.querySelector('[data-v2-appearance="protagonist"][data-value="office"] img');
    expect(office.getAttribute('src')).toBe(getWorkspaceSceneAssets(0).protagonist);
    expect(office.hasAttribute('data-fallback-src')).toBe(false);
    const globe = element.querySelector('[data-v2-appearance="decoration"][data-value="deco-globe"] img');
    expect(globe.hasAttribute('data-fallback-src')).toBe(false);
  });
});
