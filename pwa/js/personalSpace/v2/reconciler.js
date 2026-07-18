import { RULESET_ID, REWARD_EPOCH } from './config.js';
import {
  adaptSessions,
  dedupeSessionsById,
  isSessionDeleted,
} from './sessionAdapter.js';
import { selectDailyMainQuestWinners } from './questEngine.js';
import { getSessionRewardSpecs } from './rewardRules.js';
import {
  createRewardTombstone,
  createRewardEntry,
  createSessionRewardEntry,
  createSourceTombstone,
  dedupeRewardEntries,
  dedupeRewardTombstones,
  getTombstonedSourceIds,
  listActiveRewards,
  sortRewardEntries,
  summarizeRewardLedger,
} from './rewardLedger.js';
import {
  deriveActiveProject,
  getProjectCompletionTrigger,
} from './projectEngine.js';

function sessionId(session = {}) {
  return session.id ?? session.sessionId ?? session.session_id ?? '';
}

function entryRulesetId(entry) {
  return entry?.metadata?.rulesetId || entry?.rulesetId || RULESET_ID;
}

function stableReversalTime(entry, source, options) {
  return entry?.reversedAt ||
    source?.deletedAt ||
    source?.deleted_at ||
    source?.reversedAt ||
    source?.reversed_at ||
    options.reconciledAt ||
    entry?.createdAt ||
    options.rewardEpoch ||
    REWARD_EPOCH;
}

function createSourceTombstones(sourceId, entries, source, options) {
  const related = entries.filter(entry =>
    entry.sourceType === 'session' && entry.sourceId === sourceId,
  );
  if (!related.length) {
    return [createSourceTombstone(sourceId, {
      rulesetId: options.rulesetId,
      reversedAt: stableReversalTime(null, source, options),
    })];
  }
  return related.map(entry => createRewardTombstone(entry, {
    rulesetId: options.rulesetId,
    reversedAt: stableReversalTime(entry, source, options),
    reason: 'source_deleted',
  }));
}

function makeExpectedEntries(sessions, tombstones, options) {
  const claimedDailyQuestDates = options.claimedDailyQuestDates || new Set();
  const winners = selectDailyMainQuestWinners(sessions, {
    rewardEpoch: options.rewardEpoch,
    tombstones,
  }).filter(winner => !claimedDailyQuestDates.has(winner.date));
  const winnerIds = new Set(winners.map(winner => winner.id));
  const canonicalSessions = adaptSessions(sessions, {
    rewardEpoch: options.rewardEpoch,
  }).filter(session => session.isValid);
  const blockedSourceIds = getTombstonedSourceIds(tombstones);
  const rewardableSessions = canonicalSessions.filter(
    session => !blockedSourceIds.has(session.id),
  );

  const baseEntries = rewardableSessions.flatMap(session =>
    getSessionRewardSpecs(session, {
      isDailyMainQuestWinner: winnerIds.has(session.id),
      rewardEpoch: options.rewardEpoch,
    }).map(spec => createSessionRewardEntry(session, spec, options)),
  );

  return {
    entries: dedupeRewardEntries(baseEntries),
    winners,
  };
}

function createProjectMilestoneEntries(completion, options) {
  if (!completion?.sourceEntry) return [];
  const sourceEntry = completion.sourceEntry;
  return completion.rewardSpecs.map(spec => createRewardEntry({
    sourceType: 'session',
    sourceId: completion.sourceId,
    sourceFingerprint: sourceEntry.sourceFingerprint,
    rewardType: spec.rewardType,
    rewardKey: spec.rewardKey,
    amount: spec.amount,
    metadata: {
      ...spec.metadata,
      projectMilestone: 'completed',
      sessionDate: sourceEntry.metadata?.sessionDate || '',
    },
    createdAt: sourceEntry.createdAt,
    rulesetId: options.rulesetId,
  }));
}

/**
 * Project all post-epoch Sessions into an auditable ledger. The function has
 * no clock, storage, or mutation dependency; applying its output again is
 * ledger/tombstone idempotent.
 */
