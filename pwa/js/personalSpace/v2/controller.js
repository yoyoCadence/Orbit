import { getLevelInfo } from '../../leveling.js';
import {
  clearSessionDeletion,
  loadSessionDeletionLog,
} from '../../platform/sessionDeletionLog.js';
import { estimateAvailableGold } from '../economy.js';
import { loadPersonalSpaceState } from '../gameState.js';
import { REWARD_EPOCH, RULESET_ID } from './config.js';
import { isPersonalSpaceV2Enabled } from './featureFlag.js';
import { deriveActiveProject } from './projectEngine.js';
import {
  listActiveRewards,
  summarizeRewardLedger,
} from './rewardLedger.js';
import { reconcileRewardLedger } from './reconciler.js';
import {
  dedupeSessionsById,
  isSessionDeleted,
  isSessionOnOrAfterEpoch,
} from './sessionAdapter.js';
import {
  canOwnerClaimLegacyPersonalSpaceState,
  hasPersonalSpaceV2State,
  loadOrMigratePersonalSpaceV2State,
  savePersonalSpaceV2State,
} from './store.js';

export const PERSONAL_SPACE_V2_RELATIONSHIP_STAGES = Object.freeze([
  'stranger-observer',
  'familiar',
  'partner',
  'trusted-companion',
]);

const HIDDEN_STAT_KEYS = Object.freeze([
  'discipline',
  'depth',
  'vitality',
  'order',
  'courage',
  'craft',
]);

const LEGACY_RELATIONSHIP_STAGE_POINTS = Object.freeze({
  'quiet-familiarity': 1,
});

const REWARD_CHANGE_PRIORITY = Object.freeze({
  world_unlock: 6,
  relationship: 5,
  project_progress: 4,
  quest_progress: 3,
  gold: 2,
  hidden_stat: 1,
});

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function ownerIdFromUser(user = {}) {
  const ownerId = user.id ?? user.userId ?? user.user_id;
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new TypeError('Personal Space V2 controller requires user.id.');
  }
  return ownerId.trim();
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function activeCurrentRulesetEntries(state = {}) {
  return listActiveRewards(
    state.rewardLedger || [],
    state.rewardTombstones || [],
  ).filter(entry => (
    entry.metadata?.rulesetId || entry.rulesetId || state.rulesetId || RULESET_ID
  ) === RULESET_ID);
}

function summarizeStateLedger(state = {}) {
  return summarizeRewardLedger(activeCurrentRulesetEntries(state), []);
}

function relationshipPointsForState(companion = {}) {
  if (Number.isFinite(companion.relationshipPoints)) {
    return Math.max(0, Math.floor(companion.relationshipPoints));
  }
  const stage = companion.relationshipStage;
  const canonicalIndex = PERSONAL_SPACE_V2_RELATIONSHIP_STAGES.indexOf(stage);
  if (canonicalIndex >= 0) return canonicalIndex;
  return LEGACY_RELATIONSHIP_STAGE_POINTS[stage] || 0;
}

function relationshipStageForPoints(points) {
  const index = Math.min(
    PERSONAL_SPACE_V2_RELATIONSHIP_STAGES.length - 1,
    Math.max(0, Math.floor(points)),
  );
  return PERSONAL_SPACE_V2_RELATIONSHIP_STAGES[index];
}

function canonicalProject(project) {
  return {
    id: project?.id || 'workspace-upgrade',
    progress: finiteNonNegative(project?.progress),
    currentPhase: finiteNonNegative(project?.currentPhase),
    completed: Boolean(project?.completed),
    contributionCount: finiteNonNegative(project?.contributionCount),
    contributingSessionIds: Array.isArray(project?.contributingSessionIds)
      ? [...project.contributingSessionIds]
      : [],
    completedBySessionId: project?.completedBySessionId || null,
  };
}

