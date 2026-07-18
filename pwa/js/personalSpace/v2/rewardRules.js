import { adaptSession } from './sessionAdapter.js';

export const REWARD_TYPES = Object.freeze({
  HIDDEN_STAT: 'hidden_stat',
  GOLD: 'gold',
  QUEST_PROGRESS: 'quest_progress',
  PROJECT_PROGRESS: 'project_progress',
  WORLD_UNLOCK: 'world_unlock',
  RELATIONSHIP: 'relationship',
});

export const HIDDEN_STAT_KEYS = Object.freeze([
  'discipline',
  'depth',
  'vitality',
  'order',
  'courage',
  'craft',
]);

export const DAILY_MAIN_QUEST_KEY = 'main-focus';
export const WORKSPACE_PROJECT_KEY = 'workspace-upgrade';
export const FORMAL_WORKSTATION_UNLOCK_KEY = 'formal-workstation';
export const COMPANION_RELATIONSHIP_KEY = 'companion';

export const DAILY_MAIN_QUEST_GOLD = 100;
export const DAILY_MAIN_QUEST_DEPTH = 3;
export const DAILY_MAIN_QUEST_PROGRESS = 1;
export const DAILY_PROJECT_PROGRESS = 25;
export const ORDINARY_HIDDEN_STAT_AMOUNT = 1;

/** Exact ordinary-reward priority; null means the Session earns no game reward. */
export function mapSessionToHiddenStat(session = {}) {
  const canonical = session?.occurredAt ? session : adaptSession(session);
  if (!canonical.isValid) return null;
  if ((canonical.impactType === 'recovery' || canonical.taskNature === 'recovery') &&
      canonical.durationMinutes >= 30) {
    return 'vitality';
  }
  if (!canonical.isProductive) return null;
  if (canonical.value === 'S' || canonical.resistance >= 1.4 ||
      canonical.tags.includes('high-resistance')) {
    return 'courage';
  }
  if (canonical.durationMinutes >= 25) {
    return 'depth';
  }
  if (canonical.taskNature === 'maintenance' || canonical.taskNature === 'obligation') {
    return 'order';
  }
  if (canonical.taskNature === 'growth') return 'craft';
  return 'discipline';
}

export function getOrdinaryHiddenStatReward(session = {}) {
  const canonical = session?.occurredAt ? session : adaptSession(session);
  const rewardKey = mapSessionToHiddenStat(canonical);
  if (!rewardKey) return null;
  const amount = rewardKey === 'vitality' || rewardKey === 'courage'
    ? 2
    : ORDINARY_HIDDEN_STAT_AMOUNT;
  return reward(REWARD_TYPES.HIDDEN_STAT, rewardKey, amount, { tier: 'ordinary' });
}

function reward(rewardType, rewardKey, amount, metadata) {
  return { rewardType, rewardKey, amount, metadata };
}

export function getDailyMainQuestRewardKey(sessionDate) {
  return `${DAILY_MAIN_QUEST_KEY}:${String(sessionDate || '').trim()}`;
}

/**
 * Main-quest winners get the fixed four-entry bundle. Other valid Sessions get
 * exactly one hidden-stat entry, so no ordinary task can leak direct Gold.
 */
export function getSessionRewardSpecs(session = {}, options = {}) {
  const canonical = session?.occurredAt ? session : adaptSession(session, options);
  if (!canonical.isValid) return [];
  if (options.isDailyMainQuestWinner) {
    return [
      reward(REWARD_TYPES.GOLD, 'daily-main-quest', DAILY_MAIN_QUEST_GOLD,
        { tier: 'daily-main-quest' }),
      reward(REWARD_TYPES.HIDDEN_STAT, 'depth', DAILY_MAIN_QUEST_DEPTH,
        { tier: 'daily-main-quest' }),
      reward(REWARD_TYPES.QUEST_PROGRESS, getDailyMainQuestRewardKey(canonical.date),
        DAILY_MAIN_QUEST_PROGRESS, { tier: 'daily-main-quest' }),
      reward(REWARD_TYPES.PROJECT_PROGRESS, WORKSPACE_PROJECT_KEY,
        DAILY_PROJECT_PROGRESS, { tier: 'daily-main-quest' }),
    ];
  }
  const ordinaryReward = getOrdinaryHiddenStatReward(canonical);
  return ordinaryReward ? [ordinaryReward] : [];
}

export function getProjectCompletionRewardSpecs(projectKey = WORKSPACE_PROJECT_KEY) {
  return [
    reward(REWARD_TYPES.WORLD_UNLOCK, FORMAL_WORKSTATION_UNLOCK_KEY, 1, {
      tier: 'project-completion',
      projectId: projectKey,
    }),
    reward(REWARD_TYPES.RELATIONSHIP, COMPANION_RELATIONSHIP_KEY, 1, {
      tier: 'project-completion',
      projectId: projectKey,
    }),
  ];
}

export const buildSessionRewardSpecs = getSessionRewardSpecs;
export const getHiddenStatForSession = mapSessionToHiddenStat;
