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

export function loadPersonalSpaceState() {
  return readJSON(KEY, createDefaultPersonalSpaceState());
}

export function savePersonalSpaceState(nextState) {
  const merged = {
    ...createDefaultPersonalSpaceState(),
    ...nextState,
  };
  writeJSON(KEY, merged);
  return merged;
}
