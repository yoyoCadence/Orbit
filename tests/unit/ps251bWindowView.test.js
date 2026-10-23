/**
 * @vitest-environment jsdom
 *
 * ps251bWindowView.test.js — PS-251B: the view outside the window changes with
 * the time of day (user decision, 2026-10-23: S1, W2, T1). In the morning and
 * the evening an image of only what the window shows is drawn over the room
 * background and under the furniture; by day and at night the view baked into
 * the room stays. Every room style shares the window, so there is one image per
 * character style. docs/ps-251b-window-view-proposal.md.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  mountOrbitWindow,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pwaFile = path => join(REPO, 'pwa', ...path.split('/'));
const outputs = JSON.parse(readFileSync(join(REPO, 'art-pipeline', 'ps251-window', 'outputs.json'), 'utf8'));
const SHELL = [...readFileSync(pwaFile('sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);

const Q = band => `assets/personal-space/v2/workspace/window/exterior-${band}.webp`;
const PIXEL = band => `assets/personal-space/v2/workspace/pixel/window/exterior-${band}.png`;
const ROOM_STYLES = ['default', 'nordic', 'washitsu', 'nightowl', 'study'];

function poster(model) {
  const host = document.createElement('div');
  host.innerHTML = renderOrbitWindow({ activeProject: { progress: 100 }, ...model });
  return host.querySelector('[data-orbit-window]');
}

function mount(root) {
  return mountOrbitWindow(root, { runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() } });
}

describe('PS-251B window view by time of day', () => {
  it('has a view for the morning and the evening, in both character styles, for every room', () => {
    for (const roomStyle of ROOM_STYLES) {
      for (const [style, path] of [['toon', Q], ['pixel', PIXEL]]) {
        const scene = (timeBand, visual = {}) => getWorkspaceSceneAssets(100, {}, {
          appearance: { style }, ...visual,
        }, { timeBand, roomStyle });
        expect(scene('morning').exterior).toBe(path('morning'));
        expect(scene('evening').exterior).toBe(path('evening'));
        // By day and at night the room's own baked-in view stays.
        expect(scene('day').exterior).toBeNull();
        expect(scene('night').exterior).toBeNull();
        // Like the lighting, the band is read only from the options.
        expect(scene(undefined, { timeBand: 'morning' }).exterior).toBeNull();
      }
    }
  });

  it('ships every view as recorded, the Q-style ones in the manifest and the precache', () => {
    expect(Object.keys(outputs.files).sort()).toEqual([
      PIXEL('evening'), PIXEL('morning'), Q('evening'), Q('morning'),
    ]);
    for (const [path, { bytes, sha256 }] of Object.entries(outputs.files)) {
      const blob = readFileSync(pwaFile(path));
      expect(blob.length, path).toBe(bytes);
      expect(createHash('sha256').update(blob).digest('hex'), path).toBe(sha256);
      if (path.endsWith('.webp')) {
        // A lossy WebP with alpha: the room under it shows through.
        expect(blob.toString('ascii', 12, 16), path).toBe('VP8X');
        expect(blob[20] & 0x10, path).toBe(0x10);
        expect(1 + blob.readUIntLE(24, 3)).toBe(1536);
        expect(1 + blob.readUIntLE(27, 3)).toBe(1024);
      } else {
        // An RGBA PNG at the room's size.
        expect(blob.readUInt32BE(16)).toBe(1536);
        expect(blob.readUInt32BE(20)).toBe(1024);
        expect(blob[25], path).toBe(6);
      }
      expect(bytes, path).toBeLessThan(20_000);
    }
    expect(getWorkspaceAssetManifestPaths()).toEqual(expect.arrayContaining([Q('morning'), Q('evening')]));
    expect(SHELL).toEqual(expect.arrayContaining([Q('morning'), Q('evening')]));
    // The pixel views are downloaded when first shown, like the pixel room.
    expect(SHELL.some(path => path.includes('/pixel/window/'))).toBe(false);
  });

  it('draws the view above the room and below the furniture on the poster, only in the morning and evening', () => {
    for (const band of ['morning', 'evening']) {
      const root = poster({ timeBand: band });
      const exterior = root.querySelector('.orbit-window-exterior');
      expect(exterior.getAttribute('src')).toBe(Q(band));
      // Right after the background, before every prop.
      expect(exterior.previousElementSibling.classList.contains('orbit-window-background')).toBe(true);
      expect(exterior.nextElementSibling.classList.contains('orbit-window-prop')).toBe(true);
      // Its own class (e2e tests find the background by its class) and an
      // inline position, so an older style.css places it too.
      expect(exterior.classList.contains('orbit-window-background')).toBe(false);
      expect(root.querySelectorAll('.orbit-window-background')).toHaveLength(1);
      expect(exterior.style.position).toBe('absolute');
      expect(exterior.style.inset).toBe('0px');
      expect(exterior.style.objectFit).toBe('cover');
      expect(exterior.style.zIndex).toBe('');
      expect(exterior.getAttribute('alt')).toBe('');
    }
    expect(poster({ timeBand: 'day' }).querySelector('.orbit-window-exterior')).toBeNull();
    expect(poster({ timeBand: 'night' }).querySelector('.orbit-window-exterior')).toBeNull();
  });

  it('draws the pixel view with hard edges, and the Q-style one with the Q-style room it falls back to', () => {
    const root = poster({ timeBand: 'evening', appearance: { style: 'pixel' } });
    const exterior = root.querySelector('.orbit-window-exterior');
    expect(exterior.getAttribute('src')).toBe(PIXEL('evening'));
    expect(exterior.hasAttribute('data-pixel-art')).toBe(true);
    expect(exterior.dataset.exteriorFallback).toBe(Q('evening'));

    const stop = mount(root);
    // The pixel night room cannot load: the Q-style night room and its view.
    root.querySelector('.orbit-window-background').dispatchEvent(new Event('error'));
    expect(exterior.getAttribute('src')).toBe(Q('evening'));
    expect(exterior.hasAttribute('data-pixel-art')).toBe(false);
    // Nor can the Q-style night room: the day room keeps the evening view.
    root.querySelector('.orbit-window-background').dispatchEvent(new Event('error'));
    expect(exterior.getAttribute('src')).toBe(Q('evening'));
    stop();

    // A Q-style room style shares the default room's view: nothing to follow.
    expect(poster({ timeBand: 'morning', selectedThemeId: 'nordic' })
      .querySelector('.orbit-window-exterior').hasAttribute('data-exterior-fallback')).toBe(false);
  });

  it('leaves the baked-in view when the window view cannot load', () => {
    const root = poster({ timeBand: 'morning' });
    const stop = mount(root);
    const background = root.querySelector('.orbit-window-background');
    root.querySelector('.orbit-window-exterior').dispatchEvent(new Event('error'));
    expect(root.querySelector('.orbit-window-exterior')).toBeNull();
    expect(root.querySelector('.orbit-window-background')).toBe(background);
    expect(background.getAttribute('src')).toMatch(/room-v2\.webp$/);
    stop();
  });

  it('draws no view with an older manifest that has none (INFRA-105)', async () => {
    vi.resetModules();
    vi.doMock('../../pwa/js/personalSpace/v2/content/assetManifest.js', async importOriginal => {
      const actual = await importOriginal();
      return {
        ...actual,
        getWorkspaceSceneAssets: (...args) => {
          const { exterior: _exterior, ...scene } = actual.getWorkspaceSceneAssets(...args);
          return scene;
        },
      };
    });
    const { renderOrbitWindow: render } = await import('../../pwa/js/personalSpace/v2/ui/orbitWindow.js');
    const host = document.createElement('div');
    host.innerHTML = render({ activeProject: { progress: 100 }, timeBand: 'evening' });
    expect(host.querySelector('.orbit-window-exterior')).toBeNull();
    expect(host.querySelector('.orbit-window-background')).not.toBeNull();
    vi.doUnmock('../../pwa/js/personalSpace/v2/content/assetManifest.js');
    vi.resetModules();
  });
});
