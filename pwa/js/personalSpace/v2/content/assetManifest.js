export const ORBIT_WINDOW_LOGICAL_SIZE = Object.freeze({ width: 960, height: 640 });

const ASSET_ROOT = 'assets/personal-space/v2';
// PS-244: room and props are rendered by art-pipeline/ps244-blender from one
// camera; placements below come from its placements.json (test-enforced).
const PROP_ROOT = `${ASSET_ROOT}/workspace/props`;
const PROTAGONIST_ROOT = `${ASSET_ROOT}/characters/protagonist`;
const COMPANION_ROOT = `${ASSET_ROOT}/characters/companion`;
const TOON_ROOT = `${ASSET_ROOT}/characters/toon`;
const PIXEL_ROOT = `${ASSET_ROOT}/characters/pixel`;
const PIXEL_SCENE_ROOT = `${ASSET_ROOT}/workspace/pixel`;
const BACKGROUND = `${ASSET_ROOT}/workspace/backgrounds/building-formal-workstation-room-v2.webp`;
const NIGHT_BACKGROUND = `${ASSET_ROOT}/workspace/backgrounds/building-formal-workstation-room-v2-night.webp`;
const EFFECTS_ROOT = `${ASSET_ROOT}/effects`;
const CANONICAL_CAMERA_ID = 'building-workspace-v2';

const PROTAGONIST_STATES = Object.freeze(['idle', 'work', 'celebrate', 'rest', 'walk', 'inspect']);
const COMPANION_STATES = Object.freeze(['observe', 'approach', 'congratulate', 'rest', 'work', 'remind']);

// PS-250E1: the room and props have a night render (no sun, the sconces and
// lamps lit), used in the evening and at night (user decision, 2026-10-21).
// Callers pass the time band as its own option, not in visualState: the
// poster passes its whole model (which has timeBand) as visualState, so an
// older poster would show the night room under its full-strength night layer.
// The scene reports which lighting it returned; callers soften their night
// layer only for 'night', so a newer caller with this module's older version
// keeps today's look.
const NIGHT_TIME_BANDS = Object.freeze(['evening', 'night']);

// PS-250E2: room styles (user decision, 2026-10-21), chosen in Edit Mode and
// stored in world.selectedThemeId (an existing field older versions keep).
// The same camera, furniture shapes and lights; each style is its own render
// of the room and props under workspace/styles/<id>/ (pixel:
// workspace/pixel/styles/<id>/), by day and by night. Every style's props are
// cut to the default room's trim boxes, so they share PROP_DEFINITIONS.
// Callers pass the style as an option, like the time band; anything unknown
// (including legacy theme ids such as 'night') is the default room.
const ROOM_STYLE_IDS = Object.freeze(['default', 'nordic']);
const DEFAULT_ROOM_STYLE = 'default';

// PS-250B: two switchable styles; the first id of each list is that style's
// default. 'toon' (全 Q 版, the default style) uses the PS-250C Blender
// characters with the PS-244 room. 'pixel' (全像素, PS-250D) uses the pixel
// renders of the same room, props and characters (same ids), plus the PS-242
// pixel characters ('default', 'orbit-guide'). The ids mirror
// characterCatalog.js, which this module must not import: it is on the boot
// path (app.js → pixiSceneRuntime.js), and an older cache may not have that
// module (INFRA-105). ps250bAppearance and ps250dPixelSet tests keep them in sync.
const TOON_PROTAGONISTS = Object.freeze(['office', 'hoodie', 'sweater', 'sporty', 'scientist', 'artist']);
const TOON_COMPANIONS = Object.freeze(['orbit', 'catbot', 'owl', 'cube', 'jelly', 'fox']);
const CHARACTER_STYLES = Object.freeze({
  toon: Object.freeze({
    protagonists: TOON_PROTAGONISTS,
    companions: TOON_COMPANIONS,
    protagonistPath: (id, state, facing) => `${TOON_ROOT}/protagonist/${id}-${state}-${facing}.webp`,
    companionPath: (id, state) => `${TOON_ROOT}/companion/${id}-${state}.webp`,
    backgrounds: Object.freeze({ day: BACKGROUND, night: NIGHT_BACKGROUND }),
    propPath: (id, lighting) => `${PROP_ROOT}/${id}${lighting === 'night' ? '-night' : ''}.png`,
    // The PS-242 pixel characters are the office worker and Orbit, so a
    // choice of one of them carries over to the Q style as those two.
    aliases: Object.freeze({ default: 'office', 'orbit-guide': 'orbit' }),
  }),
  pixel: Object.freeze({
    protagonists: Object.freeze([...TOON_PROTAGONISTS, 'default']),
    companions: Object.freeze([...TOON_COMPANIONS, 'orbit-guide']),
    protagonistPath: (id, state, facing) => (id === 'default'
      ? `${PROTAGONIST_ROOT}/player-default-${state}-${facing}.png`
      : `${PIXEL_ROOT}/protagonist/${id}-${state}-${facing}.png`),
    companionPath: (id, state) => (id === 'orbit-guide'
      ? `${COMPANION_ROOT}/orbit-guide-${state}.png`
      : `${PIXEL_ROOT}/companion/${id}-${state}.png`),
    backgrounds: Object.freeze({
      day: `${PIXEL_SCENE_ROOT}/backgrounds/building-formal-workstation-room-pixel.png`,
      night: `${PIXEL_SCENE_ROOT}/backgrounds/building-formal-workstation-room-pixel-night.png`,
    }),
    propPath: (id, lighting) => `${PIXEL_SCENE_ROOT}/props/${id}${lighting === 'night' ? '-night' : ''}.png`,
  }),
});
const DEFAULT_STYLE = 'toon';

