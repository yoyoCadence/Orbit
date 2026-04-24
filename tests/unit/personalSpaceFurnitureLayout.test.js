/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getSceneFurnitureLayout } from '../../pwa/js/personalSpace/world/furnitureLayout.js';

describe('personal space furniture layout schema', () => {
  it('defines anchor, scale, z, and shadow metadata for office-corner props', () => {
    const layout = getSceneFurnitureLayout({
      sceneId: 'office-corner',
      sceneRole: 'work',
      level: 10,
    });

    expect(layout.find(item => item.id === 'office-corner-desk')).toMatchObject({
      assetId: 'office-corner-desk',
      placement: {
        anchor: 'center-bottom',
        z: 3,
      },
    });
    expect(layout.find(item => item.id === 'office-chair')).toMatchObject({
      placement: {
        z: 4,
        scale: 0.98,
      },
    });
    expect(layout.find(item => item.id === 'office-corner-desk')?.shadow).toMatchObject({
      width: '30%',
      height: '6%',
    });
  });

  it('keeps upgraded rental wall art and plant in the layout schema', () => {
    const layout = getSceneFurnitureLayout({
      sceneId: 'upgraded-rental',
      sceneRole: 'home',
      ownedItemCount: 1,
    });

    expect(layout.find(item => item.id === 'rental-wall-art')).toMatchObject({
      assetId: 'rental-wall-art-basic',
      placement: {
        anchor: 'center',
        z: 2,
      },
    });
    expect(layout.find(item => item.id === 'rental-plant')).toMatchObject({
      assetId: 'rental-plant-basic',
    });
  });
});
