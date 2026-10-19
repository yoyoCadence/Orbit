import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceSceneAssets,
  WORKSPACE_V2_ASSETS,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

// PS-244: the room and every prop come from one Blender camera. A prop lands
// pixel-exact on the room only with the placement process_pack.py derived from
// its trimmed render, so the runtime contract must match placements.json.
const placements = JSON.parse(readFileSync(
  new URL('../../art-pipeline/ps244-blender/placements.json', import.meta.url),
  'utf8',
));
const pwaFile = path => new URL(`../../pwa/${path}`, import.meta.url);

describe('PS-244 Blender workstation placements', () => {
  const fullScene = getWorkspaceSceneAssets(100);
  const singleMonitorScene = getWorkspaceSceneAssets(75);
  const runtimeProps = new Map(
    [...fullScene.props, ...singleMonitorScene.props].map(entry => [entry.id, entry]),
  );

  it('uses the Blender background and camera', () => {
    expect(WORKSPACE_V2_ASSETS.background).toBe(placements.background);
    expect(WORKSPACE_V2_ASSETS.canonicalCameraId).toBe('building-workspace-v2');
    expect(WORKSPACE_V2_ASSETS.dimensions).toEqual(placements.frame);
    expect(existsSync(pwaFile(placements.background))).toBe(true);
  });

  it('places every prop exactly where the render pipeline measured it', () => {
    expect([...runtimeProps.keys()].sort()).toEqual(Object.keys(placements.props).sort());
    for (const [id, expected] of Object.entries(placements.props)) {
      const entry = runtimeProps.get(id);
      expect(entry.path).toBe(expected.path);
      expect(entry.placement).toEqual(expect.objectContaining({
        x: expected.x,
        y: expected.y,
        width: expected.width,
        z: expected.z,
        anchor: 'center-bottom',
      }));
      expect(existsSync(pwaFile(expected.path))).toBe(true);
    }
  });

  it('derives each placement from the trimmed box in the 1536×1024 frame', () => {
    const { width, height } = placements.frame;
    for (const { bbox, x, y, width: w } of Object.values(placements.props)) {
      const [left, top, right, bottom] = bbox;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width);
      expect(bottom).toBeLessThanOrEqual(height);
      expect(x).toBeCloseTo(((left + right) / 2 / width) * 100, 2);
      expect(y).toBeCloseTo((bottom / height) * 100, 2);
      expect(w).toBeCloseTo(((right - left) / width) * 100, 2);
    }
  });

  it('does not add a CSS shadow on top of the baked contact shadow', () => {
    // The poster fallback draws props as <img class="orbit-window-prop">; the
    // Blender shadow is already in each PNG, as in the Pixi runtime.
    const css = readFileSync(pwaFile('assets/style.css'), 'utf8');
    const propRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').some(s => s.trim() === '.orbit-window-prop'));
    expect(propRules.length).toBeGreaterThan(0);
    for (const [, , body] of propRules) expect(body).not.toMatch(/filter\s*:/);
  });

  it('draws the chair over the desk, monitors and lamp it stands in front of', () => {
    const z = id => placements.props[id].z;
    for (const behind of ['corner-desk', 'single-monitor', 'dual-monitor', 'desk-lamp']) {
      expect(z('office-chair')).toBeGreaterThan(z(behind));
    }
  });

  it('lets placement overrides move a prop but never resize or re-anchor it', () => {
    // Shape of a migrated idle-window editor override (old artwork's width/anchor).
    const scene = getWorkspaceSceneAssets(100, {
      'office-shelf': { x: '70%', y: '80%', width: '13%', z: 5, anchor: 'center', scale: 2 },
    });
    const shelf = scene.props.find(entry => entry.id === 'office-shelf');
    const expected = placements.props['office-shelf'];
    expect(shelf.placement).toEqual({
      x: 70, y: 80, width: expected.width, z: expected.z, anchor: 'center-bottom',
    });
  });

  it('keeps the protagonist and Companion at the calibrated Blender scale', () => {
    expect(fullScene.protagonistPlacement.width).toBe(24);
    expect(fullScene.companionPlacement.width).toBe(13);
  });
});

// PS-247: a prop rendered with PROP_OCCLUDERS has the occluded parts cut out
// of its PNG, and only looks right with the occluder drawn under it in the
// same place. Every progress value that shows the prop must also show each
// occluder, at a lower z. (Fixed placements are covered by PS-246.)
describe('PS-247 baked occlusion', () => {
  const sceneSource = readFileSync(
    new URL('../../art-pipeline/ps244-blender/scene.py', import.meta.url),
    'utf8',
  );
  const block = sceneSource.match(/PROP_OCCLUDERS = \{([\s\S]*?)\n\}/);
  const occluders = [...(block?.[1] ?? '').matchAll(/'([\w-]+)':\s*\(([^)]*)\)/g)]
    .map(([, propId, list]) => [propId, [...list.matchAll(/'([\w-]+)'/g)].map(match => match[1])]);

  it('declares the chair as occluded by the desk', () => {
    expect(occluders).toEqual([['office-chair', ['corner-desk']]]);
  });

  it('shows every occluder, drawn underneath, whenever the occluded prop is on screen', () => {
    for (let progress = 0; progress <= 100; progress += 1) {
      const props = new Map(getWorkspaceSceneAssets(progress).props.map(entry => [entry.id, entry]));
      for (const [propId, occluderIds] of occluders) {
        if (!props.has(propId)) continue;
        for (const occluderId of occluderIds) {
          expect(props.has(occluderId), `${occluderId} at ${progress}%`).toBe(true);
          expect(props.get(occluderId).placement.z).toBeLessThan(props.get(propId).placement.z);
        }
      }
    }
  });
});