const PROTAGONIST_VARIANTS = protagonistVariants(resolveAppearance());
const COMPANION_VARIANTS = companionVariants(resolveAppearance());

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
  background: BACKGROUND,
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
  prop('corner-desk', 25, { x: 38.965, y: 66.309, width: 23.633, z: 24 },
    { x: 39.03, y: 72.07, width: 24.414 }),
  prop('office-chair', 25, { x: 40.299, y: 69.434, width: 6.25, z: 30 },
    { x: 41.569, y: 79.297, width: 10.352 }),
  prop('office-shelf', 50, { x: 69.466, y: 54.395, width: 34.766, z: 22 },
    { x: 75.26, y: 71.094, width: 48.307 }),
  prop('desk-lamp', 50, { x: 32.943, y: 47.754, width: 3.776, z: 29 },
    { x: 32.91, y: 47.754, width: 3.841 }),
  prop('planning-board', 75, { x: 39.193, y: 39.062, width: 14.193, z: 10 },
    { x: 39.16, y: 39.16, width: 14.258 }),
  prop('single-monitor', 75, { x: 40.755, y: 48.438, width: 7.031, z: 28 },
    { x: 40.918, y: 48.438, width: 7.227 }, 99),
  prop('dual-monitor', 100, { x: 40.495, y: 48.438, width: 12.891, z: 28 },
    { x: 40.495, y: 48.438, width: 12.891 }),
  prop('office-plant', 100, { x: 72.135, y: 64.746, width: 23.307, z: 23 },
    { x: 86.556, y: 68.164, width: 15.69 }),
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
// The same in the evening and at night (PS-250E1). For scripts and tests only.
export const WORKSPACE_NIGHT_INITIAL_PAINT_ASSETS = Object.freeze([
  NIGHT_BACKGROUND,
  ...WORKSPACE_INITIAL_PAINT_ASSETS.slice(1),
]);

// Deterministic, de-duplicated list of every image the default appearance can
// resolve (PS-250B: the toon office worker and Orbit), by day and by night
// (PS-250E1). The runtime still loads only the active state bundle; PS-243
// derives its complete-scene evidence from this same contract. Other styles
// and characters are downloaded when chosen.
export function getWorkspaceAssetManifestPaths() {
  const { propPath } = CHARACTER_STYLES[DEFAULT_STYLE];
  return Object.freeze([...new Set([
    ...WORKSPACE_INITIAL_PAINT_ASSETS,
    ...Object.values(PROTAGONIST_VARIANTS).flatMap(Object.values),
    ...Object.values(COMPANION_VARIANTS),
    ...Object.values(WEATHER_VARIANTS),
    ...PROP_DEFINITIONS.map(entry => entry.path),
    NIGHT_BACKGROUND,
    ...PROP_DEFINITIONS.map(entry => propPath(entry.id, 'night')),
  ])]);
}

