/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  getAdjacentRooms,
  getBuildingFloors,
  getBuildingMap,
  getFloorRooms,
  getMemoryRooms,
  getRoomBySceneId,
} from '../../pwa/js/personalSpace/world/floorMap.js';
import { renderFloorMapPanel } from '../../pwa/js/personalSpace/ui/floorMapPanel.js';

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

  it('marks graduated office rooms with a graduatesAtLevel field', () => {
    expect(getRoomBySceneId('office-corner')).toMatchObject({ graduatesAtLevel: 15 });
    expect(getRoomBySceneId('formal-workstation')).toMatchObject({ graduatesAtLevel: 20 });
    expect(getRoomBySceneId('small-office')).toMatchObject({ graduatesAtLevel: 30 });
    expect(getRoomBySceneId('mid-office')).toMatchObject({ graduatesAtLevel: 40 });
  });

  it('does not mark non-graduated rooms with graduatesAtLevel', () => {
    expect(getRoomBySceneId('manager-room')?.graduatesAtLevel).toBeUndefined();
    expect(getRoomBySceneId('estate-hall')?.graduatesAtLevel).toBeUndefined();
  });

  it('getMemoryRooms returns rooms that have graduated at the given level', () => {
    expect(getMemoryRooms(14).map(r => r.id)).toEqual([]);
    expect(getMemoryRooms(15).map(r => r.id)).toContain('office-corner-room');
    expect(getMemoryRooms(15).map(r => r.id)).not.toContain('formal-workstation-room');
    expect(getMemoryRooms(20).map(r => r.id)).toContain('formal-workstation-room');
    expect(getMemoryRooms(40).map(r => r.id)).toHaveLength(4);
  });
});

describe('floor map panel rendering', () => {
  function buildModel({ activeSceneId, sceneOptions }) {
    return {
      activeScene: { id: activeSceneId },
      sceneOptions,
    };
  }

  it('renders a navigable button with data-space-map-room-switch for rooms with available scenes', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
        { id: 'formal-workstation', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    const switchButtons = container.querySelectorAll('[data-space-map-room-switch]');
    const switchIds = Array.from(switchButtons).map(btn => btn.dataset.spaceMapRoomSwitch);

    expect(switchIds).toContain('office-corner');
    expect(switchIds).toContain('formal-workstation');
  });

  it('renders rooms without available scenes as non-interactive divs', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    // company-lobby has no sceneIds — should be a div, not a button with room-switch
    const lobbySwitch = container.querySelector('[data-space-map-room="company-lobby"][data-space-map-room-switch]');
    expect(lobbySwitch).toBeNull();

    const lobbyDiv = container.querySelector('[data-space-map-room="company-lobby"]');
    expect(lobbyDiv?.tagName.toLowerCase()).toBe('div');
  });

  it('marks the current room with is-current', () => {
    // office-corner is the active scene → office-corner-room should be current
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    const currentRoom = container.querySelector('[data-space-map-room="office-corner-room"].is-current');
    expect(currentRoom).not.toBeNull();
  });

  it('does not render buildings for unavailable families', () => {
    // Only office scenes available → estate building should not appear
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    const estateWindow = container.querySelector('[data-space-map-window="estate-residence"]');
    expect(estateWindow).toBeNull();
  });

  it('returns empty string when no building families are available', () => {
    const model = buildModel({
      activeSceneId: 'rough-room',
      sceneOptions: [
        { id: 'rough-room', family: 'rental', role: 'home' },
      ],
    });

    expect(renderFloorMapPanel(model)).toBe('');
  });
});
