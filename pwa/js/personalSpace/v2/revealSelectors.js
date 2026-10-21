const PROJECT_PROGRESS = 'project_progress';
const QUEST_PROGRESS = 'quest_progress';
const WORLD_UNLOCK = 'world_unlock';
const WORKSPACE_PROJECT = 'workspace-upgrade';
const FORMAL_WORKSTATION = 'formal-workstation';

function rewardsFor(reveal) {
  return Array.isArray(reveal?.rewards)
    ? reveal.rewards.filter(reward => reward && typeof reward === 'object')
    : [];
}

function hasReward(reveal, predicate) {
  return rewardsFor(reveal).some(predicate);
}

// A reversed reward takes progress back; it never counts as progress made.
function hasAddedReward(reveal, predicate) {
  return hasReward(reveal, reward => reward.direction !== 'reversed' && predicate(reward));
}

/** Structured reveal selectors; free-form labels and dialogue never drive state. */
export function isProjectCompletionReveal(reveal) {
  // The controller flags the reveal whose Session took the project from
  // incomplete to complete (BUG-113); later days and handovers are not it.
  if (typeof reveal?.projectCompleted === 'boolean') return reveal.projectCompleted;
  // Reveals queued before the flag existed, or by an older tab.
  return hasAddedReward(reveal, reward => (
    reward.rewardType === WORLD_UNLOCK
    || reward.rewardKey === FORMAL_WORKSTATION
    || reward.metadata?.tier === 'project-completion'
  ));
}

export function isQuestOrProjectProgressReveal(reveal) {
  return hasAddedReward(reveal, reward => (
    reward.rewardType === QUEST_PROGRESS
    || reward.rewardType === PROJECT_PROGRESS
    || reward.rewardKey === WORKSPACE_PROJECT
    || String(reward.rewardKey || '').startsWith('main-focus:')
  ));
}

export function isWorldProgressReveal(reveal) {
  return isQuestOrProjectProgressReveal(reveal)
    || hasAddedReward(reveal, reward => reward.rewardType === WORLD_UNLOCK);
}
