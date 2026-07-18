import { describe, expect, it } from 'vitest';
import {
  getCompanionReaction,
} from '../../pwa/js/personalSpace/v2/companionEngine.js';
import {
  deriveMomentum,
  getMomentumState,
} from '../../pwa/js/personalSpace/v2/momentum.js';
import {
  buildEditViewModel,
  buildFullWorldViewModel,
  buildHomeWindowViewModel,
  buildPersonalSpaceV2Snapshot,
  getTimeBand,
  selectProtagonistState,
  selectCanonicalMainQuestSession,
  selectMainQuestActionTarget,
} from '../../pwa/js/personalSpace/v2/viewModels.js';

function effectiveSession(date, id = date) {
  return {
    id,
    date,
    completedAt: `${date}T10:00:00.000Z`,
    result: 'complete',
    impactType: 'task',
    value: 'A',
    durationMinutes: 25,
    finalXP: 50,
    isProductiveXP: true,
  };
}

describe('Personal Space V2 Momentum', () => {
  it.each([
    [0, 'low'],
    [2, 'low'],
    [3, 'stable'],
    [4, 'stable'],
    [5, 'strong'],
    [6, 'strong'],
    [7, 'peak'],
  ])('maps %i effective days to %s', (effectiveDays, state) => {
    expect(getMomentumState(effectiveDays)).toBe(state);
  });

  it('uses only the newest seven unique Session dates and calcDailyStats semantics', () => {
    const sessions = [
      effectiveSession('2026-07-08'),
      effectiveSession('2026-07-11'),
      effectiveSession('2026-07-12'),
      effectiveSession('2026-07-13'),
      { ...effectiveSession('2026-07-14'), finalXP: 20 },
      { ...effectiveSession('2026-07-15'), finalXP: 20 },
      { ...effectiveSession('2026-07-16'), finalXP: 20 },
      { ...effectiveSession('2026-07-17'), finalXP: 20 },
    ];

    const momentum = deriveMomentum(sessions);

    expect(momentum.dates).toEqual([
      '2026-07-17',
      '2026-07-16',
      '2026-07-15',
      '2026-07-14',
      '2026-07-13',
      '2026-07-12',
      '2026-07-11',
    ]);
    expect(momentum).toMatchObject({ effectiveDays: 3, state: 'stable' });
    expect(Object.isFrozen(momentum.dailyStats)).toBe(true);
  });
});

describe('Personal Space V2 Companion selector', () => {
  const recovery = {
    id: 'recovery',
    completedAt: '2026-07-17T12:00:00.000Z',
    result: 'complete',
    impactType: 'recovery',
  };

  it('uses the documented deterministic priority and stable keys', () => {
    expect(getCompanionReaction({
      pendingReveal: { rewards: [{ rewardType: 'world_unlock', rewardKey: 'formal-workstation' }] },
      recentSessions: [recovery],
      momentum: 'peak',
    })).toMatchObject({
      state: 'congratulate',
      dialogueKey: 'companion.project.workspace-upgrade.complete',
      relationshipDelta: 0,
    });

    expect(getCompanionReaction({
      pendingReveal: { rewards: [{ rewardType: 'project_progress', rewardKey: 'workspace-upgrade' }] },
      recentSessions: [recovery],
    }).state).toBe('approach');
    expect(getCompanionReaction({ recentSessions: [recovery], momentum: 'peak' }).state).toBe('rest');
    expect(getCompanionReaction({
      recentSessions: [{ ...recovery, impactType: 'task' }],
      momentum: 'peak',
    }).state).toBe('approach');
    expect(getCompanionReaction({ momentum: { state: 'strong' } }).state).toBe('work');
    expect(getCompanionReaction({
      momentum: 'low',
      missedPatterns: { selectedGoalId: 'goal-1' },
    }).state).toBe('remind');
    expect(getCompanionReaction({ momentum: 'stable' }).state).toBe('observe');
  });

  it('does not infer reward state from free-form reveal text', () => {
    const freeFormReveal = {
      id: 'message-only',
      title: 'Project planning notes',
      message: 'The next quest will appear tomorrow.',
    };

    expect(getCompanionReaction({ pendingReveal: freeFormReveal }).state).toBe('observe');
    expect(selectProtagonistState({ pendingReveal: freeFormReveal }).state).toBe('inspect');
    expect(selectProtagonistState({
      pendingReveal: {
        rewards: [{ rewardType: 'project_progress', rewardKey: 'workspace-upgrade' }],
      },
    }).state).toBe('celebrate');
  });
});

