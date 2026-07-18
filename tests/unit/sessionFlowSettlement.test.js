// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveSessions: vi.fn(),
  saveEnergy: vi.fn(),
  saveUser: vi.fn(),
  deleteSession: vi.fn(),
  renderPage: vi.fn(),
}));

vi.mock('../../pwa/js/storage.js', () => ({
  storage: {
    saveSessions: mocks.saveSessions,
    saveEnergy: mocks.saveEnergy,
    saveUser: mocks.saveUser,
  },
  db: { deleteSession: mocks.deleteSession },
}));
vi.mock('../../pwa/js/router.js', () => ({
  renderPage: mocks.renderPage,
  currentHash: () => 'home',
}));
vi.mock('../../pwa/js/ui/feedback.js', () => ({
  showToast: vi.fn(),
  showXPFloat: vi.fn(),
  showLevelUp: vi.fn(),
}));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/ui/proofSheet.js', () => ({ showProofSheet: vi.fn() }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));

import { state } from '../../pwa/js/state.js';
import { commitSession } from '../../pwa/js/sessionFlow.js';
import { loadSessionDeletionLog } from '../../pwa/js/platform/sessionDeletionLog.js';
import { setPersonalSpaceRuntime } from '../../pwa/js/personalSpace/v2/featureFlag.js';
import { loadPersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import { listActiveRewards } from '../../pwa/js/personalSpace/v2/rewardLedger.js';

function session(overrides = {}) {
  return {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Deep work',
    date: '2026-07-17',
    completedAt: '2026-07-17T02:00:00.000Z',
    durationMinutes: 25,
    result: 'complete',
    finalXP: 0,
    energyCost: 0,
    energyGain: 0,
    impactType: 'task',
    taskNature: 'growth',
    value: 'A',
    resistance: 1,
    ...overrides,
  };
}

describe('session settlement safety', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    state.user = { id: 'owner-1', totalXP: 0 };
    state.sessions = [];
    state.energy = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
    globalThis.confirm = vi.fn(() => true);
  });

  it('rejects a duplicate Session id before changing XP, Energy, or storage', () => {
    state.sessions = [session()];

    expect(commitSession(session({ finalXP: 99, energyCost: 20 }))).toBe(false);
    expect(state.user.totalXP).toBe(0);
    expect(state.energy.currentEnergy).toBe(100);
    expect(mocks.saveSessions).not.toHaveBeenCalled();
  });

  it('reverses only the Energy delta actually applied at clamp boundaries', async () => {
    state.energy.currentEnergy = 3;
    mocks.deleteSession.mockResolvedValue(false);

    expect(commitSession(session({ energyCost: 10 }))).toBe(true);
    expect(state.energy.currentEnergy).toBe(0);
    expect(state.sessions[0]._energyDeltaApplied).toBe(-3);

    window.deleteSession('session-1');
    await Promise.resolve();
    expect(state.energy.currentEnergy).toBe(3);

    state.sessions = [];
    state.energy.currentEnergy = 97;
    expect(commitSession(session({ id: 'gain-session', energyGain: 10 }))).toBe(true);
    expect(state.energy.currentEnergy).toBe(100);
    expect(state.sessions[0]._energyDeltaApplied).toBe(3);

    window.deleteSession('gain-session');
    await Promise.resolve();
    expect(state.energy.currentEnergy).toBe(97);
  });

  it('does not mutate the Session when its deletion tombstone cannot be persisted', () => {
    state.sessions = [session()];
    const setItem = vi.spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new globalThis.DOMException('Storage quota exceeded', 'QuotaExceededError');
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(window.deleteSession('session-1')).toBe(false);
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
    }

    expect(state.sessions).toHaveLength(1);
    expect(mocks.saveSessions).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('writes a durable deletion tombstone when cloud deletion is not confirmed', async () => {
    state.sessions = [session()];
    mocks.deleteSession.mockResolvedValue(false);

    window.deleteSession('session-1');
    await Promise.resolve();

    expect(state.sessions).toEqual([]);
    expect(loadSessionDeletionLog('owner-1')['session-1']).toBeTruthy();
  });

  it('clears the sync tombstone only after cloud deletion succeeds', async () => {
    state.sessions = [session()];
    mocks.deleteSession.mockResolvedValue(true);

    window.deleteSession('session-1');

    await vi.waitFor(() => {
      expect(loadSessionDeletionLog('owner-1')).toEqual({});
    });
  });

  it('keeps remote confirmation durable when the V2 tombstone write fails', async () => {
    state.sessions = [session()];
    mocks.deleteSession.mockResolvedValue(true);
    const originalSetItem = globalThis.Storage.prototype.setItem;
    const setItem = vi.spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(function (key, value) {
        if (String(key).endsWith('personal-space-state-v2:owner-1')) {
          throw new globalThis.DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      window.deleteSession('session-1');
      await vi.waitFor(() => {
        expect(loadSessionDeletionLog('owner-1')['session-1']?.remoteConfirmedAt).toBeTruthy();
      });
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
    }
  });

  it('settles and reverses the real V2 ledger through commit and undo', async () => {
    setPersonalSpaceRuntime('v2');
    mocks.deleteSession.mockResolvedValue(false);

    expect(commitSession(session())).toBe(true);
    let v2State = loadPersonalSpaceV2State('owner-1');
    expect(listActiveRewards(v2State.rewardLedger, v2State.rewardTombstones))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ rewardType: 'gold', amount: 100 }),
        expect.objectContaining({ rewardType: 'project_progress', amount: 25 }),
      ]));

    window.deleteSession('session-1');
    await Promise.resolve();
    v2State = loadPersonalSpaceV2State('owner-1');
    expect(listActiveRewards(v2State.rewardLedger, v2State.rewardTombstones)).toEqual([]);
    expect(v2State.rewardTombstones.some(entry => entry.sourceId === 'session-1')).toBe(true);
  });
});
