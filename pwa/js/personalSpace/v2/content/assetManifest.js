export const ORBIT_WINDOW_LOGICAL_SIZE = Object.freeze({ width: 960, height: 640 });

const ASSET_ROOT = 'assets/personal-space/v2';
// PS-244: room and props are rendered by art-pipeline/ps244-blender from one
// camera; placements below come from its placements.json (test-enforced).
const PROP_ROOT = `${ASSET_ROOT}/workspace/props`;
const PROTAGONIST_ROOT = `${ASSET_ROOT}/characters/protagonist`;
const COMPANION_ROOT = `${ASSET_ROOT}/characters/companion`;
const EFFECTS_ROOT = `${ASSET_ROOT}/effects`;
const CANONICAL_CAMERA_ID = 'building-workspace-v2';

const PROTAGONIST_VARIANTS = Object.freeze({
  idle: facingPair('idle'),
  work: facingPair('work'),
  celebrate: facingPair('celebrate'),
  rest: facingPair('rest'),
  walk: facingPair('walk'),
  inspect: facingPair('inspect'),
});

const COMPANION_VARIANTS = Object.freeze({
  observe: `${COMPANION_ROOT}/orbit-guide-observe.png`,
  approach: `${COMPANION_ROOT}/orbit-guide-approach.png`,
  congratulate: `${COMPANION_ROOT}/orbit-guide-congratulate.png`,
  rest: `${COMPANION_ROOT}/orbit-guide-rest.png`,
  work: `${COMPANION_ROOT}/orbit-guide-work.png`,
  remind: `${COMPANION_ROOT}/orbit-guide-remind.png`,
});

const WEATHER_VARIANTS = Object.freeze({
  clear: `${EFFECTS_ROOT}/weather-building-clear-motes.png`,
  rain: `${EFFECTS_ROOT}/weather-building-rain.png`,
});

export const WORKSPACE_VISUAL_STATES = Object.freeze({
  protagonist: Object.freeze(Object.keys(PROTAGONIST_VARIANTS)),
  facings: Object.freeze(['left', 'right']),
  companion: Object.freeze([...Object.keys(COMPANION_VARIANTS), 'idle']),
  weather: Object.freeze(Object.keys(WEATHER_VARIANTS)),
});

export const WORKSPACE_V2_ASSETS = Object.freeze({
  id: 'building-formal-workstation-v2',
  status: 'production',
  canonicalCameraId: CANONICAL_CAMERA_ID,
  dimensions: Object.freeze({ width: 1536, height: 1024 }),
  background: `${ASSET_ROOT}/workspace/backgrounds/building-formal-workstation-room-v2.webp`,
  protagonist: PROTAGONIST_VARIANTS.idle.left,
  protagonistVariants: PROTAGONIST_VARIANTS,
  safeZone: Object.freeze({ minX: 10, maxX: 90, minY: 11, maxY: 89 }),
  companion: Object.freeze({
    kind: 'orbit-guide',
    color: 0x8bd5ff,
    accent: 0xf6d58b,
    path: COMPANION_VARIANTS.observe,
    variants: COMPANION_VARIANTS,
  }),
  weather: Object.freeze({
    state: 'clear',
    path: WEATHER_VARIANTS.clear,
    variants: WEATHER_VARIANTS,
  }),
});

const PROP_DEFINITIONS = Object.freeze([
  prop('corner-desk', 'office-corner-desk-v3/front.png', 25, { x: 42, y: 83, width: 33, z: 24 }),
  prop('office-chair', 'office-chair/prop.png', 25, { x: 38, y: 84, width: 9, z: 26 }),
  prop('office-shelf', 'office-shelf/prop.png', 50, { x: 72, y: 78, width: 13, z: 22 }),
  prop('desk-lamp', 'office-desk-lamp/prop.png', 50, { x: 32, y: 70, width: 7, z: 29 }),
  prop('planning-board', 'office-board/prop.png', 75, { x: 39, y: 43, width: 17, z: 10, anchor: 'center' }),
  prop('single-monitor', 'office-monitor-single/prop.png', 75, { x: 43, y: 70, width: 10, z: 28 }, 99),
  prop('dual-monitor', 'office-monitor-dual/prop.png', 100, { x: 44, y: 70, width: 15, z: 28 }),
  prop('office-plant', 'office-plant/prop.png', 100, { x: 82, y: 84, width: 10, z: 23 }),
]);

export const WORKSPACE_PROJECT_PHASES = Object.freeze([
  phase(0, '空白工作角', '完成一次 Main Quest，建立基本書桌。'),
  phase(25, '基本書桌', '再完成一次 Main Quest，加入燈具與收納。'),
  phase(50, '燈具與收納', '再完成一次 Main Quest，加入螢幕與工作板。'),
  phase(75, '單螢幕工作站', '再完成一次 Main Quest，完成正式工作站。'),
  phase(100, '雙螢幕正式工作站', 'Workspace Upgrade 已完成。'),
]);

// The two images the fallback-proof scene paints before any prop loads.
export const WORKSPACE_INITIAL_PAINT_ASSETS = Object.freeze([
  WORKSPACE_V2_ASSETS.background,
  WORKSPACE_V2_ASSETS.protagonist,
  WORKSPACE_V2_ASSETS.companion.path,
  WORKSPACE_V2_ASSETS.weather.path,
]);

