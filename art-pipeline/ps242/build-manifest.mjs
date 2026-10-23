import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getWorkspaceAssetManifestPaths,
  WORKSPACE_V2_ASSETS,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
export const OUTPUT_PATH = join(REPO_ROOT, 'pwa', 'assets', 'personal-space', 'v2', 'manifest.json');

const CAMERA_ID = WORKSPACE_V2_ASSETS.canonicalCameraId;
const GENERATED_LICENSE = 'art-pipeline/ps242/model-manifest.json#openai-built-in-imagegen';

// PS-244: the room and every Workspace Upgrade prop are rendered by the
// procedural Blender pipeline from one camera. Characters and weather remain
// PS-242 generated art and were re-checked against the new camera.
const BLENDER_LICENSE = 'art-pipeline/ps244-blender/model-manifest.json#orbit-blender-procedural-workstation';
const BLENDER_SOURCE = 'art-pipeline/ps244-blender/scene.py';
// PS-250B: the default characters are the PS-250C Blender Q-style ones.
const CHARACTER_LICENSE = 'art-pipeline/ps250-characters/model-manifest.json#orbit-blender-procedural-characters';
const PROP_ROOT = 'assets/personal-space/v2/workspace/props';
const PROP_METADATA = Object.freeze({
  [`${PROP_ROOT}/corner-desk.png`]: { id: 'corner-desk', label: 'Corner desk', projectPhase: 25 },
  [`${PROP_ROOT}/office-chair.png`]: { id: 'office-chair', label: 'Office chair', projectPhase: 25 },
  [`${PROP_ROOT}/office-shelf.png`]: { id: 'office-shelf', label: 'Office shelf', projectPhase: 50 },
  [`${PROP_ROOT}/desk-lamp.png`]: { id: 'desk-lamp', label: 'Desk lamp', projectPhase: 50 },
  [`${PROP_ROOT}/planning-board.png`]: { id: 'planning-board', label: 'Planning board', projectPhase: 75 },
  [`${PROP_ROOT}/single-monitor.png`]: { id: 'single-monitor', label: 'Single monitor', projectPhase: 75 },
  [`${PROP_ROOT}/dual-monitor.png`]: { id: 'dual-monitor', label: 'Dual monitor', projectPhase: 100 },
  [`${PROP_ROOT}/office-plant.png`]: { id: 'office-plant', label: 'Office plant', projectPhase: 100 },
});
// PS-250F: the default room's decorations, rendered by the same scene; each
// is shown from its support's phase (the floor ones from the start).
const DECOR_ROOT = 'assets/personal-space/v2/workspace/decor';
const DECOR_METADATA = Object.freeze({
  [`${DECOR_ROOT}/deco-trophy.png`]: { id: 'deco-trophy', label: 'Trophy', projectPhase: 50 },
  [`${DECOR_ROOT}/deco-globe.png`]: { id: 'deco-globe', label: 'Globe', projectPhase: 50 },
  [`${DECOR_ROOT}/deco-beanbag.png`]: { id: 'deco-beanbag', label: 'Beanbag', projectPhase: 0 },
  [`${DECOR_ROOT}/deco-floor-lamp.png`]: { id: 'deco-floor-lamp', label: 'Floor lamp', projectPhase: 0 },
  [`${DECOR_ROOT}/deco-succulent.png`]: { id: 'deco-succulent', label: 'Succulent', projectPhase: 25 },
  [`${DECOR_ROOT}/deco-coffee.png`]: { id: 'deco-coffee', label: 'Coffee set', projectPhase: 25 },
});

