/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_PERSONAL_SPACE_RUNTIME } from '../../pwa/js/flags.js';
import { savePersonalSpaceState } from '../../pwa/js/personalSpace/gameState.js';
import {
  PERSONAL_SPACE_V2_REWARD_EPOCH,
  PERSONAL_SPACE_V2_RULESET_ID,
  getPersonalSpaceV2StorageKey,
} from '../../pwa/js/personalSpace/v2/config.js';
import {
  getPersonalSpaceRuntime,
  isPersonalSpaceV2Enabled,
  setPersonalSpaceRuntime,
} from '../../pwa/js/personalSpace/v2/featureFlag.js';
import { migratePersonalSpaceStateV1ToV2 } from '../../pwa/js/personalSpace/v2/migrateState.js';
import {
  hasPersonalSpaceV2State,
  loadOrMigratePersonalSpaceV2State,
  loadPersonalSpaceV2State,
  PersonalSpaceV2RevisionConflictError,
  savePersonalSpaceV2State,
} from '../../pwa/js/personalSpace/v2/store.js';

describe('Personal Space V2 migration foundation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ships V2 by default while preserving an explicit legacy fallback', () => {
    expect(getPersonalSpaceRuntime()).toBe('v2');
    expect(isPersonalSpaceV2Enabled()).toBe(true);

    setPersonalSpaceRuntime('legacy');

    expect(localStorage.getItem(FLAG_PERSONAL_SPACE_RUNTIME)).toBe('legacy');
    expect(getPersonalSpaceRuntime()).toBe('legacy');
    expect(isPersonalSpaceV2Enabled()).toBe(false);

    localStorage.setItem(FLAG_PERSONAL_SPACE_RUNTIME, 'unexpected-value');
    expect(getPersonalSpaceRuntime()).toBe('v2');
  });

  it('uses distinct owner-scoped storage keys', () => {
    expect(getPersonalSpaceV2StorageKey('owner/a')).toBe('personal-space-state-v2:owner%2Fa');
    expect(getPersonalSpaceV2StorageKey('owner/a')).not.toBe(getPersonalSpaceV2StorageKey('owner/b'));
    expect(() => getPersonalSpaceV2StorageKey('')).toThrow(/ownerId/);
  });

  it('deterministically migrates legacy ownership, placement, world, and opening Gold', () => {
    const legacy = {
      version: 1,
      spentGold: 120,
      ownedItems: ['small-plant', { id: 'desk-lamp', name: 'Desk Lamp' }],
      placedItems: [{ id: 'plant-1', sceneId: 'rough-room', placement: { x: '40%' } }],
      idleWindowLayouts: { office: { placements: {} } },
      selectedSceneId: 'office-corner',
      memoryViewSceneId: 'rough-room',
      selectedThemeId: 'night',
      memorySceneLog: { 'rough-room': { firstVisitedAt: '2026-07-01T00:00:00.000Z' } },
      companionRelationshipStage: 'quiet-familiarity',
      hiddenStats: { discipline: 4, craft: 2 },
    };
    const legacyBefore = JSON.stringify(legacy);

    const migrated = migratePersonalSpaceStateV1ToV2(legacy, {
      ownerId: 'user-1',
      openingGold: 880,
    });

    expect(migrated).toMatchObject({
      version: 2,
      ownerId: 'user-1',
      rulesetId: PERSONAL_SPACE_V2_RULESET_ID,
      rewardEpoch: PERSONAL_SPACE_V2_REWARD_EPOCH,
      worldRevision: 0,
      weather: 'clear',
      migration: {
        source: 'personal-space-state',
        sourceVersion: 1,
        migratedAt: PERSONAL_SPACE_V2_REWARD_EPOCH,
      },
      economy: {
        openingGold: 880,
        balanceGold: 880,
        earnedGold: 0,
        spentGold: 0,
        legacySpentGold: 120,
      },
      inventory: {
        ownedItems: [{ id: 'small-plant' }, { id: 'desk-lamp', name: 'Desk Lamp' }],
      },
      world: {
        selectedSceneId: 'office-corner',
        memoryViewSceneId: 'rough-room',
        selectedThemeId: 'night',
      },
      companion: { relationshipStage: 'quiet-familiarity' },
      hiddenStats: { discipline: 4, craft: 2 },
    });
    expect(migrated.world.placedItems).toHaveLength(1);
    expect(migrated.rewardLedger).toEqual([]);
    expect(migrated.rewardTombstones).toEqual([]);
    expect(JSON.stringify(legacy)).toBe(legacyBefore);
  });

  it('is idempotent when the migration receives an already migrated state', () => {
    const first = migratePersonalSpaceStateV1ToV2(
      { version: 1, ownedItems: ['small-plant'], spentGold: 20 },
      { ownerId: 'user-1', openingGold: 180 }
    );
    const second = migratePersonalSpaceStateV1ToV2(first, {
      ownerId: 'user-1',
      openingGold: 9999,
    });

    expect(second).toEqual(first);
  });

  it('persists V2 per owner without changing the legacy key or remigrating', () => {
    savePersonalSpaceState({
      spentGold: 60,
      ownedItems: [{ id: 'small-plant' }],
      selectedSceneId: 'office-corner',
    });
    const legacyStorageKey = 'orbit_platform_bridge_v1:personal-space-state';
    const legacyBefore = localStorage.getItem(legacyStorageKey);

    const migrated = loadOrMigratePersonalSpaceV2State({
      ownerId: 'user-1',
      openingGold: 440,
    });

    expect(hasPersonalSpaceV2State('user-1')).toBe(true);
    expect(hasPersonalSpaceV2State('user-2')).toBe(false);
    expect(loadPersonalSpaceV2State('user-2').inventory.ownedItems).toEqual([]);
    expect(localStorage.getItem(legacyStorageKey)).toBe(legacyBefore);

    savePersonalSpaceV2State('user-1', {
      ...migrated,
      worldRevision: 3,
    });
    const loadedAgain = loadOrMigratePersonalSpaceV2State({
      ownerId: 'user-1',
      openingGold: 9999,
      legacyState: { ownedItems: [{ id: 'must-not-remigrate' }] },
    });

    expect(loadedAgain.worldRevision).toBe(3);
    expect(loadedAgain.economy.openingGold).toBe(440);
    expect(loadedAgain.inventory.ownedItems).toEqual([{ id: 'small-plant' }]);
    expect(localStorage.getItem(legacyStorageKey)).toBe(legacyBefore);
  });

  it('allows only the first owner to claim the unscoped legacy state', () => {
    savePersonalSpaceState({
      spentGold: 125,
      ownedItems: [{ id: 'legacy-desk' }],
      hiddenStats: { discipline: 7 },
    });

    const firstOwner = loadOrMigratePersonalSpaceV2State({
      ownerId: 'owner-1',
      openingGold: 475,
    });
    const secondOwner = loadOrMigratePersonalSpaceV2State({
      ownerId: 'owner-2',
      openingGold: 900,
      legacyState: {
        spentGold: 999,
        ownedItems: [{ id: 'must-not-leak' }],
        hiddenStats: { discipline: 99 },
      },
    });

    expect(firstOwner).toMatchObject({
      migration: { source: 'personal-space-state' },
      economy: { legacySpentGold: 125 },
      inventory: { ownedItems: [{ id: 'legacy-desk' }] },
      hiddenStats: { discipline: 7 },
    });
    expect(secondOwner).toMatchObject({
      migration: { source: 'empty', sourceVersion: null },
      economy: { openingGold: 900, legacySpentGold: 0 },
      inventory: { ownedItems: [] },
      hiddenStats: { discipline: 0 },
    });
  });

  it('does not copy a supplied legacy object when migration is explicitly unclaimed', () => {
    const migrated = migratePersonalSpaceStateV1ToV2({
      spentGold: 90,
      ownedItems: [{ id: 'private-item' }],
      hiddenStats: { craft: 8 },
    }, {
      ownerId: 'owner-2',
      openingGold: 300,
      claimLegacy: false,
    });

    expect(migrated).toMatchObject({
      migration: { source: 'empty', sourceVersion: null },
      economy: { openingGold: 300, legacySpentGold: 0 },
      inventory: { ownedItems: [] },
      hiddenStats: { craft: 0 },
    });
  });

  it('throws instead of reporting success when owner state cannot be persisted', () => {
    const state = loadPersonalSpaceV2State('user-1');
    const setItem = vi.spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new globalThis.DOMException('Storage quota exceeded', 'QuotaExceededError');
      });

    try {
      expect(() => savePersonalSpaceV2State('user-1', state))
        .toThrow(/Failed to persist Personal Space V2 state/);
      expect(() => loadOrMigratePersonalSpaceV2State({ ownerId: 'user-2' }))
        .toThrow(/Failed to (claim legacy Personal Space|persist Personal Space V2 state)/);
    } finally {
      setItem.mockRestore();
    }

    expect(hasPersonalSpaceV2State('user-1')).toBe(false);
    expect(hasPersonalSpaceV2State('user-2')).toBe(false);
  });

  it('rejects a stale editor write instead of overwriting a newer world revision', () => {
    const original = savePersonalSpaceV2State('user-1', {
      ...loadPersonalSpaceV2State('user-1'),
      worldRevision: 2,
    });
    savePersonalSpaceV2State('user-1', { ...original, worldRevision: 3 });

    expect(() => savePersonalSpaceV2State(
      'user-1',
      { ...original, worldRevision: 4 },
      { expectedRevision: 2 },
    )).toThrow(PersonalSpaceV2RevisionConflictError);
    expect(loadPersonalSpaceV2State('user-1').worldRevision).toBe(3);
  });
});
