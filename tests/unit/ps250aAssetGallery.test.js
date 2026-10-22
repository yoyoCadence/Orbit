/**
 * @vitest-environment jsdom
 *
 * PS-250A: the developer-only gallery lists every Personal Space V2 asset once,
 * under its group, and is off unless the developer panel turned it on.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEV_PANEL } from '../../pwa/js/flags.js';
import { getWorkspaceAssetManifestPaths } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { getToonCharacterPaths } from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';
import {
  ASSET_GALLERY_FLAG,
  buildAssetCatalog,
  isAssetGalleryEnabled,
  renderAssetGallery,
  setAssetGalleryEnabled,
} from '../../pwa/js/personalSpace/v2/ui/assetGallery.js';

// The default scene (by day and by night), every Q-style character (PS-250C)
// and every file of the pixel style on disk: the PS-242 characters and the
// PS-250D pixel set with its PS-250E1 night room and props.
const V2 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pwa', 'assets', 'personal-space', 'v2');
const PIXEL_FOLDERS = [
  'characters/protagonist', 'characters/companion', 'characters/pixel/protagonist', 'characters/pixel/companion',
  'workspace/pixel/backgrounds', 'workspace/pixel/props',
];
const PIXEL_PATHS = PIXEL_FOLDERS.flatMap(folder => readdirSync(join(V2, ...folder.split('/')))
  .map(name => `assets/personal-space/v2/${folder}/${name}`));
// PS-250E2: every room style file, in both character styles.
const outputsOf = folder => Object.keys(JSON.parse(readFileSync(
  join(V2, '..', '..', '..', '..', 'art-pipeline', folder, 'outputs.json'),
  'utf8',
)).files);
const ROOM_STYLE_PATHS = outputsOf('ps250-rooms');
// PS-250F: every decoration, in both character styles.
const DECOR_PATHS = outputsOf('ps250-decor');
const ALL_PATHS = [...new Set([
  ...getWorkspaceAssetManifestPaths(),
  ...getToonCharacterPaths(),
  ...PIXEL_PATHS,
  ...ROOM_STYLE_PATHS,
  ...DECOR_PATHS,
])].sort();

describe('PS-250A developer asset gallery', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lists every asset exactly once, in a named group', () => {
    const catalog = buildAssetCatalog();
    const listed = catalog.flatMap(group => group.assets.map(asset => asset.path));

    // The pixel room and props by day and by night (PS-250E1).
    expect(PIXEL_PATHS).toHaveLength(6 * 2 + 6 + 6 * 6 * 2 + 6 * 6 + (1 + 8) * 2);
    expect(listed.sort()).toEqual(ALL_PATHS);
    expect(new Set(listed).size).toBe(listed.length);
    expect(catalog.map(group => group.label)).toEqual([
      '場景・房間', '家具', '裝飾', '房間風格', 'Q 版主角', 'Q 版 AI 夥伴', '像素場景・房間', '像素家具', '像素裝飾',
      '像素房間風格', '像素主角', '像素 AI 夥伴',
      '經典像素主角', '經典像素 AI 夥伴', '天氣特效',
    ]);
    expect(catalog.every(group => group.source)).toBe(true);
  });

  it('keeps an asset outside the known folders under 其他 instead of dropping it', () => {
    const catalog = buildAssetCatalog(['assets/personal-space/v2/new/thing.png']);
    expect(catalog).toEqual([{
      label: '其他',
      source: '',
      assets: [{ path: 'assets/personal-space/v2/new/thing.png', name: 'thing' }],
    }]);
  });

  it('renders one lazily loaded image per asset', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAssetGallery();
    const images = [...host.querySelectorAll('img')];

    expect(images.map(image => image.getAttribute('src')).sort()).toEqual(ALL_PATHS);
    expect(images.every(image => image.getAttribute('loading') === 'lazy')).toBe(true);
    expect(host.textContent).toContain(`${images.length} 個檔案`);
  });

  it('shows only in developer mode, like the developer panel', () => {
    setAssetGalleryEnabled(true);
    vi.stubGlobal('location', { hostname: 'orbit.example.com' });
    expect(isAssetGalleryEnabled()).toBe(false);
    localStorage.setItem(FLAG_DEV_PANEL, '1');
    expect(isAssetGalleryEnabled()).toBe(true);
    vi.stubGlobal('location', { hostname: 'abc.ngrok-free.app' });
    localStorage.removeItem(FLAG_DEV_PANEL);
    expect(isAssetGalleryEnabled()).toBe(true);
  });

  it('escapes paths and leaves out an empty source', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAssetGallery(buildAssetCatalog(['assets/personal-space/v2/x/"><b>x</b>.png']));
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('h3 small').textContent).toBe('1');
  });

  it('is off until the developer panel turns it on', () => {
    expect(isAssetGalleryEnabled()).toBe(false);
    setAssetGalleryEnabled(true);
    expect(localStorage.getItem(ASSET_GALLERY_FLAG)).toBe('1');
    expect(isAssetGalleryEnabled()).toBe(true);
    setAssetGalleryEnabled(false);
    expect(isAssetGalleryEnabled()).toBe(false);
  });
});
