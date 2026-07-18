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

/** Structured reveal selectors; free-form labels and dialogue never drive state. */
export function isProjectCompletionReveal(reveal, activeProject) {
  const hasCompletionReward = hasReward(reveal, reward => (
    reward.rewardType === WORLD_UNLOCK
    || reward.rewardKey === FORMAL_WORKSTATION
    || reward.metadata?.tier === 'project-completion'
  ));
  if (hasCompletionReward) return true;

  return Number(activeProject?.progress) >= 100 && hasReward(reveal, reward => (
    reward.rewardType === PROJECT_PROGRESS
    && reward.rewardKey === WORKSPACE_PROJECT
  ));
}

export function isQuestOrProjectProgressReveal(reveal) {
  return hasReward(reveal, reward => (
    reward.rewardType === QUEST_PROGRESS
    || reward.rewardType === PROJECT_PROGRESS
    || reward.rewardKey === WORKSPACE_PROJECT
    || String(reward.rewardKey || '').startsWith('main-focus:')
  ));
}

export function isWorldProgressReveal(reveal) {
  return isQuestOrProjectProgressReveal(reveal)
    || hasReward(reveal, reward => reward.rewardType === WORLD_UNLOCK);
}
