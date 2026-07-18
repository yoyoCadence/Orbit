import { readJSON, writeJSON } from '../../platform/storageBridge.js';
import { loadPersonalSpaceState } from '../gameState.js';
import {
  PERSONAL_SPACE_V2_LEGACY_CLAIM_KEY,
  PERSONAL_SPACE_V2_REWARD_EPOCH,
  getPersonalSpaceV2StorageKey,
  normalizePersonalSpaceV2OwnerId,
} from './config.js';
import { migratePersonalSpaceStateV1ToV2 } from './migrateState.js';
import {
  createDefaultPersonalSpaceV2State,
  normalizePersonalSpaceV2State,
} from './stateSchema.js';

function readPersistedPersonalSpaceV2State(ownerId) {
  return readJSON(getPersonalSpaceV2StorageKey(ownerId), null);
}

export function getPersonalSpaceV2LegacyClaim() {
  const claim = readJSON(PERSONAL_SPACE_V2_LEGACY_CLAIM_KEY, null);
  if (!claim || typeof claim.ownerId !== 'string' || !claim.ownerId.trim()) return null;
  return {
    ownerId: claim.ownerId.trim(),
    claimedAt: claim.claimedAt || PERSONAL_SPACE_V2_REWARD_EPOCH,
  };
}

export function canOwnerClaimLegacyPersonalSpaceState(ownerId) {
  const normalizedOwnerId = normalizePersonalSpaceV2OwnerId(ownerId);
  const claim = getPersonalSpaceV2LegacyClaim();
  return !claim || claim.ownerId === normalizedOwnerId;
}

function claimLegacyPersonalSpaceState(ownerId) {
  const normalizedOwnerId = normalizePersonalSpaceV2OwnerId(ownerId);
  const existing = getPersonalSpaceV2LegacyClaim();
  if (existing?.ownerId === normalizedOwnerId) return existing;
  if (existing) return null;
  const claim = {
    ownerId: normalizedOwnerId,
    claimedAt: PERSONAL_SPACE_V2_REWARD_EPOCH,
  };
  if (!writeJSON(PERSONAL_SPACE_V2_LEGACY_CLAIM_KEY, claim)) {
    throw new Error(`Failed to claim legacy Personal Space state for owner "${normalizedOwnerId}"`);
  }
  return claim;
}

function persistPersonalSpaceV2State(ownerId, state) {
  const persisted = writeJSON(getPersonalSpaceV2StorageKey(ownerId), state);
  if (!persisted) {
    throw new Error(`Failed to persist Personal Space V2 state for owner "${ownerId}"`);
  }
  return state;
}

export function hasPersonalSpaceV2State(ownerId) {
  return readPersistedPersonalSpaceV2State(ownerId) !== null;
}

export function loadPersonalSpaceV2State(ownerId, options = {}) {
  const persisted = readPersistedPersonalSpaceV2State(ownerId);
  if (persisted === null) {
    return createDefaultPersonalSpaceV2State(ownerId, options);
  }

  return normalizePersonalSpaceV2State(persisted, { ...options, ownerId });
}

export class PersonalSpaceV2RevisionConflictError extends Error {
  constructor(expectedRevision, actualRevision) {
    super(`Personal Space V2 revision conflict: expected ${expectedRevision}, found ${actualRevision}`);
    this.name = 'PersonalSpaceV2RevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export function savePersonalSpaceV2State(ownerId, nextState, options = {}) {
  if (Number.isFinite(options.expectedRevision)) {
    const current = readPersistedPersonalSpaceV2State(ownerId);
    const actualRevision = current === null
      ? 0
      : normalizePersonalSpaceV2State(current, { ownerId }).worldRevision;
    if (actualRevision !== options.expectedRevision) {
      throw new PersonalSpaceV2RevisionConflictError(
        options.expectedRevision,
        actualRevision,
      );
    }
  }
  const normalized = normalizePersonalSpaceV2State(nextState, { ownerId });
  return persistPersonalSpaceV2State(ownerId, normalized);
}

export function loadOrMigratePersonalSpaceV2State({
  ownerId,
  openingGold = 0,
  legacyState,
  provisionalMigration = false,
} = {}) {
  const persisted = readPersistedPersonalSpaceV2State(ownerId);
  if (persisted !== null) {
    const normalized = normalizePersonalSpaceV2State(persisted, { ownerId });
    if (normalized.migration.source === 'personal-space-state') {
      claimLegacyPersonalSpaceState(ownerId);
    }
    return normalized;
  }

  const claimLegacy = canOwnerClaimLegacyPersonalSpaceState(ownerId);
  if (claimLegacy) claimLegacyPersonalSpaceState(ownerId);
  const migrated = migratePersonalSpaceStateV1ToV2(
    claimLegacy ? legacyState ?? loadPersonalSpaceState() : {},
    { ownerId, openingGold, claimLegacy, provisionalMigration }
  );
  return persistPersonalSpaceV2State(ownerId, migrated);
}
