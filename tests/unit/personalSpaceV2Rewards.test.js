import { describe, expect, it } from 'vitest';
import { REWARD_EPOCH } from '../../pwa/js/personalSpace/v2/config.js';
import {
  adaptSession,
  isDailyMainQuestCandidate,
  isSessionOnOrAfterEpoch,
} from '../../pwa/js/personalSpace/v2/sessionAdapter.js';
import {
  buildDailyMainQuestIndex,
  selectDailyMainQuestWinners,
} from '../../pwa/js/personalSpace/v2/questEngine.js';
import {
  FORMAL_WORKSTATION_UNLOCK_KEY,
  getOrdinaryHiddenStatReward,
  getSessionRewardSpecs,
  mapSessionToHiddenStat,
} from '../../pwa/js/personalSpace/v2/rewardRules.js';
import {
  createRewardId,
  getTombstonedSourceIds,
  listActiveRewards,
} from '../../pwa/js/personalSpace/v2/rewardLedger.js';
import { reconcileRewardLedger } from '../../pwa/js/personalSpace/v2/reconciler.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);

function offsetDate(offset) {
  const date = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function makeSession(overrides = {}) {
  const date = overrides.date || EPOCH_DATE;
  return {
    id: `session-${date}`,
    taskId: 'task-1',
    date,
    completedAt: `${date}T10:00:00.000Z`,
    result: 'complete',
    durationMinutes: 30,
    impactType: 'task',
    taskNature: 'growth',
    value: 'A',
    resistance: 1.2,
    ...overrides,
  };
}

describe('Personal Space V2 reward session rules', () => {
  it('keeps the explicit Session date but gates the UTC epoch by completedAt first', () => {
    const afterEpochWithEarlierDate = makeSession({
      id: 'after-with-earlier-date',
      date: offsetDate(-1),
      completedAt: `${EPOCH_DATE}T01:00:00.000Z`,
    });
    const beforeEpochWithEpochDate = makeSession({
      id: 'before-with-epoch-date',
      completedAt: new Date(Date.parse(REWARD_EPOCH) - 1).toISOString(),
    });

    expect(adaptSession(afterEpochWithEarlierDate).date).toBe(offsetDate(-1));
    expect(isSessionOnOrAfterEpoch(afterEpochWithEarlierDate)).toBe(true);
    expect(isSessionOnOrAfterEpoch(beforeEpochWithEpochDate)).toBe(false);
    expect(adaptSession(beforeEpochWithEpochDate).isValid).toBe(false);
    expect(isSessionOnOrAfterEpoch(makeSession({ completedAt: 'invalid-timestamp' }))).toBe(true);
    expect(isDailyMainQuestCandidate(makeSession())).toBe(true);
    expect(isDailyMainQuestCandidate(makeSession({ result: 'partial' }))).toBe(false);
    expect(isDailyMainQuestCandidate(makeSession({ durationMinutes: 24 }))).toBe(false);
  });

  it('locks ordinary reward mapping priority and amounts', () => {
    const fixtures = [
      [makeSession({ impactType: 'recovery', taskNature: 'recovery', value: 'D', durationMinutes: 30 }), 'vitality', 2],
      [makeSession({ value: 'S', durationMinutes: 10 }), 'courage', 2],
      [makeSession({ value: 'A', resistance: 1.4, durationMinutes: 10 }), 'courage', 2],
      [makeSession({ durationMinutes: 25 }), 'depth', 1],
      [makeSession({ taskNature: 'maintenance', value: 'B', durationMinutes: 10 }), 'order', 1],
      [makeSession({ taskNature: 'growth', durationMinutes: 10 }), 'craft', 1],
      [makeSession({ taskNature: 'other', durationMinutes: 10 }), 'discipline', 1],
    ];
    for (const [session, expected, amount] of fixtures) {
      const canonical = adaptSession(session);
      expect(mapSessionToHiddenStat(canonical)).toBe(expected);
      const rewards = getSessionRewardSpecs(canonical);
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toMatchObject({
        rewardType: 'hidden_stat',
        rewardKey: expected,
        amount,
      });
    }
    expect(getOrdinaryHiddenStatReward(adaptSession(makeSession({
      impactType: 'recovery', taskNature: 'recovery', value: 'D', durationMinutes: 29,
    })))).toBeNull();
    expect(getSessionRewardSpecs(adaptSession(makeSession({
      impactType: 'entertainment', taskNature: 'entertainment', value: 'D',
    })))).toEqual([]);
  });

  it('uses the exact versioned deterministic reward id contract', () => {
    expect(createRewardId({
      rulesetId: 'rules-v1',
      sourceType: 'session',
      sourceId: 'session-1',
      rewardType: 'gold',
      rewardKey: 'daily-main-quest',
    })).toBe('reward:rules-v1:session-1:gold:daily-main-quest');
  });

  it('gives the earliest qualifying Session on each date the fixed daily bundle', () => {
    const later = makeSession({ id: 'later', completedAt: `${EPOCH_DATE}T11:00:00.000Z` });
    const earlier = makeSession({ id: 'earlier', completedAt: `${EPOCH_DATE}T09:00:00.000Z` });
    const winners = selectDailyMainQuestWinners([later, earlier]);
    expect(winners.map(session => session.id)).toEqual(['earlier']);
    expect(buildDailyMainQuestIndex([later, earlier])).toEqual({ [EPOCH_DATE]: 'earlier' });

    const bundle = getSessionRewardSpecs(winners[0], { isDailyMainQuestWinner: true });
    expect(bundle).toEqual(expect.arrayContaining([
      expect.objectContaining({ rewardType: 'gold', amount: 100 }),
      expect.objectContaining({ rewardType: 'hidden_stat', rewardKey: 'depth', amount: 3 }),
      expect.objectContaining({
        rewardType: 'quest_progress',
        rewardKey: `main-focus:${EPOCH_DATE}`,
        amount: 1,
      }),
      expect.objectContaining({ rewardType: 'project_progress', amount: 25 }),
    ]));
    expect(bundle).toHaveLength(4);
  });
});

describe('Personal Space V2 reward reconciliation', () => {
  it('is deterministic and deduplicates app reopen / remote replay', () => {
    const winner = makeSession({ id: 'winner' });
    const ordinary = makeSession({
      id: 'ordinary',
      completedAt: `${EPOCH_DATE}T11:00:00.000Z`,
      value: 'B',
      taskNature: 'maintenance',
      durationMinutes: 10,
    });
    const first = reconcileRewardLedger({ sessions: [ordinary, winner] });
    expect(first.activeRewards).toHaveLength(5);
    expect(first.summary).toMatchObject({ gold: 100, rewardCount: 5 });
    expect(first.summary.hiddenStats.depth).toBe(3);
    expect(first.summary.hiddenStats.order).toBe(1);
    expect(first.project.progress).toBe(25);

    const replay = reconcileRewardLedger({
      sessions: [winner, ordinary, winner],
      rewardLedger: [...first.ledger, ...first.ledger],
      rewardTombstones: first.tombstones,
    });
    expect(replay.ledger).toEqual(first.ledger);
    expect(replay.tombstones).toEqual(first.tombstones);
    expect(replay.changes).toEqual({ addedIds: [], reversedIds: [], restoredIds: [] });
  });

  it('deduplicates conflicting payloads with the same immutable Session id', () => {
    const earlier = makeSession({
      id: 'conflicting-id',
      date: EPOCH_DATE,
      completedAt: `${EPOCH_DATE}T09:00:00.000Z`,
    });
    const nextDate = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const laterDate = nextDate.toISOString().slice(0, 10);
    const conflicting = makeSession({
      id: 'conflicting-id',
      date: laterDate,
      completedAt: `${laterDate}T09:00:00.000Z`,
    });

    const forward = reconcileRewardLedger({ sessions: [conflicting, earlier] });
    const reversedInput = reconcileRewardLedger({ sessions: [earlier, conflicting] });

    expect(forward.ledger).toEqual(reversedInput.ledger);
    expect(forward.dailyQuestWinners).toHaveLength(1);
    expect(forward.dailyQuestWinners[0].date).toBe(EPOCH_DATE);
    expect(forward.activeRewards).toHaveLength(4);
    expect(forward.summary.gold).toBe(100);
    expect(forward.project.progress).toBe(25);
  });

  it('does not issue a second daily bundle from a same-date partial snapshot', () => {
    const firstWinner = makeSession({
      id: 'preserved-winner',
      completedAt: `${EPOCH_DATE}T09:00:00.000Z`,
    });
    const partialCandidate = makeSession({
      id: 'partial-candidate',
      completedAt: `${EPOCH_DATE}T10:00:00.000Z`,
    });
    const initial = reconcileRewardLedger({ sessions: [firstWinner] });

    const partial = reconcileRewardLedger({
      sessions: [partialCandidate],
      rewardLedger: initial.ledger,
      rewardTombstones: initial.tombstones,
      authoritative: false,
    });

    expect(partial.changes.reversedIds).toEqual([]);
    expect(partial.activeRewards).toHaveLength(5);
    expect(partial.summary.gold).toBe(100);
    expect(partial.summary.questProgress[`main-focus:${EPOCH_DATE}`]).toBe(1);
    expect(partial.summary.hiddenStats.depth).toBe(4);
    expect(partial.project.progress).toBe(25);
    expect(partial.dailyQuestWinners).toEqual([]);
  });

  it('keeps ordinary and Main Quest hidden-stat grants immutable when a backup winner is promoted', () => {
    const firstWinner = makeSession({
      id: 'first-winner',
      completedAt: `${EPOCH_DATE}T09:00:00.000Z`,
    });
    const backupWinner = makeSession({
      id: 'backup-winner',
      completedAt: `${EPOCH_DATE}T10:00:00.000Z`,
    });
    const initial = reconcileRewardLedger({ sessions: [firstWinner, backupWinner] });
    const initialBackupDepth = initial.ledger.find(entry => (
      entry.sourceId === backupWinner.id && entry.metadata?.statKey === 'depth'
    ));

    expect(initialBackupDepth).toMatchObject({
      rewardKey: 'depth.ordinary',
      amount: 1,
      metadata: { tier: 'ordinary', statKey: 'depth' },
    });

    const promoted = reconcileRewardLedger({
      sessions: [backupWinner],
      ledger: initial.ledger,
      tombstones: initial.tombstones,
      deletedSourceIds: [firstWinner.id],
      reconciledAt: `${EPOCH_DATE}T11:00:00.000Z`,
    });
    const oldOrdinary = promoted.ledger.find(entry => entry.id === initialBackupDepth.id);
    const promotedDepth = promoted.activeRewards.find(entry => (
      entry.sourceId === backupWinner.id && entry.metadata?.statKey === 'depth'
    ));

    expect(oldOrdinary).toMatchObject({ amount: 1, reversedAt: `${EPOCH_DATE}T11:00:00.000Z` });
    expect(promotedDepth).toMatchObject({
      rewardKey: 'depth.daily-main-quest',
      amount: 3,
      metadata: { tier: 'daily-main-quest', statKey: 'depth' },
    });
    expect(promotedDepth.id).not.toBe(initialBackupDepth.id);
    expect(promoted.changes.addedIds).toContain(promotedDepth.id);
    expect(promoted.changes.reversedIds).toContain(initialBackupDepth.id);
  });

  it('unlocks the world and relationship from the deterministic fourth daily winner', () => {
    const sessions = Array.from({ length: 4 }, (_, index) => {
      const date = offsetDate(index);
      return makeSession({
        id: `winner-${index + 1}`,
        date,
        completedAt: `${date}T10:00:00.000Z`,
      });
    });
    const result = reconcileRewardLedger({ sessions });
    expect(result.project).toMatchObject({
      progress: 100,
      completed: true,
      completedBySessionId: 'winner-4',
    });
    expect(result.summary.gold).toBe(400);
    expect(result.summary.questProgress).toEqual(Object.fromEntries(
      sessions.map(session => [`main-focus:${session.date}`, 1]),
    ));
    expect(result.summary.projectProgress['workspace-upgrade']).toBe(100);
    expect(result.summary.worldUnlocks).toContain(FORMAL_WORKSTATION_UNLOCK_KEY);
    expect(result.summary.relationship).toBe(1);

    const milestone = result.activeRewards.filter(entry =>
      entry.rewardType === 'world_unlock' || entry.rewardType === 'relationship',
    );
    expect(milestone).toHaveLength(2);
    expect(milestone.every(entry => entry.sourceId === 'winner-4')).toBe(true);
  });

  it('derives one completion milestone across non-authoritative partial snapshots', () => {
    const firstThree = Array.from({ length: 3 }, (_, index) => {
      const date = offsetDate(index);
      return makeSession({
        id: `preserved-${index + 1}`,
        date,
        completedAt: `${date}T09:00:00.000Z`,
      });
    });
    const fourthDate = offsetDate(3);
    const fourth = makeSession({
      id: 'partial-fourth',
      date: fourthDate,
      completedAt: `${fourthDate}T09:00:00.000Z`,
    });
    const initial = reconcileRewardLedger({ sessions: firstThree });

    const completed = reconcileRewardLedger({
      sessions: [fourth],
      rewardLedger: initial.ledger,
      rewardTombstones: initial.tombstones,
      authoritative: false,
    });

    expect(completed.project).toMatchObject({
      progress: 100,
      completed: true,
      completedBySessionId: fourth.id,
    });
    expect(completed.summary.relationship).toBe(1);
    expect(completed.summary.worldUnlocks).toEqual([FORMAL_WORKSTATION_UNLOCK_KEY]);
    expect(completed.activeRewards.filter(entry => (
      entry.metadata?.projectMilestone === 'completed'
    ))).toHaveLength(2);
  });

  it('does not duplicate a completion milestone from a later partial project window', () => {
    const firstFour = Array.from({ length: 4 }, (_, index) => {
      const date = offsetDate(index);
      return makeSession({
        id: `first-window-${index + 1}`,
        date,
        completedAt: `${date}T09:00:00.000Z`,
      });
    });
    const secondFour = Array.from({ length: 4 }, (_, index) => {
      const date = offsetDate(index + 4);
      return makeSession({
        id: `second-window-${index + 1}`,
        date,
        completedAt: `${date}T09:00:00.000Z`,
      });
    });
    const initial = reconcileRewardLedger({ sessions: firstFour });

    const partial = reconcileRewardLedger({
      sessions: secondFour,
      rewardLedger: initial.ledger,
      rewardTombstones: initial.tombstones,
      authoritative: false,
    });

    expect(partial.project).toMatchObject({
      progress: 100,
      completed: true,
      completedBySessionId: 'first-window-4',
    });
    expect(partial.summary.relationship).toBe(1);
    expect(partial.summary.worldUnlocks).toEqual([FORMAL_WORKSTATION_UNLOCK_KEY]);
    expect(partial.activeRewards.filter(entry => (
      entry.metadata?.projectMilestone === 'completed'
    ))).toHaveLength(2);
  });

  it('tombstones a removed winner, shifts the daily reward, and blocks resurrection', () => {
    const firstWinner = makeSession({
      id: 'first-winner',
      completedAt: `${EPOCH_DATE}T09:00:00.000Z`,
    });
    const nextWinner = makeSession({
      id: 'next-winner',
      completedAt: `${EPOCH_DATE}T10:00:00.000Z`,
    });
    const initial = reconcileRewardLedger({ sessions: [firstWinner, nextWinner] });
    const removed = reconcileRewardLedger({
      sessions: [nextWinner],
      rewardLedger: initial.ledger,
      rewardTombstones: initial.tombstones,
      deletedSourceIds: [firstWinner.id],
      reconciledAt: `${EPOCH_DATE}T12:00:00.000Z`,
    });
    expect(getTombstonedSourceIds(removed.tombstones).has('first-winner')).toBe(true);
    expect(removed.summary.gold).toBe(100);
    expect(removed.project.contributingSessionIds).toEqual(['next-winner']);
    expect(listActiveRewards(removed.ledger, removed.tombstones)
      .some(entry => entry.sourceId === 'first-winner')).toBe(false);

    const resurfaced = reconcileRewardLedger({
      sessions: [firstWinner, nextWinner],
      rewardLedger: removed.ledger,
      rewardTombstones: removed.tombstones,
    });
    expect(resurfaced.summary.gold).toBe(100);
    expect(resurfaced.dailyQuestWinners.map(session => session.id)).toEqual(['next-winner']);
    expect(resurfaced.activeRewards.some(entry => entry.sourceId === 'first-winner')).toBe(false);
  });
});
