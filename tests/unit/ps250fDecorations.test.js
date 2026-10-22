/**
 * @vitest-environment jsdom
 *
 * ps250fDecorations.test.js — PS-250F: six decorations (user decision,
 * 2026-10-22: trophy and globe on the shelf, beanbag and floor lamp on the
 * floor, succulent and coffee set on the desk), rendered by the PS-244 scene
 * (art-pipeline/ps250-decor) in both character styles, by day and by night,
 * in the default room (PS-250F1) and every room style (PS-250F2).
 * Each is shown unless switched off in Edit Mode; the switches are stored
 * only on this device, in world.hiddenDecorations. The default room's
 * decorations are precached.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { createDefaultPersonalSpaceV2State, normalizePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/stateSchema.js';
import { loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import { buildEditViewModel } from '../../pwa/js/personalSpace/v2/viewModels.js';
import { buildAssetCatalog } from '../../pwa/js/personalSpace/v2/ui/assetGallery.js';
import {
  DECORATIONS,
  readAppearanceChange,
  renderAppearancePicker,
  saveAppearanceChange,
} from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';
import { renderOrbitWindow } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const DECOR = join(REPO, 'art-pipeline', 'ps250-decor');
const outputs = JSON.parse(readFileSync(join(DECOR, 'outputs.json'), 'utf8'));
const placements = JSON.parse(readFileSync(join(DECOR, 'placements.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const IDS = DECORATIONS.map(entry => entry.id);
const ROOM_STYLES = ['nordic', 'washitsu', 'nightowl', 'study'];
const ON_SHELF = ['deco-trophy', 'deco-globe'];
const ON_DESK = ['deco-succulent', 'deco-coffee'];
const ON_FLOOR = ['deco-beanbag', 'deco-floor-lamp'];

// The ids in a Python tuple or dict of the art pipeline.
function pythonIds(file, name) {
  const source = readFileSync(join(REPO, 'art-pipeline', ...file.split('/')), 'utf8');
  const start = source.indexOf(`${name} = `);
  expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf('\n\n', start));
  return [...body.matchAll(/'(deco-[a-z-]+)'(?=\s*[,:)])/g)].map(match => match[1])
    .filter((id, index, all) => all.indexOf(id) === index);
}

function pngSize(path) {
  const data = readFileSync(join(PWA, path));
  expect(data.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const ids = scene => scene.decorations.map(entry => entry.id);

function filesUnder(folder) {
  const root = join(PWA, 'assets', 'personal-space', 'v2', ...folder.split('/'));
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  return walk(root).map(path => `assets/personal-space/v2/${folder}/${path.slice(root.length + 1).split('\\').join('/')}`);
}

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('PS-250F1 decorations: assets', () => {
  it('has the six decorations the user chose, the same in the pipeline, the scene and the picker', () => {
    expect(DECORATIONS).toEqual([
      { id: 'deco-trophy', label: '獎盃' },
      { id: 'deco-globe', label: '地球儀' },
      { id: 'deco-beanbag', label: '懶骨頭' },
      { id: 'deco-floor-lamp', label: '落地燈' },
      { id: 'deco-succulent', label: '多肉盆栽' },
      { id: 'deco-coffee', label: '咖啡杯組' },
    ]);
    expect(pythonIds('ps244-blender/scene.py', 'DECOR_IDS')).toEqual(IDS);
    expect(pythonIds('ps250-decor/process_decor.py', 'DECOR')).toEqual(IDS);
    expect(ids(getWorkspaceSceneAssets(100))).toEqual(IDS);
  });

  it('puts each decoration on the same support in the pipeline and the scene', () => {
    const scene = readFileSync(join(REPO, 'art-pipeline', 'ps244-blender', 'scene.py'), 'utf8');
    const sceneSupports = Object.fromEntries([...scene.slice(scene.indexOf('DECOR_SUPPORTS = {'))
      .split('\n}')[0].matchAll(/'(deco-[a-z-]+)': \('([a-z-]+)',\)/g)].map(match => [match[1], match[2]]));
    const pipeline = readFileSync(join(DECOR, 'process_decor.py'), 'utf8');
    const pipelineSupports = Object.fromEntries([...pipeline.matchAll(/'(deco-[a-z-]+)':\s*\{'support': '([a-z-]+)'/g)]
      .map(match => [match[1], match[2]]));
    const runtimeSupports = Object.fromEntries(getWorkspaceSceneAssets(100).decorations
      .filter(entry => entry.support).map(entry => [entry.id, entry.support]));
    expect(runtimeSupports).toEqual({
      'deco-trophy': 'office-shelf',
      'deco-globe': 'office-shelf',
      'deco-succulent': 'corner-desk',
      'deco-coffee': 'corner-desk',
    });
    expect(sceneSupports).toEqual(runtimeSupports);
    expect(pipelineSupports).toEqual(runtimeSupports);
  });

  it('places each decoration where the pipeline trimmed it, by day and by night', () => {
    for (const [timeBand, section] of [['day', placements.decor], ['night', placements.night.decor]]) {
      expect(Object.keys(section)).toEqual(IDS);
      for (const entry of getWorkspaceSceneAssets(100, {}, {}, { timeBand }).decorations) {
        const expected = section[entry.id];
        expect(entry.path, entry.id).toBe(expected.path);
        expect(entry.placement, entry.id).toEqual({
          anchor: 'center-bottom',
          x: expected.x,
          y: expected.y,
          width: expected.width,
          z: placements.decor[entry.id].z,
        });
        // The trim box and the file agree, so the sprite lands pixel-exact.
        const [left, top, right, bottom] = expected.bbox;
        expect(pngSize(entry.path), entry.id).toEqual({ width: right - left, height: bottom - top });
      }
    }
  });

  it('draws each decoration just above what it stands on', () => {
    const props = Object.fromEntries(getWorkspaceSceneAssets(100).props.map(entry => [entry.id, entry.placement.z]));
    const z = Object.fromEntries(getWorkspaceSceneAssets(100).decorations.map(entry => [entry.id, entry.placement.z]));
    for (const id of ON_SHELF) expect(z[id]).toBeGreaterThan(props['office-shelf']);
    for (const id of ON_DESK) expect(z[id]).toBeGreaterThan(props['corner-desk']);
    // The beanbag stands in front of the desk and chair, below the characters.
    const scene = getWorkspaceSceneAssets(100);
    expect(z['deco-beanbag']).toBeGreaterThan(props['office-chair']);
    expect(z['deco-beanbag']).toBeLessThan(scene.protagonistPlacement.z);
    expect(z['deco-floor-lamp']).toBeLessThan(props['office-shelf']);
    expect(Object.values(z).every(Number.isInteger)).toBe(true);
  });

  it('ships exactly the hashed files the pipeline wrote, in both character styles and every room', () => {
    const onDisk = [...filesUnder('workspace/decor'), ...filesUnder('workspace/pixel/decor')].sort();
    expect(onDisk).toEqual(Object.keys(outputs.files).sort());
    // Six decorations, by day and by night, Q style and pixel, in five rooms.
    expect(onDisk).toHaveLength(6 * 2 * 2 * 5);
    for (const [path, entry] of Object.entries(outputs.files)) {
      const data = readFileSync(join(PWA, path));
      expect(data.length, path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), path).toBe(entry.sha256);
    }
    const resolved = new Set();
    for (const roomStyle of ROOM_STYLES) {
      for (const style of ['toon', 'pixel']) {
        for (const timeBand of ['day', 'night']) {
          getWorkspaceSceneAssets(100, {}, { appearance: { style } }, { timeBand, roomStyle })
            .decorations.forEach(entry => resolved.add(entry.path));
        }
      }
    }
    for (const style of ['toon', 'pixel']) {
      for (const timeBand of ['day', 'night']) {
        const scene = getWorkspaceSceneAssets(100, {}, { appearance: { style } }, { timeBand });
        scene.decorations.forEach(entry => resolved.add(entry.path));
        // A pixel decoration has the size of its Q-style twin, so both share the placements.
        if (style === 'pixel') {
          const toon = getWorkspaceSceneAssets(100, {}, {}, { timeBand });
          scene.decorations.forEach((entry, index) => {
            expect(entry.path).toContain('/workspace/pixel/decor/');
            expect(pngSize(entry.path)).toEqual(pngSize(toon.decorations[index].path));
          });
        }
      }
    }
    expect([...resolved].sort()).toEqual(onDisk);
  });

  it('precaches the default room\'s decorations by day and by night, and lists them in the manifest', () => {
    const defaults = IDS.flatMap(id => [
      `assets/personal-space/v2/workspace/decor/${id}.png`,
      `assets/personal-space/v2/workspace/decor/${id}-night.png`,
    ]);
    for (const path of defaults) {
      expect(SHELL).toContain(path);
      expect(getWorkspaceAssetManifestPaths()).toContain(path);
    }
    expect(SHELL.filter(path => path.includes('/pixel/decor/') || path.includes('/decor/styles/'))).toEqual([]);
    expect(getWorkspaceAssetManifestPaths().filter(path => path.includes('/decor/styles/'))).toEqual([]);
  });

  it('lists every decoration file in the developer gallery', () => {
    const catalog = buildAssetCatalog();
    const listed = catalog.flatMap(group => group.assets.map(asset => asset.path));
    for (const path of Object.keys(outputs.files)) expect(listed).toContain(path);
    expect(catalog.find(group => group.label === '裝飾').assets).toHaveLength(12 * 5);
    expect(catalog.find(group => group.label === '像素裝飾').assets).toHaveLength(12 * 5);
  });
});

describe('PS-250F1 decorations: scene', () => {
  it('shows the floor ones from the start and the others once what they stand on is there', () => {
    const at = progress => ids(getWorkspaceSceneAssets(progress));
    const phase = id => getWorkspaceSceneAssets(100).props.find(entry => entry.id === id).minProgress;
    expect(at(0)).toEqual(ON_FLOOR);
    expect(at(phase('corner-desk'))).toEqual([...ON_FLOOR, ...ON_DESK]);
    expect(at(phase('office-shelf'))).toEqual(IDS);
    for (const progress of [0, 25, 50, 75, 100]) {
      const props = getWorkspaceSceneAssets(progress).props.map(entry => entry.id);
      for (const entry of getWorkspaceSceneAssets(progress).decorations) {
        if (entry.support) expect(props, entry.id).toContain(entry.support);
      }
    }
  });

  it('leaves out the hidden ones, and ignores anything that is not a list', () => {
    expect(ids(getWorkspaceSceneAssets(100, {}, {}, { hiddenDecorations: ['deco-globe', 'deco-coffee', 'nope'] })))
      .toEqual(['deco-trophy', 'deco-beanbag', 'deco-floor-lamp', 'deco-succulent']);
    expect(ids(getWorkspaceSceneAssets(100, {}, {}, { hiddenDecorations: IDS }))).toEqual([]);
    for (const hiddenDecorations of [undefined, null, 'deco-globe', { 'deco-globe': true }]) {
      expect(ids(getWorkspaceSceneAssets(100, {}, {}, { hiddenDecorations }))).toEqual(IDS);
    }
  });

  it('uses the night renders in the evening and at night, and the pixel ones in the pixel style', () => {
    for (const timeBand of ['evening', 'night']) {
      const scene = getWorkspaceSceneAssets(100, {}, {}, { timeBand });
      expect(scene.decorations.every(entry => entry.path.endsWith('-night.png'))).toBe(true);
    }
    const pixel = getWorkspaceSceneAssets(100, {}, { appearance: { style: 'pixel' } });
    expect(pixel.decorations.every(entry => /\/workspace\/pixel\/decor\/deco-[a-z-]+\.png$/.test(entry.path))).toBe(true);
  });

  it('has every room style\'s own decorations, cut to the default boxes (PS-250F2)', () => {
    for (const roomStyle of ROOM_STYLES) {
      for (const style of ['toon', 'pixel']) {
        for (const timeBand of ['day', 'night']) {
          const styled = getWorkspaceSceneAssets(100, {}, { appearance: { style } }, { timeBand, roomStyle });
          const plain = getWorkspaceSceneAssets(100, {}, { appearance: { style } }, { timeBand });
          expect(ids(styled)).toEqual(IDS);
          styled.decorations.forEach((entry, index) => {
            expect(entry.path).toContain(`/decor/styles/${roomStyle}/`);
            expect(entry.placement).toEqual(plain.decorations[index].placement);
            expect(pngSize(entry.path), entry.path).toEqual(pngSize(plain.decorations[index].path));
          });
        }
      }
    }
  });

  it('records how many pixels the cut of each Q-style room-style decoration dropped, and keeps it small', () => {
    const styled = Object.keys(outputs.files).filter(path => /\/workspace\/decor\/styles\//.test(path));
    expect(styled).toHaveLength(ROOM_STYLES.length * 6 * 2);
    expect(Object.keys(outputs.clipped).sort()).toEqual(styled.sort());
    // Most cuts drop a faint shadow tail (at most 366 pixels). The most is the
    // night-owl floor lamp at night: the neon rail behind it casts the pole's
    // shadow onto the near-black wall outside the box, where it cannot be
    // seen (compared side by side). More than this would be a visible cut.
    for (const [path, count] of Object.entries(outputs.clipped)) expect(count, path).toBeLessThan(1000);
  });

  it('moves a decoration with what it stands on', () => {
    const plain = getWorkspaceSceneAssets(100, {}, {}, { timeBand: 'night' });
    const shelf = plain.props.find(entry => entry.id === 'office-shelf');
    const day = getWorkspaceSceneAssets(100).props.find(entry => entry.id === 'office-shelf');
    const moved = getWorkspaceSceneAssets(100, {
      'office-shelf': { x: day.placement.x - 5, y: day.placement.y + 2 },
      'deco-beanbag': { x: 30 },
    }, {}, { timeBand: 'night' });
    const before = Object.fromEntries(plain.decorations.map(entry => [entry.id, entry.placement]));
    const after = Object.fromEntries(moved.decorations.map(entry => [entry.id, entry.placement]));
    expect(moved.props.find(entry => entry.id === 'office-shelf').placement.x).toBeCloseTo(shelf.placement.x - 5, 3);
    for (const id of ON_SHELF) {
      expect(after[id].x).toBeCloseTo(before[id].x - 5, 3);
      expect(after[id].y).toBeCloseTo(before[id].y + 2, 3);
    }
    for (const id of ON_DESK) expect(after[id]).toEqual(before[id]);
    const beanbagDay = getWorkspaceSceneAssets(100).decorations.find(entry => entry.id === 'deco-beanbag');
    expect(after['deco-beanbag'].x).toBeCloseTo(before['deco-beanbag'].x + 30 - beanbagDay.placement.x, 3);
  });
});

describe('PS-250F1 decorations: the Orbit Window poster', () => {
  const decorationImages = host => [...host.querySelectorAll('img.orbit-window-decoration')];

  it('draws the decorations as props, and leaves out the hidden ones', () => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, timeBand: 'day' });
    const images = decorationImages(host);
    expect(images.map(image => image.dataset.decorationId)).toEqual(IDS);
    // The prop class keeps an older style.css placing them.
    expect(images.every(image => image.classList.contains('orbit-window-prop'))).toBe(true);
    expect(images.map(image => image.getAttribute('src'))).toEqual(IDS.map(id => placements.decor[id].path));
    expect(images[0].getAttribute('style')).toContain(`z-index:${placements.decor['deco-trophy'].z}`);

    host.innerHTML = renderOrbitWindow({
      activeProject: { progress: 100 },
      world: { hiddenDecorations: ['deco-beanbag'] },
    });
    expect(decorationImages(host).map(image => image.dataset.decorationId)).not.toContain('deco-beanbag');
    host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, hiddenDecorations: IDS });
    expect(decorationImages(host)).toEqual([]);
  });

  it('falls back like the props: pixel to Q style, night to day', () => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, timeBand: 'night', appearance: { style: 'pixel' } });
    const globe = host.querySelector('[data-decoration-id="deco-globe"]');
    expect(globe.getAttribute('src')).toBe('assets/personal-space/v2/workspace/pixel/decor/deco-globe-night.png');
    expect(globe.hasAttribute('data-pixel-art')).toBe(true);
    expect(globe.dataset.fallbackSrc).toBe(placements.night.decor['deco-globe'].path);
    expect(globe.dataset.daySrc).toBe(placements.decor['deco-globe'].path);
    expect(globe.dataset.dayStyle).toContain(`left:${placements.decor['deco-globe'].x}%`);
    // When every step fails the image stays empty (alt=""), so the room is drawn without it.
    expect(globe.getAttribute('alt')).toBe('');
  });

  it('draws none with an older manifest that has no decorations (INFRA-105)', async () => {
    vi.resetModules();
    vi.doMock('../../pwa/js/personalSpace/v2/content/assetManifest.js', async importOriginal => {
      const actual = await importOriginal();
      return {
        ...actual,
        getWorkspaceSceneAssets: (...args) => {
          const { decorations, ...scene } = actual.getWorkspaceSceneAssets(...args);
          expect(decorations).toBeDefined();
          return scene;
        },
      };
    });
    try {
      const { renderOrbitWindow: renderWithOlderManifest } = await import('../../pwa/js/personalSpace/v2/ui/orbitWindow.js');
      const host = document.createElement('div');
      host.innerHTML = renderWithOlderManifest({ activeProject: { progress: 100 }, timeBand: 'night' });
      expect(decorationImages(host)).toEqual([]);
      expect(host.querySelectorAll('.orbit-window-prop')).toHaveLength(7);
    } finally {
      vi.doUnmock('../../pwa/js/personalSpace/v2/content/assetManifest.js');
      vi.resetModules();
    }
  });
});

describe('PS-250F1 decoration switches', () => {
  it('keeps the hidden decorations through normalization: unique ids, unknown ones too', () => {
    expect(createDefaultPersonalSpaceV2State('user-1').world.hiddenDecorations).toEqual([]);
    const state = normalizePersonalSpaceV2State({
      ownerId: 'user-1',
      world: { hiddenDecorations: ['deco-globe', ' deco-globe ', 'deco-from-a-newer-version', 3, null, ''] },
    }, { ownerId: 'user-1' });
    expect(state.world.hiddenDecorations).toEqual(['deco-globe', 'deco-from-a-newer-version']);
    for (const hiddenDecorations of [undefined, 'deco-globe', { 'deco-globe': true }]) {
      expect(normalizePersonalSpaceV2State({ world: { hiddenDecorations } }, { ownerId: 'user-1' }).world.hiddenDecorations)
        .toEqual([]);
    }
  });

  it('passes them to the page model', () => {
    const v2State = createDefaultPersonalSpaceV2State('user-1');
    v2State.world.hiddenDecorations = ['deco-coffee'];
    const model = buildEditViewModel({
      coreState: { user: { id: 'user-1' }, sessions: [] },
      v2State,
      ledgerSnapshot: {},
      effectiveDate: '2026-10-22',
    });
    expect(model.hiddenDecorations).toEqual(['deco-coffee']);
  });

  it('offers a switch for each decoration, on unless hidden, with the decoration as its picture', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAppearancePicker(null, 'default', ['deco-globe']);
    const switches = [...host.querySelectorAll('[data-v2-appearance="decoration"]')];
    expect(host.querySelector('.personal-space-v2-appearance-decorations').closest('fieldset').querySelector('legend').textContent)
      .toBe('裝飾');
    expect(switches.map(button => button.dataset.value)).toEqual(IDS);
    expect(switches.map(button => button.textContent.trim())).toEqual(DECORATIONS.map(entry => entry.label));
    expect(switches.filter(button => button.getAttribute('aria-pressed') === 'false').map(button => button.dataset.value))
      .toEqual(['deco-globe']);
    expect(switches[0].querySelector('img').getAttribute('src')).toBe(placements.decor['deco-trophy'].path);

    host.innerHTML = renderAppearancePicker({ style: 'pixel' }, 'default', []);
    const pixel = host.querySelector('[data-v2-appearance="decoration"] img');
    expect(pixel.getAttribute('src')).toContain('/pixel/decor/');
    expect(pixel.hasAttribute('data-pixel-art')).toBe(true);
  });

  it('offers no switches to an older page or with an older manifest (INFRA-105)', async () => {
    const host = document.createElement('div');
    host.innerHTML = renderAppearancePicker(null, 'default');
    expect(host.querySelectorAll('[data-v2-appearance="decoration"]')).toHaveLength(0);

    vi.resetModules();
    vi.doMock('../../pwa/js/personalSpace/v2/content/assetManifest.js', async importOriginal => {
      const actual = await importOriginal();
      return {
        ...actual,
        getWorkspaceSceneAssets: (...args) => {
          const { decorations: _decorations, ...scene } = actual.getWorkspaceSceneAssets(...args);
          return scene;
        },
      };
    });
    try {
      const picker = await import('../../pwa/js/personalSpace/v2/ui/appearancePicker.js');
      host.innerHTML = picker.renderAppearancePicker(null, 'default', []);
      expect(host.querySelectorAll('[data-v2-appearance="decoration"]')).toHaveLength(0);
      expect(host.querySelectorAll('[data-v2-appearance="room"]').length).toBeGreaterThan(0);
    } finally {
      vi.doUnmock('../../pwa/js/personalSpace/v2/content/assetManifest.js');
      vi.resetModules();
    }
  });

  it('switches one off or on, on top of the latest saved state', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAppearancePicker(null, 'default', ['deco-globe']);
    const button = id => host.querySelector(`[data-v2-appearance="decoration"][data-value="${id}"]`);
    expect(readAppearanceChange(button('deco-trophy'))).toEqual({ hideDecoration: 'deco-trophy' });
    expect(readAppearanceChange(button('deco-globe'))).toEqual({ showDecoration: 'deco-globe' });

    const stored = createDefaultPersonalSpaceV2State('user-1');
    stored.worldRevision = 6;
    stored.world.hiddenDecorations = ['deco-globe', 'deco-from-a-newer-version'];
    stored.world.appearance = null;
    savePersonalSpaceV2State('user-1', stored);
    let saved = saveAppearanceChange('user-1', { hideDecoration: 'deco-trophy' });
    expect(saved.world.hiddenDecorations).toEqual(['deco-globe', 'deco-from-a-newer-version', 'deco-trophy']);
    saved = saveAppearanceChange('user-1', { showDecoration: 'deco-globe' });
    expect(saved.world.hiddenDecorations).toEqual(['deco-from-a-newer-version', 'deco-trophy']);
    // Nothing else changes: no appearance is chosen, and the revision is not a reward.
    const reloaded = loadPersonalSpaceV2State('user-1');
    expect(reloaded.world.hiddenDecorations).toEqual(['deco-from-a-newer-version', 'deco-trophy']);
    expect(reloaded.world.appearance).toBeNull();
    expect(reloaded.world.selectedThemeId).toBe('default');
    expect(reloaded.worldRevision).toBe(6);
    expect(reloaded.rewardLedger).toEqual([]);

    // A room or character change keeps the hidden decorations.
    saved = saveAppearanceChange('user-1', { selectedThemeId: 'nordic' });
    expect(saved.world.hiddenDecorations).toEqual(['deco-from-a-newer-version', 'deco-trophy']);
  });
});
