/**
 * ps250cCharacterCatalog.test.js — PS-250C: the Q-style characters rendered by
 * art-pipeline/ps250-characters.
 *
 * characterCatalog.js must list exactly the files the pipeline wrote
 * (outputs.json), each file must be the one the pipeline hashed, and nothing
 * may precache them before PS-250B lets the user choose them.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  WORKSPACE_VISUAL_STATES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  getToonCharacterPaths,
  TOON_COMPANION_STATES,
  TOON_COMPANIONS,
  TOON_FACINGS,
  TOON_PROTAGONIST_POSES,
  TOON_PROTAGONISTS,
} from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const outputs = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-characters', 'outputs.json'), 'utf8'));
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

describe('PS-250C Q-style character catalog', () => {
  it('lists exactly the sprites the pipeline wrote', () => {
    const paths = getToonCharacterPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths].sort()).toEqual(Object.keys(outputs.files).sort());
    expect(paths).toHaveLength(6 * 6 * 2 + 6 * 6);
  });

  it('uses the pipeline ids and labels, and every state the runtime draws', () => {
    expect(TOON_PROTAGONISTS).toEqual(outputs.protagonist.ids);
    expect(TOON_COMPANIONS).toEqual(outputs.companion.ids);
    expect(TOON_PROTAGONIST_POSES).toEqual(outputs.protagonist.poses);
    expect(TOON_FACINGS).toEqual(outputs.protagonist.facings);
    expect(TOON_COMPANION_STATES).toEqual(outputs.companion.states);
    expect([...TOON_PROTAGONIST_POSES].sort()).toEqual([...WORKSPACE_VISUAL_STATES.protagonist].sort());
    expect([...TOON_FACINGS].sort()).toEqual([...WORKSPACE_VISUAL_STATES.facings].sort());
    // The runtime draws the Companion's 'idle' as 'observe'.
    expect([...TOON_COMPANION_STATES, 'idle'].sort()).toEqual([...WORKSPACE_VISUAL_STATES.companion].sort());
  });

  it('ships every sprite as the hashed WebP with alpha, on the pipeline canvas', () => {
    for (const [path, entry] of Object.entries(outputs.files)) {
      const file = join(PWA, path);
      expect(existsSync(file), path).toBe(true);
      const data = readFileSync(file);
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
      const canvas = path.includes('/protagonist/') ? outputs.protagonist.canvas : outputs.companion.canvas;
      expect(webpInfo(data), path).toEqual({ alpha: true, width: canvas[0], height: canvas[1] });
    }
  });

  it('keeps the set small: about 15 KB per protagonist and 9 KB per Companion', () => {
    const sizes = Object.entries(outputs.files);
    const protagonists = sizes.filter(([path]) => path.includes('/protagonist/'));
    const companions = sizes.filter(([path]) => path.includes('/companion/'));
    expect(Math.max(...protagonists.map(([, entry]) => entry.bytes))).toBeLessThanOrEqual(24_000);
    expect(Math.max(...companions.map(([, entry]) => entry.bytes))).toBeLessThanOrEqual(16_000);
    expect(sizes.reduce((sum, [, entry]) => sum + entry.bytes, 0)).toBeLessThanOrEqual(1_600_000);
  });

  it('is not part of the scene or the precache until PS-250B', () => {
    const toon = path => path.includes('/characters/toon/');
    expect(getWorkspaceAssetManifestPaths().filter(toon)).toEqual([]);
    expect(SHELL.filter(toon)).toEqual([]);
  });
});
