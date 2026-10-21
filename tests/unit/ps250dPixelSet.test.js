/**
 * ps250dPixelSet.test.js — PS-250D: the pixel style (全像素) has a pixel room,
 * pixel props and the pixel version of every PS-250C character
 * (art-pipeline/ps250-pixel).
 *
 * The scene must resolve exactly the files the pipeline wrote, each file must
 * be the one it hashed, the props must keep the Q-style props' size (so they
 * share their placement), and nothing of the pixel style is precached.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
  WORKSPACE_VISUAL_STATES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { TOON_COMPANIONS, TOON_PROTAGONISTS } from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const outputs = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-pixel', 'outputs.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const PIXEL_FOLDERS = ['workspace/pixel/backgrounds', 'workspace/pixel/props', 'characters/pixel/protagonist', 'characters/pixel/companion'];

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function pixelScene(appearance, visual = {}, progress = 0) {
  return getWorkspaceSceneAssets(progress, {}, { appearance: { style: 'pixel', ...appearance }, ...visual });
}

describe('PS-250D pixel set', () => {
  it('ships exactly the hashed files the pipeline wrote, and nothing else', () => {
    const onDisk = PIXEL_FOLDERS.flatMap(folder => readdirSync(join(PWA, 'assets', 'personal-space', 'v2', ...folder.split('/')))
      .map(name => `assets/personal-space/v2/${folder}/${name}`));
    expect(onDisk.sort()).toEqual(Object.keys(outputs.files).sort());
    expect(onDisk).toHaveLength(1 + 8 + 6 * 6 * 2 + 6 * 6);
    for (const [path, entry] of Object.entries(outputs.files)) {
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
    }
  });

  it('covers the same characters as the Q style', () => {
    expect(outputs.protagonist.ids).toEqual(TOON_PROTAGONISTS.map(entry => entry.id));
    expect(outputs.companion.ids).toEqual(TOON_COMPANIONS.map(entry => entry.id));
  });

  it('resolves every pixel room, prop and character to a shipped file', () => {
    const resolved = new Set();
    for (const { progress } of WORKSPACE_PROJECT_PHASES) {
      const scene = pixelScene({}, {}, progress);
      resolved.add(scene.background);
      scene.props.forEach(entry => resolved.add(entry.path));
    }
    for (const { id } of TOON_PROTAGONISTS) {
      for (const state of WORKSPACE_VISUAL_STATES.protagonist) {
        for (const facing of WORKSPACE_VISUAL_STATES.facings) {
          resolved.add(pixelScene({ protagonistId: id }, { protagonist: { state, facing } }).protagonist);
        }
      }
    }
    for (const { id } of TOON_COMPANIONS) {
      for (const state of WORKSPACE_VISUAL_STATES.companion) {
        resolved.add(pixelScene({ companionId: id }, { companion: { state } }).companion.path);
      }
    }
    expect([...resolved].sort()).toEqual(Object.keys(outputs.files).sort());
  });

  it('keeps each pixel prop the size of its Q-style twin, so they share the placement', () => {
    const toon = getWorkspaceSceneAssets(100);
    const pixel = pixelScene({}, {}, 100);
    expect(pixel.props.map(entry => entry.id)).toEqual(toon.props.map(entry => entry.id));
    pixel.props.forEach((entry, index) => {
      expect(entry.placement).toEqual(toon.props[index].placement);
      expect(pngSize(entry.path), entry.id).toEqual(pngSize(toon.props[index].path));
    });
    expect(pngSize(pixel.background)).toEqual({ width: 1536, height: 1024 });
  });

  it('draws characters at the room\'s pixel size, on canvases framed like the Q style', () => {
    const protagonist = pixelScene({ protagonistId: 'artist' }).protagonist;
    const companion = pixelScene({ companionId: 'fox' }).companion.path;
    // Four room pixels per art pixel: 92 x 4 and 50 x 4.
    expect(pngSize(protagonist)).toEqual({ width: 368, height: 368 });
    expect(pngSize(companion)).toEqual({ width: 200, height: 200 });
  });

  it('precaches nothing of the pixel style', () => {
    const pixel = path => path.includes('/pixel/');
    expect(SHELL.filter(pixel)).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(pixel)).toEqual([]);
  });
});
