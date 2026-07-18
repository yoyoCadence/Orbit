export const ORBIT_WINDOW_LOGICAL_SIZE = Object.freeze({ width: 960, height: 640 });

const ASSET_ROOT = 'assets/personal-space/idle-window';

export const WORKSPACE_V2_ASSETS = Object.freeze({
  id: 'building-formal-workstation-v1',
  // Reused legacy 16:9 artwork is intentionally a fallback proof. The V2
  // runtime cover-crops it into the canonical 3:2 viewport without distortion;
  // it must not be mistaken for the final authored V2 scene pack.
  status: 'fallback-proof',
  canonicalCameraId: 'building-workspace-center-v1',
  background: `${ASSET_ROOT}/backgrounds/office-angle-center-v2.png`,
  protagonist: `${ASSET_ROOT}/characters/building-protagonist-idle/building-protagonist-idle-1.png`,
  safeZone: Object.freeze({ minX: 10, maxX: 90, minY: 11, maxY: 89 }),
  companion: Object.freeze({ kind: 'orbit-guide', color: 0x8bd5ff, accent: 0xf6d58b }),
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

export function getWorkspaceProjectPhase(progress = 0) {
  const normalized = clampProgress(progress);
  return [...WORKSPACE_PROJECT_PHASES].reverse().find(entry => normalized >= entry.progress)
    || WORKSPACE_PROJECT_PHASES[0];
}

export function getWorkspaceSceneAssets(progress = 0, placementOverrides = {}) {
  const normalized = clampProgress(progress);
  return {
    ...WORKSPACE_V2_ASSETS,
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
    protagonistPlacement: normalizePlacementOverride(placementOverrides.protagonist, {
      x: normalized >= 25 ? 58 : 51,
      y: 87,
      width: 14,
      z: 40,
    }),
    companionPlacement: normalizePlacementOverride(placementOverrides.companion, {
      x: normalized >= 75 ? 69 : 73,
      y: 73,
      width: 7,
      z: 42,
    }),
  };
}

function prop(id, filename, minProgress, placement, maxProgress = 100) {
  return Object.freeze({
    id,
    path: `${ASSET_ROOT}/props/${filename}`,
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
    if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseFloat(raw);
      result[key] = Number.isFinite(parsed) ? parsed : raw.trim();
    }
    return result;
  }, { ...fallback });
}

function clampProgress(value) {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(value) || 0;
  return Math.max(0, Math.min(100, numeric));
}
