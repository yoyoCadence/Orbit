import { getBuildingMap, getFloorRooms, getRoomBySceneId } from '../world/floorMap.js';

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
    ${buildings.map(building => renderMapWindow(building, currentRoom, availableSceneIds)).join('')}
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

function renderMapWindow(building, currentRoom, availableSceneIds) {
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
          ${building.floors.map(floor => renderFloor(floor, currentRoom, availableSceneIds)).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderFloor(floor, currentRoom, availableSceneIds) {
  const rooms = getFloorRooms(floor.id);

  return `
    <article class="space-map-floor">
      <div class="space-map-floor-label">
        <span>${escapeHtml(floor.shortLabel)}</span>
        <strong>${escapeHtml(floor.label)}</strong>
      </div>
      <div class="space-map-room-grid">
        ${rooms.map(room => renderRoom(room, currentRoom, availableSceneIds)).join('')}
      </div>
    </article>
  `;
}

function renderRoom(room, currentRoom, availableSceneIds) {
  const isCurrent = currentRoom?.id === room.id;
  const kindLabel = formatRoomKind(room.kind);
  const switchableSceneId = room.sceneIds.find(sceneId => availableSceneIds.has(sceneId)) ?? null;

  if (switchableSceneId) {
    return `
      <button
        class="space-map-room is-navigable ${isCurrent ? 'is-current' : ''}"
        type="button"
        data-space-map-room="${escapeHtml(room.id)}"
        data-space-map-room-switch="${escapeHtml(switchableSceneId)}"
        aria-label="前往${escapeHtml(room.label)}"
      >
        <strong>${escapeHtml(room.label)}</strong>
        <span>${escapeHtml(kindLabel)}</span>
      </button>
    `;
  }

  return `
    <div
      class="space-map-room ${isCurrent ? 'is-current' : ''}"
      data-space-map-room="${escapeHtml(room.id)}"
    >
      <strong>${escapeHtml(room.label)}</strong>
      <span>${escapeHtml(kindLabel)}</span>
    </div>
  `;
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
