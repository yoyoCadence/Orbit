/**
 * @vitest-environment jsdom
 *
 * ps250e1NightRoom.test.js — PS-250E1: the room and props have a night render
 * (art-pipeline/ps244-blender --lighting night, and its pixel version), shown
 * in the evening and at night (user decision, 2026-10-21). The night room is
 * already dark, so the light layer over it is weaker and the achievement frame
 * is dimmed with its photo. The default night set is precached.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_INITIAL_PAINT_ASSETS,
  WORKSPACE_NIGHT_INITIAL_PAINT_ASSETS,
  WORKSPACE_PROJECT_PHASES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  mountOrbitWindow,
  renderOrbitWindow,
  updateOrbitWindowAchievementPhoto,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { getTimeBand, TIME_BANDS } from '../../pwa/js/timeBand.js';

// Paths, not URLs: under jsdom, URL is jsdom's and node:fs rejects it.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const placements = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps244-blender', 'placements.json'), 'utf8'));
const pixelOutputs = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps250-pixel', 'outputs.json'), 'utf8'));
const pwaFile = path => join(REPO, 'pwa', ...path.split('/'));
const SHELL = [...readFileSync(pwaFile('sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const PHOTO = { status: 'selected', src: 'data:image/png;base64,AAAA', taskName: '跑步' };

function poster(model) {
  const host = document.createElement('div');
  host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, ...model });
  return host;
}

afterEach(() => {
  vi.doUnmock('../../pwa/js/personalSpace/v2/content/assetManifest.js');
  vi.resetModules();
});

describe('PS-250E1 night room', () => {
  it('uses the night room in the evening and at night, and the day room otherwise', () => {
    const lightingFor = Object.fromEntries(Object.keys(TIME_BANDS).map(timeBand => [
      timeBand,
      getWorkspaceSceneAssets(100, {}, {}, { timeBand }).lighting,
    ]));
    expect(lightingFor).toEqual({ morning: 'day', day: 'day', evening: 'night', night: 'night' });
    // 17:00–05:00 with the shared time bands.
    expect([4, 5, 16, 17, 20, 21, 23].map(hour => getTimeBand(hour))).toEqual(
      ['night', 'morning', 'day', 'evening', 'evening', 'night', 'night'],
    );
    expect(getWorkspaceSceneAssets(100).lighting).toBe('day');
    expect(getWorkspaceSceneAssets(100, {}, {}, { timeBand: 'dusk' }).lighting).toBe('day');
  });

  it('reads the time band only from the options, never from visualState', () => {
    // The poster passes its whole model (with timeBand) as visualState. An
    // older poster with this manifest must still get the day room.
    const scene = getWorkspaceSceneAssets(100, {}, { timeBand: 'night' });
    expect(scene.lighting).toBe('day');
    expect(scene.background).toBe(placements.background);
  });

  it('draws every night prop exactly where the night render measured it', () => {
    const night = new Map([
      ...getWorkspaceSceneAssets(100, {}, {}, { timeBand: 'night' }).props,
      ...getWorkspaceSceneAssets(75, {}, {}, { timeBand: 'night' }).props,
    ].map(entry => [entry.id, entry]));
    expect(getWorkspaceSceneAssets(0, {}, {}, { timeBand: 'night' }).background).toBe(placements.night.background);
    expect(existsSync(pwaFile(placements.night.background))).toBe(true);
    expect([...night.keys()].sort()).toEqual(Object.keys(placements.night.props).sort());
    for (const [id, expected] of Object.entries(placements.night.props)) {
      const entry = night.get(id);
      expect(entry.path).toBe(expected.path);
      expect(entry.path).toMatch(/-night\.png$/);
      expect(entry.placement).toEqual({
        x: expected.x,
        y: expected.y,
        width: expected.width,
        z: placements.props[id].z,
        anchor: 'center-bottom',
      });
      expect(existsSync(pwaFile(expected.path))).toBe(true);
    }
  });

  it('derives each night placement from its own trim box', () => {
    const { width, height } = placements.frame;
    for (const { bbox, x, y, width: w } of Object.values(placements.night.props)) {
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

  it('moves a night prop by the same offset as its day twin when the user moved it', () => {
    const day = getWorkspaceSceneAssets(100).props.find(entry => entry.id === 'corner-desk').placement;
    const nightBase = getWorkspaceSceneAssets(100, {}, {}, { timeBand: 'night' })
      .props.find(entry => entry.id === 'corner-desk').placement;
    const overrides = { 'corner-desk': { x: day.x + 3, y: day.y - 2, width: 99, anchor: 'center' } };
    const moved = getWorkspaceSceneAssets(100, overrides, {}, { timeBand: 'night' })
      .props.find(entry => entry.id === 'corner-desk').placement;
    expect(moved.x).toBeCloseTo(nightBase.x + 3, 3);
    expect(moved.y).toBeCloseTo(nightBase.y - 2, 3);
    // Overrides never resize or re-anchor a prop, by night either.
    expect(moved.width).toBe(nightBase.width);
    expect(moved.anchor).toBe('center-bottom');
    // Only x moved: y stays the night value.
    const onlyX = getWorkspaceSceneAssets(100, { 'corner-desk': { x: day.x + 1 } }, {}, { timeBand: 'night' })
      .props.find(entry => entry.id === 'corner-desk').placement;
    expect(onlyX.y).toBe(nightBase.y);
  });

  it('has a night pixel room and pixel props, the size of the Q-style night props', () => {
    for (const { progress } of WORKSPACE_PROJECT_PHASES) {
      const scene = getWorkspaceSceneAssets(progress, {}, { appearance: { style: 'pixel' } }, { timeBand: 'night' });
      expect(scene.background).toBe(pixelOutputs.night.room);
      for (const entry of scene.props) {
        expect(entry.path).toBe(pixelOutputs.night.props[entry.id]);
        expect(pixelOutputs.files[entry.path]).toBeTruthy();
        const toon = readFileSync(pwaFile(placements.night.props[entry.id].path));
        const pixel = readFileSync(pwaFile(entry.path));
        expect(pixel.readUInt32BE(16), entry.id).toBe(toon.readUInt32BE(16));
        expect(pixel.readUInt32BE(20), entry.id).toBe(toon.readUInt32BE(20));
      }
    }
  });

  it('precaches the default night room and props, and nothing of the pixel night set', () => {
    const night = [placements.night.background, ...Object.values(placements.night.props).map(entry => entry.path)];
    expect(night).toHaveLength(9);
    for (const path of night) {
      expect(SHELL).toContain(path);
      expect(getWorkspaceAssetManifestPaths()).toContain(path);
    }
    expect(SHELL.filter(path => path.includes('/pixel/'))).toEqual([]);
    expect(WORKSPACE_NIGHT_INITIAL_PAINT_ASSETS).toEqual([
      placements.night.background,
      ...WORKSPACE_INITIAL_PAINT_ASSETS.slice(1),
    ]);
  });

  it('draws the night room in the poster under a weaker night layer and a dimmed frame', () => {
    for (const timeBand of ['evening', 'night']) {
      const host = poster({ timeBand, achievementPhoto: PHOTO });
      expect(host.querySelector('.orbit-window-background').getAttribute('src')).toBe(placements.night.background);
      expect(host.querySelector('.orbit-window-background').dataset.fallbackSrc).toBe(placements.night.background);
      expect([...host.querySelectorAll('.orbit-window-prop')].every(image => /-night\.png$/.test(image.getAttribute('src'))))
        .toBe(true);
      const light = host.querySelector('.orbit-window-light');
      // The evening uses the night room, so it also uses the night layer.
      expect(light.className).toBe('orbit-window-light orbit-window-light--night');
      expect(light.style.opacity).toBe('0.5');
      const frame = host.querySelector('[data-achievement-photo]');
      expect(frame.hasAttribute('data-night-dim')).toBe(true);
      // The whole frame, photo included.
      expect(frame.style.filter).toBe('brightness(0.65)');
      expect(frame.querySelector('img')).not.toBeNull();
    }
  });

  it('keeps the day poster as it was', () => {
    for (const timeBand of ['morning', 'day']) {
      const host = poster({ timeBand, achievementPhoto: PHOTO });
      expect(host.querySelector('.orbit-window-background').getAttribute('src')).toBe(placements.background);
      const light = host.querySelector('.orbit-window-light');
      expect(light.className).toBe(`orbit-window-light orbit-window-light--${timeBand}`);
      expect(light.getAttribute('style')).toBeNull();
      const frame = host.querySelector('[data-achievement-photo]');
      expect(frame.hasAttribute('data-night-dim')).toBe(false);
      expect(frame.getAttribute('style')).toBeNull();
    }
  });

  it('falls back to the day room when a night image cannot load either (an interrupted update, offline)', () => {
    const host = poster({ timeBand: 'night' });
    const root = host.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() } });
    const background = root.querySelector('.orbit-window-background');
    // The default night room is its own default, so its fallback is the day room.
    background.dispatchEvent(new Event('error'));
    expect(background.getAttribute('src')).toBe(placements.background);
    background.dispatchEvent(new Event('error'));
    expect(background.getAttribute('src')).toBe(placements.background);

    // A night prop becomes the day prop at the day placement.
    const desk = root.querySelector(`.orbit-window-prop[src="${placements.night.props['corner-desk'].path}"]`);
    desk.dispatchEvent(new Event('error'));
    expect(desk.getAttribute('src')).toBe(placements.props['corner-desk'].path);
    expect(desk.style.left).toBe(`${placements.props['corner-desk'].x}%`);
    expect(desk.style.width).toBe(`${placements.props['corner-desk'].width}%`);
    cleanup();

    // A pixel night image falls back to the Q-style night image, then the day room.
    const pixel = poster({ timeBand: 'evening', appearance: { style: 'pixel' } }).querySelector('[data-orbit-window]');
    const stop = mountOrbitWindow(pixel, { runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() } });
    const pixelRoom = pixel.querySelector('.orbit-window-background');
    pixelRoom.dispatchEvent(new Event('error'));
    expect(pixelRoom.getAttribute('src')).toBe(placements.night.background);
    expect(pixelRoom.hasAttribute('data-pixel-art')).toBe(false);
    pixelRoom.dispatchEvent(new Event('error'));
    expect(pixelRoom.getAttribute('src')).toBe(placements.background);
    stop();

    // By day nothing changes: no second step.
    const dayRoom = poster({ timeBand: 'day' }).querySelector('.orbit-window-background');
    expect(dayRoom.hasAttribute('data-day-src')).toBe(false);
  });

  it('keeps the frame dimmed when the photo changes at night', () => {
    const host = poster({ timeBand: 'night' });
    expect(updateOrbitWindowAchievementPhoto(host, PHOTO)).toBe(true);
    const frame = host.querySelector('[data-achievement-photo]');
    expect(frame.dataset.photoStatus).toBe('selected');
    expect(frame.style.filter).toBe('brightness(0.65)');

    const day = poster({ timeBand: 'day' });
    updateOrbitWindowAchievementPhoto(day, PHOTO);
    expect(day.querySelector('[data-achievement-photo]').getAttribute('style')).toBeNull();
  });

  it('keeps today\'s look when an older manifest returns the day room without `lighting`', async () => {
    // During an update the poster can be newer than assetManifest.js
    // (INFRA-105). The older manifest ignores the time band and has no
    // `lighting`: the poster then keeps the full night layer and a bright frame.
    vi.resetModules();
    vi.doMock('../../pwa/js/personalSpace/v2/content/assetManifest.js', async importOriginal => {
      const actual = await importOriginal();
      return {
        ...actual,
        getWorkspaceSceneAssets: (progress, overrides, visualState) => {
          const { lighting, ...scene } = actual.getWorkspaceSceneAssets(progress, overrides, visualState);
          expect(lighting).toBe('day');
          return scene;
        },
      };
    });
    const { renderOrbitWindow: renderWithOlderManifest } = await import('../../pwa/js/personalSpace/v2/ui/orbitWindow.js');
    const host = document.createElement('div');
    host.innerHTML = renderWithOlderManifest({ activeProject: { progress: 100 }, timeBand: 'night', achievementPhoto: PHOTO });
    expect(host.querySelector('.orbit-window-background').getAttribute('src')).toBe(placements.background);
    const light = host.querySelector('.orbit-window-light');
    expect(light.className).toBe('orbit-window-light orbit-window-light--night');
    expect(light.getAttribute('style')).toBeNull();
    expect(host.querySelector('[data-achievement-photo]').getAttribute('style')).toBeNull();
  });
});
