/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLevelInfo } from '../../pwa/js/leveling.js';
import { estimateAvailableGold } from '../../pwa/js/personalSpace/economy.js';
import {
  loadPersonalSpaceState,
  savePersonalSpaceState,
} from '../../pwa/js/personalSpace/gameState.js';
import {
  loadSessionDeletionLog,
  recordSessionDeletion,
  recordSessionDeletionRemoteConfirmed,
} from '../../pwa/js/platform/sessionDeletionLog.js';
import { REWARD_EPOCH, getPersonalSpaceV2StorageKey } from '../../pwa/js/personalSpace/v2/config.js';
import {
  consumePersonalSpaceV2Reveal,
  loadAndReconcilePersonalSpaceV2,
  refreshCanonicalStateAndReconcilePersonalSpaceV2,
  reconcileAndSavePersonalSpaceV2 as reconcileAndSaveController,
} from '../../pwa/js/personalSpace/v2/controller.js';
import {
  loadPersonalSpaceV2State,
} from '../../pwa/js/personalSpace/v2/store.js';
import { listActiveRewards } from '../../pwa/js/personalSpace/v2/rewardLedger.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);
const STORAGE_PREFIX = 'orbit_platform_bridge_v1:';

function reconcileAndSavePersonalSpaceV2(input) {
  return reconcileAndSaveController({ ...input, queueReveal: true });
}

function user(id = 'user-1', totalXP = 2000) {
  return { id, totalXP };
}

