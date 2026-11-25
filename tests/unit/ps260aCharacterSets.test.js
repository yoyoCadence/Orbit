/**
 * ps260aCharacterSets.test.js — PS-260A: the ten themed protagonists rendered
 * by art-pipeline/ps260-sets.
 *
 * Five male and five female sets, each with its own room and two decorations.
 * Every sprite is the file the pipeline hashed, on the PS-250C canvas and
 * ground point, in every pose and facing the runtime draws. None is precached:
 * once the picker offers them (PS-260E) they load on demand (PS-250B).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getWorkspaceAssetManifestPaths } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { TOON_FACINGS, TOON_PROTAGONIST_POSES } from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';
import { DECORATIONS, ROOM_STYLES } from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const sets = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'outputs.json'), 'utf8'));
const toon = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-characters', 'outputs.json'), 'utf8'));
// The catalog the later segments read (rooms, decorations): sets_catalog.py.
const CATALOG = readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'sets_catalog.py'), 'utf8');
const CATALOG_SETS = [...CATALOG.matchAll(
  /\{'id': '([a-z]+)', 'gender': '(male|female)', 'label': '([^']+)',\s*'room': \('([a-z]+)', '[^']+'\),\s*'decor': \(\('(deco-[a-z]+)', '[^']+'\), \('(deco-[a-z]+)', '[^']+'\)\)\}/g,
)].map(([, id, gender, label, room, first, second]) => ({ id, gender, label, room, decorations: [first, second] }));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);

// Canvas size and alpha flag from a WebP's VP8X header.
function webpInfo(buffer) {
  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buffer.toString('ascii', 8, 12)).toBe('WEBP');
  expect(buffer.toString('ascii', 12, 16)).toBe('VP8X');
  return {
    alpha: (buffer[20] & 0x10) !== 0,
    width: buffer.readUIntLE(24, 3) + 1,
    height: buffer.readUIntLE(27, 3) + 1,
  };
}

describe('PS-260A themed character sets', () => {
  it('has at least ten sets, half male and half female, with unique ids', () => {
    const { ids } = sets.protagonist;
    expect(ids.length).toBeGreaterThanOrEqual(10);
    const male = ids.filter(entry => entry.gender === 'male');
    const female = ids.filter(entry => entry.gender === 'female');
    expect(male.length).toBe(female.length);
    expect(male.length + female.length).toBe(ids.length);
    const all = [...ids.map(entry => entry.id), ...toon.protagonist.ids.map(entry => entry.id)];
    expect(new Set(all).size).toBe(all.length);
    for (const entry of ids) expect(entry.label, entry.id).toMatch(/\S/);
  });

  it('matches sets_catalog.py, which the room and decoration segments read', () => {
    expect(CATALOG_SETS).toHaveLength(sets.sets.length);
    expect(CATALOG_SETS.map(({ id, gender, label }) => ({ id, label, gender }))).toEqual(sets.protagonist.ids);
    expect(CATALOG_SETS.map(({ id, room, decorations }) => ({ protagonist: id, room, decorations }))).toEqual(sets.sets);
  });

  it('uses room and decoration ids that no PS-250 room or decoration has', () => {
    const rooms = ROOM_STYLES.map(entry => entry.id);
    const decorations = DECORATIONS.map(entry => entry.id);
    for (const entry of sets.sets) {
      expect(rooms, entry.room).not.toContain(entry.room);
      for (const id of entry.decorations) expect(decorations, id).not.toContain(id);
    }
  });

  it('gives every set its own room and two decorations', () => {
    expect(sets.sets.map(entry => entry.protagonist)).toEqual(sets.protagonist.ids.map(entry => entry.id));
    const rooms = sets.sets.map(entry => entry.room);
    const decorations = sets.sets.flatMap(entry => entry.decorations);
    expect(new Set(rooms).size).toBe(rooms.length);
    expect(new Set(decorations).size).toBe(decorations.length);
    for (const entry of sets.sets) expect(entry.decorations, entry.protagonist).toHaveLength(2);
    for (const id of decorations) expect(id).toMatch(/^deco-[a-z]+$/);
  });

  it('draws the PS-250C poses and facings on the same canvas and ground point', () => {
    expect(sets.protagonist.poses).toEqual(TOON_PROTAGONIST_POSES);
    expect(sets.protagonist.facings).toEqual(TOON_FACINGS);
    expect(sets.protagonist.canvas).toEqual(toon.protagonist.canvas);
    expect(sets.protagonist.ground).toEqual(toon.protagonist.ground);
    expect(sets.encoding).toEqual(toon.encoding);
  });

  it('ships one sprite per set, pose and facing, as the hashed WebP with alpha', () => {
    const expected = sets.protagonist.ids.flatMap(({ id }) => sets.protagonist.poses.flatMap(pose =>
      sets.protagonist.facings.map(facing => `assets/personal-space/v2/characters/toon/protagonist/${id}-${pose}-${facing}.webp`)));
    expect(Object.keys(sets.files).sort()).toEqual(expected.sort());
    for (const [path, entry] of Object.entries(sets.files)) {
      const file = join(PWA, path);
      expect(existsSync(file), path).toBe(true);
      const data = readFileSync(file);
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
      expect(webpInfo(data), path).toEqual({ alpha: true, width: 512, height: 512 });
    }
  });

  it('keeps each sprite as small as the PS-250C ones', () => {
    const sizes = Object.values(sets.files).map(entry => entry.bytes);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(24_000);
    expect(sizes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThanOrEqual(2_400_000);
  });

  it('precaches none of them', () => {
    const paths = new Set(Object.keys(sets.files));
    expect(SHELL.filter(path => paths.has(path))).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(path => paths.has(path))).toEqual([]);
  });
});