// Deterministic, de-duplicated list of every authored image the production
// workspace can resolve. The runtime still loads only the active state bundle;
// PS-243 derives its complete-scene evidence from this same contract.
export function getWorkspaceAssetManifestPaths() {
  return Object.freeze([...new Set([
    ...WORKSPACE_INITIAL_PAINT_ASSETS,
    ...Object.values(PROTAGONIST_VARIANTS).flatMap(Object.values),
    ...Object.values(COMPANION_VARIANTS),
    ...Object.values(WEATHER_VARIANTS),
    ...PROP_DEFINITIONS.map(entry => entry.path),
  ])]);
}

export function resolveWorkspaceVisualState(visualState = {}) {
  const protagonistInput = visualState.protagonist && typeof visualState.protagonist === 'object'
    ? visualState.protagonist
    : {};
  const protagonistState = normalizeKey(
    protagonistInput.state || visualState.playerState,
    PROTAGONIST_VARIANTS,
    'idle',
  );
  const protagonistFacing = normalizeFacing(
    protagonistInput.facing || protagonistInput.direction || visualState.protagonistFacing,
  );
  const companionInput = visualState.companion && typeof visualState.companion === 'object'
    ? visualState.companion
    : {};
  const requestedCompanionState = companionInput.state || visualState.companionState;
  const companionState = requestedCompanionState === 'idle'
    ? 'observe'
    : normalizeKey(requestedCompanionState, COMPANION_VARIANTS, 'observe');
  const weatherState = normalizeKey(visualState.weather, WEATHER_VARIANTS, 'clear');

  return {
    protagonist: Object.freeze({
      state: protagonistState,
      facing: protagonistFacing,
      path: PROTAGONIST_VARIANTS[protagonistState][protagonistFacing],
    }),
    companion: Object.freeze({
      state: companionState,
      path: COMPANION_VARIANTS[companionState],
    }),
    weather: Object.freeze({
      state: weatherState,
      path: WEATHER_VARIANTS[weatherState],
    }),
  };
}

export function getWorkspaceProjectPhase(progress = 0) {
  const normalized = clampProgress(progress);
  return [...WORKSPACE_PROJECT_PHASES].reverse().find(entry => normalized >= entry.progress)
    || WORKSPACE_PROJECT_PHASES[0];
}

export function getWorkspaceSceneAssets(progress = 0, placementOverrides = {}, visualState = {}) {
  const normalized = clampProgress(progress);
  const resolvedVisuals = resolveWorkspaceVisualState(visualState);
  return {
    ...WORKSPACE_V2_ASSETS,
    protagonist: resolvedVisuals.protagonist.path,
    protagonistVariant: resolvedVisuals.protagonist,
    companion: {
      ...WORKSPACE_V2_ASSETS.companion,
      ...resolvedVisuals.companion,
    },
    weatherOverlay: resolvedVisuals.weather.path,
    weatherVariant: resolvedVisuals.weather,
    phase: getWorkspaceProjectPhase(normalized),
    props: PROP_DEFINITIONS
      .filter(entry => normalized >= entry.minProgress && normalized <= entry.maxProgress)
      .map(entry => ({
        ...entry,
        placement: {
          ...entry.placement,
          ...normalizePlacementOverride(placementOverrides[entry.id]),
        },
      })),
    // PS-244: sized so the chibi sprite matches a 1.7 m figure in the Blender camera.
    protagonistPlacement: normalizePlacementOverride(placementOverrides.protagonist, {
      x: normalized >= 25 ? 58 : 51,
      y: 87,
      width: 24,
      z: 40,
    }),
    companionPlacement: normalizePlacementOverride(placementOverrides.companion, {
      x: normalized >= 75 ? 69 : 73,
      y: 73,
      width: 13,
      z: 42,
      anchor: 'center',
    }),
  };
}

function facingPair(action) {
  return Object.freeze({
    left: `${PROTAGONIST_ROOT}/player-default-${action}-left.png`,
    right: `${PROTAGONIST_ROOT}/player-default-${action}-right.png`,
  });
}

function normalizeKey(value, variants, fallback) {
  return typeof value === 'string' && Object.hasOwn(variants, value) ? value : fallback;
}

function normalizeFacing(value) {
  return value === 'right' ? 'right' : 'left';
}

function prop(id, minProgress, placement, maxProgress = 100) {
  return Object.freeze({
    id,
    path: `${PROP_ROOT}/${id}.png`,
    minProgress,
    maxProgress,
    placement: Object.freeze({ anchor: 'center-bottom', ...placement }),
  });
}

function phase(progress, label, nextRequirement) {
  return Object.freeze({ progress, label, nextRequirement });
}

function normalizePlacementOverride(value, fallback = {}) {
  if (!value || typeof value !== 'object') return { ...fallback };
  return ['x', 'y', 'width', 'z', 'scale', 'rotation', 'anchor'].reduce((result, key) => {
    const raw = value[key];
    if (key === 'anchor') {
      if (raw === 'center' || raw === 'center-bottom') result[key] = raw;
      return result;
    }
    const parsed = typeof raw === 'number' ? raw : Number.parseFloat(raw);
    if (Number.isFinite(parsed)) result[key] = parsed;
    return result;
  }, { ...fallback });
}

function clampProgress(value) {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(value) || 0;
  return Math.max(0, Math.min(100, numeric));
}
