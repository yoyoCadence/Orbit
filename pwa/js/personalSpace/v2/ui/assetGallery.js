/**
 * PS-250A: a developer-only overview of every Personal Space V2 asset, so new
 * Blender renders can be checked in the app without reaching the state that
 * shows them. The developer panel in Settings turns it on; the 空間 page then
 * lists each asset under its group.
 *
 * It only reads existing exports of the asset manifest: a new export imported
 * across SHELL modules can fail to link while an older copy is cached
 * (INFRA-105). Assets the scene does not use yet come from their own new
 * modules (PS-250C: characterCatalog.js).
 */
import { FLAG_DEV_PANEL } from '../../../flags.js';
import { getWorkspaceAssetManifestPaths } from '../content/assetManifest.js';
import { getToonCharacterPaths } from '../content/characterCatalog.js';

export const ASSET_GALLERY_FLAG = 'orbit_dev_asset_gallery';

const ASSET_ROOT = 'assets/personal-space/v2/';

// Folder → group, in the order the gallery shows them.
const ASSET_GROUPS = Object.freeze([
  { folder: 'workspace/backgrounds', label: '場景・房間', source: 'Blender（PS-244～PS-245）' },
  { folder: 'workspace/props', label: '家具', source: 'Blender（PS-244～PS-247）' },
  { folder: 'characters/toon/protagonist', label: 'Q 版主角', source: 'Blender（PS-250C）' },
  { folder: 'characters/toon/companion', label: 'Q 版 AI 夥伴', source: 'Blender（PS-250C）' },
  { folder: 'characters/protagonist', label: '像素主角', source: '影像生成（PS-242）' },
  { folder: 'characters/companion', label: '像素 AI 夥伴', source: '影像生成（PS-242）' },
  { folder: 'effects', label: '天氣特效', source: '影像生成（PS-242）' },
]);

const OTHER_GROUP = Object.freeze({ folder: '', label: '其他', source: '' });

// The same rule as the developer panel in Settings: local hosts, ngrok, or the
// panel turned on explicitly. Turning the panel off also hides the gallery.
function isDeveloperMode() {
  const host = globalThis.location?.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'].some(end => host.endsWith(end))) return true;
  return globalThis.localStorage?.getItem(FLAG_DEV_PANEL) === '1';
}

export function isAssetGalleryEnabled() {
  try {
    return globalThis.localStorage?.getItem(ASSET_GALLERY_FLAG) === '1' && isDeveloperMode();
  } catch {
    return false;
  }
}

export function setAssetGalleryEnabled(enabled) {
  try {
    if (enabled) globalThis.localStorage?.setItem(ASSET_GALLERY_FLAG, '1');
    else globalThis.localStorage?.removeItem(ASSET_GALLERY_FLAG);
  } catch {
    // Private mode or blocked storage: the gallery simply stays off.
  }
}

function groupFor(path) {
  const relative = path.startsWith(ASSET_ROOT) ? path.slice(ASSET_ROOT.length) : path;
  return ASSET_GROUPS.find(group => relative.startsWith(`${group.folder}/`)) || OTHER_GROUP;
}

/** Every asset once, grouped for the gallery; empty groups are left out. */
export function buildAssetCatalog(paths = [...getWorkspaceAssetManifestPaths(), ...getToonCharacterPaths()]) {
  const groups = new Map([...ASSET_GROUPS, OTHER_GROUP].map(group => [group, []]));
  for (const path of [...new Set(paths)].sort()) {
    groups.get(groupFor(path)).push({
      path,
      name: path.split('/').pop().replace(/\.(png|webp|jpe?g)$/i, ''),
    });
  }
  return [...groups.entries()]
    .filter(([, assets]) => assets.length)
    .map(([group, assets]) => ({ label: group.label, source: group.source, assets }));
}

export function renderAssetGallery(catalog = buildAssetCatalog()) {
  const total = catalog.reduce((sum, group) => sum + group.assets.length, 0);
  return `
    <section class="personal-space-v2-asset-gallery" data-v2-asset-gallery aria-labelledby="personal-space-v2-asset-gallery-title">
      <div class="personal-space-v2-editor-heading">
        <div><small>開發者</small><h2 id="personal-space-v2-asset-gallery-title">全部 3D 資產</h2></div>
        <span>${total} 個檔案</span>
      </div>
      ${catalog.map(group => `
        <h3>${escapeHtml(group.label)} <small>${group.source ? `${escapeHtml(group.source)} · ` : ''}${group.assets.length}</small></h3>
        <ul>
          ${group.assets.map(asset => `
            <li>
              <figure>
                <img src="${escapeHtml(asset.path)}" alt="" loading="lazy" decoding="async">
                <figcaption title="${escapeHtml(asset.path)}">${escapeHtml(asset.name)}</figcaption>
              </figure>
            </li>
          `).join('')}
        </ul>
      `).join('')}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
