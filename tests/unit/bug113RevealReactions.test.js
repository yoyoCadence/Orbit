/**
 * @vitest-environment jsdom
 *
 * BUG-113: a completed project made every later Main Quest reveal, and every
 * reversal, look like the completion. The reactions now follow what the
 * reconciliation actually changed: the reveal that completed the project is
 * flagged when `activeProject.completed` goes false → true, only added
 * unlocks and relationship that change state are `major`, and a reveal that
 * only takes rewards back leaves the Companion observing.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { REWARD_EPOCH } from '../../pwa/js/personalSpace/v2/config.js';
import { reconcileAndSavePersonalSpaceV2 } from '../../pwa/js/personalSpace/v2/controller.js';
import { getCompanionReaction } from '../../pwa/js/personalSpace/v2/companionEngine.js';
import { selectProtagonistState } from '../../pwa/js/personalSpace/v2/viewModels.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);

function dateAtOffset(offset) {
  const date = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mainQuestDay(day) {
  const date = dateAtOffset(day - 1);
  return {
    id: `day-${day}`,
    taskId: 'task-1',
    date,
    completedAt: `${date}T10:00:00.000Z`,
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

const days = count => Array.from({ length: count }, (_, index) => mainQuestDay(index + 1));
const currentUser = { id: 'bug-113-owner', totalXP: 2000 };

function settle(sessions, extra = {}) {
  return reconcileAndSavePersonalSpaceV2({
    user: currentUser,
    sessions,
    queueReveal: true,
    reconciledAt: `${dateAtOffset(sessions.length)}T12:00:00.000Z`,
    ...extra,
  }).state;
}

function undo(remaining, day) {
  return settle(remaining, { deletedSourceIds: [`day-${day}`] });
}

// Reveals this reconciliation queued; earlier ones may still be waiting.
function newReveals(previous, state) {
  const seen = new Set(previous.pendingRewardReveals.map(reveal => reveal.id));
  return state.pendingRewardReveals.filter(reveal => !seen.has(reveal.id));
}

function revealFor(previous, state, sourceId) {
  return newReveals(previous, state).find(reveal => reveal.sourceId === sourceId) || null;
}

function reactionTo(reveal, state, recentSessions = []) {
  return getCompanionReaction({
    pendingReveal: reveal,
    activeProject: state.activeProject,
    recentSessions,
    momentum: 'stable',
  });
}

function rewardTypes(reveal) {
  return reveal.rewards.map(reward => `${reward.direction}:${reward.rewardType}`).sort();
}

describe('BUG-113 project completion and reversal reveals', () => {
  beforeEach(() => localStorage.clear());

  it('celebrates the Session that completes the project, once', () => {
    const previous = settle(days(3));
    const state = settle(days(4));
    const reveal = revealFor(previous, state, 'day-4');

    expect(state.activeProject).toMatchObject({ completed: true, completedBySessionId: 'day-4' });
    expect(reveal).toMatchObject({ projectCompleted: true, kind: 'major' });
    expect(reactionTo(reveal, state)).toMatchObject({
      state: 'congratulate',
      dialogueKey: 'companion.project.workspace-upgrade.complete',
    });
    expect(selectProtagonistState({ pendingReveal: reveal }).state).toBe('celebrate');
  });

  it('treats a Main Quest day after completion as progress, not as the completion', () => {
    const previous = settle(days(4));
    const state = settle(days(5));
    const reveal = revealFor(previous, state, 'day-5');

    expect(reveal).toMatchObject({ projectCompleted: false, kind: 'medium' });
    expect(reactionTo(reveal, state)).toMatchObject({
      state: 'approach',
      dialogueKey: 'companion.project.workspace-upgrade.progress',
    });
  });

  it('only observes when a day after completion is undone, even with another Session today', () => {
    const previous = settle(days(6));
    const state = undo(days(5), 6);
    const reveal = revealFor(previous, state, 'day-6');
    const otherSessionToday = { ...mainQuestDay(6), id: 'other-today' };

    expect(reveal).toMatchObject({ direction: 'reversal', projectCompleted: false });
    expect(reveal.kind).not.toBe('major');
    expect(reactionTo(reveal, state, [otherSessionToday])).toMatchObject({
      state: 'observe',
      dialogueKey: 'companion.observe',
    });
    expect(selectProtagonistState({ pendingReveal: reveal }).state).not.toBe('celebrate');
  });

  it('shows the lost unlock without celebrating when the completing day is undone', () => {
    const previous = settle(days(4));
    const state = undo(days(3), 4);
    const reveal = revealFor(previous, state, 'day-4');

    expect(state.activeProject.completed).toBe(false);
    expect(reveal).toMatchObject({ direction: 'reversal', projectCompleted: false });
    expect(reveal.kind).not.toBe('major');
    expect(rewardTypes(reveal)).toEqual(expect.arrayContaining([
      'reversed:relationship',
      'reversed:world_unlock',
    ]));
    expect(reactionTo(reveal, state)).toMatchObject({
      state: 'observe',
      dialogueKey: 'companion.observe',
    });
    expect(selectProtagonistState({ pendingReveal: reveal }).state).not.toBe('celebrate');
  });

  it('hands completion to the next day without an unlock or relationship line', () => {
    const previous = settle(days(5));
    const remaining = days(5).filter(session => session.id !== 'day-4');
    const state = undo(remaining, 4);
    const reversal = revealFor(previous, state, 'day-4');

    expect(state.activeProject).toMatchObject({ completed: true, completedBySessionId: 'day-5' });
    expect(state.companion.relationshipPoints).toBe(1);
    expect(reversal.kind).not.toBe('major');
    expect(rewardTypes(reversal).some(type => /world_unlock|relationship/.test(type))).toBe(false);
    expect(reactionTo(reversal, state)).toMatchObject({
      state: 'observe',
      dialogueKey: 'companion.observe',
    });
    // Day 5 only takes over the completion: nothing about the world changed.
    expect(newReveals(previous, state).map(reveal => reveal.sourceId)).toEqual(['day-4']);
    expect(state.recentWorldChange.metadata.rewardType).not.toMatch(/world_unlock|relationship/);
  });
});

describe('BUG-113 reveal selectors', () => {
  const unlock = { rewardType: 'world_unlock', rewardKey: 'formal-workstation' };
  const progress = { rewardType: 'project_progress', rewardKey: 'workspace-upgrade' };

  it('trusts the completion flag over the rewards', () => {
    const reveal = { projectCompleted: false, rewards: [{ ...unlock, direction: 'added' }] };
    expect(getCompanionReaction({ pendingReveal: reveal }).state).not.toBe('congratulate');
  });

  it('still recognises a flagless completion from an older version, but not a reversed one', () => {
    expect(getCompanionReaction({
      pendingReveal: { rewards: [{ ...unlock, direction: 'added' }] },
    }).state).toBe('congratulate');
    expect(getCompanionReaction({
      pendingReveal: { rewards: [{ ...unlock, direction: 'reversed' }] },
    }).state).not.toBe('congratulate');
  });

  it('does not count reversed progress as progress', () => {
    const reveal = { rewards: [{ ...progress, direction: 'reversed' }] };
    expect(getCompanionReaction({ pendingReveal: reveal, momentum: 'stable' }).state).toBe('observe');
    expect(selectProtagonistState({ pendingReveal: reveal }).state).toBe('inspect');
  });
});
