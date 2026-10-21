/**
 * @vitest-environment jsdom
 *
 * BUG-114: past 100% a Main Quest day still records `project_progress +25`,
 * and an undo that leaves four Main Quest days records `-25`, but the project
 * does not move. Reveals show project progress only when the project's
 * progress actually changed, and the Companion's "the workspace changed" line
 * only appears when a reveal shows the project moving.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { REWARD_EPOCH } from '../../pwa/js/personalSpace/v2/config.js';
import {
  applyReconciliationToV2State,
  consumePersonalSpaceV2Reveal,
  reconcileAndSavePersonalSpaceV2,
} from '../../pwa/js/personalSpace/v2/controller.js';
import { getCompanionReaction } from '../../pwa/js/personalSpace/v2/companionEngine.js';
import { reconcileRewardLedger } from '../../pwa/js/personalSpace/v2/reconciler.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);
const currentUser = { id: 'bug-114-owner', totalXP: 2000 };

function mainQuestDay(day, { id = `day-${day}`, hour = 10 } = {}) {
  const date = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  const isoDate = date.toISOString().slice(0, 10);
  return {
    id,
    taskId: 'task-1',
    date: isoDate,
    completedAt: `${isoDate}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    result: 'complete',
    durationMinutes: 30,
    impactType: 'task',
    taskNature: 'growth',
    value: 'A',
    resistance: 1.2,
    finalXP: 50,
    isProductiveXP: true,
  };
}

const days = (...numbers) => numbers.map(mainQuestDay);

// Settles the Sessions and returns the state with its queued reveals; unless
// told otherwise, the user then watches them.
function settle(sessions, { watch = true, ...extra } = {}) {
  const queued = reconcileAndSavePersonalSpaceV2({
    user: currentUser,
    sessions,
    queueReveal: true,
    ...extra,
  }).state;
  if (watch) {
    queued.pendingRewardReveals.forEach(reveal => {
      consumePersonalSpaceV2Reveal({ user: currentUser, revealId: reveal.id });
    });
  }
  return queued;
}

function progressLines(state) {
  return state.pendingRewardReveals
    .flatMap(reveal => reveal.rewards)
    .filter(reward => reward.rewardType === 'project_progress')
    .map(reward => `${reward.direction}:${reward.amount}`);
}

describe('BUG-114 project progress lines', () => {
  beforeEach(() => localStorage.clear());

  it('shows the project moving up to 100%', () => {
    settle(days(1, 2));
    const state = settle(days(1, 2, 3));
    expect(state.activeProject.progress).toBe(75);
    expect(progressLines(state)).toEqual(['added:25']);
    expect(getCompanionReaction({ pendingReveal: state.pendingRewardReveals[0] }).dialogueKey)
      .toBe('companion.project.workspace-upgrade.progress');
  });

  it('shows no project progress for a Main Quest day past 100%', () => {
    settle(days(1, 2, 3, 4));
    const state = settle(days(1, 2, 3, 4, 5));
    const [reveal] = state.pendingRewardReveals;

    expect(state.activeProject.progress).toBe(100);
    expect(progressLines(state)).toEqual([]);
    expect(reveal.rewards.map(reward => reward.rewardType))
      .toEqual(expect.arrayContaining(['gold', 'quest_progress']));
    // The day's Session line, even when the reveal plays on a later day.
    expect(getCompanionReaction({ pendingReveal: reveal }))
      .toMatchObject({ state: 'approach', dialogueKey: 'companion.session.productive-complete' });
  });

  it('shows no project progress when an undo leaves the project at 100%', () => {
    settle(days(1, 2, 3, 4, 5, 6));
    const afterLaterDay = settle(days(1, 2, 3, 4, 5), { deletedSourceIds: ['day-6'] });
    const afterCompletingDay = settle(days(1, 2, 3, 5), { deletedSourceIds: ['day-4'] });

    expect(afterLaterDay.activeProject.progress).toBe(100);
    expect(progressLines(afterLaterDay)).toEqual([]);
    expect(afterCompletingDay.activeProject.progress).toBe(100);
    expect(progressLines(afterCompletingDay)).toEqual([]);
  });

  it('shows the project moving when a later Session takes over a day the user has not watched', () => {
    const later = mainQuestDay(2, { id: 'day-2-later', hour: 12 });
    settle(days(1));
    settle(days(1, 2), { watch: false });
    settle([...days(1, 2), later], { watch: false });
    const state = settle([mainQuestDay(1), later], { deletedSourceIds: ['day-2'] });
    const reveal = state.pendingRewardReveals.find(entry => entry.sourceId === 'day-2-later');

    expect(state.activeProject.progress).toBe(50);
    expect(progressLines(state)).toEqual(['added:25']);
    expect(getCompanionReaction({ pendingReveal: reveal }).dialogueKey)
      .toBe('companion.project.workspace-upgrade.progress');
  });

  it('cleans up a reveal and world change an older version saved past 100%', () => {
    settle(days(1, 2, 3, 4));
    const saved = settle(days(1, 2, 3, 4, 5), { watch: false });
    const entry = saved.rewardLedger
      .find(reward => reward.sourceId === 'day-5' && reward.rewardType === 'project_progress');
    const progress = { ...entry, direction: 'added' };
    const older = {
      ...saved,
      pendingRewardReveals: saved.pendingRewardReveals.map(reveal => ({
        ...reveal,
        rewards: [...reveal.rewards, progress],
      })),
      recentWorldChange: {
        id: 'world-change:older',
        sourceId: 'day-5',
        type: 'project_progress',
        key: 'workspace-upgrade',
        amount: 25,
        metadata: { direction: 'added', rewardId: entry.id, rewardType: 'project_progress' },
      },
      recentWorldChangeEventId: entry.id,
    };
    // The silent reconcile at boot.
    const state = applyReconciliationToV2State(older, reconcileRewardLedger({
      sessions: days(1, 2, 3, 4, 5),
      rewardLedger: older.rewardLedger,
      rewardTombstones: older.rewardTombstones,
    }));

    expect(progressLines(state)).toEqual([]);
    expect(state.pendingRewardReveals[0].worldChange.metadata.rewardType).not.toBe('project_progress');
    expect(state.recentWorldChange).toBeNull();
    expect(getCompanionReaction({ pendingReveal: state.pendingRewardReveals[0] }).dialogueKey)
      .toBe('companion.session.productive-complete');
  });

  it('shows the project moving back when an undo lowers its progress', () => {
    settle(days(1, 2, 3, 4));
    const state = settle(days(1, 2, 3), { deletedSourceIds: ['day-4'] });
    expect(state.activeProject.progress).toBe(75);
    expect(progressLines(state)).toEqual(['reversed:25']);
  });
});
