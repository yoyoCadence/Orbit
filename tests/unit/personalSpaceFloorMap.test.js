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
  function buildModel({ activeSceneId, sceneOptions, activeWorkScene = null }) {
    return {
      activeScene: { id: activeSceneId },
      activeWorkScene,
      sceneOptions,
    };
  }

  it('renders navigable buttons for rooms with available scenes', () => {
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

    const switchIds = Array.from(container.querySelectorAll('[data-space-map-room-switch]'))
      .map(btn => btn.dataset.spaceMapRoomSwitch);

    expect(switchIds).toContain('office-corner');
    expect(switchIds).toContain('formal-workstation');
  });

  it('excludes corridor rooms (no sceneIds) from the map entirely', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [{ id: 'office-corner', family: 'office', role: 'work' }],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    // company-lobby, company-elevator etc. have no sceneIds → not rendered at all
    expect(container.querySelector('[data-space-map-room="company-lobby"]')).toBeNull();
    expect(container.querySelector('[data-space-map-room="company-elevator"]')).toBeNull();
  });

  it('renders locked rooms with Lv.XX and hides the room name', () => {
    // office-corner available; formal-workstation (Lv.15) is locked
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [{ id: 'office-corner', family: 'office', role: 'work' }],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    const lockedRoom = container.querySelector('[data-space-map-room="formal-workstation-room"]');
    expect(lockedRoom?.classList.contains('is-locked')).toBe(true);
    expect(lockedRoom?.textContent).not.toContain('正式工位');
    expect(lockedRoom?.textContent).toContain('繼續努力');
    // Lv.15 displayed on the locked cell
    expect(lockedRoom?.querySelector('.space-map-room-level')?.textContent).toContain('15');
  });

  it('shows a teaser for the next locked floor and hides further locked floors', () => {
    // Only office-corner → floor-1 open; floor-2 (small-office Lv.20) should appear as teaser
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [{ id: 'office-corner', family: 'office', role: 'work' }],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    // Teaser floor: exists and shows level info
    const teaserFloor = container.querySelector('.is-locked-floor');
    expect(teaserFloor).not.toBeNull();
    expect(teaserFloor?.querySelector('.space-map-floor-teaser')?.textContent).toContain('20');

    // Floor 3+ should NOT appear as full floors (only one teaser)
    const teaser = container.querySelectorAll('.space-map-floor.is-locked-floor');
    expect(teaser).toHaveLength(1);

    // "更多樓層" note should appear because there are floors 3/4/5 still locked
    expect(container.querySelector('.space-map-more-floors')).not.toBeNull();
  });

  it('shows no more-floors note when only one locked floor remains', () => {
    // All office scenes up to manager-room available; only large-office-suite is locked
    const model = buildModel({
      activeSceneId: 'manager-room',
      activeWorkScene: { id: 'manager-room' },
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
        { id: 'formal-workstation', family: 'office', role: 'work' },
        { id: 'small-office', family: 'office', role: 'work' },
        { id: 'mid-office', family: 'office', role: 'work' },
        { id: 'manager-room', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    // Only floor-5 locked → teaser but no more-floors note
    expect(container.querySelector('.is-locked-floor')).not.toBeNull();
    expect(container.querySelector('.space-map-more-floors')).toBeNull();
  });

  it('marks the active work scene with 上班中 badge', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      activeWorkScene: { id: 'office-corner' },
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
        { id: 'formal-workstation', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    const workBadge = container.querySelector('[data-space-map-room="office-corner-room"] .space-map-room-badge--work');
    expect(workBadge?.textContent).toBe('上班中');
  });

  it('marks graduated office rooms with 回顧 badge', () => {
    // office-corner graduated at Lv.15; formal-workstation is the active work scene
    const model = buildModel({
      activeSceneId: 'formal-workstation',
      activeWorkScene: { id: 'formal-workstation' },
      sceneOptions: [
        { id: 'office-corner', family: 'office', role: 'work' },
        { id: 'formal-workstation', family: 'office', role: 'work' },
      ],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    // office-corner-room has graduatesAtLevel: 15 → should show 回顧
    const memoryBadge = container.querySelector('[data-space-map-room="office-corner-room"] .space-map-room-badge--memory');
    expect(memoryBadge?.textContent).toBe('回顧');
  });

  it('marks the current room with is-current', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [{ id: 'office-corner', family: 'office', role: 'work' }],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('[data-space-map-room="office-corner-room"].is-current')).not.toBeNull();
  });

  it('does not render buildings for unavailable families', () => {
    const model = buildModel({
      activeSceneId: 'office-corner',
      sceneOptions: [{ id: 'office-corner', family: 'office', role: 'work' }],
    });

    const html = renderFloorMapPanel(model);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('[data-space-map-window="estate-residence"]')).toBeNull();
  });

  it('returns empty string when no building families are available', () => {
    const model = buildModel({
      activeSceneId: 'rough-room',
      sceneOptions: [{ id: 'rough-room', family: 'rental', role: 'home' }],
    });

    expect(renderFloorMapPanel(model)).toBe('');
  });
});
