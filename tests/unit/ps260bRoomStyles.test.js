/**
 * ps260bRoomStyles.test.js — PS-260B: the rooms of the ten themed sets.
 *
 * Each room is the PS-244 scene with the set's materials and its own view
 * out of the window (art-pipeline/ps244-blender/room_styles.py PS260_STYLES),
 * rendered by day and by night in the Q style and in pixels, with the props
 * cut to the default room's boxes like every PS-250E style. The files are
 * recorded with the sets (art-pipeline/ps260-sets/rooms-outputs.json) and
 * none is precached; the picker lists them in PS-260E.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { ROOM_STYLES } from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const V2 = 'assets/personal-space/v2';
const rooms = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'rooms-outputs.json'), 'utf8'));
const sets = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps260-sets', 'outputs.json'), 'utf8'));
const placements = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps244-blender', 'placements.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const PROPS = Object.keys(placements.props);
// assets/personal-space/v2/workspace/[pixel/]styles/<room>/...
const RECORDED = [...new Set(Object.keys(rooms.files).map(path => path.match(/\/styles\/([^/]+)\//)[1]))].sort();

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function webpSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.toString('ascii', 8, 12), path).toBe('WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
}

describe('PS-260B themed rooms', () => {
  it('records only the rooms of the sets', () => {
    expect(rooms.taskId).toBe('PS-260B');
    // B1 (#271): the male sets' rooms; B2: the female sets'. Every set's room.
    expect(RECORDED).toEqual(sets.sets.map(entry => entry.room).sort());
    expect(RECORDED).toHaveLength(10);
  });

  it('ships each room by day and by night, in both styles: the background and every prop, as hashed', () => {
    const expected = RECORDED.flatMap(room => ['', '-night'].flatMap(suffix => [
      `${V2}/workspace/styles/${room}/background${suffix}.webp`,
      ...PROPS.map(id => `${V2}/workspace/styles/${room}/props/${id}${suffix}.png`),
      `${V2}/workspace/pixel/styles/${room}/background${suffix}.png`,
      ...PROPS.map(id => `${V2}/workspace/pixel/styles/${room}/props/${id}${suffix}.png`),
    ]));
    expect(Object.keys(rooms.files).sort()).toEqual(expected.sort());
    for (const [path, entry] of Object.entries(rooms.files)) {
      expect(existsSync(join(PWA, path)), path).toBe(true);
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
    }
  });

  it('fits every prop to the default prop of the same lighting and style, so the shared placements hold', () => {
    for (const room of RECORDED) {
      for (const [suffix, timeBand] of [['', 'day'], ['-night', 'night']]) {
        expect(webpSize(`${V2}/workspace/styles/${room}/background${suffix}.webp`)).toEqual({ width: 1536, height: 1024 });
        expect(pngSize(`${V2}/workspace/pixel/styles/${room}/background${suffix}.png`)).toEqual({ width: 1536, height: 1024 });
        for (const [style, folder] of [['toon', 'styles'], ['pixel', 'pixel/styles']]) {
          // The default room's props in every phase (single-monitor is gone at 100%).
          const plain = WORKSPACE_PROJECT_PHASES.flatMap(({ progress }) => (
            getWorkspaceSceneAssets(progress, {}, { appearance: { style } }, { timeBand }).props));
          for (const id of PROPS) {
            const reference = plain.find(entry => entry.id === id);
            expect(reference, id).toBeDefined();
            expect(pngSize(`${V2}/workspace/${folder}/${room}/props/${id}${suffix}.png`), `${style} ${room} ${id}${suffix}`)
              .toEqual(pngSize(reference.path));
          }
        }
      }
    }
  });

  it('records how many pixels the cut of each Q-style prop dropped, and keeps it small', () => {
    const props = Object.keys(rooms.files).filter(path => path.includes('/props/') && !path.includes('/pixel/'));
    expect(Object.keys(rooms.clipped).sort()).toEqual(props.sort());
    for (const [path, count] of Object.entries(rooms.clipped)) expect(count, path).toBeLessThan(400);
  });

  it('keeps the Q-style rooms small: a background under 160 KB, a room by day and night under 1.2 MB', () => {
    for (const room of RECORDED) {
      const files = Object.entries(rooms.files).filter(([path]) => path.includes(`/workspace/styles/${room}/`));
      for (const [path, entry] of files.filter(([path]) => path.endsWith('.webp'))) {
        expect(entry.bytes, path).toBeLessThan(160_000);
      }
      expect(files.reduce((sum, [, entry]) => sum + entry.bytes, 0), room).toBeLessThan(1_200_000);
    }
  });

  it('is not precached, not in the default manifest, and not offered by the picker yet', () => {
    const paths = new Set(Object.keys(rooms.files));
    expect(SHELL.filter(path => paths.has(path))).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(path => paths.has(path))).toEqual([]);
    const offered = ROOM_STYLES.map(entry => entry.id);
    for (const room of RECORDED) expect(offered).not.toContain(room);
  });
});
