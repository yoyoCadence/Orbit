/**
 * ps260cDecorations.test.js — PS-260C: the decorations of the themed rooms.
 *
 * Each PS-260 room has the six PS-250F decorations in its own materials, cut
 * to the default boxes like every PS-250F2 room, and its set's two
 * decorations (art-pipeline/ps244-blender/decor_sets.py), which stand only in
 * that room and are placed by their own trim boxes. Both in the Q style and in
 * pixels, by day and by night. The files are recorded with the sets
 * (art-pipeline/ps260-sets/decor-outputs.json, decor-placements.json); none
 * is precached and the picker lists them in PS-260E.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getWorkspaceAssetManifestPaths } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const V2 = 'assets/personal-space/v2';
const SETS = join(REPO, 'art-pipeline', 'ps260-sets');
const outputs = JSON.parse(readFileSync(join(SETS, 'decor-outputs.json'), 'utf8'));
const placements = JSON.parse(readFileSync(join(SETS, 'decor-placements.json'), 'utf8'));
const sets = JSON.parse(readFileSync(join(SETS, 'outputs.json'), 'utf8'));
const standard = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-decor', 'placements.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const STANDARD = Object.keys(standard.decor);
const ROOMS = Object.keys(placements.rooms).sort();
const OWN = Object.fromEntries(sets.sets.map(entry => [entry.room, entry.decorations]));
const LIGHTINGS = [['', 'day'], ['-night', 'night']];

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const path = (id, suffix, room, pixel) => `${V2}/workspace/${pixel ? 'pixel/' : ''}decor/styles/${room}/${id}${suffix}.png`;

describe('PS-260C decorations of the themed rooms', () => {
  it('places only the rooms of the sets, each with its set\'s two decorations', () => {
    // C1 (#273): the male sets' rooms; C2: the female sets'. Every set's room.
    expect(ROOMS).toEqual(sets.sets.map(entry => entry.room).sort());
    expect(ROOMS).toHaveLength(10);
    for (const room of ROOMS) {
      expect(Object.keys(OWN), room).toContain(room);
      expect(Object.keys(placements.rooms[room]).sort()).toEqual([...OWN[room]].sort());
    }
  });

  it('ships the six PS-250F decorations and the set\'s two in every placed room, in both styles, as hashed', () => {
    const expected = ROOMS.flatMap(room => [...STANDARD, ...OWN[room]].flatMap(id => LIGHTINGS.flatMap(([suffix]) => [
      path(id, suffix, room, false), path(id, suffix, room, true),
    ])));
    expect(Object.keys(outputs.files).sort()).toEqual(expected.sort());
    for (const [file, entry] of Object.entries(outputs.files)) {
      expect(existsSync(join(PWA, file)), file).toBe(true);
      const data = readFileSync(join(PWA, file));
      expect(data.length, file).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), file).toBe(entry.sha256);
    }
  });

  it('cuts the six PS-250F decorations to the default boxes, so their placements hold', () => {
    for (const room of ROOMS) {
      for (const [suffix, lighting] of LIGHTINGS) {
        const section = lighting === 'day' ? standard.decor : standard.night.decor;
        for (const id of STANDARD) {
          for (const pixel of [false, true]) {
            const reference = pixel ? section[id].path.replace('/workspace/decor/', '/workspace/pixel/decor/') : section[id].path;
            expect(pngSize(path(id, suffix, room, pixel)), `${room} ${id}${suffix}`).toEqual(pngSize(reference));
          }
        }
      }
    }
  });

  it('places each set decoration by its own trim box, the same in both styles, on the floor', () => {
    for (const room of ROOMS) {
      const spots = OWN[room].map(id => placements.rooms[room][id].day.spot).sort();
      expect(spots, room).toEqual(['back', 'front']);
      for (const id of OWN[room]) {
        for (const [suffix, lighting] of LIGHTINGS) {
          const entry = placements.rooms[room][id][lighting];
          expect(entry.path).toBe(path(id, suffix, room, false));
          const [left, top, right, bottom] = entry.bbox;
          const size = { width: right - left, height: bottom - top };
          expect(pngSize(entry.path), `${room} ${id}${suffix}`).toEqual(size);
          expect(pngSize(path(id, suffix, room, true)), `${room} ${id}${suffix} pixel`).toEqual(size);
          // Centre x and bottom y in % of the 1536 x 1024 frame.
          expect(entry.x).toBeCloseTo(((left + right) / 2 / 1536) * 100, 1);
          expect(entry.y).toBeCloseTo((bottom / 1024) * 100, 1);
          expect(entry.width).toBeCloseTo((size.width / 1536) * 100, 1);
          // The back-wall one behind the shelf and desk, the front one below
          // the characters; its z follows its spot, and the spot where it stands.
          expect(entry.spot).toBe(placements.rooms[room][id].day.spot);
          if (entry.spot === 'back') {
            expect(entry.z, `${room} ${id}`).toBe(21);
            // Its bottom (with the shadow, which at night can fall forward) stays
            // well above the front spot's.
            expect(entry.y, `${room} ${id}`).toBeLessThan(65);
            expect(entry.x, `${room} ${id}`).toBeLessThan(62);
          } else {
            expect(entry.spot).toBe('front');
            expect(entry.z, `${room} ${id}`).toBe(32);
            expect(entry.y, `${room} ${id}`).toBeGreaterThan(70);
          }
        }
      }
    }
  });

  it('records how many pixels the cut of each Q-style PS-250F decoration dropped, and keeps it small', () => {
    const cut = Object.keys(outputs.files).filter(file => !file.includes('/pixel/')
      && STANDARD.some(id => file.endsWith(`/${id}.png`) || file.endsWith(`/${id}-night.png`)));
    expect(Object.keys(outputs.clipped).sort()).toEqual(cut.sort());
    for (const [file, count] of Object.entries(outputs.clipped)) expect(count, file).toBeLessThan(1000);
  });

  it('is not precached and not in the default manifest', () => {
    const files = new Set(Object.keys(outputs.files));
    expect(SHELL.filter(file => files.has(file))).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(file => files.has(file))).toEqual([]);
  });
});