function dateAtOffset(offset) {
  const date = new Date(`${EPOCH_DATE}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mainQuestSession(id = 'session-1', date = EPOCH_DATE) {
  return {
    id,
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

function rawOwnerState(ownerId) {
  return localStorage.getItem(`${STORAGE_PREFIX}${getPersonalSpaceV2StorageKey(ownerId)}`);
}

describe('Personal Space V2 integration controller', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates opening Gold once and preserves the legacy hidden-stat baseline', () => {
    savePersonalSpaceState({
      spentGold: 120,
      hiddenStats: { discipline: 4, craft: 2 },
      ownedItems: [{ id: 'small-plant' }],
    });
    const currentUser = user();
    const level = getLevelInfo(currentUser.totalXP).level;
    const expectedOpeningGold = estimateAvailableGold(level, 120);

    const result = loadAndReconcilePersonalSpaceV2({
      user: currentUser,
      sessions: [],
    });

    expect(result.persisted).toBe(false);
    expect(result.state).toMatchObject({
      ownerId: currentUser.id,
      worldRevision: 0,
      economy: {
        openingGold: expectedOpeningGold,
        balanceGold: expectedOpeningGold,
        earnedGold: 0,
        spentGold: 0,
        legacySpentGold: 120,
      },
      hiddenStats: { discipline: 4, craft: 2 },
      activeProject: { id: 'workspace-upgrade', progress: 0 },
    });
    expect(loadPersonalSpaceV2State(currentUser.id).activeProject).toBeNull();
    expect(loadPersonalSpaceState().spentGold).toBe(120);
  });

  it('uses the reward-epoch XP cutover for delayed enable and never recomputes existing V2 Gold', () => {
    savePersonalSpaceState({ spentGold: 120 });
    const currentUser = user('delayed-owner', 2000);
    const postEpoch = mainQuestSession('post-epoch');
    postEpoch.finalXP = 800;
    const preEpoch = {
      ...mainQuestSession('pre-epoch'),
      completedAt: new Date(Date.parse(REWARD_EPOCH) - 1).toISOString(),
      finalXP: 500,
    };
    const cutoverLevel = getLevelInfo(currentUser.totalXP - postEpoch.finalXP).level;
    const expectedOpeningGold = estimateAvailableGold(cutoverLevel, 120);

    const first = reconcileAndSaveController({
      user: currentUser,
      sessions: [preEpoch, postEpoch, { ...postEpoch }],
      queueReveal: false,
    });

    expect(first.state.economy.openingGold).toBe(expectedOpeningGold);
    expect(first.state.economy.openingGold).not.toBe(
      estimateAvailableGold(getLevelInfo(currentUser.totalXP).level, 120),
    );

    const reopened = reconcileAndSaveController({
      user: user('delayed-owner', 9999),
      sessions: [],
      queueReveal: false,
    });
    expect(reopened.state.economy.openingGold).toBe(expectedOpeningGold);
  });

  it('rebases a cached provisional Gold cutover once after remote resolution', () => {
    savePersonalSpaceState({ spentGold: 120 });
    const currentUser = user('cached-owner', 5000);
    const postEpoch = mainQuestSession('remote-session');
    postEpoch.finalXP = 3000;

    const provisional = reconcileAndSaveController({
      user: currentUser,
      sessions: [],
      provisionalMigration: true,
      queueReveal: false,
    });
    expect(provisional.state.migration.provisional).toBe(true);
    expect(provisional.state.economy.openingGold).toBe(
      estimateAvailableGold(getLevelInfo(5000).level, 120),
    );

    const finalized = reconcileAndSaveController({
      user: currentUser,
      sessions: [postEpoch],
      authoritative: true,
      queueReveal: false,
    });
    const finalOpeningGold = estimateAvailableGold(getLevelInfo(2000).level, 120);
    expect(finalized.state.migration.provisional).toBe(false);
    expect(finalized.state.economy.openingGold).toBe(finalOpeningGold);

    const replay = reconcileAndSaveController({
      user: user('cached-owner', 9999),
      sessions: [],
      authoritative: true,
      queueReveal: false,
    });
    expect(replay.state.economy.openingGold).toBe(finalOpeningGold);
    expect(replay.state.migration.provisional).toBe(false);
  });

  it('refreshes canonical post-sync state before a silent authoritative V2 reconcile', () => {
    const centralState = {
      user: { id: 'stale-owner' },
      tasks: [{ id: 'stale-task' }],
      sessions: [],
      energy: {},
      dailyPlan: [],
    };
    const snapshots = {
      user: { id: 'synced-owner', totalXP: 300 },
      tasks: [{ id: 'synced-task' }],
      sessions: [mainQuestSession('synced-session')],
      energy: { currentEnergy: 70, maxEnergy: 100, lastResetDate: EPOCH_DATE },
      dailyPlan: ['synced-task'],
    };
    const storageApi = {
      getUser: vi.fn(() => snapshots.user),
      getTasks: vi.fn(() => snapshots.tasks),
      getSessions: vi.fn(() => snapshots.sessions),
      getEnergy: vi.fn(() => snapshots.energy),
      getDailyPlan: vi.fn(() => snapshots.dailyPlan),
    };
    const reconcile = vi.fn(() => ({ persisted: true }));

    const result = refreshCanonicalStateAndReconcilePersonalSpaceV2({
      centralState,
      storageApi,
      authoritative: true,
      v2Enabled: true,
      reconcile,
    });

    expect(centralState).toEqual(snapshots);
    expect(reconcile).toHaveBeenCalledWith({
      user: snapshots.user,
      sessions: snapshots.sessions,
      authoritative: true,
      queueReveal: false,
      finalizeMigration: true,
    });
    expect(result.reconciliationResult).toEqual({ persisted: true });
  });

  it('settles once, preserves baselines, and is byte-semantically stable on replay', () => {
    savePersonalSpaceState({
      spentGold: 80,
      hiddenStats: { discipline: 5, depth: 2 },
    });
    const currentUser = user();
    const session = mainQuestSession();
    const first = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
      reconciledAt: `${EPOCH_DATE}T12:00:00.000Z`,
    });
    const firstRaw = rawOwnerState(currentUser.id);

    expect(first.state).toMatchObject({
      worldRevision: 1,
      economy: {
        earnedGold: 100,
        balanceGold: first.state.economy.openingGold + 100,
      },
      hiddenStats: { discipline: 5, depth: 5 },
      activeProject: { progress: 25, completed: false },
      companion: {
        relationshipPoints: 0,
        relationshipStage: 'stranger-observer',
      },
    });
    expect(first.state.rewardLedger).toHaveLength(4);
    expect(first.state.pendingRewardReveals).toHaveLength(1);
    expect(first.ledgerSnapshot.hiddenStats).toEqual(first.state.hiddenStats);
    expect(first.ledgerSnapshot.wallet).toEqual(first.state.economy);

    const replay = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session, session],
      reconciledAt: `${EPOCH_DATE}T13:00:00.000Z`,
    });
    expect(replay.state).toEqual(first.state);
    expect(rawOwnerState(currentUser.id)).toBe(firstRaw);
    expect(replay.reconciliation.changes).toEqual({
      addedIds: [],
      reversedIds: [],
      restoredIds: [],
    });
  });

  it('keeps load-and-reconcile projection read-only after the owner state exists', () => {
    const currentUser = user();
    reconcileAndSavePersonalSpaceV2({ user: currentUser, sessions: [] });
    const before = rawOwnerState(currentUser.id);

    const projected = loadAndReconcilePersonalSpaceV2({
      user: currentUser,
      sessions: [mainQuestSession()],
    });

    expect(projected.state.rewardLedger).toHaveLength(4);
    expect(projected.persisted).toBe(false);
    expect(rawOwnerState(currentUser.id)).toBe(before);
  });

  it('reconciles boot or migration history silently unless a live settlement requests a reveal', () => {
    const currentUser = user('silent-boot-owner');
    const result = reconcileAndSaveController({
      user: currentUser,
      sessions: [mainQuestSession('historical-session')],
    });

    expect(result.state.rewardLedger).toHaveLength(4);
    expect(result.state.pendingRewardReveals).toEqual([]);
    expect(result.state.worldRevision).toBe(1);
  });

  it('prunes an unconsumed positive reveal after a silent authoritative reversal', () => {
    const currentUser = user('stale-reveal-owner');
    const session = mainQuestSession('stale-reveal-session');
    const settled = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
    });
    expect(settled.state.pendingRewardReveals).toHaveLength(1);
    expect(settled.state.recentWorldChange).toBeTruthy();

    const reversed = reconcileAndSaveController({
      user: currentUser,
      sessions: [],
      authoritative: true,
      queueReveal: false,
    });

    expect(reversed.state.pendingRewardReveals).toEqual([]);
    expect(reversed.state.recentWorldChange).toBeNull();
    expect(reversed.state.recentWorldChangeEventId).toBeNull();
    expect(listActiveRewards(
      reversed.state.rewardLedger,
      reversed.state.rewardTombstones,
    )).toEqual([]);
  });

  it('undoes rewards, writes tombstones, and excludes resurrected remote Sessions', () => {
    savePersonalSpaceState({ hiddenStats: { discipline: 3, depth: 2 } });
    const currentUser = user();
    const session = mainQuestSession();
    const settled = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
      reconciledAt: `${EPOCH_DATE}T12:00:00.000Z`,
    });
    const undone = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [],
      deletedSourceIds: [session.id],
      reconciledAt: `${EPOCH_DATE}T14:00:00.000Z`,
    });

    expect(undone.state).toMatchObject({
      worldRevision: settled.state.worldRevision + 1,
      economy: { earnedGold: 0, balanceGold: undone.state.economy.openingGold },
      hiddenStats: { discipline: 3, depth: 2 },
      activeProject: { progress: 0, completed: false },
    });
    expect(undone.state.rewardTombstones.every(entry => entry.sourceId === session.id)).toBe(true);
    expect(undone.state.rewardLedger.every(entry => entry.reversedAt)).toBe(true);
    expect(undone.state.pendingRewardReveals).toHaveLength(1);
    expect(undone.state.pendingRewardReveals[0].direction).toBe('reversal');
    const undoneRaw = rawOwnerState(currentUser.id);

    const resurfaced = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
      reconciledAt: `${EPOCH_DATE}T15:00:00.000Z`,
    });
    expect(resurfaced.state).toEqual(undone.state);
    expect(rawOwnerState(currentUser.id)).toBe(undoneRaw);
    expect(resurfaced.reconciliation.activeRewards).toEqual([]);
  });

  it('recovers an interrupted undo from the durable deletion log on boot', () => {
    const currentUser = user('recovery-owner');
    const session = mainQuestSession('crash-session');
    reconcileAndSavePersonalSpaceV2({ user: currentUser, sessions: [session] });
    recordSessionDeletion(currentUser.id, session.id, `${EPOCH_DATE}T13:00:00.000Z`);

    const recovered = reconcileAndSaveController({
      user: currentUser,
      sessions: [],
      queueReveal: false,
    });

    expect(listActiveRewards(
      recovered.state.rewardLedger,
      recovered.state.rewardTombstones,
    )).toEqual([]);
    expect(recovered.state.rewardTombstones.some(entry => entry.sourceId === session.id)).toBe(true);
    expect(loadSessionDeletionLog(currentUser.id)[session.id]).toBeTruthy();
  });

  it('clears a remotely confirmed deletion only after the V2 tombstone is saved', () => {
    const currentUser = user('confirmed-owner');
    const session = mainQuestSession('confirmed-session');
    reconcileAndSavePersonalSpaceV2({ user: currentUser, sessions: [session] });
    recordSessionDeletion(currentUser.id, session.id, `${EPOCH_DATE}T13:00:00.000Z`);
    recordSessionDeletionRemoteConfirmed(
      currentUser.id,
      session.id,
      `${EPOCH_DATE}T14:00:00.000Z`,
    );

    const originalSetItem = globalThis.Storage.prototype.setItem;
    const setItem = vi.spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(function (key, value) {
        if (String(key).includes('personal-space-state-v2:confirmed-owner')) {
          throw new globalThis.DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      });
    try {
      expect(() => reconcileAndSaveController({
        user: currentUser,
        sessions: [],
        queueReveal: false,
      })).toThrow(/Failed to persist Personal Space V2 state/);
      expect(loadSessionDeletionLog(currentUser.id)[session.id].remoteConfirmedAt).toBeTruthy();
    } finally {
      setItem.mockRestore();
    }

    reconcileAndSaveController({ user: currentUser, sessions: [], queueReveal: false });
    expect(loadSessionDeletionLog(currentUser.id)).toEqual({});
  });

  it('does not reverse omitted sources from a non-authoritative partial cache', () => {
    const currentUser = user('partial-owner');
    const first = mainQuestSession('first-source', dateAtOffset(0));
    const second = mainQuestSession('second-source', dateAtOffset(1));
    const settled = reconcileAndSaveController({
      user: currentUser,
      sessions: [first, second],
      queueReveal: false,
    });
    const activeCount = listActiveRewards(
      settled.state.rewardLedger,
      settled.state.rewardTombstones,
    ).length;

    const partial = reconcileAndSaveController({
      user: currentUser,
      sessions: [second],
      authoritative: false,
      queueReveal: false,
    });

    expect(listActiveRewards(
      partial.state.rewardLedger,
      partial.state.rewardTombstones,
    )).toHaveLength(activeCount);
    expect(partial.reconciliation.changes.reversedIds).toEqual([]);
  });

  it('derives project completion and relationship stage from four daily winners', () => {
    const sessions = Array.from({ length: 4 }, (_, index) =>
      mainQuestSession(`session-${index + 1}`, dateAtOffset(index)));
    const result = reconcileAndSavePersonalSpaceV2({
      user: user(),
      sessions,
      reconciledAt: `${dateAtOffset(3)}T12:00:00.000Z`,
    });

    expect(result.state.activeProject).toMatchObject({
      progress: 100,
      completed: true,
      completedBySessionId: 'session-4',
    });
    expect(result.state.companion).toMatchObject({
      relationshipPoints: 1,
      relationshipStage: 'familiar',
    });
    expect(result.state.economy.earnedGold).toBe(400);
    expect(result.state.pendingRewardReveals).toHaveLength(4);
    expect(result.state.recentWorldChange.key).toBe('formal-workstation');
  });

  it('consumes a reveal without changing world revision or recreating it', () => {
    const currentUser = user();
    const session = mainQuestSession();
    const settled = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
    });
    const reveal = settled.state.pendingRewardReveals[0];
    const revision = settled.state.worldRevision;

    const consumed = consumePersonalSpaceV2Reveal({
      user: currentUser,
      revealId: reveal.id,
    });
    expect(consumed.consumedReveal).toEqual(reveal);
    expect(consumed.state.pendingRewardReveals).toEqual([]);
    expect(consumed.state.worldRevision).toBe(revision);

    const replay = reconcileAndSavePersonalSpaceV2({
      user: currentUser,
      sessions: [session],
    });
    expect(replay.state.pendingRewardReveals).toEqual([]);
    expect(replay.state.worldRevision).toBe(revision);
    const beforeMissingConsume = rawOwnerState(currentUser.id);
    expect(consumePersonalSpaceV2Reveal({
      user: currentUser,
      revealId: reveal.id,
    }).persisted).toBe(false);
    expect(rawOwnerState(currentUser.id)).toBe(beforeMissingConsume);
  });

  it('isolates persisted ledgers and reveal queues by owner', () => {
    const ownerOne = user('owner-1');
    const ownerTwo = user('owner-2');
    const first = reconcileAndSavePersonalSpaceV2({
      user: ownerOne,
      sessions: [mainQuestSession('owner-1-session')],
    });
    const second = reconcileAndSavePersonalSpaceV2({
      user: ownerTwo,
      sessions: [],
    });

    expect(first.state.rewardLedger).toHaveLength(4);
    expect(first.state.pendingRewardReveals).toHaveLength(1);
    expect(second.state.rewardLedger).toEqual([]);
    expect(second.state.pendingRewardReveals).toEqual([]);
    expect(rawOwnerState(ownerOne.id)).not.toBe(rawOwnerState(ownerTwo.id));
    expect(loadPersonalSpaceV2State(ownerOne.id).rewardLedger).toHaveLength(4);
    expect(loadPersonalSpaceV2State(ownerTwo.id).rewardLedger).toEqual([]);
  });
});
