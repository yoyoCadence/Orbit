import {
  PERSONAL_SPACE_V2_REWARD_EPOCH,
  PERSONAL_SPACE_V2_RULESET_ID,
  PERSONAL_SPACE_V2_STATE_VERSION,
} from './config.js';
import {
  createDefaultPersonalSpaceV2State,
  normalizePersonalSpaceV2State,
} from './stateSchema.js';

function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function copyObjectArray(value) {
  return Array.isArray(value)
    ? value.filter(entry => entry && typeof entry === 'object').map(entry => ({ ...entry }))
    : [];
}

export function isPersonalSpaceV2State(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.version === PERSONAL_SPACE_V2_STATE_VERSION
    && value.rulesetId === PERSONAL_SPACE_V2_RULESET_ID
  );
}

export function migratePersonalSpaceStateV1ToV2(legacyState, options = {}) {
  const ownerId = options.ownerId ?? legacyState?.ownerId;

  if (isPersonalSpaceV2State(legacyState)) {
    return normalizePersonalSpaceV2State(legacyState, { ownerId });
  }

  const legacySource = legacyState && typeof legacyState === 'object' && !Array.isArray(legacyState)
    ? legacyState
    : {};
  const claimLegacy = options.claimLegacy !== false;
  const legacy = claimLegacy ? legacySource : {};
  const openingGold = nonNegative(options.openingGold);
  const defaults = createDefaultPersonalSpaceV2State(ownerId, { openingGold });

  return normalizePersonalSpaceV2State({
    ...defaults,
    migration: {
      source: claimLegacy ? 'personal-space-state' : 'empty',
      sourceVersion: claimLegacy
        ? (Number.isInteger(legacy.version) && legacy.version > 0 ? legacy.version : 1)
        : null,
      migratedAt: PERSONAL_SPACE_V2_REWARD_EPOCH,
      provisional: options.provisionalMigration === true,
    },
    economy: {
      ...defaults.economy,
      legacySpentGold: nonNegative(legacy.spentGold),
    },
    inventory: {
      ownedItems: Array.isArray(legacy.ownedItems) ? [...legacy.ownedItems] : [],
    },
    world: {
      selectedSceneId: legacy.selectedSceneId,
      memoryViewSceneId: legacy.memoryViewSceneId,
      selectedThemeId: legacy.selectedThemeId,
      placedItems: copyObjectArray(legacy.placedItems),
      idleWindowLayouts: legacy.idleWindowLayouts,
      memorySceneLog: legacy.memorySceneLog,
    },
    hiddenStats: legacy.hiddenStats,
    companion: {
      relationshipStage: legacy.companionRelationshipStage,
    },
  }, { ownerId, openingGold });
}
