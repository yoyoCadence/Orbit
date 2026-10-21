import {
  isProjectCompletionReveal,
  isQuestOrProjectProgressReveal,
} from './revealSelectors.js';

export const PRODUCTIVE_RESULTS = new Set(['complete', 'partial', 'instant']);

function freezeReaction(reaction) {
  return Object.freeze({
    relationshipDelta: 0,
    worldAction: null,
    ...reaction,
  });
}

function getLatestValidSession(recentSessions) {
  return (Array.isArray(recentSessions) ? recentSessions : [])
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session && session.result !== 'invalid')
    .sort((left, right) => {
      const rightTime = Date.parse(right.session.completedAt || '') || 0;
      const leftTime = Date.parse(left.session.completedAt || '') || 0;
      return rightTime - leftTime || left.index - right.index;
    })[0]?.session ?? null;
}

// A reveal that only takes rewards back (an undone Session). Kept local:
// importing a new export across SHELL modules can fail to link while an older
// copy of the other module is still cached (INFRA-105).
function isReversalOnlyReveal(reveal) {
  return reveal?.direction === 'reversal';
}

// The workspace line only when the reveal shows the project moving: past 100%
// a Main Quest day is still progress, but the workspace no longer changes
// (BUG-114).
function showsProjectProgress(reveal) {
  return Array.isArray(reveal?.rewards) && reveal.rewards.some(reward => (
    reward?.direction !== 'reversed' && reward?.rewardType === 'project_progress'
  ));
}

function hasSelectedGoal(missedPatterns) {
  if (!missedPatterns) return false;
  if (Array.isArray(missedPatterns)) {
    return missedPatterns.some(pattern => pattern?.selectedByUser === true || pattern?.goalId);
  }
  return missedPatterns.hasSelectedGoal === true
    || missedPatterns.selectedGoalId != null
    || missedPatterns.goalId != null;
}

/**
 * Deterministic, presentation-only Companion selector. It never grants rewards
 * or changes relationship state; reducers retain that responsibility.
 */
export function getCompanionReaction({
  recentSessions = [],
  momentum = 'low',
  missedPatterns = null,
  pendingReveal = null,
} = {}) {
  // Nothing was earned, so neither congratulate nor approach (BUG-113); this
  // also wins over a productive Session earlier the same day.
  if (isReversalOnlyReveal(pendingReveal)) {
    return freezeReaction({
      state: 'observe',
      dialogueKey: 'companion.observe',
      animationKey: 'observe',
      worldAction: null,
    });
  }

  if (isProjectCompletionReveal(pendingReveal)) {
    return freezeReaction({
      state: 'congratulate',
      dialogueKey: 'companion.project.workspace-upgrade.complete',
      animationKey: 'congratulate',
      worldAction: 'celebrate-project',
    });
  }

  if (isQuestOrProjectProgressReveal(pendingReveal)) {
    if (showsProjectProgress(pendingReveal)) {
      return freezeReaction({
        state: 'approach',
        dialogueKey: 'companion.project.workspace-upgrade.progress',
        animationKey: 'approach',
        worldAction: 'approach-project',
      });
    }
    // The reveal still shows a productive Main Quest, whichever Sessions the
    // current day holds.
    return freezeReaction({
      state: 'approach',
      dialogueKey: 'companion.session.productive-complete',
      animationKey: 'approach',
      worldAction: 'approach-player',
    });
  }

  const latestSession = getLatestValidSession(recentSessions);
  if (latestSession?.impactType === 'recovery'
      && PRODUCTIVE_RESULTS.has(latestSession.result)) {
    return freezeReaction({
      state: 'rest',
      dialogueKey: 'companion.recovery.completed',
      animationKey: 'rest',
      worldAction: 'rest-near-player',
    });
  }

  if (latestSession?.impactType === 'task'
      && PRODUCTIVE_RESULTS.has(latestSession.result)) {
    return freezeReaction({
      state: 'approach',
      dialogueKey: 'companion.session.productive-complete',
      animationKey: 'approach',
      worldAction: 'approach-player',
    });
  }

  const momentumState = typeof momentum === 'string' ? momentum : momentum?.state;
  if (momentumState === 'strong' || momentumState === 'peak') {
    return freezeReaction({
      state: 'work',
      dialogueKey: 'companion.momentum.strong',
      animationKey: 'work',
      worldAction: 'work-at-project',
    });
  }

  if (momentumState === 'low' && hasSelectedGoal(missedPatterns)) {
    return freezeReaction({
      state: 'remind',
      dialogueKey: 'companion.goal.gentle-reminder',
      animationKey: 'remind',
      worldAction: null,
    });
  }

  return freezeReaction({
    state: 'observe',
    dialogueKey: momentumState === 'low'
      ? 'companion.momentum.low'
      : 'companion.observe',
    animationKey: 'observe',
    worldAction: null,
  });
}

export const selectCompanionState = getCompanionReaction;
