/**
 * @vitest-environment jsdom
 *
 * PS-250A: the developer-only gallery lists every Personal Space V2 asset once,
 * under its group, and is off unless the developer panel turned it on.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { getWorkspaceAssetManifestPaths } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  ASSET_GALLERY_FLAG,
  buildAssetCatalog,
  isAssetGalleryEnabled,
  renderAssetGallery,
  setAssetGalleryEnabled,
} from '../../pwa/js/personalSpace/v2/ui/assetGallery.js';

describe('PS-250A developer asset gallery', () => {
  afterEach(() => localStorage.clear());

  it('lists every manifest asset exactly once, in a named group', () => {
    const catalog = buildAssetCatalog();
    const listed = catalog.flatMap(group => group.assets.map(asset => asset.path));

    expect(listed.sort()).toEqual([...getWorkspaceAssetManifestPaths()].sort());
    expect(catalog.map(group => group.label)).toEqual(['場景・房間', '家具', '主角', 'AI 夥伴', '天氣特效']);
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

    expect(images.map(image => image.getAttribute('src')).sort())
      .toEqual([...getWorkspaceAssetManifestPaths()].sort());
    expect(images.every(image => image.getAttribute('loading') === 'lazy')).toBe(true);
    expect(host.textContent).toContain(`${images.length} 個檔案`);
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
