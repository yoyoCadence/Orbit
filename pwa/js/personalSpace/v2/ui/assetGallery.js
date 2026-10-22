/**
 * PS-250A: a developer-only overview of every Personal Space V2 asset, so new
 * Blender renders can be checked in the app without reaching the state that
 * shows them. The developer panel in Settings turns it on; the 空間 page then
 * lists each asset under its group.
 *
 * It only reads existing exports of the asset manifest: a new export imported
 * across SHELL modules can fail to link while an older copy is cached
 * (INFRA-105). Characters outside the default come from characterCatalog.js
 * (Q style, PS-250C); the pixel style is resolved through the scene for every
 * option the Edit Mode picker offers (PS-250B, PS-250D), by day and by night
 * (PS-250E1).
 */
import { FLAG_DEV_PANEL } from '../../../flags.js';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
  WORKSPACE_VISUAL_STATES,
} from '../content/assetManifest.js';
import { getToonCharacterPaths } from '../content/characterCatalog.js';
import { APPEARANCE_STYLES } from './appearancePicker.js';

export const ASSET_GALLERY_FLAG = 'orbit_dev_asset_gallery';

const ASSET_ROOT = 'assets/personal-space/v2/';

// Folder → group, in the order the gallery shows them.
const ASSET_GROUPS = Object.freeze([
  { folder: 'workspace/backgrounds', label: '場景・房間', source: 'Blender（PS-244～PS-245；夜晚 PS-250E1）' },
  { folder: 'workspace/props', label: '家具', source: 'Blender（PS-244～PS-247；夜晚 PS-250E1）' },
  { folder: 'characters/toon/protagonist', label: 'Q 版主角', source: 'Blender（PS-250C）' },
  { folder: 'characters/toon/companion', label: 'Q 版 AI 夥伴', source: 'Blender（PS-250C）' },
  { folder: 'workspace/pixel/backgrounds', label: '像素場景・房間', source: 'Blender 像素渲染（PS-250D；夜晚 PS-250E1）' },
  { folder: 'workspace/pixel/props', label: '像素家具', source: 'Blender 像素渲染（PS-250D；夜晚 PS-250E1）' },
  { folder: 'characters/pixel/protagonist', label: '像素主角', source: '由 Q 版縮小（PS-250D）' },
  { folder: 'characters/pixel/companion', label: '像素 AI 夥伴', source: '由 Q 版縮小（PS-250D）' },
  { folder: 'characters/protagonist', label: '經典像素主角', source: '影像生成（PS-242）' },
  { folder: 'characters/companion', label: '經典像素 AI 夥伴', source: '影像生成（PS-242）' },
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

// The pixel style is not the default, so the manifest list leaves it out:
// resolve every option the picker offers, in every state and project phase,
// through the scene the way the runtime does (PS-250B, PS-250D). A day and a
// night time band give the day and night rooms (PS-250E1).
function pixelStylePaths() {
  const { protagonist, facings, companion } = WORKSPACE_VISUAL_STATES;
  const pixel = APPEARANCE_STYLES.find(style => style.id === 'pixel');
  const resolve = (appearance, visual = {}, progress = 0, timeBand = 'day') => (
    getWorkspaceSceneAssets(progress, {}, { appearance, ...visual }, { timeBand })
  );
  return [
    ...['day', 'night'].flatMap(timeBand => WORKSPACE_PROJECT_PHASES.flatMap(({ progress }) => {
      const scene = resolve({ style: 'pixel' }, {}, progress, timeBand);
      return [scene.background, ...scene.props.map(entry => entry.path)];
    })),
    ...pixel.protagonists.flatMap(({ id }) => protagonist.flatMap(state => facings.map(facing => (
      resolve({ style: 'pixel', protagonistId: id }, { protagonist: { state, facing } }).protagonist
    )))),
    ...pixel.companions.flatMap(({ id }) => companion.map(state => (
      resolve({ style: 'pixel', companionId: id }, { companion: { state } }).companion.path
    ))),
  ];
}

function allAssetPaths() {
  return [...getWorkspaceAssetManifestPaths(), ...getToonCharacterPaths(), ...pixelStylePaths()];
}

/** Every asset once, grouped for the gallery; empty groups are left out. */
export function buildAssetCatalog(paths = allAssetPaths()) {
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
