import { RULESET_ID, REWARD_EPOCH } from './config.js';
import { HIDDEN_STAT_KEYS, REWARD_TYPES } from './rewardRules.js';

function segment(value) {
  return encodeURIComponent(String(value ?? '').trim());
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function createRewardId({
  sourceId,
  rewardType,
  rewardKey,
  rulesetId = RULESET_ID,
}) {
  return `reward:${rulesetId}:${sourceId}:${rewardType}:${rewardKey}`;
}

export function createRewardEntry({
  sourceType = 'session',
  sourceId,
  sourceFingerprint = null,
  rewardType,
  rewardKey,
  amount,
  metadata = {},
  createdAt,
  rulesetId = RULESET_ID,
}) {
  if (!sourceId || !rewardType || !rewardKey) {
    throw new TypeError('Reward entries require sourceId, rewardType, and rewardKey.');
  }
  const id = createRewardId({ sourceId, rewardType, rewardKey, rulesetId });
  return {
    id,
    sourceType,
    sourceId,
    sourceFingerprint,
    rewardType,
    rewardKey,
    amount: numberOrZero(amount),
    metadata: {
      ...metadata,
      rulesetId,
    },
    createdAt: createdAt || REWARD_EPOCH,
    reversedAt: null,
  };
}

export function createSessionRewardEntry(session, spec, options = {}) {
  const sessionDate = session.date || session.original?.date || '';
  const createdAt = session.occurredAt || session.completedAt ||
    session.original?.completedAt ||
    (sessionDate ? `${sessionDate}T00:00:00.000Z` : options.rewardEpoch ?? REWARD_EPOCH);
  const isHiddenStat = spec.rewardType === REWARD_TYPES.HIDDEN_STAT;
  const statKey = isHiddenStat ? spec.rewardKey : null;
  const tier = spec.metadata?.tier || 'ordinary';
  // A Session can move between ordinary and Daily Main Quest ownership after
  // reconciliation. The semantic ledger key must keep those immutable variants
  // distinct even when both contribute to the same domain stat (for example Depth).
  const rewardKey = isHiddenStat ? `${statKey}.${tier}` : spec.rewardKey;
  return createRewardEntry({
    sourceType: 'session',
    sourceId: session.id,
    sourceFingerprint: createSessionRewardFingerprint(session),
    rewardType: spec.rewardType,
    rewardKey,
    amount: spec.amount,
    metadata: {
      ...spec.metadata,
      ...(statKey ? { statKey } : {}),
      sessionDate,
    },
    createdAt,
    rulesetId: options.rulesetId ?? RULESET_ID,
  });
}

export function createSessionRewardFingerprint(session = {}) {
  const source = session.original || session;
  const canonical = [
    session.id ?? source.id,
    session.date ?? source.date,
    session.occurredAt ?? source.completedAt ?? source.completed_at,
    session.result ?? source.result,
    session.durationMinutes ?? source.durationMinutes ?? source.duration_minutes,
    session.impactType ?? source.impactType ?? source.impact_type,
    session.taskNature ?? source.taskNature ?? source.task_nature,
    session.value ?? source.value,
    session.resistance ?? source.resistance,
  ].map(value => String(value ?? '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `session-fnv1a:${(hash >>> 0).toString(36)}`;
}

function chooseDuplicate(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.reversedAt && !right.reversedAt) return left;
  if (right.reversedAt && !left.reversedAt) return right;
  const leftStamp = `${left.reversedAt || ''}|${left.createdAt || ''}|${left.id || ''}`;
  const rightStamp = `${right.reversedAt || ''}|${right.createdAt || ''}|${right.id || ''}`;
  return leftStamp <= rightStamp ? left : right;
}

export function sortRewardEntries(entries = []) {
  return [...entries].sort((left, right) =>
    String(left.createdAt || '').localeCompare(String(right.createdAt || '')) ||
    String(left.id || '').localeCompare(String(right.id || '')),
  );
}

export function dedupeRewardEntries(entries = []) {
  const byId = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id) continue;
    byId.set(entry.id, chooseDuplicate(byId.get(entry.id), entry));
  }
  return sortRewardEntries([...byId.values()]);
}

export function createRewardTombstone(entry, options = {}) {
  const reversedAt = options.reversedAt || entry.reversedAt || entry.createdAt || REWARD_EPOCH;
  return {
    id: entry.id,
    rewardId: entry.id,
    sourceType: entry.sourceType || 'session',
    sourceId: entry.sourceId,
    rewardType: entry.rewardType,
    rewardKey: entry.rewardKey,
    rulesetId: options.rulesetId ?? entry.metadata?.rulesetId ?? RULESET_ID,
    reversedAt,
    reason: options.reason || 'source_deleted',
  };
}