export function reconcileRewardLedger(input = {}) {
  const options = {
    rulesetId: input.rulesetId ?? RULESET_ID,
    rewardEpoch: input.rewardEpoch ?? REWARD_EPOCH,
    reconciledAt: input.reconciledAt,
    projectId: input.projectId,
  };
  const sessions = dedupeSessionsById(input.sessions, {
    rewardEpoch: options.rewardEpoch,
  });
  const previousLedger = dedupeRewardEntries(
    input.ledger ?? input.rewardLedger ?? [],
  );
  const incomingTombstones = dedupeRewardTombstones(
    input.tombstones ?? input.rewardTombstones ?? [],
  );
  const currentRulesetEntries = previousLedger.filter(
    entry => entryRulesetId(entry) === options.rulesetId,
  );
  const unrelatedEntries = previousLedger.filter(
    entry => entryRulesetId(entry) !== options.rulesetId,
  );

  const activeRawSessions = sessions.filter(session => !isSessionDeleted(session));
  const activeSourceIds = new Set(activeRawSessions.map(sessionId).filter(Boolean));
  const deletedById = new Map(sessions
    .filter(isSessionDeleted)
    .map(session => [sessionId(session), session]));
  const priorSourceIds = new Set(currentRulesetEntries
    .filter(entry => entry.sourceType === 'session')
    .map(entry => entry.sourceId));
  const removedSourceIds = new Set([
    ...deletedById.keys(),
    ...(Array.isArray(input.deletedSourceIds) ? input.deletedSourceIds : []),
    ...(input.authoritative === true
      ? [...priorSourceIds].filter(sourceId => !activeSourceIds.has(sourceId))
      : []),
  ]);

  const createdTombstones = [];
  for (const sourceId of removedSourceIds) {
    if (!sourceId) continue;
    createdTombstones.push(...createSourceTombstones(
      sourceId,
      currentRulesetEntries,
      deletedById.get(sourceId),
      options,
    ));
  }
  const tombstones = dedupeRewardTombstones([
    ...incomingTombstones,
    ...createdTombstones,
  ]);
  const blockedSourceIds = getTombstonedSourceIds(tombstones);
  const preservedOmittedSourceIds = new Set(
    input.authoritative === true
      ? []
      : [...priorSourceIds].filter(sourceId => (
          !activeSourceIds.has(sourceId)
          && !removedSourceIds.has(sourceId)
          && !blockedSourceIds.has(sourceId)
        )),
  );
  const claimedDailyQuestDates = new Set(
    listActiveRewards(currentRulesetEntries, tombstones)
      .filter(entry => (
        preservedOmittedSourceIds.has(entry.sourceId)
        && entry.rewardType === 'quest_progress'
        && String(entry.rewardKey).startsWith('main-focus:')
      ))
      .map(entry => String(entry.rewardKey).slice('main-focus:'.length))
      .filter(Boolean),
  );
  const liveSessions = activeRawSessions.filter(
    session => !blockedSourceIds.has(sessionId(session)),
  );
  const expectedBase = makeExpectedEntries(liveSessions, tombstones, {
    ...options,
    claimedDailyQuestDates,
  });
  const preservedEntries = listActiveRewards(currentRulesetEntries, tombstones)
    .filter(entry => preservedOmittedSourceIds.has(entry.sourceId));
  const completion = getProjectCompletionTrigger([
    ...preservedEntries,
    ...expectedBase.entries,
  ], [], options);
  const expected = {
    ...expectedBase,
    entries: dedupeRewardEntries([
      ...expectedBase.entries,
      ...createProjectMilestoneEntries(completion, options),
    ]),
  };
  const expectedById = new Map(expected.entries.map(entry => [entry.id, entry]));
  const previousById = new Map(currentRulesetEntries.map(entry => [entry.id, entry]));
  const addedIds = [];
  const reversedIds = [];
  const restoredIds = [];
  const reconciledCurrentEntries = [];

  for (const existing of currentRulesetEntries) {
    const wanted = expectedById.get(existing.id);
    if (wanted && !blockedSourceIds.has(wanted.sourceId)) {
      if (existing.reversedAt) restoredIds.push(existing.id);
      reconciledCurrentEntries.push({
        ...existing,
        reversedAt: null,
      });
      continue;
    }
    const sourceOmittedFromPartialSnapshot = (
      input.authoritative !== true
      && existing.sourceType === 'session'
      && !activeSourceIds.has(existing.sourceId)
      && !removedSourceIds.has(existing.sourceId)
      && !blockedSourceIds.has(existing.sourceId)
      && existing.metadata?.projectMilestone !== 'completed'
    );
    if (sourceOmittedFromPartialSnapshot) {
      // Cached/live callers are not entitled to infer deletion from absence.
      // Keep prior entries exactly as-is until an explicit tombstone or a
      // complete authoritative Session snapshot proves that the source left.
      reconciledCurrentEntries.push(existing);
      continue;
    }
    const reversedAt = stableReversalTime(
      existing,
      deletedById.get(existing.sourceId),
      options,
    );
    if (!existing.reversedAt) reversedIds.push(existing.id);
    reconciledCurrentEntries.push({ ...existing, reversedAt });
  }

  for (const wanted of expected.entries) {
    if (previousById.has(wanted.id)) continue;
    addedIds.push(wanted.id);
    reconciledCurrentEntries.push(wanted);
  }

  const ledger = sortRewardEntries(dedupeRewardEntries([
    ...unrelatedEntries,
    ...reconciledCurrentEntries,
  ]));
  const activeRewards = listActiveRewards(ledger, tombstones)
    .filter(entry => entryRulesetId(entry) === options.rulesetId);
  const summary = summarizeRewardLedger(activeRewards, []);
  const project = deriveActiveProject(activeRewards, [], options);

  return {
    ledger,
    rewardLedger: ledger,
    tombstones,
    rewardTombstones: tombstones,
    activeRewards,
    rewards: activeRewards,
    summary,
    project,
    dailyQuestWinners: expected.winners,
    changes: {
      addedIds,
      reversedIds,
      restoredIds,
    },
  };
}

/** Positional convenience form retained for small reducers and unit tests. */
export function reconcileRewards(input, ledger = [], tombstones = [], options = {}) {
  if (!Array.isArray(input)) return reconcileRewardLedger(input || {});
  return reconcileRewardLedger({
    ...options,
    sessions: input,
    ledger,
    tombstones,
  });
}

export function reconcileRewardState(state = {}, sessions = [], options = {}) {
  const result = reconcileRewardLedger({
    ...options,
    sessions,
    rewardLedger: state.rewardLedger,
    rewardTombstones: state.rewardTombstones,
  });
  return {
    ...state,
    rewardLedger: result.ledger,
    rewardTombstones: result.tombstones,
  };
}

export const reconcileGameRewards = reconcileRewardLedger;
