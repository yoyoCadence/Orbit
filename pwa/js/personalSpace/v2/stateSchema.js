import {
  PERSONAL_SPACE_V2_REWARD_EPOCH,
  PERSONAL_SPACE_V2_RULESET_ID,
  PERSONAL_SPACE_V2_STATE_VERSION,
  normalizePersonalSpaceV2OwnerId,
} from './config.js';

const DEFAULT_HIDDEN_STATS = Object.freeze({
  discipline: 0,
  depth: 0,
  vitality: 0,
  order: 0,
  courage: 0,
  craft: 0,
});

const PERSONAL_SPACE_WEATHER = new Set(['clear', 'rain']);

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeOwnedItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (typeof item === 'string' && item.trim()) return { id: item.trim() };
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        return null;
      }
      return { ...item, id: item.id.trim() };
    })
    .filter(Boolean);
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeObjectArray(value) {
  return Array.isArray(value)
    ? value.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)).map(entry => ({ ...entry }))
    : [];
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createDefaultPersonalSpaceV2State(ownerId, options = {}) {
  const normalizedOwnerId = normalizePersonalSpaceV2OwnerId(ownerId);
  const openingGold = finiteNonNegative(options.openingGold);

  return {
    version: PERSONAL_SPACE_V2_STATE_VERSION,
    ownerId: normalizedOwnerId,
    rulesetId: PERSONAL_SPACE_V2_RULESET_ID,
    rewardEpoch: PERSONAL_SPACE_V2_REWARD_EPOCH,
    worldRevision: 0,
    weather: 'clear',
    migration: {
      source: null,
      sourceVersion: null,
      migratedAt: null,
      provisional: false,
    },
    economy: {
      openingGold,
      balanceGold: openingGold,
      earnedGold: 0,
      spentGold: 0,
      legacySpentGold: 0,
    },
    inventory: {
      ownedItems: [],
    },
    world: {
      selectedSceneId: 'rough-room',
      memoryViewSceneId: null,
      selectedThemeId: 'default',
      placedItems: [],
      idleWindowLayouts: {},
      memorySceneLog: {},
    },
    hiddenStats: { ...DEFAULT_HIDDEN_STATS },
    companion: {
      relationshipStage: 'stranger-observer',
    },
    activeProject: null,
    rewardLedger: [],
    rewardTombstones: [],
    pendingRewardReveals: [],
  };
}

export function normalizePersonalSpaceV2State(value, options = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ownerId = options.ownerId ?? raw.ownerId;
  const defaults = createDefaultPersonalSpaceV2State(ownerId, {
    openingGold: options.openingGold,
  });
  const rawEconomy = normalizeObject(raw.economy);
  const openingGold = finiteNonNegative(rawEconomy.openingGold, defaults.economy.openingGold);
  const rawInventory = normalizeObject(raw.inventory);
  const rawWorld = normalizeObject(raw.world);
  const rawMigration = normalizeObject(raw.migration);
  const rawCompanion = normalizeObject(raw.companion);

  return {
    ...raw,
    version: PERSONAL_SPACE_V2_STATE_VERSION,
    ownerId: defaults.ownerId,
    rulesetId: PERSONAL_SPACE_V2_RULESET_ID,
    rewardEpoch: PERSONAL_SPACE_V2_REWARD_EPOCH,
    worldRevision: finiteNonNegative(raw.worldRevision),
    weather: PERSONAL_SPACE_WEATHER.has(raw.weather) ? raw.weather : defaults.weather,
    migration: {
      source: normalizeNullableString(rawMigration.source),
      sourceVersion: Number.isInteger(rawMigration.sourceVersion) && rawMigration.sourceVersion > 0
        ? rawMigration.sourceVersion
        : null,
      migratedAt: normalizeNullableString(rawMigration.migratedAt),
      provisional: rawMigration.provisional === true,
    },
    economy: {
      ...rawEconomy,
      openingGold,
      balanceGold: finiteNonNegative(rawEconomy.balanceGold, openingGold),
      earnedGold: finiteNonNegative(rawEconomy.earnedGold),
      spentGold: finiteNonNegative(rawEconomy.spentGold),
      legacySpentGold: finiteNonNegative(rawEconomy.legacySpentGold),
    },
    inventory: {
      ...rawInventory,
      ownedItems: normalizeOwnedItems(rawInventory.ownedItems),
    },
    world: {
      ...rawWorld,
      selectedSceneId: normalizeNullableString(rawWorld.selectedSceneId) ?? defaults.world.selectedSceneId,
      memoryViewSceneId: normalizeNullableString(rawWorld.memoryViewSceneId),
      selectedThemeId: normalizeNullableString(rawWorld.selectedThemeId) ?? defaults.world.selectedThemeId,
      placedItems: normalizeObjectArray(rawWorld.placedItems),
      idleWindowLayouts: normalizeObject(rawWorld.idleWindowLayouts),
      memorySceneLog: normalizeObject(rawWorld.memorySceneLog),
    },
    hiddenStats: Object.keys(DEFAULT_HIDDEN_STATS).reduce((stats, stat) => {
      stats[stat] = finiteNonNegative(raw.hiddenStats?.[stat]);
      return stats;
    }, {}),
    companion: {
      ...rawCompanion,
      relationshipStage: normalizeNullableString(rawCompanion.relationshipStage)
        ?? defaults.companion.relationshipStage,
    },
    activeProject: raw.activeProject && typeof raw.activeProject === 'object' && !Array.isArray(raw.activeProject)
      ? { ...raw.activeProject }
      : null,
    rewardLedger: normalizeObjectArray(raw.rewardLedger),
    rewardTombstones: normalizeObjectArray(raw.rewardTombstones),
    pendingRewardReveals: normalizeObjectArray(raw.pendingRewardReveals),
  };
}