export function createSourceTombstone(sourceId, options = {}) {
  const rulesetId = options.rulesetId ?? RULESET_ID;
  return {
    id: `reward-tombstone:${segment(rulesetId)}:session:${segment(sourceId)}`,
    rewardId: null,
    sourceType: 'session',
    sourceId,
    rewardType: 'source',
    rewardKey: 'deleted',
    rulesetId,
    reversedAt: options.reversedAt || REWARD_EPOCH,
    reason: options.reason || 'source_deleted',
  };
}

export function dedupeRewardTombstones(tombstones = []) {
  const byId = new Map();
  for (const tombstone of Array.isArray(tombstones) ? tombstones : []) {
    if (!tombstone?.id || !tombstone?.sourceId) continue;
    const existing = byId.get(tombstone.id);
    if (!existing || String(tombstone.reversedAt || '') < String(existing.reversedAt || '')) {
      byId.set(tombstone.id, tombstone);
    }
  }
  return [...byId.values()].sort((left, right) =>
    String(left.reversedAt || '').localeCompare(String(right.reversedAt || '')) ||
    String(left.id).localeCompare(String(right.id)),
  );
}

export function getTombstonedSourceIds(tombstones = []) {
  return new Set(dedupeRewardTombstones(tombstones).map(tombstone => tombstone.sourceId));
}

export function listActiveRewards(entries = [], tombstones = []) {
  const blockedRewardIds = new Set(dedupeRewardTombstones(tombstones)
    .map(tombstone => tombstone.rewardId)
    .filter(Boolean));
  const blockedSourceIds = getTombstonedSourceIds(tombstones);
  return dedupeRewardEntries(entries).filter(entry =>
    !entry.reversedAt &&
    !blockedRewardIds.has(entry.id) &&
    !blockedSourceIds.has(entry.sourceId),
  );
}

export function reverseRewardsForSource(entries = [], sourceId, options = {}) {
  const reversedAt = options.reversedAt || REWARD_EPOCH;
  const reason = options.reason || 'source_deleted';
  const ledger = dedupeRewardEntries(entries).map(entry =>
    entry.sourceId === sourceId && !entry.reversedAt
      ? { ...entry, reversedAt }
      : entry,
  );
  const sourceEntries = ledger.filter(entry => entry.sourceId === sourceId);
  const createdTombstones = sourceEntries.length
    ? sourceEntries.map(entry => createRewardTombstone(entry, { reversedAt, reason }))
    : [createSourceTombstone(sourceId, { reversedAt, reason })];
  return {
    ledger,
    tombstones: dedupeRewardTombstones([
      ...(options.tombstones || []),
      ...createdTombstones,
    ]),
  };
}

export function summarizeRewardLedger(entries = [], tombstones = []) {
  const activeEntries = listActiveRewards(entries, tombstones);
  const hiddenStats = Object.fromEntries(HIDDEN_STAT_KEYS.map(key => [key, 0]));
  const questProgress = {};
  const projectProgress = {};
  const worldUnlocks = new Set();
  let gold = 0;
  let relationship = 0;

  for (const entry of activeEntries) {
    const amount = numberOrZero(entry.amount);
    switch (entry.rewardType) {
      case REWARD_TYPES.GOLD:
        gold += amount;
        break;
      case REWARD_TYPES.HIDDEN_STAT:
        {
          const statKey = entry.metadata?.statKey || entry.rewardKey;
          if (statKey in hiddenStats) hiddenStats[statKey] += amount;
        }
        break;
      case REWARD_TYPES.QUEST_PROGRESS:
        questProgress[entry.rewardKey] = (questProgress[entry.rewardKey] || 0) + amount;
        break;
      case REWARD_TYPES.PROJECT_PROGRESS:
        projectProgress[entry.rewardKey] = (projectProgress[entry.rewardKey] || 0) + amount;
        break;
      case REWARD_TYPES.WORLD_UNLOCK:
        if (amount > 0) worldUnlocks.add(entry.rewardKey);
        break;
      case REWARD_TYPES.RELATIONSHIP:
        relationship += amount;
        break;
    }
  }

  return {
    gold,
    earnedGold: gold,
    hiddenStats,
    questProgress,
    projectProgress,
    worldUnlocks: [...worldUnlocks].sort(),
    relationship,
    relationshipDelta: relationship,
    rewardCount: activeEntries.length,
    activeEntries,
  };
}

export const makeRewardId = createRewardId;
export const appendUniqueRewards = dedupeRewardEntries;
export const getActiveRewards = listActiveRewards;
