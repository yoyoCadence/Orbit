/**
 * @vitest-environment jsdom
 *
 * AI-202B1: the Companion relationship grows with Main Quest days. The 4th
 * day is the project completion (a ledger entry, unchanged); the 12th and
 * 30th are milestones derived from the active ledger, never written into it,
 * so a tab still on the previous code cannot reverse them. Legacy points are
 * a floor stored once. The stage shows on the Home card, picks the two lines
 * seen most often, and every reward line uses the same Chinese names.
 * docs/ai-202-companion-relationship-proposal.md (approved 2026-10-23).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { REWARD_EPOCH, RULESET_ID } from '../../pwa/js/personalSpace/v2/config.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyReconciliationToV2State,
  loadAndReconcilePersonalSpaceV2,
  PERSONAL_SPACE_V2_RELATIONSHIP_STAGES,
  reconcileAndSavePersonalSpaceV2,
} from '../../pwa/js/personalSpace/v2/controller.js';
import { getCompanionReaction } from '../../pwa/js/personalSpace/v2/companionEngine.js';
import { reconcileRewardLedger } from '../../pwa/js/personalSpace/v2/reconciler.js';
import { listActiveRewards, summarizeRewardLedger } from '../../pwa/js/personalSpace/v2/rewardLedger.js';
import {
  formatRewardLine,
  formatWorldChange,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  relationshipStageLabel,
} from '../../pwa/js/personalSpace/v2/content/worldLabels.js';
import { COMPANION_DIALOGUE } from '../../pwa/js/personalSpace/v2/content/companionDialogue.js';
import {
  normalizeOrbitWindowModel,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import {
  buildHomeWindowViewModel,
  buildPersonalSpaceV2Snapshot,
} from '../../pwa/js/personalSpace/v2/viewModels.js';
import { renderPersonalSpaceV2 } from '../../pwa/js/pages/personalSpaceV2.js';

const EPOCH_DATE = REWARD_EPOCH.slice(0, 10);
const POLICY_ID = 'ai202-main-quest-days-v1';

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

function instantSession(index) {
  const date = dateAtOffset(index % 20);
  return {
    id: `instant-${index}`,
    taskId: `instant-task-${index}`,
    date,
    completedAt: `${date}T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
    result: 'instant',
    durationMinutes: 0,
    impactType: 'task',
    taskNature: 'maintenance',
    value: 'B',
    resistance: 1,
    finalXP: 5,
    isProductiveXP: true,
  };
}

function recoveryDay(day) {
  const date = dateAtOffset(day - 1);
  return {
    id: `recovery-${day}`,
    taskId: 'rest',
    date,
    completedAt: `${date}T20:00:00.000Z`,
    result: 'complete',
    durationMinutes: 40,
    impactType: 'recovery',
    taskNature: 'recovery',
    value: 'B',
    resistance: 1,
    finalXP: 0,
    isProductiveXP: false,
  };
}

const days = count => Array.from({ length: count }, (_, index) => mainQuestDay(index + 1));
const currentUser = { id: 'ai-202b1-owner', totalXP: 2000 };

function settle(sessions, extra = {}) {
  return reconcileAndSavePersonalSpaceV2({
    user: currentUser,
    sessions,
    queueReveal: true,
    reconciledAt: `${dateAtOffset(sessions.length)}T12:00:00.000Z`,
    ...extra,
  }).state;
}

const stageAfter = count => settle(days(count)).companion.relationshipStage;

// A bare state for driving applyReconciliationToV2State directly.
function bareState(companion = {}, ledgerState = {}) {
  return {
    version: 2,
    ownerId: 'pure-owner',
    rulesetId: RULESET_ID,
    rewardEpoch: REWARD_EPOCH,
    worldRevision: 0,
    economy: { openingGold: 0, earnedGold: 0, spentGold: 0, balanceGold: 0 },
    hiddenStats: {},
    companion,
    activeProject: {},
    rewardLedger: [],
    rewardTombstones: [],
    pendingRewardReveals: [],
    ...ledgerState,
  };
}

function apply(state, sessions, options = {}) {
  const reconciliation = reconcileRewardLedger({
    sessions,
    rewardLedger: state.rewardLedger,
    rewardTombstones: state.rewardTombstones,
    rulesetId: state.rulesetId,
    rewardEpoch: state.rewardEpoch,
    reconciledAt: `${EPOCH_DATE}T23:00:00.000Z`,
    ...options,
  });
  return applyReconciliationToV2State(state, reconciliation, { queueReveal: false });
}

// The relationship arithmetic before AI-202B1: stored points minus the old
// ledger's relationship plus the new ledger's. An older tab still runs it.
function applyAsOldVersion(state, sessions, options = {}) {
  const reconciliation = reconcileRewardLedger({
    sessions,
    rewardLedger: state.rewardLedger,
    rewardTombstones: state.rewardTombstones,
    rulesetId: state.rulesetId,
    rewardEpoch: state.rewardEpoch,
    reconciledAt: `${EPOCH_DATE}T23:00:00.000Z`,
    ...options,
  });
  const oldRelationship = summarizeRewardLedger(
    listActiveRewards(state.rewardLedger, state.rewardTombstones), [],
  ).relationship || 0;
  const points = Math.max(0, state.companion.relationshipPoints - oldRelationship)
    + (reconciliation.summary.relationship || 0);
  const stages = ['stranger-observer', 'familiar', 'partner', 'trusted-companion'];
  return {
    reconciliation,
    state: {
      ...state,
      companion: {
        ...state.companion,
        relationshipPoints: points,
        relationshipStage: stages[Math.min(3, points)],
      },
      rewardLedger: reconciliation.ledger,
      rewardTombstones: reconciliation.tombstones,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('AI-202B1 the stage follows Main Quest days', () => {
  it('reaches familiar on the 4th, partner on the 12th and trusted-companion on the 30th day', () => {
    expect(stageAfter(3)).toBe('stranger-observer');
    localStorage.clear();
    expect(stageAfter(4)).toBe('familiar');
    localStorage.clear();
    expect(stageAfter(11)).toBe('familiar');
    localStorage.clear();
    expect(stageAfter(12)).toBe('partner');
    localStorage.clear();
    expect(stageAfter(29)).toBe('partner');
    localStorage.clear();
    expect(stageAfter(30)).toBe('trusted-companion');
    localStorage.clear();
    expect(stageAfter(40)).toBe('trusted-companion');
  });

  it('counts a day once however many Main Quest candidates it has', () => {
    const sessions = [
      ...days(11),
      mainQuestDay(11, { id: 'day-11-second', hour: 14 }),
      mainQuestDay(11, { id: 'day-11-third', hour: 16 }),
    ];
    expect(settle(sessions).companion.relationshipStage).toBe('familiar');
  });

  it('does not move for instant, ordinary or recovery Sessions', () => {
    const before = settle(days(11));
    localStorage.clear();
    const instants = Array.from({ length: 100 }, (_, index) => instantSession(index));
    const recoveries = Array.from({ length: 20 }, (_, index) => recoveryDay(index + 1));
    const after = settle([...days(11), ...instants, ...recoveries]);
    expect(after.companion.relationshipStage).toBe('familiar');
    expect(after.companion.relationshipPoints).toBe(before.companion.relationshipPoints);
    const statTotal = state => Object.values(state.hiddenStats).reduce((sum, value) => sum + value, 0);
    expect(statTotal(after)).toBeGreaterThan(statTotal(before));
  });

  it('falls back only when an undone day takes the count under a threshold', () => {
    const twelve = days(12);
    expect(settle(twelve).companion.relationshipStage).toBe('partner');
    const remaining = twelve.filter(session => session.id !== 'day-5');
    expect(settle(remaining, { deletedSourceIds: ['day-5'] }).companion.relationshipStage).toBe('familiar');
  });

  it('has no time input and no decay', () => {
    const early = settle(days(12), { reconciledAt: `${dateAtOffset(12)}T12:00:00.000Z` });
    localStorage.clear();
    const late = settle(days(12), { reconciledAt: '2030-01-01T00:00:00.000Z', queueReveal: false });
    expect(late.companion).toEqual(early.companion);
  });

  it('keeps the stage from a partial snapshot that omits earlier days', () => {
    settle(days(13));
    const partial = settle(days(13).slice(10), { queueReveal: false });
    expect(partial.companion.relationshipStage).toBe('partner');
    const again = settle(days(13).slice(10), { queueReveal: false });
    expect(again).toEqual(partial);
  });

  it('leaves the ledger, the ruleset, hidden stats and Gold as they were', () => {
    const state = settle(days(30));
    expect(state.rulesetId).toBe(RULESET_ID);
    const relationship = state.rewardLedger.filter(entry => entry.rewardType === 'relationship');
    expect(relationship).toHaveLength(1);
    expect(relationship[0].metadata?.tier).toBe('project-completion');
    expect(new Set(state.rewardLedger.map(entry => entry.rewardType))).toEqual(new Set([
      'gold', 'hidden_stat', 'quest_progress', 'project_progress', 'world_unlock', 'relationship',
    ]));
    expect(state.companion.relationshipPolicyId).toBe(POLICY_ID);
    const summary = summarizeRewardLedger(listActiveRewards(state.rewardLedger, state.rewardTombstones), []);
    expect(state.hiddenStats.depth).toBe(summary.hiddenStats.depth);
    expect(state.economy.earnedGold).toBe(summary.earnedGold ?? summary.gold);
  });
});

describe('AI-202B1 legacy points and older tabs (K4)', () => {
  it('stores the legacy floor once and recomputes from it and the ledger afterwards', () => {
    const first = apply(bareState({ relationshipStage: 'stranger-observer' }), days(11));
    expect(first.companion.legacyRelationshipPoints).toBe(0);
    expect(first.companion.relationshipStage).toBe('familiar');

    // An older tab wrote a stale total; the stored floor is what counts.
    const stale = { ...first, companion: { ...first.companion, relationshipPoints: 3 } };
    const next = apply(stale, days(11));
    expect(next.companion.legacyRelationshipPoints).toBe(0);
    expect(next.companion.relationshipPoints).toBe(1);
    expect(next.companion.relationshipStage).toBe('familiar');
  });

  it('reads an invalid stored floor as 0', () => {
    for (const legacyRelationshipPoints of [-2, Number.NaN, 'two', null]) {
      const state = apply(bareState({ relationshipPoints: 3, legacyRelationshipPoints }), days(4));
      expect(state.companion.legacyRelationshipPoints, String(legacyRelationshipPoints)).toBe(0);
      expect(state.companion.relationshipStage).toBe('familiar');
    }
  });

  it('keeps a legacy quiet-familiarity user on the same thresholds', () => {
    const legacy = bareState({ relationshipStage: 'quiet-familiarity' });
    expect(apply(legacy, []).companion.relationshipStage).toBe('familiar');
    expect(apply(legacy, days(4)).companion.relationshipStage).toBe('familiar');
    expect(apply(legacy, days(11)).companion.relationshipStage).toBe('familiar');
    expect(apply(legacy, days(12)).companion.relationshipStage).toBe('partner');
    expect(apply(legacy, days(30)).companion.relationshipStage).toBe('trusted-companion');
  });

  it('is read by the previous code without reversing, adding or losing anything', () => {
    const current = apply(bareState({ relationshipStage: 'stranger-observer' }), days(13));
    expect(current.companion.relationshipStage).toBe('partner');
    for (const options of [{}, { authoritative: true }]) {
      const old = applyAsOldVersion(current, days(13), options);
      expect(old.reconciliation.changes.addedIds).toEqual([]);
      expect(old.reconciliation.changes.reversedIds).toEqual([]);
      expect(old.state.companion.relationshipStage).toBe('partner');
      expect(old.state.companion.legacyRelationshipPoints).toBe(0);
      expect(old.state.companion.relationshipPolicyId).toBe(POLICY_ID);
    }
    // A new Main Quest day recorded by the older tab keeps the stage too.
    const older = applyAsOldVersion(current, days(14));
    expect(older.state.companion.relationshipStage).toBe('partner');
  });

  it('corrects what an older tab got wrong on the next reconciliation', () => {
    const current = apply(bareState({ relationshipStage: 'stranger-observer' }), days(13));
    // The older tab undid days 12 and 13 but kept the derived point.
    const undo = { deletedSourceIds: ['day-12', 'day-13'] };
    const older = applyAsOldVersion(current, days(11), undo).state;
    expect(older.companion.relationshipStage).toBe('partner');
    expect(apply(older, days(11), undo).companion.relationshipStage).toBe('familiar');
  });

  it('jumps straight to the stage of the history the first time, with no reveal', () => {
    const result = loadAndReconcilePersonalSpaceV2({
      user: currentUser,
      sessions: days(30),
      queueReveal: false,
      reconciledAt: `${dateAtOffset(30)}T12:00:00.000Z`,
    });
    expect(result.state.companion.relationshipStage).toBe('trusted-companion');
    expect(result.state.pendingRewardReveals).toEqual([]);
  });
});

describe('AI-202B1 the stage is visible', () => {
  const stages = ['stranger-observer', 'familiar', 'partner', 'trusted-companion'];

  it('labels the Home card with the stage', () => {
    for (const stage of stages) {
      const html = renderOrbitWindow(normalizeOrbitWindowModel({
        companion: { relationshipStage: stage, dialogueKey: 'companion.observe' },
      }));
      const shell = document.createElement('div');
      shell.innerHTML = html;
      const card = shell.querySelector('[data-orbit-companion]');
      expect(card.dataset.relationshipStage).toBe(stage);
      expect(card.querySelector('span').textContent).toBe(`COMPANION · ${relationshipStageLabel(stage)}`);
    }
    expect(relationshipStageLabel('familiar')).toBe('熟悉夥伴');
    expect(relationshipStageLabel('unknown')).toBe('陌生觀察者');
  });

  it('reads the stage the controller stored, without adding the ledger again', () => {
    const state = settle(days(12));
    // The old view model added the ledger's relationship to the stored stage:
    // partner + 1 would read trusted-companion.
    const snapshot = buildPersonalSpaceV2Snapshot({
      coreState: { user: currentUser, tasks: [], dailyPlan: [], sessions: days(12) },
      v2State: state,
      ledgerSnapshot: { summary: { relationship: 1 } },
      effectiveDate: dateAtOffset(12),
      now: new Date(`${dateAtOffset(12)}T12:00:00.000Z`),
    });
    expect(snapshot.relationshipStage).toBe('partner');
    const home = buildHomeWindowViewModel(snapshot);
    expect(home.companion.relationshipStage).toBe('partner');
  });

  it('keeps one list of stages and one table of their names', () => {
    expect(PERSONAL_SPACE_V2_RELATIONSHIP_STAGES).toBe(RELATIONSHIP_STAGES);
    expect(Object.keys(RELATIONSHIP_STAGE_LABELS)).toEqual([...RELATIONSHIP_STAGES]);
    const root = join(process.cwd(), 'pwa', 'js');
    for (const file of ['personalSpace/v2/controller.js', 'personalSpace/v2/viewModels.js', 'pages/personalSpaceV2.js']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source, file).not.toMatch(/'stranger-observer',\s*'familiar'/);
      expect(source, file).not.toContain("'陌生觀察者'");
    }
  });

  it('ignores inherited names such as constructor or toString', () => {
    expect(relationshipStageLabel('constructor')).toBe('陌生觀察者');
    expect(relationshipStageLabel('toString')).toBe('陌生觀察者');
    expect(formatRewardLine({ rewardType: 'constructor', amount: 1 })).toBe('世界變化 +1');
    expect(formatRewardLine({ rewardType: 'hidden_stat', rewardKey: '__proto__', amount: 1 })).toBe('隱藏能力 +1');
    expect(getCompanionReaction({ relationshipStage: 'toString', momentum: 'stable' }).dialogueKey)
      .toBe('companion.observe');
    expect(getCompanionReaction({ relationshipStage: 'constructor', momentum: 'strong' }).dialogueKey)
      .toBe('companion.momentum.strong');
    const html = renderOrbitWindow(normalizeOrbitWindowModel({ companion: { relationshipStage: 'toString' } }));
    expect(html).toContain('COMPANION · <span class="orbit-window-relationship-stage">陌生觀察者</span>');
  });

  it('picks the observe and strong-momentum lines by stage', () => {
    const line = (stage, extra) => getCompanionReaction({ relationshipStage: stage, ...extra }).dialogueKey;
    expect(line('stranger-observer', { momentum: 'stable' })).toBe('companion.observe');
    expect(line('familiar', { momentum: 'stable' })).toBe('companion.observe.familiar');
    expect(line('partner', { momentum: 'stable' })).toBe('companion.observe.partner');
    expect(line('trusted-companion', { momentum: 'stable' })).toBe('companion.observe.trusted-companion');
    expect(line(undefined, { momentum: 'stable' })).toBe('companion.observe');
    expect(line('stranger-observer', { momentum: 'strong' })).toBe('companion.momentum.strong');
    expect(line('familiar', { momentum: 'peak' })).toBe('companion.momentum.strong.familiar');
    expect(line('partner', { momentum: 'strong' })).toBe('companion.momentum.strong.partner');
    expect(line('trusted-companion', { momentum: 'strong' })).toBe('companion.momentum.strong.trusted-companion');
    expect(line('partner', { momentum: 'low' })).toBe('companion.momentum.low');
    // An undone Session: observing, in the current stage's words.
    expect(line('partner', { pendingReveal: { direction: 'reversal', rewards: [] } }))
      .toBe('companion.observe.partner');
    for (const key of Object.keys(COMPANION_DIALOGUE)) expect(COMPANION_DIALOGUE[key]).toBeTruthy();
  });
});

describe('AI-202B1 reward lines use one table of names (H1)', () => {
  const RAW_KEYS = ['depth.ordinary', 'depth.daily-main-quest', 'main-focus:', 'workspace-upgrade',
    'formal-workstation', 'companion +1', 'daily-main-quest', 'hidden_stat', 'quest_progress'];

  it('names every reward type on Home and in the full page alike', () => {
    const state = settle(days(4));
    const reveal = state.pendingRewardReveals.at(-1);
    // AI-202B2: the unlock and the stage come from the milestone, not entries.
    const lines = reveal.lines;
    expect(lines).toEqual(expect.arrayContaining([
      '金幣 +100', '深度 +3', '每日主線任務 +1', '工作空間進度 +25', '解鎖：正式工作站', '夥伴關係：熟悉夥伴',
    ]));
    expect(lines).toEqual(reveal.rewards
      .filter(reward => !['world_unlock', 'relationship'].includes(reward.rewardType))
      .map(formatRewardLine)
      .concat(['解鎖：正式工作站', '夥伴關係：熟悉夥伴']));
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow(normalizeOrbitWindowModel({ pendingReveal: reveal }));
    const shown = shell.querySelector('.orbit-window-reward').textContent;
    for (const line of lines) expect(shown).toContain(line);
    for (const raw of RAW_KEYS) expect(shown, raw).not.toContain(raw);
  });

  it('shows the same names and the stage on the full page', () => {
    globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
    const reveal = settle(days(4)).pendingRewardReveals.at(-1);
    localStorage.clear();
    const state = settle(days(12));
    const pageState = { ...state, pendingRewardReveals: [reveal] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const coreState = { user: currentUser, tasks: [], dailyPlan: [], sessions: days(12) };
    const cleanup = renderPersonalSpaceV2(container, {
      user: currentUser,
      coreState,
      reconcile: () => ({
        state: pageState,
        reconciliation: { ledger: pageState.rewardLedger, summary: {}, project: pageState.activeProject },
        ledgerSnapshot: { companion: pageState.companion, pendingRewardReveals: [reveal] },
      }),
      mountWindow: () => () => {},
      destroyRuntime: () => {},
      effectiveDate: dateAtOffset(12),
      now: new Date(`${dateAtOffset(12)}T12:00:00.000Z`),
    });
    const text = container.textContent;
    for (const line of ['深度 +3', '每日主線任務 +1', '解鎖：正式工作站']) expect(text).toContain(line);
    for (const raw of ['depth.daily-main-quest', 'main-focus:', 'companion +1']) expect(text, raw).not.toContain(raw);
    expect(container.querySelector('[data-v2-detail="companion"] small').textContent).toBe('夥伴關係 · 合作夥伴');
    cleanup();
    delete globalThis.IntersectionObserver;
    container.remove();
  });

  it('names reversed rewards and the last world change the same way', () => {
    expect(formatRewardLine({ rewardType: 'hidden_stat', rewardKey: 'courage.ordinary',
      metadata: { statKey: 'courage' }, amount: 2, direction: 'reversed' })).toBe('勇氣 −2');
    expect(formatRewardLine({ rewardType: 'world_unlock', rewardKey: 'formal-workstation',
      amount: 1, direction: 'reversed' })).toBe('收回解鎖：正式工作站');
    expect(formatWorldChange({ type: 'hidden_stat', key: 'craft', amount: 1,
      metadata: { rewardType: 'hidden_stat', direction: 'added' } })).toBe('技藝 +1');
    expect(formatWorldChange({ type: 'reward_reversed', key: 'daily-main-quest', amount: -100,
      metadata: { rewardType: 'gold', direction: 'reversed' } })).toBe('金幣 −100');
    expect(formatWorldChange({ label: '自訂文字' })).toBe('自訂文字');
    expect(formatWorldChange({ type: 'gold', key: 'daily-main-quest' })).toBe('金幣');
    expect(formatWorldChange(null)).toBeNull();
  });
});