export function buildPs242AssetManifest() {
  const outputs = getWorkspaceAssetManifestPaths().map(buildOutputEntry);
  return {
    schemaVersion: 1,
    taskId: 'PS-244',
    status: 'production',
    reviewedAt: '2026-10-18',
    scene: {
      id: WORKSPACE_V2_ASSETS.id,
      canonicalCameraId: CAMERA_ID,
      dimensions: WORKSPACE_V2_ASSETS.dimensions,
      logicalDimensions: { width: 960, height: 640 },
      safeZone: WORKSPACE_V2_ASSETS.safeZone,
    },
    provenance: {
      environment: {
        modelManifest: 'art-pipeline/ps244-blender/model-manifest.json',
        source: BLENDER_SOURCE,
        placements: 'art-pipeline/ps244-blender/placements.json',
        previews: 'art-pipeline/ps244-blender/previews/',
        review: 'Shared-camera renders by day and by night (PS-250E1: own trim box per night prop), shadow-catcher contact shadows, trimmed placements, and per-phase composites with the protagonist and Companion.',
      },
      characters: {
        modelManifest: 'art-pipeline/ps250-characters/model-manifest.json',
        outputs: 'art-pipeline/ps250-characters/outputs.json',
        previews: 'art-pipeline/ps250-characters/previews/',
        review: 'PS-250B default characters: shared-camera Q-style renders, ground point and canvas matching the PS-242 sprites, edge-clipping check, contact sheets and a room composite. The PS-242 pixel characters stay selectable as the pixel style.',
      },
      decorations: {
        source: BLENDER_SOURCE,
        placements: 'art-pipeline/ps250-decor/placements.json',
        outputs: 'art-pipeline/ps250-decor/outputs.json',
        previews: 'art-pipeline/ps250-decor/previews/',
        review: 'PS-250F decorations: shared-camera renders by day and by night with their support as a shadow catcher, trimmed like the props, and per-phase composites over the committed room.',
      },
      modelManifest: 'art-pipeline/ps242/model-manifest.json',
      prompts: 'art-pipeline/ps242/prompts/',
      rawSources: 'art-pipeline/ps242/raw/',
      processedSources: 'art-pipeline/ps242/processed/',
      review: 'Automated alpha/edge/hash/budget checks plus 100%, card-size, light, and dark visual inspection.',
    },
    outputs,
  };
}

function buildOutputEntry(path) {
  const absolutePath = join(REPO_ROOT, 'pwa', ...path.split('/'));
  const buffer = readFileSync(absolutePath);
  const image = readImageMetadata(buffer);
  const shared = {
    path,
    dimensions: image.dimensions,
    format: image.format,
    alpha: image.alpha,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    canonicalCameraId: CAMERA_ID,
    status: 'production',
  };

  // PS-250E1: the room and props also have a night render (-night).
  const night = /-night\.(png|webp)$/.test(path);
  if (path.includes('/workspace/backgrounds/')) {
    return {
      id: `building-formal-workstation-room${night ? '-night' : ''}`,
      label: `Building Formal Workstation room${night ? ' (night)' : ''}`,
      role: 'background',
      lighting: night ? 'night' : 'day',
      projectPhase: 'all',
      source: BLENDER_SOURCE,
      qc: 'passed: authored-3:2, shared-camera, backdrop-composite, visual, WebP-budget',
      licenseRef: BLENDER_LICENSE,
      ...shared,
    };
  }

  // PS-251B: the morning and evening views outside the window.
  const exterior = path.match(/workspace\/window\/exterior-(morning|evening)\.webp$/);
  if (exterior) {
    const band = exterior[1];
    return {
      id: `building-formal-workstation-exterior-${band}`,
      label: `Building Formal Workstation window view (${band})`,
      role: 'exterior',
      band,
      projectPhase: 'all',
      source: 'art-pipeline/ps251-window/render_window.py',
      qc: 'passed: shared-camera, window-only-alpha, same-alpha-every-room-style, visual',
      licenseRef: BLENDER_LICENSE,
      ...shared,
    };
  }

  const toonProtagonist = path.match(/characters\/toon\/protagonist\/([a-z]+)-([a-z]+)-(left|right)\.webp$/);
  if (toonProtagonist) {
    const [, character, state, facing] = toonProtagonist;
    return {
      id: `toon-${character}-${state}-${facing}`,
      label: `Q-style ${character} ${state} ${facing}`,
      role: 'protagonist-action',
      projectPhase: 'all',
      state,
      facing,
      source: 'art-pipeline/ps250-characters/protagonists.py',
      qc: 'passed: shared-camera, ground-point, no-edge-touch, contact-shadow, visual',
      licenseRef: CHARACTER_LICENSE,
      ...shared,
    };
  }

  const toonCompanion = path.match(/characters\/toon\/companion\/([a-z]+)-([a-z]+)\.webp$/);
  if (toonCompanion) {
    const [, character, state] = toonCompanion;
    return {
      id: `toon-${character}-${state}`,
      label: `Q-style ${character} ${state}`,
      role: 'companion-action',
      projectPhase: 'all',
      state,
      source: 'art-pipeline/ps250-characters/companions.py',
      qc: 'passed: shared-camera, centred, no-edge-touch, supportive-expression, visual',
      licenseRef: CHARACTER_LICENSE,
      ...shared,
    };
  }

  const protagonist = path.match(/player-default-([a-z]+)-(left|right)\.png$/);
  if (protagonist) {
    const [, state, facing] = protagonist;
    return {
      id: `player-default-${state}-${facing}`,
      label: `Default player ${state} ${facing}`,
      role: 'protagonist-action',
      projectPhase: 'all',
      state,
      facing,
      source: 'art-pipeline/ps242/processed/protagonist-final/sheet-transparent.png',
      qc: 'passed: shared-scale, feet-anchor, no-edge-touch, alpha-despill, visual',
      licenseRef: GENERATED_LICENSE,
      ...shared,
    };
  }

  const companion = path.match(/orbit-guide-([a-z]+)\.png$/);
  if (companion) {
    const state = companion[1];
    return {
      id: `orbit-guide-${state}`,
      label: `Orbit Guide ${state}`,
      role: 'companion-action',
      projectPhase: 'all',
      state,
      source: 'art-pipeline/ps242/processed/companion-state-pack/sheet-transparent.png',
      qc: 'passed: shared-scale, no-edge-touch, alpha-despill, supportive-expression, visual',
      licenseRef: GENERATED_LICENSE,
      ...shared,
    };
  }

  const weather = path.match(/weather-building-(clear-motes|rain)\.png$/);
  if (weather) {
    const state = weather[1] === 'rain' ? 'rain' : 'clear';
    return {
      id: `weather-building-${weather[1]}`,
      label: state === 'rain' ? 'Building rain' : 'Building clear motes',
      role: 'weather-effect',
      projectPhase: 'all',
      state,
      source: `art-pipeline/ps242/processed/weather-building-${weather[1]}-transparent.png`,
      qc: 'passed: transparent-corners, zero-visible-chroma, sparse-safe-zone, visual, size-budget',
      licenseRef: GENERATED_LICENSE,
      ...shared,
    };
  }

  const dayPath = night ? path.replace(/-night\.png$/, '.png') : path;
  const decoration = Object.hasOwn(DECOR_METADATA, dayPath);
  const dayProp = decoration ? DECOR_METADATA[dayPath] : PROP_METADATA[dayPath];
  if (!dayProp) throw new Error(`PS-242 manifest metadata missing for ${path}`);
  const prop = night
    ? { ...dayProp, id: `${dayProp.id}-night`, label: `${dayProp.label} (night)` }
    : dayProp;
  return {
    ...prop,
    role: decoration ? 'decoration' : 'project-prop',
    lighting: night ? 'night' : 'day',
    source: BLENDER_SOURCE,
    qc: 'passed: shared-camera, contact-shadow-catcher, trimmed-placement, phase-composite, visual',
    licenseRef: BLENDER_LICENSE,
    ...shared,
  };
}

