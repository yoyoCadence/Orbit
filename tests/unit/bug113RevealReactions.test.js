/**
 * @vitest-environment jsdom
 *
 * BUG-113: a completed project made every later Main Quest reveal, and every
 * reversal, look like the completion. The reactions now follow what the
 * reconciliation changed for the user: the reveal of the Session that took the
 * project from incomplete to complete (by the ledger, as last seen) is flagged,
 * rewards that only move to another Session are not shown, only added unlocks
 * and relationship are `major`, and a reveal that only takes rewards back
 * leaves the Companion observing.
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
import { normalizeOrbitWindowModel } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { selectProtagonistState } from '../../pwa/js/personalSpace/v2/viewModels.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);

function dateAtOffset(offset) {
  const date = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mainQuestDay(day, { id = `day-${day}`, hour = 10 } = {}) {
  const date = dateAtOffset(day - 1);
  return {
    id,
    taskId: 'task-1',
    date,
    completedAt: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
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
  return settle(remaining, { deletedSourceIds: [typeof day === 'number' ? `day-${day}` : day] });
}

// The user has watched every queued reveal.
function seeAll(state) {
  return state.pendingRewardReveals.reduce((current, reveal) => (
    consumePersonalSpaceV2Reveal({ user: currentUser, revealId: reveal.id }).state
  ), state);
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
    const previous = seeAll(settle(days(5)));
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

  it('hands the day to a later Session that day without celebrating it', () => {
    // Undoing the day's winner makes the next Session that day the winner: it
    // gains the same Main Quest bundle the undone one loses.
    const later = mainQuestDay(6, { id: 'day-6-later', hour: 12 });
    const previous = seeAll(settle([...days(6), later]));
    const state = undo([...days(5), later], 6);
    const reveals = newReveals(previous, state);

    expect(reveals.map(reveal => reveal.sourceId)).toEqual(['day-6-later']);
    const [reveal] = reveals;
    expect(reveal.direction).toBe('reversal');
    expect(rewardTypes(reveal)).toEqual(['reversed:hidden_stat']);
    expect(reactionTo(reveal, state, [later])).toMatchObject({
      state: 'observe',
      dialogueKey: 'companion.observe',
    });
    expect(selectProtagonistState({ pendingReveal: reveal }).state).not.toBe('celebrate');
  });

  it('hands the completing day to a later Session that day without celebrating it', () => {
    const later = mainQuestDay(4, { id: 'day-4-later', hour: 12 });
    const previous = seeAll(settle([...days(4), later]));
    const state = undo([...days(3), later], 4);
    const reveals = newReveals(previous, state);

    expect(state.activeProject).toMatchObject({ completed: true, completedBySessionId: 'day-4-later' });
    expect(reveals.map(reveal => reveal.sourceId)).toEqual(['day-4-later']);
    expect(reveals.every(reveal => reveal.kind !== 'major' && !reveal.projectCompleted)).toBe(true);
    for (const reveal of reveals) {
      expect(reactionTo(reveal, state, [later]).state).toBe('observe');
      expect(selectProtagonistState({ pendingReveal: reveal }).state).not.toBe('celebrate');
    }
  });

  it('shows the day\'s Main Quest when it moves to a later Session before its reveal played', () => {
    const later = mainQuestDay(6, { id: 'day-6-later', hour: 12 });
    seeAll(settle(days(5)));
    settle(days(6));
    const previous = settle([...days(6), later]);
    const state = undo([...days(5), later], 6);
    const reveal = revealFor(previous, state, 'day-6-later');

    expect(rewardTypes(reveal)).toEqual(expect.arrayContaining(['added:gold', 'added:quest_progress']));
    expect(reactionTo(reveal, state).state).toBe('approach');
    // The undone Session's Main Quest was never seen, so its loss is not shown.
    const shown = newReveals(previous, state).flatMap(rewardTypes);
    expect(shown).not.toContain('reversed:gold');
    expect(shown).not.toContain('reversed:quest_progress');
  });

  it('celebrates the day that takes over a completion whose reveal has not played', () => {
    const previous = settle(days(5));
    const remaining = days(5).filter(session => session.id !== 'day-4');
    const state = undo(remaining, 4);
    const reveal = revealFor(previous, state, 'day-5');

    expect(reveal).toMatchObject({ projectCompleted: true, kind: 'major' });
    expect(reactionTo(reveal, state).state).toBe('congratulate');
    // Day 4's unlock and relationship were never seen, so their loss is not shown.
    const shown = newReveals(previous, state).flatMap(rewardTypes);
    expect(shown).not.toContain('reversed:world_unlock');
    expect(shown).not.toContain('reversed:relationship');
    expect(state.recentWorldChange.metadata.rewardType).not.toBe('world_unlock');
  });

  it('also recognises an unplayed completion reveal queued by an older version', () => {
    const queued = settle(days(5));
    const legacy = {
      ...queued,
      pendingRewardReveals: queued.pendingRewardReveals
        .map(({ projectCompleted: _flag, ...reveal }) => reveal),
    };
    const remaining = days(5).filter(session => session.id !== 'day-4');
    const state = applyReconciliationToV2State(legacy, reconcileRewardLedger({
      sessions: remaining,
      rewardLedger: legacy.rewardLedger,
      rewardTombstones: legacy.rewardTombstones,
      deletedSourceIds: ['day-4'],
    }), { queueReveal: true });

    expect(revealFor(legacy, state, 'day-5')).toMatchObject({ projectCompleted: true, kind: 'major' });
  });

  it('decides the completion from the ledger, not from the stored project', () => {
    const replay = (state, sessions) => applyReconciliationToV2State(
      state,
      reconcileRewardLedger({
        sessions,
        rewardLedger: state.rewardLedger,
        rewardTombstones: state.rewardTombstones,
      }),
      { queueReveal: true },
    );

    const three = settle(days(3));
    const storedAhead = { ...three, activeProject: { ...three.activeProject, completed: true } };
    expect(revealFor(storedAhead, replay(storedAhead, days(4)), 'day-4'))
      .toMatchObject({ projectCompleted: true, kind: 'major' });

    const four = seeAll(settle(days(4)));
    const storedBehind = { ...four, activeProject: { ...four.activeProject, completed: false } };
    expect(revealFor(storedBehind, replay(storedBehind, days(5)), 'day-5'))
      .toMatchObject({ projectCompleted: false, kind: 'medium' });
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

  it('never shows an undo queued by an older version as a world milestone', () => {
    const model = normalizeOrbitWindowModel({
      pendingReveal: { id: 'old-undo', kind: 'major', direction: 'reversal' },
    });
    expect(model.pendingReveal.kind).toBe('medium');
    expect(normalizeOrbitWindowModel({
      pendingReveal: { id: 'completion', kind: 'major', direction: 'settlement' },
    }).pendingReveal.kind).toBe('major');
  });

  it('does not count reversed progress as progress', () => {
    const reveal = { rewards: [{ ...progress, direction: 'reversed' }] };
    expect(getCompanionReaction({ pendingReveal: reveal, momentum: 'stable' }).state).toBe('observe');
    expect(selectProtagonistState({ pendingReveal: reveal }).state).toBe('inspect');
  });
});
