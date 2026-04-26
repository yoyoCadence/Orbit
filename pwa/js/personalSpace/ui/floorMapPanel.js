import { getBuildingMap, getFloorRooms, getRoomBySceneId } from '../world/floorMap.js';
import { getSceneMinLevel } from '../unlockRules.js';

const MAP_BUILDINGS = [
  { id: 'company-building', family: 'office' },
  { id: 'estate-residence', family: 'estate' },
];

export function renderFloorMapPanel(model) {
  const currentRoom = getRoomBySceneId(model.activeScene?.id);
  const availableFamilies = new Set(model.sceneOptions.map(option => option.family));
  const availableSceneIds = new Set(model.sceneOptions.map(option => option.id));
  const buildings = MAP_BUILDINGS
    .filter(entry => availableFamilies.has(entry.family))
    .map(entry => getBuildingMap(entry.id))
    .filter(Boolean);

  if (!buildings.length) return '';

  return `
    <div class="space-map-entry" aria-label="Floor map">
      ${buildings.map(building => renderMapButton(building)).join('')}
    </div>
    ${buildings.map(building => renderMapWindow(building, currentRoom, availableSceneIds, model)).join('')}
  `;
}

function renderMapButton(building) {
  return `
    <button
      class="space-map-button"
      type="button"
      data-space-map-open="${escapeHtml(building.id)}"
      aria-label="開啟${escapeHtml(building.label)}地圖"
      title="${escapeHtml(building.label)}地圖"
    >
      <span aria-hidden="true">⌖</span>
    </button>
  `;
}

function renderMapWindow(building, currentRoom, availableSceneIds, model) {
  const { openFloors, teaserFloor, hasMoreLockedFloors } = categorizeFloors(building, availableSceneIds);

  return `
    <div
      class="space-map-window"
      data-space-map-window="${escapeHtml(building.id)}"
      hidden
    >
      <button class="space-map-backdrop" type="button" data-space-map-close aria-label="關閉地圖"></button>
      <section class="space-map-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(building.label)}地圖">
        <div class="space-map-header">
          <div>
            <span>Floor Map</span>
            <strong>${escapeHtml(building.label)}</strong>
          </div>
          <button class="space-map-close" type="button" data-space-map-close aria-label="關閉地圖">×</button>
        </div>
        <div class="space-map-floor-list">
          ${openFloors.map(floor => renderFloor(floor, currentRoom, availableSceneIds, building, model)).join('')}
          ${teaserFloor ? renderTeaserFloor(teaserFloor) : ''}
          ${hasMoreLockedFloors ? '<div class="space-map-more-floors">更多樓層持續升等後陸續開放</div>' : ''}
        </div>
      </section>
    </div>
  `;
}

// Split building floors into open (has at least one available scene) and locked.
// Returns the first locked floor as a teaser; the rest are hidden.
function categorizeFloors(building, availableSceneIds) {
  const openFloors = [];
  const lockedFloors = [];

  for (const floor of building.floors) {
    const sceneRooms = getFloorRooms(floor.id).filter(room => room.sceneIds.length > 0);
    const hasAvailable = sceneRooms.some(room =>
      room.sceneIds.some(id => availableSceneIds.has(id))
    );

    if (hasAvailable) {
      openFloors.push(floor);
    } else {
      const minLevel = getFloorMinLevel(floor);
      lockedFloors.push({ floor, minLevel });
    }
  }

  lockedFloors.sort((a, b) => (a.minLevel ?? Infinity) - (b.minLevel ?? Infinity));

  return {
    openFloors,
    teaserFloor: lockedFloors[0] ?? null,
    hasMoreLockedFloors: lockedFloors.length > 1,
  };
}

function getFloorMinLevel(floor) {
  const levels = getFloorRooms(floor.id)
    .flatMap(room => room.sceneIds)
    .map(sceneId => getSceneMinLevel(sceneId))
    .filter(v => v != null);
  return levels.length > 0 ? Math.min(...levels) : null;
}

function renderFloor(floor, currentRoom, availableSceneIds, building, model) {
  // Only rooms with sceneIds — corridors and transition areas are excluded from the map
  const rooms = getFloorRooms(floor.id).filter(room => room.sceneIds.length > 0);

  return `
    <article class="space-map-floor">
      <div class="space-map-floor-label">
        <span>${escapeHtml(floor.shortLabel)}</span>
        <strong>${escapeHtml(floor.label)}</strong>
      </div>
      <div class="space-map-room-grid">
        ${rooms.map(room => renderRoom(room, currentRoom, availableSceneIds, building, model)).join('')}
      </div>
    </article>
  `;
}

function renderTeaserFloor({ minLevel }) {
  return `
    <article class="space-map-floor is-locked-floor" aria-label="尚未解鎖的樓層">
      <div class="space-map-floor-label">
        <span>?</span>
        <strong>更高樓層</strong>
      </div>
      <div class="space-map-floor-teaser">
        <span>${minLevel ? `升到 Lv.${minLevel} 解鎖` : '持續升等後解鎖'}</span>
      </div>
    </article>
  `;
}

function renderRoom(room, currentRoom, availableSceneIds, building, model) {
  const isCurrent = currentRoom?.id === room.id;
  const kindLabel = formatRoomKind(room.kind);
  const switchableSceneId = room.sceneIds.find(sceneId => availableSceneIds.has(sceneId)) ?? null;

  // Locked room: has sceneId but not yet available
  if (!switchableSceneId) {
    const unlockLevel = getSceneMinLevel(room.sceneIds[0]);
    return `
      <div
        class="space-map-room is-locked"
        data-space-map-room="${escapeHtml(room.id)}"
        aria-label="${unlockLevel ? `Lv.${unlockLevel} 後解鎖` : '尚未解鎖的空間'}"
      >
        ${unlockLevel ? `<span class="space-map-room-level">Lv.${unlockLevel}</span>` : ''}
        <span class="space-map-room-locked-label">繼續努力<br>開放更多空間</span>
      </div>
    `;
  }

  // Navigable room — add badge for company building offices
  const badge = getRoomBadge(room, building, switchableSceneId, model.activeWorkScene);
  return `
    <button
      class="space-map-room is-navigable ${isCurrent ? 'is-current' : ''}"
      type="button"
      data-space-map-room="${escapeHtml(room.id)}"
      data-space-map-room-switch="${escapeHtml(switchableSceneId)}"
      aria-label="前往${escapeHtml(room.label)}"
    >
      ${badge ? `<span class="space-map-room-badge space-map-room-badge--${badge}">${badge === 'work' ? '上班中' : '回顧'}</span>` : ''}
      <strong>${escapeHtml(room.label)}</strong>
      <span>${escapeHtml(kindLabel)}</span>
    </button>
  `;
}

// Returns 'work' if this is the current workplace, 'memory' if it's a graduated past office.
function getRoomBadge(room, building, sceneId, activeWorkScene) {
  if (building.id !== 'company-building') return null;
  if (sceneId === activeWorkScene?.id) return 'work';
  if (room.graduatesAtLevel != null) return 'memory';
  return null;
}

function formatRoomKind(kind) {
  return {
    leisure: '休閒',
    living: '生活',
    meeting: '會議',
    study: '書房',
    transition: '通道',
    view: '景觀',
    workspace: '工作',
  }[kind] || '空間';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
