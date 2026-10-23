/**
 * @vitest-environment jsdom
 *
 * AI-202B2: the project completion and the relationship stage are shown as the
 * net change from what the user last saw (`presentedMilestones`), on one
 * reveal, instead of as the unlock and relationship ledger entries a reveal
 * carries. So a handover, a sync, an undo or a reveal an older tab played can
 * neither repeat a milestone nor show a stale one.
 * docs/ai-202-companion-relationship-proposal.md §3.4 and §8.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { REWARD_EPOCH, RULESET_ID } from '../../pwa/js/personalSpace/v2/config.js';
import {
  applyReconciliationToV2State,
  consumePersonalSpaceV2Reveal,
  reconcileAndSavePersonalSpaceV2,
} from '../../pwa/js/personalSpace/v2/controller.js';
import { getCompanionReaction } from '../../pwa/js/personalSpace/v2/companionEngine.js';
import { reconcileRewardLedger } from '../../pwa/js/personalSpace/v2/reconciler.js';
import {
  loadPersonalSpaceV2State,
  savePersonalSpaceV2State,
} from '../../pwa/js/personalSpace/v2/store.js';
import {
  normalizeOrbitWindowModel,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { selectProtagonistState } from '../../pwa/js/personalSpace/v2/viewModels.js';
import { renderPersonalSpaceV2 } from '../../pwa/js/pages/personalSpaceV2.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);
const UNLOCK = '解鎖：正式工作站';
const UNLOCK_TAKEN_BACK = '收回解鎖：正式工作站';
const FAMILIAR = '夥伴關係：熟悉夥伴';
const PARTNER = '夥伴關係：合作夥伴';
const TRUSTED = '夥伴關係：信賴夥伴';
const STAGE_LINE = /^夥伴關係：/;

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

// A valid Session that is not the day's Main Quest.
function ordinarySession(day) {
  const date = dateAtOffset(day - 1);
  return {
    id: `ordinary-${day}`,
    taskId: 'chores',
    date,
    completedAt: `${date}T15:00:00.000Z`,
    result: 'complete',
    durationMinutes: 20,
    impactType: 'task',
    taskNature: 'maintenance',
    value: 'B',
    resistance: 1,
    finalXP: 10,
    isProductiveXP: true,
  };
}

function invalidSession(day) {
  return { ...ordinarySession(day), id: `invalid-${day}`, result: 'invalid', finalXP: 0, isProductiveXP: false };
}

const range = (first, last) => Array.from({ length: last - first + 1 }, (_, index) => mainQuestDay(first + index));
const days = count => range(1, count);
const without = (sessions, ...ids) => sessions.filter(session => !ids.includes(session.id));
const currentUser = { id: 'ai-202b2-owner', totalXP: 2000 };

function settle(sessions, extra = {}) {
  return reconcileAndSavePersonalSpaceV2({
    user: currentUser,
    sessions,
    queueReveal: true,
    reconciledAt: `${dateAtOffset(sessions.length)}T12:00:00.000Z`,
    ...extra,
  }).state;
}

function undo(remaining, ...ids) {
  return settle(remaining, { deletedSourceIds: ids });
}

// Opening the app or a sync from another device: nothing is recorded here.
function sync(sessions, extra = {}) {
  return settle(sessions, { queueReveal: false, ...extra });
}

function consume(revealId) {
  return consumePersonalSpaceV2Reveal({ user: currentUser, revealId }).state;
}

// The user has watched every queued reveal.
function seeAll(state) {
  return state.pendingRewardReveals.reduce((current, reveal) => consume(reveal.id), state);
}

function stored() {
  return loadPersonalSpaceV2State(currentUser.id);
}

// What a tab on the previous version leaves: it plays a reveal without moving
// `presentedMilestones` (it keeps the field it does not know).
function oldTabConsumes(revealId) {
  const state = stored();
  return savePersonalSpaceV2State(currentUser.id, {
    ...state,
    pendingRewardReveals: state.pendingRewardReveals.filter(reveal => reveal.id !== revealId),
  });
}

// The state as v1.39.0 queued it: no `presentedMilestones`, and reveals with
// the BUG-113 flag but no milestone, drawn from their entries.
function asPreviousVersion(state) {
  const reveals = state.pendingRewardReveals.map(reveal => {
    const {
      milestone: _milestone, lines: _lines, title: _title, relationshipStage: _stage, ...rest
    } = reveal;
    const major = reveal.rewards.some(reward => reward.direction === 'added'
      && (reward.rewardType === 'world_unlock' || reward.rewardType === 'relationship'));
    return { ...rest, kind: major ? 'major' : rest.kind };
  });
  const { presentedMilestones: _presented, ...rest } = state;
  return savePersonalSpaceV2State(currentUser.id, { ...rest, pendingRewardReveals: reveals });
}

function revealOf(state, sourceId) {
  const matches = state.pendingRewardReveals.filter(reveal => reveal.sourceId === sourceId);
  return matches.at(-1) || null;
}

function stageLines(reveal) {
  return reveal.lines.filter(line => STAGE_LINE.test(line));
}

function carriers(state) {
  return state.pendingRewardReveals.filter(reveal => reveal.milestone);
}

function reactionTo(reveal, state, recentSessions = []) {
  return getCompanionReaction({
    pendingReveal: reveal,
    recentSessions,
    momentum: 'stable',
    relationshipStage: state.companion.relationshipStage,
  });
}

// Through `day` days, every reveal seen.
function seenThrough(day) {
  return seeAll(settle(days(day)));
}

describe('AI-202B2 milestone reveals', () => {
  beforeEach(() => localStorage.clear());

  describe('crossing a threshold', () => {
    it('shows the unlock and familiar on the 4th day, from before and after', () => {
      seenThrough(3);
      const state = settle(days(4));
      const reveal = revealOf(state, 'day-4');

      expect(reveal).toMatchObject({ kind: 'major', projectCompleted: true });
      expect(reveal.lines).toEqual(expect.arrayContaining([UNLOCK, FAMILIAR]));
      expect(reveal.lines).not.toContain('夥伴關係 +1');
      expect(reveal.title).toBeUndefined();
      expect(reveal.relationshipStage).toEqual({ from: 'stranger-observer', to: 'familiar' });
      expect(reactionTo(reveal, state)).toMatchObject({
        state: 'congratulate',
        dialogueKey: 'companion.project.workspace-upgrade.complete',
      });
      expect(state.recentWorldChange.label).toBe(UNLOCK);
      expect(state.presentedMilestones).toEqual({
        projectCompleted: false,
        relationshipStage: 'stranger-observer',
        pending: { revealId: reveal.id, to: { projectCompleted: true, relationshipStage: 'familiar' } },
      });

      const after = consume(reveal.id);
      expect(after.presentedMilestones).toEqual({
        projectCompleted: true, relationshipStage: 'familiar', pending: null,
      });
    });

    it('shows only the unlock when a legacy floor is already familiar', () => {
      const legacy = {
        version: 2,
        ownerId: 'pure-owner',
        rulesetId: RULESET_ID,
        rewardEpoch: REWARD_EPOCH,
        worldRevision: 0,
        economy: { openingGold: 0, earnedGold: 0, spentGold: 0, balanceGold: 0 },
        hiddenStats: {},
        companion: { relationshipStage: 'quiet-familiarity' },
        activeProject: {},
        rewardLedger: [],
        rewardTombstones: [],
        pendingRewardReveals: [],
      };
      const reconciliation = reconcileRewardLedger({
        sessions: days(4),
        rewardLedger: [],
        rewardTombstones: [],
        rulesetId: RULESET_ID,
        rewardEpoch: REWARD_EPOCH,
        reconciledAt: `${EPOCH_DATE}T23:00:00.000Z`,
      });
      const state = applyReconciliationToV2State(legacy, reconciliation, { queueReveal: true });
      const reveal = state.pendingRewardReveals.find(entry => entry.sourceId === 'day-4');

      expect(state.companion.relationshipStage).toBe('familiar');
      expect(reveal.lines).toContain(UNLOCK);
      expect(stageLines(reveal)).toEqual([]);
      expect(reactionTo(reveal, state).dialogueKey).toBe('companion.project.workspace-upgrade.complete');
    });

    it('titles the 12th day with the new stage on Home and on the full page', () => {
      seenThrough(11);
      const state = settle(days(12));
      const reveal = revealOf(state, 'day-12');

      expect(reveal).toMatchObject({ kind: 'major', projectCompleted: false, title: PARTNER });
      expect(stageLines(reveal)).toEqual([PARTNER]);
      expect(reactionTo(reveal, state)).toMatchObject({
        state: 'congratulate',
        dialogueKey: 'companion.relationship.stage-up',
      });
      expect(selectProtagonistState({ pendingReveal: reveal }).state).toBe('celebrate');

      const shell = document.createElement('div');
      shell.innerHTML = renderOrbitWindow(normalizeOrbitWindowModel({ pendingReveal: reveal }));
      expect(shell.querySelector('.orbit-window-reward strong').textContent).toBe(PARTNER);
      expect(shell.querySelector('.orbit-window-major-reveal strong').textContent).toBe(PARTNER);
      expect(shell.textContent).not.toContain('世界里程碑已解鎖');

      globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
      const container = document.createElement('div');
      document.body.appendChild(container);
      const cleanup = renderPersonalSpaceV2(container, {
        user: currentUser,
        coreState: { user: currentUser, tasks: [], dailyPlan: [], sessions: days(12) },
        reconcile: () => ({
          state,
          reconciliation: { ledger: state.rewardLedger, summary: {}, project: state.activeProject },
          ledgerSnapshot: { companion: state.companion, pendingRewardReveals: [reveal] },
        }),
        mountWindow: () => () => {},
        destroyRuntime: () => {},
        effectiveDate: dateAtOffset(12),
        now: new Date(`${dateAtOffset(12)}T12:00:00.000Z`),
      });
      expect(container.textContent).toContain(PARTNER);
      expect(container.textContent).not.toContain('世界有了新變化');
      cleanup();
      delete globalThis.IntersectionObserver;
      container.remove();
    });

    it('shows trusted companion on the 30th day', () => {
      seenThrough(29);
      const reveal = revealOf(settle(days(30)), 'day-30');
      expect(reveal).toMatchObject({ kind: 'major', title: TRUSTED });
      expect(stageLines(reveal)).toEqual([TRUSTED]);
    });

    it('shows both milestones on the 12th day when everything is recorded at once', () => {
      const state = settle(days(12));
      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(revealOf(state, 'day-12').lines).toEqual(expect.arrayContaining([UNLOCK, PARTNER]));
      expect(revealOf(state, 'day-4').lines).not.toContain(UNLOCK);
      expect(revealOf(state, 'day-4').kind).not.toBe('major');
    });
  });

  describe('undoing a Main Quest day', () => {
    it('shows nothing of the relationship when day 13 keeps the stage', () => {
      seenThrough(13);
      const state = undo(without(days(13), 'day-12'), 'day-12');
      const reveal = revealOf(state, 'day-12');

      expect(state.companion.relationshipStage).toBe('partner');
      expect(stageLines(reveal)).toEqual([]);
      expect(reveal.kind).not.toBe('major');
      expect(reactionTo(reveal, state).state).not.toBe('congratulate');
    });

    it('takes the stage back on the undo reveal without celebrating', () => {
      seenThrough(12);
      const state = undo(days(11), 'day-12');
      const reveal = revealOf(state, 'day-12');

      expect(state.companion.relationshipStage).toBe('familiar');
      expect(reveal.direction).toBe('reversal');
      expect(stageLines(reveal)).toEqual([FAMILIAR]);
      expect(reveal.lines.filter(line => /降級|夥伴關係 −/.test(line))).toEqual([]);
      expect(reveal.kind).not.toBe('major');
      expect(reactionTo(reveal, state)).toMatchObject({
        state: 'observe',
        dialogueKey: 'companion.observe.familiar',
      });
      expect(selectProtagonistState({ pendingReveal: reveal }).state).not.toBe('celebrate');
    });

    it('still only observes when another Session that day stays valid', () => {
      const sessions = [...days(12), ordinarySession(12)];
      seeAll(settle(sessions));
      const remaining = without(sessions, 'day-12');
      const state = undo(remaining, 'day-12');
      const reveal = revealOf(state, 'day-12');

      expect(reactionTo(reveal, state, remaining)).toMatchObject({
        state: 'observe',
        dialogueKey: 'companion.observe.familiar',
      });
    });

    it('only observes when day 6 is undone after completion, with another Session that day', () => {
      const sessions = [...days(6), ordinarySession(6)];
      seeAll(settle(sessions));
      const remaining = without(sessions, 'day-6');
      const state = undo(remaining, 'day-6');
      const reveal = revealOf(state, 'day-6');

      expect(stageLines(reveal)).toEqual([]);
      expect(reactionTo(reveal, state, remaining)).toMatchObject({
        state: 'observe',
        dialogueKey: 'companion.observe.familiar',
      });
    });

    it('puts the stage back on day 2\'s undo only, with exactly 12 days', () => {
      seenThrough(12);
      const before = stored();
      const state = undo(without(days(12), 'day-2'), 'day-2');
      const added = state.pendingRewardReveals.filter(reveal => !before.pendingRewardReveals
        .some(previous => previous.id === reveal.id));

      expect(added.map(reveal => reveal.sourceId)).toEqual(['day-2']);
      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-2']);
      expect(stageLines(added[0])).toEqual([FAMILIAR]);
      expect(added[0].lines).not.toContain(UNLOCK);
    });

    it('queues only day 4\'s undo when day 5 takes over a completion already seen', () => {
      seenThrough(5);
      const state = undo(without(days(5), 'day-4'), 'day-4');

      expect(state.pendingRewardReveals.map(reveal => reveal.sourceId)).toEqual(['day-4']);
      const [reveal] = state.pendingRewardReveals;
      expect(reveal.kind).not.toBe('major');
      expect(reveal.lines.join(' ')).not.toMatch(/解鎖|夥伴關係/);
      expect(reactionTo(reveal, state).state).toBe('observe');
      expect(state.presentedMilestones).toMatchObject({ projectCompleted: true, relationshipStage: 'familiar' });
    });

    it('moves an unseen completion to day 5 when day 4 is undone', () => {
      seenThrough(3);
      const queued = settle(days(5));
      const state = undo(without(days(5), 'day-4'), 'day-4');
      // Day 5 now has two reveals: its own, still queued, and the takeover.
      const [takeover] = carriers(state);
      const undone = revealOf(state, 'day-4');

      expect(carriers(state)).toHaveLength(1);
      expect(takeover.sourceId).toBe('day-5');
      expect(queued.pendingRewardReveals.map(reveal => reveal.id)).not.toContain(takeover.id);
      expect(takeover.lines).toEqual(expect.arrayContaining([UNLOCK, FAMILIAR]));
      expect(reactionTo(takeover, state).dialogueKey).toBe('companion.project.workspace-upgrade.complete');
      expect(undone.kind).not.toBe('major');
      expect(undone.lines.join(' ')).not.toMatch(/解鎖|夥伴關係/);
    });

    it('takes back the unlock on the undo reveal when no day takes it over', () => {
      seenThrough(4);
      const state = undo(days(3), 'day-4');
      const reveal = revealOf(state, 'day-4');

      expect(reveal.lines).toEqual(expect.arrayContaining([UNLOCK_TAKEN_BACK, '夥伴關係：陌生觀察者']));
      expect(reveal.kind).not.toBe('major');
      expect(reactionTo(reveal, state).state).toBe('observe');
      expect(state.recentWorldChange.label).toBe('夥伴關係：陌生觀察者');
    });
  });

  describe('a milestone that has not played yet', () => {
    it('drops a queued stage-up when an earlier day is undone below the threshold', () => {
      seenThrough(11);
      settle(days(12));
      const state = undo(without(days(12), 'day-6'), 'day-6');
      const reveal = revealOf(state, 'day-12');

      expect(state.companion.relationshipStage).toBe('familiar');
      expect(reveal.lines).not.toContain(PARTNER);
      expect(reveal.kind).not.toBe('major');
      expect(reveal.title).toBeUndefined();
      expect(carriers(state)).toEqual([]);
      const shell = document.createElement('div');
      shell.innerHTML = renderOrbitWindow(normalizeOrbitWindowModel({ pendingReveal: reveal }));
      expect(shell.querySelector('.orbit-window-major-reveal')).toBeNull();
      expect(shell.textContent).not.toContain(PARTNER);
    });

    it('shows no stage at all when a queued stage-down is undone by a new day', () => {
      seenThrough(12);
      undo(days(11), 'day-12');
      const state = settle([...days(11), mainQuestDay(13)]);

      expect(state.companion.relationshipStage).toBe('partner');
      expect(state.pendingRewardReveals.flatMap(stageLines)).toEqual([]);
      expect(carriers(state)).toEqual([]);
      state.pendingRewardReveals.forEach(reveal => {
        expect(reactionTo(reveal, state).dialogueKey).not.toBe('companion.relationship.stage-up');
      });
    });

    it('keeps the milestone when an earlier reveal without one plays first', () => {
      seenThrough(2);
      settle(days(3));
      const queued = settle(days(4));
      const milestoneReveal = revealOf(queued, 'day-4');

      consume(revealOf(queued, 'day-3').id);
      const reopened = sync(days(4));
      expect(revealOf(reopened, 'day-4').lines).toEqual(expect.arrayContaining([UNLOCK, FAMILIAR]));
      expect(reopened.presentedMilestones).toMatchObject({ projectCompleted: false });

      const after = consume(milestoneReveal.id);
      expect(after.presentedMilestones).toMatchObject({ projectCompleted: true, relationshipStage: 'familiar' });
      expect(settle(days(5)).pendingRewardReveals.flatMap(reveal => reveal.lines))
        .not.toEqual(expect.arrayContaining([UNLOCK]));
    });

    it('merges an unseen completion into the 12th day', () => {
      seenThrough(3);
      settle(days(4));
      const through11 = settle(days(11));
      through11.pendingRewardReveals
        .filter(reveal => reveal.sourceId !== 'day-4')
        .forEach(reveal => consume(reveal.id));
      const state = settle(days(12));

      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(revealOf(state, 'day-12').lines).toEqual(expect.arrayContaining([UNLOCK, PARTNER]));
      expect(revealOf(state, 'day-4').lines).not.toContain(UNLOCK);
      expect(revealOf(state, 'day-4').kind).not.toBe('major');

      // An older tab plays the 12th day: neither milestone comes back.
      oldTabConsumes(revealOf(state, 'day-12').id);
      const next = settle(days(13));
      expect(next.pendingRewardReveals.flatMap(reveal => reveal.lines))
        .not.toEqual(expect.arrayContaining([UNLOCK]));
      expect(next.pendingRewardReveals.flatMap(stageLines)).toEqual([]);
      expect(carriers(next)).toEqual([]);
    });

    it('does not replay a stage-up an older tab played', () => {
      seenThrough(11);
      const state = settle(days(12));
      oldTabConsumes(revealOf(state, 'day-12').id);
      const next = settle(days(13));

      expect(revealOf(next, 'day-13').lines).not.toContain(PARTNER);
      expect(next.presentedMilestones).toMatchObject({ relationshipStage: 'partner', pending: null });
    });

    it('shrinks a queued familiar → trusted when a sync takes days away', () => {
      seenThrough(11);
      settle(days(30));
      const carrier = carriers(stored())[0];
      expect(carrier.sourceId).toBe('day-30');
      expect(carrier.relationshipStage).toEqual({ from: 'familiar', to: 'trusted-companion' });

      const shrunk = sync(without(days(30), 'day-20'), { deletedSourceIds: ['day-20'] });
      expect(shrunk.companion.relationshipStage).toBe('partner');
      expect(revealOf(shrunk, 'day-30').relationshipStage).toEqual({ from: 'familiar', to: 'partner' });
      expect(revealOf(shrunk, 'day-30')).toMatchObject({ kind: 'major', title: PARTNER });

      const removedIds = range(11, 29).map(session => session.id);
      const gone = sync(without(days(30), ...removedIds), { deletedSourceIds: removedIds });
      expect(gone.companion.relationshipStage).toBe('familiar');
      expect(carriers(gone)).toEqual([]);
      expect(revealOf(gone, 'day-30').kind).not.toBe('major');
      expect(gone.presentedMilestones.relationshipStage).toBe('familiar');
    });
  });

  describe('a queued milestone and later Sessions', () => {
    it('stays on the undo when the same undo is applied again', () => {
      seenThrough(12);
      const once = undo(days(11), 'day-12');
      const twice = undo(days(11), 'day-12');

      expect(carriers(twice).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(stageLines(revealOf(twice, 'day-12'))).toEqual([FAMILIAR]);
      expect(twice.presentedMilestones).toEqual(once.presentedMilestones);
    });

    it('stays on the undo when an ordinary Session is recorded next', () => {
      seenThrough(12);
      undo(days(11), 'day-12');
      const next = settle([...days(11), ordinarySession(11)]);

      expect(carriers(next).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(stageLines(revealOf(next, 'ordinary-11'))).toEqual([]);
    });

    it('is not taken as seen when a Session that adds nothing is recorded', () => {
      seenThrough(4);
      undo(days(3), 'day-4');
      const next = settle([...days(3), invalidSession(3)]);

      expect(carriers(next).map(reveal => reveal.sourceId)).toEqual(['day-4']);
      expect(revealOf(next, 'day-4').lines).toContain(UNLOCK_TAKEN_BACK);
      expect(next.presentedMilestones).toMatchObject({ projectCompleted: true, relationshipStage: 'familiar' });
    });

    it('never moves a stage taken back onto a Main Quest day just added', () => {
      seenThrough(12);
      undo(days(11), 'day-12');
      undo(days(10), 'day-11');
      const state = settle([...days(10), mainQuestDay(13)]);
      const added = revealOf(state, 'day-13');

      expect(state.companion.relationshipStage).toBe('familiar');
      expect(stageLines(added)).toEqual([]);
      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(reactionTo(added, state).state).toBe('approach');
    });

    it('keeps a stage-up on a backdated 12th day when another Session follows', () => {
      const eleven = without(days(12), 'day-3');
      seeAll(settle(eleven));
      const twelve = [...eleven, mainQuestDay(3)];
      const recorded = settle(twelve);
      expect(carriers(recorded).map(reveal => reveal.sourceId)).toEqual(['day-3']);

      const next = settle([...twelve, ordinarySession(12)]);
      expect(carriers(next).map(reveal => reveal.sourceId)).toEqual(['day-3']);
      expect(revealOf(next, 'ordinary-12').title).toBeUndefined();
      expect(selectProtagonistState({ pendingReveal: revealOf(next, 'day-3') }).state).toBe('celebrate');
      // Nor does a later Main Quest day take it.
      const later = settle([...twelve, ordinarySession(12), mainQuestDay(13)]);
      expect(carriers(later).map(reveal => reveal.sourceId)).toEqual(['day-3']);
    });
  });

  describe('the last world change', () => {
    it('follows a queued stage-up a sync shrinks', () => {
      seenThrough(11);
      settle(days(30));
      expect(stored().recentWorldChange.label).toBe(TRUSTED);
      const shrunk = sync(without(days(30), 'day-20'), { deletedSourceIds: ['day-20'] });
      expect(shrunk.recentWorldChange.label).toBe(PARTNER);
    });

    it('no longer names a stage a sync took back after it was seen', () => {
      seenThrough(11);
      seeAll(settle(days(12)));
      expect(stored().recentWorldChange.label).toBe(PARTNER);
      const state = sync(without(days(12), 'day-6'), { deletedSourceIds: ['day-6'] });
      expect(state.companion.relationshipStage).toBe('familiar');
      expect(state.recentWorldChange.label).toBeUndefined();
      expect(state.recentWorldChange.metadata.rewardType).toBe('quest_progress');
    });
  });

  describe('a sync from another device', () => {
    it('takes the 12th day into the baseline without a reveal', () => {
      seenThrough(11);
      const state = sync(days(12));

      expect(state.pendingRewardReveals).toEqual([]);
      expect(state.companion.relationshipStage).toBe('partner');
      expect(state.presentedMilestones).toEqual({
        projectCompleted: true, relationshipStage: 'partner', pending: null,
      });
      expect(stageLines(revealOf(settle(days(13)), 'day-13'))).toEqual([]);
    });

    it('never turns a queued undo into a congratulation', () => {
      seenThrough(11);
      const undone = undo(days(10), 'day-11');
      const undoReveal = revealOf(undone, 'day-11');
      const state = sync([...days(10), ...range(12, 13)]);

      expect(state.companion.relationshipStage).toBe('partner');
      const reveal = state.pendingRewardReveals.find(entry => entry.id === undoReveal.id);
      expect(reveal.lines).toEqual(undoReveal.lines);
      expect(reactionTo(reveal, state).state).toBe('observe');
      expect(state.presentedMilestones.relationshipStage).toBe('partner');
    });

    it('keeps an unseen completion and drops its outdated stage', () => {
      seenThrough(3);
      settle(days(4));
      const state = sync(days(12));
      const reveal = revealOf(state, 'day-4');

      expect(reveal.lines).toContain(UNLOCK);
      expect(stageLines(reveal)).toEqual([]);
      expect(reactionTo(reveal, state).dialogueKey).toBe('companion.project.workspace-upgrade.complete');
      expect(state.presentedMilestones).toMatchObject({
        projectCompleted: false,
        relationshipStage: 'partner',
        pending: { revealId: reveal.id },
      });
    });
  });

  describe('reveals queued by the previous version', () => {
    it('shows an unplayed completion with its unlock and stage after upgrading', () => {
      seenThrough(3);
      asPreviousVersion(settle(days(4)));
      const state = sync(days(4));
      const reveal = revealOf(state, 'day-4');

      expect(reveal.lines).toEqual(expect.arrayContaining([UNLOCK, FAMILIAR]));
      expect(reveal.kind).toBe('major');
      expect(reactionTo(reveal, state).dialogueKey).toBe('companion.project.workspace-upgrade.complete');
    });

    it.each([
      [12, PARTNER],
      [30, TRUSTED],
    ])('shows an unplayed completion with %i days of history as one change', (count, stageLine) => {
      seenThrough(3);
      settle(days(4));
      const recorded = settle(days(count));
      recorded.pendingRewardReveals
        .filter(reveal => reveal.sourceId !== 'day-4')
        .forEach(reveal => consume(reveal.id));
      // The previous version kept the completion on day 4 itself.
      const queued = stored();
      asPreviousVersion({
        ...queued,
        pendingRewardReveals: queued.pendingRewardReveals.map(reveal => ({
          ...reveal,
          rewards: reveal.rewards,
          projectCompleted: true,
        })),
      });
      const state = sync(days(count));

      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-4']);
      expect(revealOf(state, 'day-4').lines).toEqual(expect.arrayContaining([UNLOCK, stageLine]));
      expect(revealOf(state, 'day-4').relationshipStage.from).toBe('stranger-observer');
    });

    it('gives a Main Quest day an older tab recorded its own stage-up', () => {
      seenThrough(11);
      const seen = stored().presentedMilestones;
      // The older tab records day 12: a reveal without a milestone, and the
      // baseline it does not know left as it was.
      const recorded = settle(days(12));
      asPreviousVersion(recorded);
      savePersonalSpaceV2State(currentUser.id, { ...stored(), presentedMilestones: seen });

      const state = sync(days(12));
      expect(carriers(state).map(reveal => reveal.sourceId)).toEqual(['day-12']);
      expect(revealOf(state, 'day-12')).toMatchObject({ kind: 'major', title: PARTNER });
    });

    it('does not put a synced stage-up on a reveal an older tab queued for another day', () => {
      seenThrough(10);
      const seen = stored().presentedMilestones;
      asPreviousVersion(settle(days(11)));
      savePersonalSpaceV2State(currentUser.id, { ...stored(), presentedMilestones: seen });

      const state = sync(days(12));
      expect(state.companion.relationshipStage).toBe('partner');
      expect(carriers(state)).toEqual([]);
      expect(state.pendingRewardReveals.flatMap(stageLines)).toEqual([]);
      expect(state.presentedMilestones.relationshipStage).toBe('partner');
    });

    it('takes a 12th day a first-run sync brings in as seen', () => {
      seenThrough(10);
      asPreviousVersion(settle(days(11)));
      const state = sync(days(12));

      expect(carriers(state)).toEqual([]);
      expect(revealOf(state, 'day-11').kind).not.toBe('major');
      expect(state.presentedMilestones.relationshipStage).toBe('partner');
    });

    it('does not put a first-run synced undo on an unrelated reveal', () => {
      const sessions = [...days(12), ordinarySession(12)];
      settle(sessions).pendingRewardReveals
        .filter(reveal => reveal.sourceId !== 'ordinary-12')
        .forEach(reveal => consume(reveal.id));
      asPreviousVersion(stored());
      const state = sync(without(sessions, 'day-6'), { deletedSourceIds: ['day-6'] });

      expect(carriers(state)).toEqual([]);
      expect(state.pendingRewardReveals.flatMap(stageLines)).toEqual([]);
      expect(state.presentedMilestones.relationshipStage).toBe('familiar');
    });

    it('keeps an unplayed completion and drops its stage when a first-run sync goes past it', () => {
      seenThrough(3);
      asPreviousVersion(settle(days(4)));
      const state = sync(days(12));
      const reveal = revealOf(state, 'day-4');

      expect(reveal.lines).toContain(UNLOCK);
      expect(stageLines(reveal)).toEqual([]);
      expect(state.presentedMilestones).toMatchObject({ projectCompleted: false, relationshipStage: 'partner' });
    });

    it('survives a queued reveal with malformed rewards', () => {
      seenThrough(3);
      const { presentedMilestones: _presented, ...rest } = stored();
      savePersonalSpaceV2State(currentUser.id, {
        ...rest,
        pendingRewardReveals: [{ id: 'reveal:malformed', sourceId: 'day-3', rewardIds: [], rewards: { bad: true } }],
      });
      expect(() => sync(days(3))).not.toThrow();
      expect(stored().presentedMilestones).toMatchObject({ pending: null });
    });

    it('does not replay history the new rule catches up', () => {
      const old = settle(days(25));
      asPreviousVersion(seeAll(old));
      const state = sync(days(25));
      expect(state.pendingRewardReveals).toEqual([]);
      expect(state.presentedMilestones).toEqual({
        projectCompleted: true, relationshipStage: 'partner', pending: null,
      });
    });
  });

  it('reads what was seen from presentedMilestones, not from stale stored points', () => {
    seenThrough(12);
    const state = stored();
    savePersonalSpaceV2State(currentUser.id, {
      ...state,
      companion: { ...state.companion, relationshipPoints: 0, relationshipStage: 'stranger-observer' },
    });
    const next = settle(days(13));
    expect(next.pendingRewardReveals.flatMap(stageLines)).toEqual([]);
  });

  it('gives the same state when the same reconciliation is applied again', () => {
    seenThrough(3);
    settle(days(4));
    const once = sync(days(12));
    const twice = sync(days(12));
    expect(twice).toEqual(once);
  });
});
