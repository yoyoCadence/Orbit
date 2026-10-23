import { getLevelInfo } from '../../leveling.js';
import {
  clearSessionDeletion,
  loadSessionDeletionLog,
} from '../../platform/sessionDeletionLog.js';
import { estimateAvailableGold } from '../economy.js';
import { loadPersonalSpaceState } from '../gameState.js';
import { REWARD_EPOCH, RULESET_ID } from './config.js';
import { isPersonalSpaceV2Enabled } from './featureFlag.js';
import { PROJECT_REQUIRED_DAILY_ENTRIES, deriveActiveProject } from './projectEngine.js';
import {
  listActiveRewards,
  summarizeRewardLedger,
} from './rewardLedger.js';
import { reconcileRewardLedger } from './reconciler.js';
import { FORMAL_WORKSTATION_UNLOCK_KEY } from './rewardRules.js';
import {
  formatRewardLine,
  RELATIONSHIP_STAGES,
  relationshipStageLabel,
} from './content/worldLabels.js';
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

export const PERSONAL_SPACE_V2_RELATIONSHIP_STAGES = RELATIONSHIP_STAGES;

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

// AI-202: the relationship also grows on the 12th and 30th Main Quest day.
// Derived from the active ledger rather than written into it: an older tab
// still on the previous code would reverse a same-ruleset entry it does not
// expect. The policy id versions this derivation; RULESET_ID versions the
// ledger entries themselves.
const RELATIONSHIP_POLICY_ID = 'ai202-main-quest-days-v1';
const RELATIONSHIP_MILESTONE_MAIN_QUEST_DAYS = Object.freeze([12, 30]);

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

// Distinct Main Quest days: the reconciler keeps one winner a day, and its
// quest_progress key names the day.
function countMainQuestDays(entries = []) {
  return new Set(entries
    .filter(entry => entry.rewardType === 'quest_progress'
      && String(entry.rewardKey || '').startsWith('main-focus:'))
    .map(entry => entry.rewardKey)).size;
}

function derivedRelationshipMilestones(mainQuestDays) {
  return RELATIONSHIP_MILESTONE_MAIN_QUEST_DAYS.filter(days => mainQuestDays >= days).length;
}

