import { readJSON, writeJSON } from '../platform/storageBridge.js';

const KEY = 'personal-space-state';

export function createDefaultPersonalSpaceState() {
  return {
    version: 1,
    spentGold: 0,
    ownedItems: [],
    placedItems: [],
    idleWindowLayouts: {},
    selectedSceneId: 'rough-room',
    memoryViewSceneId: null,  // set only when user explicitly navigates to a memory scene
    selectedThemeId: 'default',
    companionRelationshipStage: 'stranger-observer',
    memorySceneLog: {},  // { [sceneId]: { firstVisitedAt: ISO string | null } }
    hiddenStats: {
      discipline: 0,
      depth: 0,
      vitality: 0,
      order: 0,
      courage: 0,
      craft: 0,
    },
  };
}

function normalizeOwnedItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (typeof item === 'string') {
        return { id: item };
      }

      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        return null;
      }

      return {
        ...item,
        id: item.id.trim(),
      };
    })
    .filter(Boolean);
}

function normalizePlacement(value = {}) {
  if (!value || typeof value !== 'object') return null;

  const normalized = {};
  const stringFields = [
    'x',
    'y',
    'width',
    'height',
    'anchor',
    'variantId',
    'planeId',
    'parentItemId',
    'surfaceId',
  ];
  stringFields.forEach(field => {
    if (typeof value[field] === 'string' && value[field].trim()) {
      normalized[field] = value[field].trim();
    }
  });

  if (Number.isFinite(value.z)) normalized.z = value.z;
  if (Number.isFinite(value.scale)) normalized.scale = value.scale;
  if (Number.isFinite(value.rotation)) normalized.rotation = value.rotation;
  if (Number.isFinite(value.localX)) normalized.localX = Math.max(0, Math.min(1, value.localX));
  if (Number.isFinite(value.localY)) normalized.localY = Math.max(0, Math.min(1, value.localY));

  return Object.keys(normalized).length ? normalized : null;
}

function normalizePlacedItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;

      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : typeof item.layoutItemId === 'string' && item.layoutItemId.trim()
          ? item.layoutItemId.trim()
          : null;
      const sceneId = typeof item.sceneId === 'string' && item.sceneId.trim()
        ? item.sceneId.trim()
        : null;

      if (!id || !sceneId) return null;

      const normalized = {
        id,
        sceneId,
      };

      const optionalStrings = ['itemId', 'assetId', 'layoutItemId', 'kind', 'label'];
      optionalStrings.forEach(field => {
        if (typeof item[field] === 'string' && item[field].trim()) {
          normalized[field] = item[field].trim();
        }
      });

      if (typeof item.hidden === 'boolean') {
        normalized.hidden = item.hidden;
      }

      const placement = normalizePlacement(item.placement);
      if (placement) normalized.placement = placement;

      const shadow = normalizePlacement(item.shadow);
      if (shadow) normalized.shadow = shadow;

      return normalized;
    })
    .filter(Boolean);
}

function normalizeIdleWindowLayouts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((layouts, [layoutId, entry]) => {
    if (typeof layoutId !== 'string' || !layoutId.trim()) return layouts;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return layouts;

    const placements = entry.placements && typeof entry.placements === 'object' && !Array.isArray(entry.placements)
      ? Object.entries(entry.placements).reduce((result, [itemId, placement]) => {
          if (typeof itemId !== 'string' || !itemId.trim()) return result;
          const normalizedPlacement = normalizePlacement(placement);
          if (normalizedPlacement) result[itemId.trim()] = normalizedPlacement;
          return result;
        }, {})
      : {};

    layouts[layoutId.trim()] = {
      placements,
      cameraProfileId: typeof entry.cameraProfileId === 'string' && entry.cameraProfileId.trim()
        ? entry.cameraProfileId.trim()
        : undefined,
    };
    return layouts;
  }, {});
}

function normalizePersonalSpaceState(value) {
  const defaults = createDefaultPersonalSpaceState();
  const raw = value && typeof value === 'object' ? value : {};

  return {
    ...defaults,
    ...raw,
    spentGold: Number.isFinite(raw.spentGold) ? Math.max(0, raw.spentGold) : defaults.spentGold,
    ownedItems: normalizeOwnedItems(raw.ownedItems),
    placedItems: normalizePlacedItems(raw.placedItems),
    idleWindowLayouts: normalizeIdleWindowLayouts(raw.idleWindowLayouts),
    memoryViewSceneId: typeof raw.memoryViewSceneId === 'string' && raw.memoryViewSceneId.trim() ? raw.memoryViewSceneId.trim() : null,
    memorySceneLog: normalizeMemorySceneLog(raw.memorySceneLog),
    hiddenStats: {
      ...defaults.hiddenStats,
      ...(raw.hiddenStats && typeof raw.hiddenStats === 'object' ? raw.hiddenStats : {}),
    },
  };
}

function normalizeMemorySceneLog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result = {};
  for (const [sceneId, entry] of Object.entries(value)) {
    if (typeof sceneId !== 'string' || !sceneId.trim()) continue;
    result[sceneId.trim()] = {
      firstVisitedAt: typeof entry?.firstVisitedAt === 'string' ? entry.firstVisitedAt : null,
    };
  }
  return result;
}

export function loadPersonalSpaceState() {
  return normalizePersonalSpaceState(readJSON(KEY, null));
}

export function savePersonalSpaceState(nextState) {
  const merged = normalizePersonalSpaceState(nextState);
  writeJSON(KEY, merged);
  return merged;
}

// Records the first visit to a memory scene. Idempotent — does not overwrite existing entry.
export function recordMemorySceneVisit(sceneId) {
  const state = loadPersonalSpaceState();
  if (state.memorySceneLog[sceneId]?.firstVisitedAt) return state;

  return savePersonalSpaceState({
    ...state,
    memorySceneLog: {
      ...state.memorySceneLog,
      [sceneId]: { firstVisitedAt: new Date().toISOString() },
    },
  });
}
