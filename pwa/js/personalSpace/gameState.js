import { readJSON, writeJSON } from '../platform/storageBridge.js';

const KEY = 'personal-space-state';

export function createDefaultPersonalSpaceState() {
  return {
    version: 1,
    spentGold: 0,
    ownedItems: [],
    placedItems: [],
    selectedSceneId: 'rough-room',
    selectedThemeId: 'default',
    companionRelationshipStage: 'stranger-observer',
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
  const stringFields = ['x', 'y', 'width', 'height', 'anchor'];
  stringFields.forEach(field => {
    if (typeof value[field] === 'string' && value[field].trim()) {
      normalized[field] = value[field].trim();
    }
  });

  if (Number.isFinite(value.z)) normalized.z = value.z;
  if (Number.isFinite(value.scale)) normalized.scale = value.scale;

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

function normalizePersonalSpaceState(value) {
  const defaults = createDefaultPersonalSpaceState();
  const raw = value && typeof value === 'object' ? value : {};

  return {
    ...defaults,
    ...raw,
    spentGold: Number.isFinite(raw.spentGold) ? Math.max(0, raw.spentGold) : defaults.spentGold,
    ownedItems: normalizeOwnedItems(raw.ownedItems),
    placedItems: normalizePlacedItems(raw.placedItems),
    hiddenStats: {
      ...defaults.hiddenStats,
      ...(raw.hiddenStats && typeof raw.hiddenStats === 'object' ? raw.hiddenStats : {}),
    },
  };
}

export function loadPersonalSpaceState() {
  return normalizePersonalSpaceState(readJSON(KEY, null));
}

export function savePersonalSpaceState(nextState) {
  const merged = normalizePersonalSpaceState(nextState);
  writeJSON(KEY, merged);
  return merged;
}
