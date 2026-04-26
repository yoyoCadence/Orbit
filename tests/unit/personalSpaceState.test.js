/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultPersonalSpaceState,
  loadPersonalSpaceState,
  recordMemorySceneVisit,
  savePersonalSpaceState,
} from '../../pwa/js/personalSpace/gameState.js';
import { getPlacedFurnitureForScene } from '../../pwa/js/personalSpace/furnitureState.js';

describe('personal space furniture state', () => {
  it('includes a separate placedItems collection in the default state', () => {
    expect(createDefaultPersonalSpaceState()).toMatchObject({
      ownedItems: [],
      placedItems: [],
    });
  });

  it('includes memorySceneLog as an empty object in default state', () => {
    expect(createDefaultPersonalSpaceState().memorySceneLog).toEqual({});
  });

  it('normalizes and persists memorySceneLog entries', () => {
    localStorage.clear();
    savePersonalSpaceState({
      memorySceneLog: {
        'office-corner': { firstVisitedAt: '2026-04-26T10:00:00.000Z' },
        '': { firstVisitedAt: '2026-01-01T00:00:00.000Z' },  // invalid key — should be dropped
      },
    });

    const state = loadPersonalSpaceState();
    expect(state.memorySceneLog['office-corner']).toEqual({ firstVisitedAt: '2026-04-26T10:00:00.000Z' });
    expect(state.memorySceneLog['']).toBeUndefined();
  });

  it('recordMemorySceneVisit sets firstVisitedAt on first call and is idempotent', () => {
    localStorage.clear();

    recordMemorySceneVisit('office-corner');
    const first = loadPersonalSpaceState().memorySceneLog['office-corner'];
    expect(typeof first.firstVisitedAt).toBe('string');

    recordMemorySceneVisit('office-corner');
    const second = loadPersonalSpaceState().memorySceneLog['office-corner'];
    expect(second.firstVisitedAt).toBe(first.firstVisitedAt);
  });

  it('normalizes placed items separately from owned items', () => {
    localStorage.clear();

    savePersonalSpaceState({
      spentGold: 120,
      ownedItems: [{ id: 'small-plant', name: 'Small Plant' }],
      placedItems: [
        {
          sceneId: 'rough-room',
          layoutItemId: 'rental-plant',
          placement: {
            x: '38%',
            y: '82%',
            z: 4,
            scale: 1.1,
          },
        },
      ],
    });

    const state = loadPersonalSpaceState();

    expect(state.ownedItems).toEqual([{ id: 'small-plant', name: 'Small Plant' }]);
    expect(state.placedItems).toEqual([
      {
        id: 'rental-plant',
        sceneId: 'rough-room',
        layoutItemId: 'rental-plant',
        placement: {
          x: '38%',
          y: '82%',
          z: 4,
          scale: 1.1,
        },
      },
    ]);
  });

  it('applies placement overrides without coupling them to owned item storage', () => {
    const resolved = getPlacedFurnitureForScene({
      sceneId: 'rough-room',
      layoutItems: [
        {
          id: 'rental-bed',
          assetId: 'rental-bed-basic',
          placement: { x: '17%', y: '86%', z: 3, anchor: 'center-bottom', scale: 1 },
        },
      ],
      ownedItems: [{ id: 'small-plant' }],
      placedItems: [
        {
          id: 'rental-bed',
          sceneId: 'rough-room',
          layoutItemId: 'rental-bed',
          placement: { x: '21%', scale: 1.08 },
        },
        {
          id: 'small-plant-instance',
          sceneId: 'rough-room',
          itemId: 'small-plant',
          assetId: 'rental-plant-basic',
          kind: 'plant',
          label: 'Small Plant',
          placement: { x: '42%', y: '84%', width: '9%', height: '16%', z: 3 },
        },
      ],
    });

    expect(resolved[0].placement).toMatchObject({
      x: '21%',
      y: '86%',
      scale: 1.08,
    });
    expect(resolved[1]).toMatchObject({
      itemId: 'small-plant',
      assetId: 'rental-plant-basic',
      kind: 'plant',
    });
  });
});
