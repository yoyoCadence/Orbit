export const personalSpaceFloorMap = {
  buildings: {
    'company-building': {
      id: 'company-building',
      label: '公司大樓',
      category: 'work',
      defaultFloorId: 'company-floor-1',
      floors: ['company-floor-1', 'company-floor-2', 'company-floor-3', 'company-floor-4', 'company-floor-5'],
    },
    'estate-residence': {
      id: 'estate-residence',
      label: '豪宅',
      category: 'home',
      defaultFloorId: 'estate-floor-1',
      floors: ['estate-floor-1', 'estate-floor-2'],
    },
  },
  floors: {
    'company-floor-1': {
      id: 'company-floor-1',
      buildingId: 'company-building',
      label: '公司一樓',
      shortLabel: '1F',
      order: 1,
      rooms: ['company-lobby', 'company-elevator', 'office-corner-room', 'formal-workstation-room'],
    },
    'company-floor-2': {
      id: 'company-floor-2',
      buildingId: 'company-building',
      label: '公司二樓',
      shortLabel: '2F',
      order: 2,
      rooms: ['company-floor-2-hall', 'small-office-room'],
    },
    'company-floor-3': {
      id: 'company-floor-3',
      buildingId: 'company-building',
      label: '公司中高樓層',
      shortLabel: 'Upper',
      order: 3,
      rooms: ['company-floor-3-hall', 'mid-office-room'],
    },
    'company-floor-4': {
      id: 'company-floor-4',
      buildingId: 'company-building',
      label: '公司主管樓層',
      shortLabel: 'Exec',
      order: 4,
      rooms: ['company-floor-4-hall', 'manager-room-suite'],
    },
    'company-floor-5': {
      id: 'company-floor-5',
      buildingId: 'company-building',
      label: '公司大型辦公層',
      shortLabel: 'HQ',
      order: 5,
      rooms: ['company-floor-5-hall', 'large-office-suite-room', 'meeting-zone-room'],
    },
    'estate-floor-1': {
      id: 'estate-floor-1',
      buildingId: 'estate-residence',
      label: '豪宅主層',
      shortLabel: 'Main',
      order: 1,
      rooms: ['estate-entry', 'estate-hall-room', 'estate-lounge-room', 'estate-balcony-room'],
    },
    'estate-floor-2': {
      id: 'estate-floor-2',
      buildingId: 'estate-residence',
      label: '豪宅私人層',
      shortLabel: 'Private',
      order: 2,
      rooms: ['estate-upper-landing', 'estate-study-room', 'estate-game-room-space'],
    },
  },
  rooms: {
    'company-lobby': createRoom({
      id: 'company-lobby',
      floorId: 'company-floor-1',
      label: '公司大廳',
      kind: 'transition',
      adjacentRooms: ['company-elevator', 'office-corner-room'],
    }),
    'company-elevator': createRoom({
      id: 'company-elevator',
      floorId: 'company-floor-1',
      label: '電梯前廳',
      kind: 'transition',
      adjacentRooms: ['company-lobby', 'office-corner-room', 'company-floor-2-hall'],
    }),
    'office-corner-room': createRoom({
      id: 'office-corner-room',
      floorId: 'company-floor-1',
      label: '一樓辦公角',
      kind: 'workspace',
      sceneIds: ['office-corner'],
      adjacentRooms: ['company-lobby', 'company-elevator', 'formal-workstation-room'],
    }),
    'formal-workstation-room': createRoom({
      id: 'formal-workstation-room',
      floorId: 'company-floor-1',
      label: '正式工位',
      kind: 'workspace',
      sceneIds: ['formal-workstation'],
      adjacentRooms: ['office-corner-room', 'company-elevator'],
    }),
    'company-floor-2-hall': createRoom({
      id: 'company-floor-2-hall',
      floorId: 'company-floor-2',
      label: '二樓走廊',
      kind: 'transition',
      adjacentRooms: ['company-elevator', 'small-office-room', 'company-floor-3-hall'],
    }),
    'small-office-room': createRoom({
      id: 'small-office-room',
      floorId: 'company-floor-2',
      label: '二樓小辦公室',
      kind: 'workspace',
      sceneIds: ['small-office'],
      adjacentRooms: ['company-floor-2-hall'],
    }),
    'company-floor-3-hall': createRoom({
      id: 'company-floor-3-hall',
      floorId: 'company-floor-3',
      label: '高樓層走廊',
      kind: 'transition',
      adjacentRooms: ['company-floor-2-hall', 'mid-office-room', 'company-floor-4-hall'],
    }),
    'mid-office-room': createRoom({
      id: 'mid-office-room',
      floorId: 'company-floor-3',
      label: '中階高樓層辦公室',
      kind: 'workspace',
      sceneIds: ['mid-office'],
      adjacentRooms: ['company-floor-3-hall'],
    }),
    'company-floor-4-hall': createRoom({
      id: 'company-floor-4-hall',
      floorId: 'company-floor-4',
      label: '主管樓層前廳',
      kind: 'transition',
      adjacentRooms: ['company-floor-3-hall', 'manager-room-suite', 'company-floor-5-hall'],
    }),
    'manager-room-suite': createRoom({
      id: 'manager-room-suite',
      floorId: 'company-floor-4',
      label: '主管室',
      kind: 'workspace',
      sceneIds: ['manager-room'],
      adjacentRooms: ['company-floor-4-hall'],
    }),
    'company-floor-5-hall': createRoom({
      id: 'company-floor-5-hall',
      floorId: 'company-floor-5',
      label: '大型辦公層前廳',
      kind: 'transition',
      adjacentRooms: ['company-floor-4-hall', 'large-office-suite-room', 'meeting-zone-room'],
    }),
    'large-office-suite-room': createRoom({
      id: 'large-office-suite-room',
      floorId: 'company-floor-5',
      label: '大型辦公室',
      kind: 'workspace',
      sceneIds: ['large-office-suite'],
      adjacentRooms: ['company-floor-5-hall', 'meeting-zone-room'],
    }),
    'meeting-zone-room': createRoom({
      id: 'meeting-zone-room',
      floorId: 'company-floor-5',
      label: '私人會議區',
      kind: 'meeting',
      adjacentRooms: ['company-floor-5-hall', 'large-office-suite-room'],
    }),
    'estate-entry': createRoom({
      id: 'estate-entry',
      floorId: 'estate-floor-1',
      label: '豪宅玄關',
      kind: 'transition',
      adjacentRooms: ['estate-hall-room'],
    }),
    'estate-hall-room': createRoom({
      id: 'estate-hall-room',
      floorId: 'estate-floor-1',
      label: '豪宅主廳',
      kind: 'living',
      sceneIds: ['estate-hall'],
      adjacentRooms: ['estate-entry', 'estate-lounge-room', 'estate-upper-landing'],
    }),
    'estate-lounge-room': createRoom({
      id: 'estate-lounge-room',
      floorId: 'estate-floor-1',
      label: '豪宅大客廳',
      kind: 'living',
      sceneIds: ['estate-lounge'],
      adjacentRooms: ['estate-hall-room', 'estate-balcony-room'],
    }),
    'estate-balcony-room': createRoom({
      id: 'estate-balcony-room',
      floorId: 'estate-floor-1',
      label: '豪宅陽台',
      kind: 'view',
      adjacentRooms: ['estate-lounge-room'],
    }),
    'estate-upper-landing': createRoom({
      id: 'estate-upper-landing',
      floorId: 'estate-floor-2',
      label: '豪宅二樓平台',
      kind: 'transition',
      adjacentRooms: ['estate-hall-room', 'estate-study-room', 'estate-game-room-space'],
    }),
    'estate-study-room': createRoom({
      id: 'estate-study-room',
      floorId: 'estate-floor-2',
      label: '私人書房',
      kind: 'study',
      sceneIds: ['estate-study'],
      adjacentRooms: ['estate-upper-landing'],
    }),
    'estate-game-room-space': createRoom({
      id: 'estate-game-room-space',
      floorId: 'estate-floor-2',
      label: '遊戲房',
      kind: 'leisure',
      sceneIds: ['estate-game-room'],
      adjacentRooms: ['estate-upper-landing'],
    }),
  },
};