function semanticProjection(state) {
  const companionPoints = relationshipPointsForState(state.companion);
  return {
    economy: {
      earnedGold: finiteNonNegative(state.economy?.earnedGold),
      balanceGold: finiteNonNegative(state.economy?.balanceGold),
    },
    hiddenStats: Object.fromEntries(HIDDEN_STAT_KEYS.map(key => [
      key,
      finiteNonNegative(state.hiddenStats?.[key]),
    ])),
    activeProject: canonicalProject(state.activeProject),
    companion: {
      relationshipPoints: companionPoints,
      relationshipStage: relationshipStageForPoints(companionPoints),
    },
  };
}

function semanticEqual(left, right) {
  return JSON.stringify(semanticProjection(left)) === JSON.stringify(semanticProjection(right));
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function revealKind(rewards) {
  if (rewards.some(reward =>
    reward.rewardType === 'world_unlock' || reward.rewardType === 'relationship')) {
    return 'major';
  }
  if (rewards.some(reward =>
    reward.rewardType === 'gold' ||
    reward.rewardType === 'quest_progress' ||
    reward.rewardType === 'project_progress')) {
    return 'medium';
  }
  return 'small';
}

function mostImportantReward(rewards) {
  return [...rewards].sort((left, right) =>
    (REWARD_CHANGE_PRIORITY[right.rewardType] || 0) -
      (REWARD_CHANGE_PRIORITY[left.rewardType] || 0) ||
    (right.direction === 'added' ? 1 : 0) - (left.direction === 'added' ? 1 : 0) ||
    String(left.id).localeCompare(String(right.id)),
  )[0] || null;
}

function createWorldChange(revealId, reward, createdAt) {
  if (!reward) return null;
  return {
    id: `world-change:${revealId}`,
    sourceId: reward.sourceId,
    type: reward.direction === 'reversed' ? 'reward_reversed' : reward.rewardType,
    key: reward.metadata?.statKey || reward.rewardKey,
    amount: reward.direction === 'reversed'
      ? -Math.abs(reward.amount)
      : reward.amount,
    createdAt,
    metadata: {
      direction: reward.direction,
      rewardId: reward.id,
      rewardType: reward.rewardType,
    },
  };
}

function buildRevealEvents(reconciliation, changeIds, reconciledAt) {
  const entryById = new Map(reconciliation.ledger.map(entry => [entry.id, entry]));
  const grouped = new Map();
  const addToGroup = (id, direction) => {
    const entry = entryById.get(id);
    if (!entry) return;
    const sourceId = entry.sourceId || 'unknown-source';
    if (!grouped.has(sourceId)) grouped.set(sourceId, []);
    grouped.get(sourceId).push({
      id: entry.id,
      sourceId,
      rewardType: entry.rewardType,
      rewardKey: entry.rewardKey,
      amount: finiteNonNegative(entry.amount),
      direction,
      createdAt: direction === 'reversed'
        ? entry.reversedAt || entry.createdAt
        : entry.createdAt,
      metadata: entry.metadata || {},
    });
  };

  changeIds.added.forEach(id => addToGroup(id, 'added'));
  changeIds.reversed.forEach(id => addToGroup(id, 'reversed'));

  return [...grouped.entries()].map(([sourceId, rewards]) => {
    const sortedRewards = [...rewards].sort((left, right) =>
      left.direction.localeCompare(right.direction) || left.id.localeCompare(right.id),
    );
    const signature = sortedRewards
      .map(reward => `${reward.direction}:${reward.id}`)
      .join('|');
    const sourceOccurredAt = sortedRewards
      .map(reward => reward.createdAt)
      .filter(Boolean)
      .sort()
      .at(-1) || REWARD_EPOCH;
    const createdAt = typeof reconciledAt === 'string' && reconciledAt
      ? reconciledAt
      : sourceOccurredAt;
    const id = `reveal:${RULESET_ID}:${sourceId}:${stableHash(signature)}`;
    const importantReward = mostImportantReward(sortedRewards);
    const addedRewardIds = sortedRewards
      .filter(reward => reward.direction === 'added')
      .map(reward => reward.id);
    const reversedRewardIds = sortedRewards
      .filter(reward => reward.direction === 'reversed')
      .map(reward => reward.id);
    return {
      id,
      sourceId,
      kind: revealKind(sortedRewards),
      direction: addedRewardIds.length && reversedRewardIds.length
        ? 'mixed'
        : addedRewardIds.length ? 'settlement' : 'reversal',
      rewardIds: sortedRewards.map(reward => reward.id),
      addedRewardIds,
      reversedRewardIds,
      rewards: sortedRewards,
      createdAt,
      sourceOccurredAt,
      worldChange: createWorldChange(id, importantReward, createdAt),
    };
  }).sort((left, right) =>
    String(left.sourceOccurredAt).localeCompare(String(right.sourceOccurredAt)) ||
    String(left.createdAt).localeCompare(String(right.createdAt)) ||
    left.id.localeCompare(right.id),
  );
}

function normalizeRevealQueue(reveals = []) {
  const byId = new Map();
  for (const reveal of Array.isArray(reveals) ? reveals : []) {
    if (!reveal || typeof reveal.id !== 'string' || !reveal.id) continue;
    if (!byId.has(reveal.id)) byId.set(reveal.id, reveal);
  }
  return [...byId.values()].sort((left, right) =>
    String(left.sourceOccurredAt || '').localeCompare(String(right.sourceOccurredAt || '')) ||
    String(left.createdAt || '').localeCompare(String(right.createdAt || '')) ||
    left.id.localeCompare(right.id),
  );
}

function revealMatchesActiveLedger(reveal, activeRewardIds) {
  const rewardIds = Array.isArray(reveal.rewardIds) ? reveal.rewardIds : [];
  const addedRewardIds = Array.isArray(reveal.addedRewardIds)
    ? reveal.addedRewardIds
    : reveal.direction === 'reversal' ? [] : rewardIds;
  const reversedRewardIds = Array.isArray(reveal.reversedRewardIds)
    ? reveal.reversedRewardIds
    : reveal.direction === 'reversal' ? rewardIds : [];
  if (!addedRewardIds.length && !reversedRewardIds.length) return true;
  return addedRewardIds.every(id => activeRewardIds.has(id))
    && reversedRewardIds.every(id => !activeRewardIds.has(id));
}

function worldChangeMatchesActiveLedger(worldChange, activeRewardIds) {
  const rewardId = worldChange?.metadata?.rewardId;
  const direction = worldChange?.metadata?.direction;
  if (!rewardId || !direction) return true;
  return direction === 'reversed'
    ? !activeRewardIds.has(rewardId)
    : activeRewardIds.has(rewardId);
}

function getEffectiveChangeIds(state, reconciliation) {
  const oldActiveIds = new Set(activeCurrentRulesetEntries(state).map(entry => entry.id));
  const added = uniqueSorted([
    ...(reconciliation.changes?.addedIds || []),
    ...(reconciliation.changes?.restoredIds || []),
  ]).filter(id => !oldActiveIds.has(id));
  const reversed = uniqueSorted(reconciliation.changes?.reversedIds || [])
    .filter(id => oldActiveIds.has(id));
  return { added, reversed };
}

/** Purely applies a ledger reconciliation to a normalized V2 state. */
export function applyReconciliationToV2State(state, reconciliation, options = {}) {
  const oldSummary = summarizeStateLedger(state);
  const newSummary = reconciliation.summary;
  const hiddenStats = Object.fromEntries(HIDDEN_STAT_KEYS.map(key => {
    const migratedBaseline = finiteNonNegative(state.hiddenStats?.[key]) -
      finiteNonNegative(oldSummary.hiddenStats?.[key]);
    return [key, Math.max(0, migratedBaseline + finiteNonNegative(newSummary.hiddenStats?.[key]))];
  }));
  const openingGold = finiteNonNegative(state.economy?.openingGold);
  const spentGold = finiteNonNegative(state.economy?.spentGold);
  const earnedGold = finiteNonNegative(newSummary.earnedGold ?? newSummary.gold);
  const existingRelationshipPoints = relationshipPointsForState(state.companion);
  const relationshipBaseline = Math.max(
    0,
    existingRelationshipPoints - finiteNonNegative(oldSummary.relationship),
  );
  const relationshipPoints = relationshipBaseline + finiteNonNegative(newSummary.relationship);
  const changeIds = getEffectiveChangeIds(state, reconciliation);
  const revealEvents = options.queueReveal === true
    ? buildRevealEvents(reconciliation, changeIds, options.reconciledAt)
    : [];
  const activeRewardIds = new Set(listActiveRewards(
    reconciliation.ledger,
    reconciliation.tombstones,
  ).map(entry => entry.id));
  const retainedRevealQueue = (state.pendingRewardReveals || [])
    .filter(reveal => revealMatchesActiveLedger(reveal, activeRewardIds));
  const pendingRewardReveals = normalizeRevealQueue([
    ...retainedRevealQueue,
    ...revealEvents,
  ]);
  const recentReveal = revealEvents.at(-1) || null;
  const retainedWorldChange = worldChangeMatchesActiveLedger(
    state.recentWorldChange,
    activeRewardIds,
  ) ? state.recentWorldChange || null : null;
  const retainedWorldChangeEventId = retainedWorldChange
    ? state.recentWorldChangeEventId || null
    : null;

  const derived = {
    ...state,
    economy: {
      ...state.economy,
      openingGold,
      earnedGold,
      spentGold,
      balanceGold: Math.max(0, openingGold + earnedGold - spentGold),
    },
    hiddenStats,
    companion: {
      ...state.companion,
      relationshipPoints,
      relationshipStage: relationshipStageForPoints(relationshipPoints),
    },
    activeProject: { ...reconciliation.project },
    rewardLedger: reconciliation.ledger,
    rewardTombstones: reconciliation.tombstones,
    pendingRewardReveals,
    recentWorldChange: recentReveal?.worldChange || retainedWorldChange,
    recentWorldChangeEventId: recentReveal?.worldChange?.metadata?.rewardId ||
      retainedWorldChangeEventId ||
      null,
  };
  const hasLedgerChanges = changeIds.added.length > 0 || changeIds.reversed.length > 0;
  const hasSemanticChange = hasLedgerChanges || !semanticEqual(state, derived);
  return {
    ...derived,
    worldRevision: finiteNonNegative(state.worldRevision) + (hasSemanticChange ? 1 : 0),
  };
}

function sumRewardEpochSessionXP(sessions = []) {
  if (!Array.isArray(sessions)) return 0;

  return dedupeSessionsById(sessions, { rewardEpoch: REWARD_EPOCH })
    .reduce((total, session) => {
    if (!session || typeof session !== 'object' || isSessionDeleted(session)) return total;

    if (!isSessionOnOrAfterEpoch(session, REWARD_EPOCH)) return total;

    const finalXP = Number(session.finalXP ?? session.final_xp);
    return total + (Number.isFinite(finalXP) ? Math.max(0, finalXP) : 0);
    }, 0);
}

function calculateMigrationOpeningGold(user, sessions, legacySpentGold) {
  const cutoverTotalXP = Math.max(
    0,
    finiteNonNegative(user.totalXP) - sumRewardEpochSessionXP(sessions),
  );
  const level = getLevelInfo(cutoverTotalXP).level;
  return estimateAvailableGold(level, finiteNonNegative(legacySpentGold));
}

function loadControllerState(user, sessions, legacyStateOverride, options = {}) {
  const ownerId = ownerIdFromUser(user);
  if (hasPersonalSpaceV2State(ownerId)) {
    const state = loadOrMigratePersonalSpaceV2State({ ownerId });
    if (state.migration?.provisional !== true || options.finalizeMigration !== true) {
      return state;
    }

    const openingGold = calculateMigrationOpeningGold(
      user,
      sessions,
      state.economy?.legacySpentGold,
    );
    const openingGoldChanged = openingGold !== finiteNonNegative(state.economy?.openingGold);
    return {
      ...state,
      worldRevision: finiteNonNegative(state.worldRevision) + (openingGoldChanged ? 1 : 0),
      migration: {
        ...state.migration,
        provisional: false,
      },
      economy: {
        ...state.economy,
        openingGold,
        balanceGold: Math.max(
          0,
          openingGold + finiteNonNegative(state.economy?.earnedGold) -
            finiteNonNegative(state.economy?.spentGold),
        ),
      },
    };
  }
  const claimLegacy = canOwnerClaimLegacyPersonalSpaceState(ownerId);
  const legacyState = claimLegacy
    ? legacyStateOverride ?? loadPersonalSpaceState()
    : {};
  const openingGold = calculateMigrationOpeningGold(user, sessions, legacyState.spentGold);
  return loadOrMigratePersonalSpaceV2State({
    ownerId,
    openingGold,
    legacyState,
    provisionalMigration: options.provisionalMigration === true,
  });
}

function buildLedgerSnapshot(state, reconciliation) {
  return {
    ...reconciliation,
    revision: state.worldRevision,
    worldRevision: state.worldRevision,
    hiddenStats: state.hiddenStats,
    wallet: state.economy,
    companion: state.companion,
    pendingRewardReveals: state.pendingRewardReveals,
    recentWorldChange: state.recentWorldChange,
    recentWorldChangeEventId: state.recentWorldChangeEventId,
  };
}

/**
 * Loads/migrates the owner state and computes reconciliation without saving the
 * projected reward state. Callers that settle Sessions should use the saving
 * variant below.
 */
export function loadAndReconcilePersonalSpaceV2({
  user,
  sessions = [],
  reconciledAt,
  legacyState,
  queueReveal = false,
  deletedSourceIds = [],
  authoritative = false,
  provisionalMigration = false,
  finalizeMigration = authoritative === true,
} = {}) {
  const ownerId = ownerIdFromUser(user);
  const deletionLog = loadSessionDeletionLog(ownerId);
  const state = loadControllerState(user, sessions, legacyState, {
    provisionalMigration,
    finalizeMigration,
  });
  const reconciliation = reconcileRewardLedger({
    sessions,
    rewardLedger: state.rewardLedger,
    rewardTombstones: state.rewardTombstones,
    rulesetId: state.rulesetId,
    rewardEpoch: state.rewardEpoch,
    reconciledAt,
    deletedSourceIds: uniqueSorted([
      ...(Array.isArray(deletedSourceIds) ? deletedSourceIds : []),
      ...Object.keys(deletionLog),
    ]),
    authoritative,
  });
  const nextState = applyReconciliationToV2State(state, reconciliation, {
    reconciledAt,
    queueReveal,
  });
  return {
    state: nextState,
    v2State: nextState,
    reconciliation,
    ledgerSnapshot: buildLedgerSnapshot(nextState, reconciliation),
    persisted: false,
  };
}

export function reconcileAndSavePersonalSpaceV2(input = {}) {
  const ownerId = ownerIdFromUser(input.user);
  const result = loadAndReconcilePersonalSpaceV2(input);
  const state = savePersonalSpaceV2State(ownerId, result.state);
  const deletionLog = loadSessionDeletionLog(ownerId);
  Object.values(deletionLog)
    .filter(entry => entry.remoteConfirmedAt)
    .forEach(entry => {
      try {
        clearSessionDeletion(ownerId, entry.sessionId);
      } catch (error) {
        console.warn('Session deletion log cleanup will retry later:', error);
      }
    });
  return {
    ...result,
    state,
    v2State: state,
    ledgerSnapshot: buildLedgerSnapshot(state, result.reconciliation),
    persisted: true,
  };
}

/**
 * Refreshes the app's canonical state from the post-sync storage cache, then
 * silently reconciles the owner-scoped V2 projection. Remote sync callers
 * should pass authoritative:true only after a complete load/merge succeeds.
 *
 * V2 failures are deliberately isolated from the canonical state refresh: a
 * world projection must never leave the task/session UI on stale remote data.
 */
export function refreshCanonicalStateAndReconcilePersonalSpaceV2({
  centralState,
  storageApi,
  authoritative = true,
  provisionalMigration = false,
  finalizeMigration = authoritative === true,
  reconciledAt,
  v2Enabled = isPersonalSpaceV2Enabled(),
  reconcile = reconcileAndSavePersonalSpaceV2,
  onReconcileError = error => console.warn(
    'Personal Space V2 silent reconciliation failed:',
    error,
  ),
} = {}) {
  if (!centralState || typeof centralState !== 'object') {
    throw new TypeError('A mutable centralState object is required.');
  }
  if (!storageApi || typeof storageApi !== 'object') {
    throw new TypeError('A storageApi object is required.');
  }

  centralState.user = storageApi.getUser();
  centralState.tasks = storageApi.getTasks();
  centralState.sessions = storageApi.getSessions();
  centralState.energy = storageApi.getEnergy();
  centralState.dailyPlan = storageApi.getDailyPlan();

  const ownerId = centralState.user?.id ?? centralState.user?.userId ?? centralState.user?.user_id;
  if (!v2Enabled || typeof ownerId !== 'string' || !ownerId.trim()) {
    return {
      centralState,
      reconciliationResult: null,
      reconciliationError: null,
    };
  }

  try {
    const reconciliationResult = reconcile({
      user: centralState.user,
      sessions: centralState.sessions,
      authoritative,
      queueReveal: false,
      ...(provisionalMigration ? { provisionalMigration: true } : {}),
      ...(finalizeMigration ? { finalizeMigration: true } : {}),
      ...(reconciledAt ? { reconciledAt } : {}),
    });
    return {
      centralState,
      reconciliationResult,
      reconciliationError: null,
    };
  } catch (error) {
    onReconcileError?.(error);
    return {
      centralState,
      reconciliationResult: null,
      reconciliationError: error,
    };
  }
}

export function consumePersonalSpaceV2Reveal({ user, revealId, legacyState } = {}) {
  const ownerId = ownerIdFromUser(user);
  const state = loadControllerState(user, [], legacyState);
  const queue = normalizeRevealQueue(state.pendingRewardReveals);
  const consumedReveal = queue.find(reveal => reveal.id === revealId) || null;
  if (!consumedReveal) {
    return { state, v2State: state, consumedReveal: null, persisted: false };
  }
  const nextState = savePersonalSpaceV2State(ownerId, {
    ...state,
    pendingRewardReveals: queue.filter(reveal => reveal.id !== revealId),
  });
  return {
    state: nextState,
    v2State: nextState,
    consumedReveal,
    persisted: true,
  };
}

export function buildStoredPersonalSpaceV2LedgerSnapshot(state) {
  const activeRewards = activeCurrentRulesetEntries(state);
  const summary = summarizeRewardLedger(activeRewards, []);
  const project = deriveActiveProject(activeRewards, []);
  return buildLedgerSnapshot(state, {
    ledger: state.rewardLedger || [],
    tombstones: state.rewardTombstones || [],
    activeRewards,
    rewards: activeRewards,
    summary,
    project,
    dailyQuestWinners: [],
    changes: { addedIds: [], reversedIds: [], restoredIds: [] },
  });
}