describe('Personal Space V2 shared view models', () => {
  it('chooses the first eligible Daily Plan task, then the first eligible task', () => {
    const tasks = [
      { id: 'fallback', name: 'Fallback', category: 'focus', impactType: 'task', value: 'S' },
      { id: 'planned-b', name: 'B task', category: 'focus', impactType: 'task', value: 'B' },
      { id: 'planned-a', name: 'Plan A', category: 'focus', impactType: 'task', value: 'A' },
    ];

    expect(selectMainQuestActionTarget(tasks, ['planned-b', 'planned-a'])).toMatchObject({
      taskId: 'planned-a',
      source: 'daily-plan',
    });
    expect(selectMainQuestActionTarget(tasks, ['planned-b'])).toMatchObject({
      taskId: 'fallback',
      source: 'tasks',
    });
    expect(selectMainQuestActionTarget([], [])).toMatchObject({
      kind: 'create-focus-task',
      route: 'settings',
    });
  });

  it('uses completedAt and Session id as canonical Main Quest tie-breakers', () => {
    const sessions = [
      { ...effectiveSession('2026-07-17', 'z'), completedAt: '2026-07-17T10:00:00.000Z' },
      { ...effectiveSession('2026-07-17', 'b'), completedAt: '2026-07-17T09:00:00.000Z' },
      { ...effectiveSession('2026-07-17', 'a'), completedAt: '2026-07-17T09:00:00.000Z' },
    ];

    expect(selectCanonicalMainQuestSession(sessions, '2026-07-17')?.id).toBe('a');
  });

  it('does not mistake historical aggregate quest progress for today completion', () => {
    const snapshot = buildPersonalSpaceV2Snapshot({
      coreState: { user: {}, tasks: [], dailyPlan: [], sessions: [] },
      v2State: { world: {}, economy: {}, hiddenStats: {}, companion: {} },
      ledgerSnapshot: {
        summary: { questProgress: { 'main-focus:2026-07-16': 1 } },
        dailyQuestWinners: [{ id: 'yesterday', date: '2026-07-16' }],
      },
      effectiveDate: '2026-07-17',
      now: new Date(2026, 6, 17, 12),
    });

    expect(snapshot.mainQuest.progress).toBe(0);
    expect(snapshot.mainQuest.completed).toBe(false);
  });

  it('derives completion from the active dated ledger or reconciliation winner, never raw Sessions', () => {
    const date = '2026-07-17';
    const session = { ...effectiveSession(date, 'winner'), taskId: 'focus-a', taskName: 'Focus A' };
    const input = {
      coreState: {
        user: {},
        tasks: [{ id: 'focus-a', name: 'Focus A', category: 'focus', impactType: 'task', value: 'A' }],
        dailyPlan: ['focus-a'],
        sessions: [session],
      },
      v2State: { world: {}, economy: {}, hiddenStats: {}, companion: {} },
      effectiveDate: date,
      now: new Date(2026, 6, 17, 12),
    };

    const rawOnly = buildPersonalSpaceV2Snapshot({
      ...input,
      ledgerSnapshot: { ledger: [], dailyQuestWinners: [] },
    });
    expect(rawOnly.mainQuest).toMatchObject({
      completed: false,
      progress: 0,
      completionSourceSessionId: null,
    });

    const inactiveLedgerEntry = buildPersonalSpaceV2Snapshot({
      ...input,
      ledgerSnapshot: {
        activeRewards: [],
        ledger: [{
          id: 'blocked-quest-winner',
          sourceId: session.id,
          rewardType: 'quest_progress',
          rewardKey: `main-focus:${date}`,
          amount: 1,
          reversedAt: null,
        }],
      },
    });
    expect(inactiveLedgerEntry.mainQuest.completed).toBe(false);

    const activeEntry = buildPersonalSpaceV2Snapshot({
      ...input,
      ledgerSnapshot: {
        activeRewards: [{
          id: 'quest-winner',
          sourceId: session.id,
          rewardType: 'quest_progress',
          rewardKey: `main-focus:${date}`,
          amount: 1,
          reversedAt: null,
        }],
      },
    });
    expect(activeEntry.mainQuest).toMatchObject({
      completed: true,
      progress: 1,
      completionSourceSessionId: session.id,
      taskId: session.taskId,
    });

    const reversedEntry = buildPersonalSpaceV2Snapshot({
      ...input,
      ledgerSnapshot: {
        ledger: [{
          id: 'quest-winner',
          sourceId: session.id,
          rewardType: 'quest_progress',
          rewardKey: `main-focus:${date}`,
          amount: 1,
          reversedAt: `${date}T12:00:00.000Z`,
        }],
      },
    });
    expect(reversedEntry.mainQuest.completed).toBe(false);

    const winnerProjection = buildPersonalSpaceV2Snapshot({
      ...input,
      coreState: { ...input.coreState, sessions: [] },
      ledgerSnapshot: { ledger: [], dailyQuestWinners: [session] },
    });
    expect(winnerProjection.mainQuest).toMatchObject({
      completed: true,
      completionSourceSessionId: session.id,
      taskId: session.taskId,
    });
  });

  it('builds immutable home/full/edit projections that agree on canonical world fields', () => {
    const coreState = {
      user: { id: 'u1', name: 'Tester', totalXP: 600, streakDays: 4, newDayHour: 5 },
      tasks: [
        { id: 'fallback', name: 'Fallback', category: 'focus', impactType: 'task', value: 'S' },
        { id: 'planned-b', name: 'B task', category: 'focus', impactType: 'task', value: 'B' },
        { id: 'planned-a', name: 'Plan A', category: 'focus', impactType: 'task', value: 'A' },
      ],
      dailyPlan: ['planned-b', 'planned-a'],
      sessions: [],
    };
    const v2State = {
      worldRevision: 4,
      weather: 'rain',
      economy: { openingGold: 50, earnedGold: 0, spentGold: 10 },
      hiddenStats: { depth: 2, discipline: 1 },
      companion: { relationshipStage: 'stranger-observer' },
      inventory: { ownedItems: [{ id: 'plant' }] },
      world: {
        selectedSceneId: 'office-corner',
        selectedThemeId: 'default',
        placedItems: [{ id: 'desk', x: 20 }],
        idleWindowLayouts: { office: { placements: {} } },
      },
      pendingRewardReveals: [{ id: 'reward-project', rewardIds: ['reward-project'] }],
      rewardLedger: [],
    };
    const ledgerSnapshot = {
      revision: 5,
      ledger: [{
        id: 'reward-project',
        sourceId: 'session-1',
        rewardType: 'project_progress',
        rewardKey: 'workspace-upgrade',
        amount: 25,
        createdAt: '2026-07-17T12:00:00.000Z',
        reversedAt: null,
      }],
      summary: {
        gold: 100,
        hiddenStats: { depth: 3, discipline: 0 },
        questProgress: { 'main-focus:2026-07-17': 0 },
        projectProgress: { 'workspace-upgrade': 50 },
        relationship: 0,
      },
      project: { id: 'workspace-upgrade', label: 'Workspace Upgrade', progress: 50 },
    };
    const before = JSON.stringify({ coreState, v2State, ledgerSnapshot });
    const snapshot = buildPersonalSpaceV2Snapshot({
      coreState,
      v2State,
      ledgerSnapshot,
      effectiveDate: '2026-07-17',
      now: new Date(2026, 6, 17, 11, 0, 0),
    });
    const home = buildHomeWindowViewModel(snapshot);
    const full = buildFullWorldViewModel(snapshot);
    const edit = buildEditViewModel(snapshot);

    expect(snapshot).toMatchObject({
      worldRevision: 5,
      sceneId: 'office-corner',
      sceneStage: 'light-and-storage',
      timeBand: 'day',
      weather: 'rain',
      playerState: 'celebrate',
      companionState: 'approach',
      wallet: { openingGold: 50, earnedGold: 100, spentGold: 10, balanceGold: 140 },
      hiddenStats: { depth: 5, discipline: 1 },
      mainQuest: { progress: 0 },
    });
    expect(snapshot.mainQuest.actionTarget).toMatchObject({
      taskId: 'planned-a',
      source: 'daily-plan',
    });

    for (const field of [
      'worldRevision',
      'walletRevision',
      'sceneId',
      'sceneStage',
      'activeProject',
      'companion',
      'relationshipStage',
      'wallet',
      'hiddenStats',
      'placements',
      'recentWorldChange',
      'pendingReveal',
    ]) {
      expect(full[field]).toEqual(home[field]);
      expect(edit[field]).toEqual(home[field]);
    }

    expect(home).not.toHaveProperty('inventory');
    expect(home).not.toHaveProperty('editor');
    expect(full).toMatchObject({ canEdit: true, inventorySummary: { ownedCount: 1 } });
    expect(edit).toMatchObject({
      revealPlaybackEnabled: false,
      inventory: { ownedItems: [{ id: 'plant' }] },
      editor: { awardsRewards: false },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(home.activeProject)).toBe(true);
    expect(JSON.stringify({ coreState, v2State, ledgerSnapshot })).toBe(before);
  });

  it('shares the existing time-band boundaries', () => {
    expect(getTimeBand(4)).toBe('night');
    expect(getTimeBand(5)).toBe('morning');
    expect(getTimeBand(10)).toBe('day');
    expect(getTimeBand(17)).toBe('evening');
    expect(getTimeBand(21)).toBe('night');
  });
});