export function getBuildingMap(buildingId) {
  const building = personalSpaceFloorMap.buildings[buildingId];
  if (!building) return null;

  return {
    ...building,
    floors: building.floors
      .map(floorId => personalSpaceFloorMap.floors[floorId])
      .filter(Boolean),
  };
}

export function getBuildingFloors(buildingId) {
  return getBuildingMap(buildingId)?.floors || [];
}

export function getFloorDescriptor(floorId) {
  return personalSpaceFloorMap.floors[floorId] || null;
}

export function getFloorRooms(floorId) {
  const floor = getFloorDescriptor(floorId);
  if (!floor) return [];

  return floor.rooms
    .map(roomId => personalSpaceFloorMap.rooms[roomId])
    .filter(Boolean);
}

export function getRoomDescriptor(roomId) {
  return personalSpaceFloorMap.rooms[roomId] || null;
}

export function getAdjacentRooms(roomId) {
  const room = getRoomDescriptor(roomId);
  if (!room) return [];

  return room.adjacentRooms
    .map(adjacentRoomId => getRoomDescriptor(adjacentRoomId))
    .filter(Boolean);
}

export function getRoomBySceneId(sceneId) {
  return Object.values(personalSpaceFloorMap.rooms).find(room => room.sceneIds.includes(sceneId)) || null;
}

function createRoom({
  id,
  floorId,
  label,
  kind,
  sceneIds = [],
  adjacentRooms = [],
}) {
  return {
    id,
    floorId,
    label,
    kind,
    sceneIds,
    adjacentRooms,
  };
}
