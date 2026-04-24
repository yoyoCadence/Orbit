/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  getAdjacentRooms,
  getBuildingFloors,
  getBuildingMap,
  getFloorRooms,
  getRoomBySceneId,
} from '../../pwa/js/personalSpace/world/floorMap.js';

describe('personal space floor map schema', () => {
  it('defines company and estate building maps with ordered floors', () => {
    const companyBuilding = getBuildingMap('company-building');
    const estateBuilding = getBuildingMap('estate-residence');

    expect(companyBuilding?.label).toBe('公司大樓');
    expect(companyBuilding?.floors.map(floor => floor.id)).toEqual([
      'company-floor-1',
      'company-floor-2',
      'company-floor-3',
      'company-floor-4',
      'company-floor-5',
    ]);

    expect(estateBuilding?.label).toBe('豪宅');
    expect(getBuildingFloors('estate-residence').map(floor => floor.id)).toEqual([
      'estate-floor-1',
      'estate-floor-2',
    ]);
  });

  it('maps unlocked scenes to rooms without touching runtime code', () => {
    expect(getRoomBySceneId('office-corner')).toMatchObject({
      id: 'office-corner-room',
      floorId: 'company-floor-1',
    });
    expect(getRoomBySceneId('formal-workstation')).toMatchObject({
      id: 'formal-workstation-room',
      floorId: 'company-floor-1',
    });
    expect(getRoomBySceneId('estate-study')).toMatchObject({
      id: 'estate-study-room',
      floorId: 'estate-floor-2',
    });
  });

  it('keeps room adjacency queryable for future map and travel surfaces', () => {
    const firstFloorRooms = getFloorRooms('company-floor-1');
    const officeAdjacency = getAdjacentRooms('office-corner-room');

    expect(firstFloorRooms.map(room => room.id)).toContain('formal-workstation-room');
    expect(officeAdjacency.map(room => room.id)).toEqual([
      'company-lobby',
      'company-elevator',
      'formal-workstation-room',
    ]);
  });
});
