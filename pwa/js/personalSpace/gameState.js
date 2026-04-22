import { readJSON, writeJSON } from '../platform/storageBridge.js';

const KEY = 'personal-space-state';

export function createDefaultPersonalSpaceState() {
  return {
    version: 1,
    spentGold: 0,
    ownedItems: [],
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

function normalizePersonalSpaceState(value) {
  const defaults = createDefaultPersonalSpaceState();
  const raw = value && typeof value === 'object' ? value : {};

  return {
    ...defaults,
    ...raw,
    spentGold: Number.isFinite(raw.spentGold) ? Math.max(0, raw.spentGold) : defaults.spentGold,
    ownedItems: normalizeOwnedItems(raw.ownedItems),
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
