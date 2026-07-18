export const PERSONAL_SPACE_V2_STATE_VERSION = 2;
export const PERSONAL_SPACE_V2_RULESET_ID = 'ps-v2-workspace-v1';
export const PERSONAL_SPACE_V2_REWARD_EPOCH = '2026-07-17T00:00:00.000Z';
export const PERSONAL_SPACE_V2_STORAGE_KEY_PREFIX = 'personal-space-state-v2';
export const PERSONAL_SPACE_V2_LEGACY_CLAIM_KEY = 'personal-space-state-v2:legacy-claim';

// Short aliases keep game modules concise while preserving descriptive public names.
export const RULESET_ID = PERSONAL_SPACE_V2_RULESET_ID;
export const REWARD_EPOCH = PERSONAL_SPACE_V2_REWARD_EPOCH;

export const PERSONAL_SPACE_RUNTIME = Object.freeze({
  LEGACY: 'legacy',
  V2: 'v2',
});

export const DEFAULT_PERSONAL_SPACE_RUNTIME = PERSONAL_SPACE_RUNTIME.V2;

export function normalizePersonalSpaceV2OwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new TypeError('Personal Space V2 requires a non-empty ownerId');
  }

  return ownerId.trim();
}

export function getPersonalSpaceV2StorageKey(ownerId) {
  const normalizedOwnerId = normalizePersonalSpaceV2OwnerId(ownerId);
  return `${PERSONAL_SPACE_V2_STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedOwnerId)}`;
}