// The points a migrated legacy relationship gives: a floor, not a bonus, so
// the thresholds are the same for everyone. Stored once, so that a stale
// total written by an older tab can never be read back as legacy points.
function legacyRelationshipPoints(state, oldSummary) {
  const companion = state.companion || {};
  if (Object.hasOwn(companion, 'legacyRelationshipPoints')) {
    return finiteNonNegative(companion.legacyRelationshipPoints);
  }
  return Math.max(
    0,
    relationshipPointsForState(companion) - finiteNonNegative(oldSummary.relationship),
  );
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

// `major` comes only from a milestone (AI-202B2, presentReveal).
function revealKind(rewards) {
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

// Reveals and world changes saved before v1.31.9 still show project progress
// that a Main Quest day past 100% recorded without moving the project
// (BUG-114). Only the first days up to 100% count toward it.
// Null when the project is unknown: nothing is then treated as uncounted.
function countedProgressSourceIds(project = {}) {
  if (!Array.isArray(project?.contributingSessionIds)) return null;
  return new Set(project.contributingSessionIds.slice(0, PROJECT_REQUIRED_DAILY_ENTRIES));
}

function isUncountedProgress(rewardType, direction, sourceId, countedSourceIds) {
  return Boolean(countedSourceIds) && rewardType === 'project_progress'
    && direction !== 'reversed' && !countedSourceIds.has(sourceId);
}

function withoutUncountedProgress(reveal, countedSourceIds) {
  const isUncounted = reward => isUncountedProgress(
    reward?.rewardType, reward?.direction, reward?.sourceId, countedSourceIds,
  );
  if (!Array.isArray(reveal.rewards) || !reveal.rewards.some(isUncounted)) return reveal;
  const rewards = reveal.rewards.filter(reward => !isUncounted(reward));
  if (!rewards.length) return null;
  // The stored ids follow what the reveal shows, as for new reveals.
  const removed = new Set(reveal.rewards.filter(isUncounted).map(reward => reward.id));
  const keep = ids => (Array.isArray(ids) ? ids.filter(id => !removed.has(id)) : ids);
  return {
    ...reveal,
    rewards,
    rewardIds: keep(reveal.rewardIds),
    addedRewardIds: keep(reveal.addedRewardIds),
    worldChange: createWorldChange(reveal.id, mostImportantReward(rewards), reveal.createdAt),
  };
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

// A queued completion reveal: flagged, or, if an older version queued it,
// one that adds the completion rewards.
function isQueuedCompletionReveal(reveal) {
  if (typeof reveal?.projectCompleted === 'boolean') return reveal.projectCompleted;
  return Array.isArray(reveal?.rewards) && reveal.rewards.some(reward => (
    reward?.direction !== 'reversed' && reward?.metadata?.tier === 'project-completion'
  ));
}

// What this reconciliation changed for the user beyond its ledger entries.
// The project before it is read from the ledger; the stored activeProject can
// disagree. Which reveal shows the completion is decided with the other
// milestones (AI-202B2, placeMilestones).
function getRevealContext(state, reconciliation) {
  const before = deriveActiveProject(activeCurrentRulesetEntries(state), []);
  const project = reconciliation.project || {};
  return {
    // Past 100% a Main Quest day still records project progress, but the
    // project does not move, so that progress is not shown (BUG-114).
    progressChanged: before.progress !== project.progress,
    countedSourceIds: countedProgressSourceIds(project),
    unseenRewardIds: new Set((state.pendingRewardReveals || []).flatMap(revealAddedRewardIds)),
  };
}

// Rewards that only move between Sessions keep the same type, key and amount:
// the day's Main Quest bundle when an undo hands it to another Session that
// day, and the completion unlock and relationship when it moves to another day.
function handoverKey(reward) {
  const tier = reward.metadata?.tier;
  const base = `${reward.rewardType}|${reward.rewardKey}|${reward.amount}`;
  if (tier === 'daily-main-quest') {
    return reward.metadata?.sessionDate ? `${base}|${reward.metadata.sessionDate}` : null;
  }
  if (tier === 'project-completion') return base;
  return null;
}

// An added and a reversed copy of the same reward in one reconciliation change
// nothing for the user, so neither is shown. A reward whose reveal has not
// played yet was never seen: the other Session's copy is shown as gained, and
// its own loss is not.
function findHandoverIds(rewards, unseenRewardIds) {
  const byKey = new Map();
  for (const reward of rewards) {
    const key = handoverKey(reward);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { added: [], reversed: [], unseen: [] });
    const group = byKey.get(key);
    if (reward.direction === 'reversed' && unseenRewardIds.has(reward.id)) group.unseen.push(reward.id);
    else group[reward.direction].push(reward.id);
  }
  const hidden = new Set();
  // Gains taken over from a reward the user never saw: news to the user even
  // when the project as a whole did not move.
  const inherited = new Set();
  for (const { added, reversed, unseen } of byKey.values()) {
    const pairs = Math.min(added.length, reversed.length);
    added.sort();
    [...added.slice(0, pairs), ...reversed.sort().slice(0, pairs)]
      .forEach(id => hidden.add(id));
    if (added.length && unseen.length) {
      unseen.forEach(id => hidden.add(id));
      added.slice(pairs).forEach(id => inherited.add(id));
    }
  }
  return { hidden, inherited };
}

function buildRevealEvents(reconciliation, changeIds, reconciledAt, context) {
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
  const handover = findHandoverIds([...grouped.values()].flat(), context.unseenRewardIds);
  const isShown = reward => !handover.hidden.has(reward.id)
    && (context.progressChanged || reward.rewardType !== 'project_progress'
      || (handover.inherited.has(reward.id)
        && !isUncountedProgress(reward.rewardType, reward.direction, reward.sourceId, context.countedSourceIds)));

  return [...grouped.entries()].map(([sourceId, rewards]) => {
    const sortedRewards = [...rewards].sort((left, right) =>
      left.direction.localeCompare(right.direction) || left.id.localeCompare(right.id),
    );
    // A reveal shows, and is kept in step with the ledger by, what changed for
    // the user; a reveal of nothing else is not queued.
    const shownRewards = sortedRewards.filter(isShown);
    if (!shownRewards.length) return null;
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
    const importantReward = mostImportantReward(shownRewards);
    const addedRewardIds = shownRewards
      .filter(reward => reward.direction === 'added')
      .map(reward => reward.id);
    const reversedRewardIds = shownRewards
      .filter(reward => reward.direction === 'reversed')
      .map(reward => reward.id);
    return {
      id,
      sourceId,
      direction: addedRewardIds.length && reversedRewardIds.length
        ? 'mixed'
        : addedRewardIds.length ? 'settlement' : 'reversal',
      rewardIds: shownRewards.map(reward => reward.id),
      addedRewardIds,
      reversedRewardIds,
      rewards: shownRewards,
      createdAt,
      sourceOccurredAt,
      worldChange: createWorldChange(id, importantReward, createdAt),
    };
  }).filter(Boolean).sort((left, right) =>
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

function revealAddedRewardIds(reveal) {
  if (Array.isArray(reveal?.addedRewardIds)) return reveal.addedRewardIds;
  if (reveal?.direction === 'reversal') return [];
  return Array.isArray(reveal?.rewardIds) ? reveal.rewardIds : [];
}

function revealMatchesActiveLedger(reveal, activeRewardIds) {
  const rewardIds = Array.isArray(reveal.rewardIds) ? reveal.rewardIds : [];
  const addedRewardIds = revealAddedRewardIds(reveal);
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

// AI-202B2: milestones are the project completion and the relationship stage.
// A reveal shows them as the net change from what the user last saw
// (`presentedMilestones`), not from the ledger entries it carries, so a
// handover, a sync or a reveal that never played cannot show a stale or a
// repeated milestone. docs/ai-202-companion-relationship-proposal.md §3.4.
const PROJECT_COMPLETED = 'completed';
const PROJECT_UNCOMPLETED = 'uncompleted';
const STAGE_MILESTONE_DAYS = Object.freeze({ partner: 12, 'trusted-companion': 30 });
const MILESTONE_REWARD_TYPES = new Set(['world_unlock', 'relationship']);

function stageIndex(stage) {
  return Math.max(0, RELATIONSHIP_STAGES.indexOf(stage));
}

function isStageUp(change) {
  return Boolean(change) && stageIndex(change.to) > stageIndex(change.from);
}

function isMilestoneUp(milestone) {
  return milestone?.project === PROJECT_COMPLETED || isStageUp(milestone?.stage);
}

function hasMilestone(milestone) {
  return Boolean(milestone?.project || milestone?.stage);
}

// Reveals queued before AI-202B2 (or by an older tab) carry no milestone field.
function isPreMilestoneReveal(reveal) {
  return !Object.hasOwn(reveal || {}, 'milestone');
}

function isReversalOnly(reveal) {
  return reveal?.direction === 'reversal';
}

function milestonesForEntries(entries, legacyPoints, relationshipOffset = 0) {
  const summary = summarizeRewardLedger(entries, []);
  const derived = relationshipOffset ? 0 : derivedRelationshipMilestones(countMainQuestDays(entries));
  const points = Math.max(
    legacyPoints,
    finiteNonNegative(summary.relationship) - relationshipOffset + derived,
  );
  return {
    projectCompleted: Boolean(deriveActiveProject(entries, []).completed),
    relationshipStage: relationshipStageForPoints(points),
  };
}

function normalizePresentedMilestones(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.projectCompleted !== 'boolean') return null;
  if (!RELATIONSHIP_STAGES.includes(value.relationshipStage)) return null;
  const pending = value.pending && typeof value.pending.revealId === 'string'
    && value.pending.to && typeof value.pending.to.projectCompleted === 'boolean'
    && RELATIONSHIP_STAGES.includes(value.pending.to.relationshipStage)
    ? { revealId: value.pending.revealId, to: { ...value.pending.to } }
    : null;
  return { projectCompleted: value.projectCompleted, relationshipStage: value.relationshipStage, pending };
}

// What the user last saw. The first time (no stored value) it is computed with
// the current rule from the ledger before this reconciliation, minus what the
// still-valid queued reveals have not shown yet; so history caught up by the
// rule is not replayed, while an unplayed completion still is.
function presentedMilestonesBefore(state, legacyPoints) {
  const stored = normalizePresentedMilestones(state.presentedMilestones);
  const queuedIds = new Set((state.pendingRewardReveals || []).map(reveal => reveal?.id));
  if (stored) {
    // An older tab played the reveal and could not move the baseline.
    if (stored.pending && !queuedIds.has(stored.pending.revealId)) {
      return { ...stored.pending.to, pending: null };
    }
    return stored;
  }
  const entries = activeCurrentRulesetEntries(state);
  const activeIds = new Set(entries.map(entry => entry.id));
  const unplayed = (state.pendingRewardReveals || [])
    .filter(reveal => reveal && revealMatchesActiveLedger(reveal, activeIds));
  let unplayedRelationship = 0;
  let unplayedCompletion = false;
  let unplayedStageFrom = null;
  for (const reveal of unplayed) {
    if (!isPreMilestoneReveal(reveal)) {
      if (reveal.milestone?.project === PROJECT_COMPLETED) unplayedCompletion = true;
      if (reveal.milestone?.stage) unplayedStageFrom = reveal.milestone.stage.from;
      continue;
    }
    if (isQueuedCompletionReveal(reveal)) unplayedCompletion = true;
    unplayedRelationship += (reveal.rewards || [])
      .filter(reward => reward?.direction !== 'reversed' && reward?.rewardType === 'relationship'
        && activeIds.has(reward.id))
      .reduce((sum, reward) => sum + finiteNonNegative(reward.amount), 0);
  }
  // An unplayed relationship entry is shown together with whatever the rule
  // has caught up since, as one change (not after the derived milestones).
  const base = milestonesForEntries(entries, legacyPoints, unplayedRelationship);
  return {
    projectCompleted: unplayedCompletion ? false : base.projectCompleted,
    relationshipStage: unplayedStageFrom || base.relationshipStage,
    pending: null,
  };
}

// The Session whose Main Quest day reached a stage: the project completion
// for `familiar`, then the 12th and 30th distinct Main Quest days.
function stageAnchorSourceId(stage, entries, project) {
  if (stage === 'familiar') return project?.completedBySessionId || null;
  const day = STAGE_MILESTONE_DAYS[stage];
  if (!day) return null;
  const days = entries
    .filter(entry => entry.rewardType === 'quest_progress'
      && String(entry.rewardKey || '').startsWith('main-focus:'))
    .sort((left, right) => String(left.rewardKey).localeCompare(String(right.rewardKey)));
  const unique = [];
  for (const entry of days) {
    if (!unique.length || unique.at(-1).rewardKey !== entry.rewardKey) unique.push(entry);
  }
  return unique[day - 1]?.sourceId || null;
}

function changesMainQuestDay(reveal) {
  return (reveal.rewards || []).some(reward => reward?.rewardType === 'quest_progress'
    && String(reward.rewardKey || '').startsWith('main-focus:'));
}

// Picks the one reveal that shows the net change (§3.4 placement order).
function chooseMilestoneReveal(queue, newIds, net, entries, project, { anchorOnly = false } = {}) {
  const up = isMilestoneUp(net);
  const allowed = reveal => !(up && isReversalOnly(reveal));
  const anchor = isStageUp(net.stage)
    ? stageAnchorSourceId(net.stage.to, entries, project)
    : net.project === PROJECT_COMPLETED ? project?.completedBySessionId || null : null;
  if (anchor) {
    const atAnchor = queue.filter(reveal => reveal.sourceId === anchor && allowed(reveal));
    const chosen = atAnchor.find(reveal => newIds.has(reveal.id)) || atAnchor.at(-1);
    if (chosen) return chosen;
  }
  if (anchorOnly) return null;
  const dayChanged = queue.filter(reveal => newIds.has(reveal.id)
    && changesMainQuestDay(reveal) && allowed(reveal));
  if (dayChanged.length) return dayChanged.at(-1);
  return [...queue].reverse().find(reveal => !isReversalOnly(reveal)) || null;
}

// With nothing recorded (opening the app, a sync) a queued milestone can only
// shrink or go: what came with a sync goes into the baseline instead.
function shrinkMilestone(milestone, current) {
  if (!hasMilestone(milestone)) return null;
  let project = milestone.project;
  if (project === PROJECT_COMPLETED && !current.projectCompleted) project = null;
  if (project === PROJECT_UNCOMPLETED && current.projectCompleted) project = null;
  let stage = milestone.stage;
  if (stage) {
    // Kept as `from → now` while now lies on the way to `to`; past `to`, at
    // `from` or the other way, the stage is no longer this reveal's to show.
    const from = stageIndex(stage.from);
    const to = stageIndex(stage.to) - from;
    const now = stageIndex(current.relationshipStage) - from;
    const onTheWay = now !== 0 && Math.sign(now) === Math.sign(to) && Math.abs(now) <= Math.abs(to);
    stage = onTheWay ? { from: stage.from, to: current.relationshipStage } : null;
  }
  return project || stage ? { project: project || null, stage: stage || null } : null;
}

function milestoneLines(milestone) {
  const lines = [];
  if (milestone?.project) {
    lines.push(formatRewardLine({
      rewardType: 'world_unlock',
      rewardKey: FORMAL_WORKSTATION_UNLOCK_KEY,
      direction: milestone.project === PROJECT_COMPLETED ? 'added' : 'reversed',
    }));
  }
  if (milestone?.stage) lines.push(`夥伴關係：${relationshipStageLabel(milestone.stage.to)}`);
  return lines;
}

// The controller never queues a reveal without rewards; one written by hand
// (e.g. by a test) is shown as it is.
function isPresentable(reveal) {
  return Array.isArray(reveal?.rewards) && reveal.rewards.length > 0;
}

// The world change a milestone leaves: the unlock first, then the stage.
function milestoneLabel(milestone) {
  const [projectLine, stageLine] = [
    milestoneLines({ project: milestone.project }),
    milestoneLines({ stage: milestone.stage }),
  ].map(lines => lines[0] || null);
  return milestone.project === PROJECT_COMPLETED ? projectLine : stageLine || projectLine;
}

// Everything a reveal shows follows from its rewards and its milestone; the
// unlock and relationship entries themselves are never lines any more.
function presentReveal(reveal) {
  if (!isPresentable(reveal)) return reveal;
  const milestone = hasMilestone(reveal.milestone) ? reveal.milestone : null;
  const lineRewards = reveal.rewards
    .filter(reward => reward && !MILESTONE_REWARD_TYPES.has(reward.rewardType));
  const lines = [...lineRewards.map(reward => formatRewardLine(reward)), ...milestoneLines(milestone)];
  const stageUp = isStageUp(milestone?.stage);
  const completed = milestone?.project === PROJECT_COMPLETED;
  // The unlock entry, when the reveal has it, still names the world change.
  const unlockReward = milestone?.project ? reveal.rewards.find(reward => reward?.rewardType === 'world_unlock'
    && reward.direction === (completed ? 'added' : 'reversed')) : null;
  const worldChange = createWorldChange(
    reveal.id,
    unlockReward || mostImportantReward(lineRewards),
    reveal.createdAt,
  );
  const presented = {
    ...reveal,
    milestone,
    projectCompleted: completed,
    relationshipStage: milestone?.stage || null,
    kind: completed || stageUp ? 'major' : revealKind(lineRewards),
    lines,
    worldChange: milestone
      ? {
        ...(worldChange || { id: `world-change:${reveal.id}`, sourceId: reveal.sourceId, createdAt: reveal.createdAt }),
        label: milestoneLabel(milestone),
      }
      : worldChange,
  };
  // The page and the Orbit Window title a stage-up of its own (§3.4).
  if (stageUp && !completed) presented.title = `夥伴關係：${relationshipStageLabel(milestone.stage.to)}`;
  else delete presented.title;
  return presented;
}

function netMilestone(presentedBefore, current) {
  return {
    project: current.projectCompleted === presentedBefore.projectCompleted
      ? null
      : current.projectCompleted ? PROJECT_COMPLETED : PROJECT_UNCOMPLETED,
    stage: current.relationshipStage === presentedBefore.relationshipStage
      ? null
      : { from: presentedBefore.relationshipStage, to: current.relationshipStage },
  };
}

// `mode`: 'place' moves the whole net change onto one reveal (recording or
// undoing a Session, and the first run under this rule); 'anchor' does so only
// onto the anchor Session's reveal an older tab queued; 'shrink' can only
// shrink or remove a queued milestone.
function placeMilestones({ queue, newIds, presentedBefore, current, entries, project, mode }) {
  const net = netMilestone(presentedBefore, current);
  const candidates = queue.filter(isPresentable);
  let target = null;
  if (hasMilestone(net) && mode === 'place') {
    target = chooseMilestoneReveal(candidates, newIds, net, entries, project);
  } else if (hasMilestone(net) && mode === 'anchor') {
    target = chooseMilestoneReveal(candidates.filter(isPreMilestoneReveal), new Set(), net, entries, project, {
      anchorOnly: true,
    });
  }
  const placed = queue.map(reveal => {
    if (!isPresentable(reveal)) return reveal;
    if (mode === 'shrink' || (mode === 'anchor' && !target)) {
      return { ...reveal, milestone: shrinkMilestone(reveal.milestone, current) };
    }
    return { ...reveal, milestone: target && reveal.id === target.id ? net : null };
  });
  const presented = placed.map(presentReveal)
    .filter(reveal => !isPresentable(reveal) || reveal.lines.length > 0);
  const carrier = presented.find(reveal => hasMilestone(reveal.milestone)) || null;
  // What the carrier does not show is merged into the baseline.
  const presentedMilestones = {
    projectCompleted: carrier?.milestone.project ? !current.projectCompleted : current.projectCompleted,
    relationshipStage: carrier?.milestone.stage ? carrier.milestone.stage.from : current.relationshipStage,
    pending: carrier ? { revealId: carrier.id, to: { ...current } } : null,
  };
  return { reveals: presented, presentedMilestones, current };
}

// The last world change in the words of now: a reveal still queued names it
// as it is shown, and a milestone a sync or undo has since taken back is no
// longer named (its reward still is).
function currentWorldChange(change, reveals, current) {
  if (!change?.label) return change;
  const revealId = String(change.id || '').replace(/^world-change:/, '');
  const queued = reveals.find(reveal => reveal.id === revealId && reveal.worldChange);
  if (queued) return queued.worldChange;
  const holds = milestoneLines({
    project: current.projectCompleted ? PROJECT_COMPLETED : PROJECT_UNCOMPLETED,
    stage: { to: current.relationshipStage },
  });
  if (holds.includes(change.label)) return change;
  const { label: _label, ...rest } = change;
  return rest;
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
  const changeIds = getEffectiveChangeIds(state, reconciliation);
  const activeRewards = listActiveRewards(reconciliation.ledger, reconciliation.tombstones);
  const activeRewardIds = new Set(activeRewards.map(entry => entry.id));
  // AI-202: max(legacy points, the ledger's relationship + derived milestones).
  const legacyPoints = legacyRelationshipPoints(state, oldSummary);
  const currentRulesetRewards = activeRewards.filter(entry => (
    entry.metadata?.rulesetId || entry.rulesetId || state.rulesetId || RULESET_ID
  ) === RULESET_ID);
  const mainQuestDays = countMainQuestDays(currentRulesetRewards);
  const relationshipPoints = Math.max(
    legacyPoints,
    finiteNonNegative(newSummary.relationship) + derivedRelationshipMilestones(mainQuestDays),
  );
  const revealEvents = options.queueReveal === true
    ? buildRevealEvents(
      reconciliation,
      changeIds,
      options.reconciledAt,
      getRevealContext(state, reconciliation),
    )
    : [];
  const countedSourceIds = countedProgressSourceIds(reconciliation.project);
  const retainedRevealQueue = (state.pendingRewardReveals || [])
    .filter(reveal => revealMatchesActiveLedger(reveal, activeRewardIds))
    .map(reveal => withoutUncountedProgress(reveal, countedSourceIds))
    .filter(Boolean);
  const relationshipStage = relationshipStageForPoints(relationshipPoints);
  const queue = normalizeRevealQueue([...retainedRevealQueue, ...revealEvents]);
  const presentedBefore = presentedMilestonesBefore(state, legacyPoints);
  const milestones = placeMilestones({
    queue,
    newIds: new Set(revealEvents.map(reveal => reveal.id)),
    presentedBefore,
    current: {
      projectCompleted: Boolean(reconciliation.project?.completed),
      relationshipStage,
    },
    entries: currentRulesetRewards,
    project: reconciliation.project,
    // Only recording or undoing a Session places a milestone, and the first
    // run under this rule places the ones older reveals have not shown yet.
    // Afterwards a reveal an older tab queued can still take its own.
    mode: options.queueReveal === true || !normalizePresentedMilestones(state.presentedMilestones)
      ? 'place'
      : queue.some(isPreMilestoneReveal) ? 'anchor' : 'shrink',
  });
  const pendingRewardReveals = milestones.reveals;
  const newRevealIds = new Set(revealEvents.map(reveal => reveal.id));
  const recentReveal = pendingRewardReveals.filter(reveal => newRevealIds.has(reveal.id)).at(-1) || null;
  const savedWorldChange = currentWorldChange(
    state.recentWorldChange,
    pendingRewardReveals,
    milestones.current,
  );
  const retainedWorldChange = worldChangeMatchesActiveLedger(savedWorldChange, activeRewardIds)
    && !isUncountedProgress(
      savedWorldChange?.metadata?.rewardType,
      savedWorldChange?.metadata?.direction,
      savedWorldChange?.sourceId,
      countedSourceIds,
    )
    ? savedWorldChange || null
    : null;
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
      relationshipStage,
      legacyRelationshipPoints: legacyPoints,
      relationshipPolicyId: RELATIONSHIP_POLICY_ID,
    },
    activeProject: { ...reconciliation.project },
    rewardLedger: reconciliation.ledger,
    rewardTombstones: reconciliation.tombstones,
    pendingRewardReveals,
    presentedMilestones: milestones.presentedMilestones,
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
  // AI-202B2: the user has now seen the reveal's milestone.
  const presented = normalizePresentedMilestones(state.presentedMilestones);
  const milestone = hasMilestone(consumedReveal.milestone) ? consumedReveal.milestone : null;
  const nextState = savePersonalSpaceV2State(ownerId, {
    ...state,
    pendingRewardReveals: queue.filter(reveal => reveal.id !== revealId),
    ...(presented && milestone ? {
      presentedMilestones: {
        projectCompleted: milestone.project
          ? milestone.project === PROJECT_COMPLETED
          : presented.projectCompleted,
        relationshipStage: milestone.stage ? milestone.stage.to : presented.relationshipStage,
        pending: null,
      },
    } : {}),
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