function readImageMetadata(buffer) {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') === pngSignature) {
    const colorType = buffer[25];
    return {
      format: 'png',
      dimensions: { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) },
      alpha: colorType === 4 || colorType === 6,
    };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return readWebpMetadata(buffer);
  }
  throw new Error('Unsupported PS-242 runtime image format');
}

function readWebpMetadata(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X') {
      return {
        format: 'webp',
        dimensions: {
          width: 1 + buffer.readUIntLE(data + 4, 3),
          height: 1 + buffer.readUIntLE(data + 7, 3),
        },
        alpha: Boolean(buffer[data] & 0x10),
      };
    }
    if (type === 'VP8 ') {
      return {
        format: 'webp',
        dimensions: {
          width: buffer.readUInt16LE(data + 6) & 0x3fff,
          height: buffer.readUInt16LE(data + 8) & 0x3fff,
        },
        alpha: false,
      };
    }
    offset = data + length + (length % 2);
  }
  throw new Error('Unsupported WebP chunk layout');
}

export function serializePs242AssetManifest() {
  return `${JSON.stringify(buildPs242AssetManifest(), null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const serialized = serializePs242AssetManifest();
  if (process.argv.includes('--check')) {
    const committed = readFileSync(OUTPUT_PATH, 'utf8').replace(/\r\n/g, '\n');
    if (committed !== serialized) {
      console.error('PS-242 production asset manifest is stale. Run `npm run ps242:manifest`.');
      process.exitCode = 1;
    } else {
      console.log('PS-242 production asset manifest is current.');
    }
  } else {
    writeFileSync(OUTPUT_PATH, serialized);
    console.log(`Wrote ${OUTPUT_PATH}`);
  }
}
