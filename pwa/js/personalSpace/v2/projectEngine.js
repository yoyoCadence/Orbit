import { listActiveRewards } from './rewardLedger.js';
import {
  DAILY_PROJECT_PROGRESS,
  REWARD_TYPES,
  WORKSPACE_PROJECT_KEY,
  getProjectCompletionRewardSpecs,
} from './rewardRules.js';

export const WORKSPACE_PROJECT_LABEL = 'Workspace Upgrade';
export const PROJECT_REQUIRED_DAILY_ENTRIES = 4;
export const PROJECT_MAX_PROGRESS = 100;

function projectEntryOrder(left, right) {
  return String(left.metadata?.sessionDate || '').localeCompare(
    String(right.metadata?.sessionDate || ''),
  ) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')) ||
    String(left.id || '').localeCompare(String(right.id || ''));
}

export function getDailyProjectEntries(entries = [], tombstones = [], options = {}) {
  const projectId = options.projectId || WORKSPACE_PROJECT_KEY;
  const sorted = listActiveRewards(entries, tombstones)
    .filter(entry => entry.rewardType === REWARD_TYPES.PROJECT_PROGRESS)
    .filter(entry => entry.rewardKey === projectId)
    .sort(projectEntryOrder);

  const daily = new Map();
  for (const entry of sorted) {
    const key = entry.metadata?.sessionDate || `source:${entry.sourceId}`;
    if (!daily.has(key)) daily.set(key, entry);
  }
  return [...daily.values()];
}

export function deriveActiveProject(entries = [], tombstones = [], options = {}) {
  const projectId = options.projectId || WORKSPACE_PROJECT_KEY;
  const contributors = getDailyProjectEntries(entries, tombstones, { projectId });
  const rawProgress = contributors.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0,
  );
  const progress = Math.max(0, Math.min(PROJECT_MAX_PROGRESS, rawProgress));
  const completed = contributors.length >= PROJECT_REQUIRED_DAILY_ENTRIES &&
    progress >= PROJECT_MAX_PROGRESS;
  const completionEntry = completed
    ? contributors[PROJECT_REQUIRED_DAILY_ENTRIES - 1]
    : null;
  const remainingCompletions = Math.max(
    0,
    PROJECT_REQUIRED_DAILY_ENTRIES - contributors.length,
  );

  return {
    id: projectId,
    label: WORKSPACE_PROJECT_LABEL,
    progress,
    currentPhase: Math.min(4, Math.floor(progress / DAILY_PROJECT_PROGRESS)),
    completed,
    contributionCount: contributors.length,
    contributingSessionIds: contributors.map(entry => entry.sourceId),
    completedBySessionId: completionEntry?.sourceId || null,
    completedAt: completionEntry?.createdAt || null,
    nextRequirement: completed ? null : {
      type: 'daily-main-quest',
      remainingCompletions,
    },
  };
}

export function getProjectCompletionTrigger(entries = [], tombstones = [], options = {}) {
  const project = deriveActiveProject(entries, tombstones, options);
  if (!project.completed) return null;
  const projectEntries = getDailyProjectEntries(entries, tombstones, options);
  const sourceEntry = projectEntries[PROJECT_REQUIRED_DAILY_ENTRIES - 1];
  return {
    project,
    sourceId: sourceEntry.sourceId,
    sourceEntry,
    rewardSpecs: getProjectCompletionRewardSpecs(project.id),
  };
}

export const deriveProjectState = deriveActiveProject;
export const reduceProjectProgress = deriveActiveProject;
