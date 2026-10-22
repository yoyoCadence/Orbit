/**
 * @vitest-environment jsdom
 *
 * ps250e2RoomStyles.test.js — PS-250E2: room styles (user decision,
 * 2026-10-21). Each style is a render of the same room, camera and lights
 * with other materials, in both character styles and by day and by night
 * (art-pipeline/ps250-rooms). The choice is stored in the existing
 * world.selectedThemeId, only on this device; the default room stays the
 * precached one.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { createDefaultPersonalSpaceV2State, normalizePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/stateSchema.js';
import { loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import { buildAssetCatalog } from '../../pwa/js/personalSpace/v2/ui/assetGallery.js';
import {
  readAppearanceChange,
  renderAppearancePicker,
  resolveRoomStyleChoice,
  ROOM_STYLES,
  saveAppearanceChange,
} from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';
import { renderOrbitWindow } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const outputs = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-rooms', 'outputs.json'), 'utf8'));
const placements = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps244-blender', 'placements.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const STYLES = ROOM_STYLES.map(entry => entry.id).filter(id => id !== 'default');
const LIGHTINGS = { day: 'day', night: 'night' };

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function filesUnder(folder) {
  const root = join(PWA, 'assets', 'personal-space', 'v2', ...folder.split('/'));
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  return walk(root).map(path => `assets/personal-space/v2/${folder}/${path.slice(root.length + 1).split('\\').join('/')}`);
}

// Every room and prop path a room style resolves to, in both character
// styles, by day and by night, in every project phase.
function stylePaths(roomStyle) {
  const paths = new Set();
  for (const style of ['toon', 'pixel']) {
    for (const timeBand of Object.values(LIGHTINGS)) {
      for (const { progress } of WORKSPACE_PROJECT_PHASES) {
        const scene = getWorkspaceSceneAssets(progress, {}, { appearance: { style } }, { timeBand, roomStyle });
        paths.add(scene.background);
        scene.props.forEach(entry => paths.add(entry.path));
      }
    }
  }
  return [...paths];
}

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('PS-250E2 room styles', () => {
  it('offers the default room first, then each style the scene can draw', () => {
    expect(ROOM_STYLES[0]).toEqual({ id: 'default', label: '藍色工作室' });
    expect(STYLES.length).toBeGreaterThan(0);
    for (const { id } of ROOM_STYLES) {
      expect(getWorkspaceSceneAssets(0, {}, {}, { roomStyle: id }).roomStyle).toBe(id);
    }
  });

  it('draws the default room for no choice, an unknown one, or a legacy theme id', () => {
    for (const roomStyle of [undefined, null, 'default', 'night', 'rough-room', 42]) {
      const scene = getWorkspaceSceneAssets(100, {}, {}, { roomStyle });
      expect(scene.roomStyle).toBe('default');
      expect(scene.background).toBe(placements.background);
      expect(resolveRoomStyleChoice(roomStyle)).toBe('default');
    }
  });

  it('ships exactly the hashed files the pipeline wrote, and resolves every one of them', () => {
    const onDisk = [...filesUnder('workspace/styles'), ...filesUnder('workspace/pixel/styles')].sort();
    expect(onDisk).toEqual(Object.keys(outputs.files).sort());
    for (const [path, entry] of Object.entries(outputs.files)) {
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
    }
    // Room and 8 props, by day and by night, Q style and pixel.
    expect(onDisk).toHaveLength(STYLES.length * (1 + 8) * 2 * 2);
    expect(STYLES.flatMap(stylePaths).sort()).toEqual(onDisk);
  });

  it('keeps every style prop the size of the default prop of the same lighting, so they share placements', () => {
    for (const roomStyle of STYLES) {
      for (const timeBand of Object.values(LIGHTINGS)) {
        const styled = getWorkspaceSceneAssets(100, {}, {}, { timeBand, roomStyle });
        const plain = getWorkspaceSceneAssets(100, {}, {}, { timeBand });
        expect(styled.props.map(entry => entry.placement)).toEqual(plain.props.map(entry => entry.placement));
        styled.props.forEach((entry, index) => {
          expect(pngSize(entry.path), entry.path).toEqual(pngSize(plain.props[index].path));
        });
        const pixel = getWorkspaceSceneAssets(100, {}, { appearance: { style: 'pixel' } }, { timeBand, roomStyle });
        expect(pngSize(pixel.background)).toEqual({ width: 1536, height: 1024 });
      }
    }
  });

  it('records how many pixels the cut to the shared boxes dropped, and keeps it small', () => {
    for (const [path, count] of Object.entries(outputs.clipped)) {
      expect(outputs.files[path], path).toBeTruthy();
      // A style's outline can be a pixel wider than the default's; more than
      // this would be a visible cut.
      expect(count, path).toBeLessThan(400);
    }
  });

  it('precaches no room style, and keeps them out of the default manifest', () => {
    const styled = path => path.includes('/styles/');
    expect(SHELL.filter(styled)).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(styled)).toEqual([]);
  });

  it('lists every room style file in the developer gallery', () => {
    const listed = buildAssetCatalog().flatMap(group => group.assets.map(asset => asset.path));
    for (const path of Object.keys(outputs.files)) expect(listed).toContain(path);
    const labels = buildAssetCatalog().map(group => group.label);
    expect(labels).toContain('房間風格');
    expect(labels).toContain('像素房間風格');
  });
});

describe('PS-250E2 room style choice', () => {
  it('keeps world.selectedThemeId through normalization, as before', () => {
    const state = normalizePersonalSpaceV2State({ ownerId: 'user-1', world: { selectedThemeId: 'nordic' } }, { ownerId: 'user-1' });
    expect(state.world.selectedThemeId).toBe('nordic');
    expect(createDefaultPersonalSpaceV2State('user-1').world.selectedThemeId).toBe('default');
  });

  it('draws the chosen room in the poster, with the default room as its fallback', () => {
    const roomStyle = STYLES[0];
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, timeBand: 'night', selectedThemeId: roomStyle });
    const background = host.querySelector('.orbit-window-background');
    expect(background.getAttribute('src')).toBe(getWorkspaceSceneAssets(100, {}, {}, { timeBand: 'night', roomStyle }).background);
    expect(background.dataset.fallbackSrc).toBe(placements.night.background);
    for (const image of host.querySelectorAll('.orbit-window-prop')) {
      expect(image.getAttribute('src')).toContain(`/styles/${roomStyle}/props/`);
      expect(image.dataset.fallbackSrc).not.toContain('/styles/');
    }
    // The world model carries the choice too.
    host.innerHTML = renderOrbitWindow({ activeProject: { progress: 0 }, world: { selectedThemeId: roomStyle } });
    expect(host.querySelector('.orbit-window-background').getAttribute('src')).toContain(`/styles/${roomStyle}/`);
  });

  it('shows the rooms in the picker with the current one pressed', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAppearancePicker(null, STYLES[0]);
    const rooms = [...host.querySelectorAll('[data-v2-appearance="room"]')];
    expect(rooms.map(button => button.dataset.value)).toEqual(ROOM_STYLES.map(entry => entry.id));
    expect(rooms.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.value))
      .toEqual([STYLES[0]]);
    expect(rooms[1].querySelector('img').getAttribute('src')).toBe(
      getWorkspaceSceneAssets(0, {}, {}, { roomStyle: rooms[1].dataset.value }).background,
    );
    expect(rooms[0].querySelector('img').getAttribute('width')).toBe('108');

    // A legacy theme id shows the default room pressed; pixel thumbnails are pixel rooms.
    host.innerHTML = renderAppearancePicker({ style: 'pixel' }, 'night');
    const pressed = host.querySelector('[data-v2-appearance="room"][aria-pressed="true"]');
    expect(pressed.dataset.value).toBe('default');
    expect(pressed.querySelector('img').hasAttribute('data-pixel-art')).toBe(true);
    expect(pressed.querySelector('img').getAttribute('src')).toContain('/pixel/');
  });

  it('stores a room in world.selectedThemeId and leaves an unchosen look unchosen', () => {
    const button = document.createElement('button');
    button.dataset.v2Appearance = 'room';
    button.dataset.value = STYLES[0];
    expect(readAppearanceChange(button)).toEqual({ selectedThemeId: STYLES[0] });
    button.setAttribute('aria-pressed', 'true');
    expect(readAppearanceChange(button)).toBeNull();

    const stored = createDefaultPersonalSpaceV2State('user-1');
    stored.worldRevision = 4;
    savePersonalSpaceV2State('user-1', stored);
    const saved = saveAppearanceChange('user-1', { selectedThemeId: STYLES[0] });
    expect(saved.world.selectedThemeId).toBe(STYLES[0]);
    expect(saved.world.appearance).toBeNull();
    expect(saved.worldRevision).toBe(4);
    const both = saveAppearanceChange('user-1', { style: 'pixel' });
    expect(both.world.selectedThemeId).toBe(STYLES[0]);
    expect(both.world.appearance).toEqual(expect.objectContaining({ style: 'pixel' }));
    expect(loadPersonalSpaceV2State('user-1').world.selectedThemeId).toBe(STYLES[0]);
  });
});