export function resolveWorkspaceVisualState(visualState = {}) {
  const appearance = resolveAppearance(visualState.appearance);
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
  const style = CHARACTER_STYLES[appearance.style];

  return {
    appearance: Object.freeze(appearance),
    protagonist: Object.freeze({
      state: protagonistState,
      facing: protagonistFacing,
      path: style.protagonistPath(appearance.protagonistId, protagonistState, protagonistFacing),
    }),
    companion: Object.freeze({
      state: companionState,
      path: style.companionPath(appearance.companionId, companionState),
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

export function getWorkspaceSceneAssets(progress = 0, placementOverrides = {}, visualState = {}, options = {}) {
  const normalized = clampProgress(progress);
  const resolvedVisuals = resolveWorkspaceVisualState(visualState);
  const lighting = NIGHT_TIME_BANDS.includes(options?.timeBand) ? 'night' : 'day';
  const roomStyle = ROOM_STYLE_IDS.includes(options?.roomStyle) ? options.roomStyle : DEFAULT_ROOM_STYLE;
  const room = roomPaths(resolvedVisuals.appearance.style, roomStyle);
  return {
    ...WORKSPACE_V2_ASSETS,
    background: room.backgrounds[lighting],
    lighting,
    roomStyle,
    appearance: resolvedVisuals.appearance,
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
      .map(({ nightPlacement, ...entry }) => ({
        ...entry,
        path: room.propPath(entry.id, lighting),
        placement: lighting === 'night'
          ? movedLike(nightPlacement, entry.placement, placementOverrides[entry.id])
          : { ...entry.placement, ...normalizePositionOverride(placementOverrides[entry.id]) },
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

// PS-250B: { style, protagonistId, companionId }. Anything unknown falls back to
// the default style, or to the chosen style's first character, so a stored
// choice that no longer exists (or an older state without one) still draws.
function resolveAppearance(value) {
  const input = value && typeof value === 'object' ? value : {};
  const style = typeof input.style === 'string' && Object.hasOwn(CHARACTER_STYLES, input.style)
    ? input.style
    : DEFAULT_STYLE;
  const { protagonists, companions, aliases = {} } = CHARACTER_STYLES[style];
  const pick = (options, id) => {
    if (options.includes(id)) return id;
    const alias = typeof id === 'string' && Object.hasOwn(aliases, id) ? aliases[id] : null;
    return options.includes(alias) ? alias : options[0];
  };
  return {
    style,
    protagonistId: pick(protagonists, input.protagonistId),
    companionId: pick(companions, input.companionId),
  };
}

// The default room is the PS-244 render (PS-250D for pixel); the others have
// their own folder in each character style.
function roomPaths(characterStyle, roomStyle) {
  const style = CHARACTER_STYLES[characterStyle];
  if (roomStyle === DEFAULT_ROOM_STYLE) return style;
  const pixel = characterStyle === 'pixel';
  const root = `${ASSET_ROOT}/workspace/${pixel ? 'pixel/' : ''}styles/${roomStyle}`;
  const ext = pixel ? 'png' : 'webp';
  return {
    backgrounds: { day: `${root}/background.${ext}`, night: `${root}/background-night.${ext}` },
    propPath: (id, lighting) => `${root}/props/${id}${lighting === 'night' ? '-night' : ''}.png`,
  };
}

function protagonistVariants({ style, protagonistId }) {
  const { protagonistPath } = CHARACTER_STYLES[style];
  return Object.freeze(Object.fromEntries(PROTAGONIST_STATES.map(state => [state, Object.freeze({
    left: protagonistPath(protagonistId, state, 'left'),
    right: protagonistPath(protagonistId, state, 'right'),
  })])));
}

function companionVariants({ style, companionId }) {
  const { companionPath } = CHARACTER_STYLES[style];
  return Object.freeze(Object.fromEntries(COMPANION_STATES.map(state => [state, companionPath(companionId, state)])));
}

function normalizeKey(value, variants, fallback) {
  return typeof value === 'string' && Object.hasOwn(variants, value) ? value : fallback;
}

function normalizeFacing(value) {
  return value === 'right' ? 'right' : 'left';
}

// A prop's night sprite has its own trim box (its shadows fall another way),
// so it has its own x, y and width; it shares the day sprite's draw order.
function prop(id, minProgress, placement, nightPlacement, maxProgress = 100) {
  return Object.freeze({
    id,
    path: `${PROP_ROOT}/${id}.png`,
    minProgress,
    maxProgress,
    placement: Object.freeze({ anchor: 'center-bottom', ...placement }),
    nightPlacement: Object.freeze({ anchor: 'center-bottom', ...nightPlacement, z: placement.z }),
  });
}

function phase(progress, label, nextRequirement) {
  return Object.freeze({ progress, label, nextRequirement });
}

// Prop overrides move a prop; they never resize or re-anchor it. Each PS-244
// sprite's width and anchor come from its Blender render (shadow margin
// included), while migrated idle-window overrides carry the width and anchor of
// the old artwork. V2 Edit Mode itself only adjusts x and y.
function normalizePositionOverride(value) {
  const { x, y } = normalizePlacementOverride(value);
  return {
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
  };
}

// An override is where the user moved the day sprite. The night sprite moves
// by the same offset, so the furniture stays in place when the light changes.
function movedLike(nightPlacement, dayPlacement, override) {
  const moved = normalizePositionOverride(override);
  const result = { ...nightPlacement };
  for (const key of ['x', 'y']) {
    if (moved[key] !== undefined) {
      result[key] = Math.round((nightPlacement[key] + moved[key] - dayPlacement[key]) * 1000) / 1000;
    }
  }
  return result;
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
