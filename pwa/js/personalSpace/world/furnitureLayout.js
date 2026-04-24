const OFFICE_SUITE_SCENES = new Set(['small-office', 'mid-office', 'manager-room', 'large-office-suite']);
const OFFICE_BOARD_SCENES = new Set(['mid-office', 'manager-room', 'large-office-suite']);

export function getSceneFurnitureLayout({ sceneId, sceneRole, ownedItemCount = 0, level = 1 }) {
  if (sceneRole === 'work') {
    return buildOfficeLayout(sceneId, level);
  }

  if (sceneId?.startsWith('estate-')) {
    return buildEstateLayout(sceneId, ownedItemCount);
  }

  return buildRentalLayout(sceneId, ownedItemCount);
}

function buildOfficeLayout(sceneId, level) {
  const items = [
    createItem({
      id: 'office-corner-desk',
      kind: 'desk',
      label: sceneId === 'office-corner' ? 'Corner Desk' : 'Desk',
      assetId: 'office-corner-desk',
      x: '34%',
      y: '76%',
      width: '34%',
      height: '26%',
      z: 3,
      scale: 1.08,
      shadow: shadow('36%', '80%', '30%', '6%', 0.28),
    }),
    createItem({
      id: 'office-chair',
      kind: 'chair',
      label: 'Chair',
      assetId: 'office-chair-basic',
      x: '32%',
      y: '88%',
      width: '11%',
      height: '12%',
      z: 4,
      scale: 0.98,
      shadow: shadow('32.5%', '89%', '11%', '4.5%', 0.22),
    }),
    createItem({
      id: 'office-monitor',
      kind: 'monitor',
      label: level >= 15 ? 'Dual Screen' : 'Screen',
      assetId: level >= 15 ? 'office-monitor-dual' : 'office-monitor-single',
      x: '33.5%',
      y: '64.5%',
      width: level >= 15 ? '13.5%' : '10%',
      height: '9%',
      z: 5,
      scale: 1,
    }),
    createItem({
      id: 'office-shelf',
      kind: 'shelf',
      label: 'Shelf',
      assetId: 'office-shelf-basic',
      x: '79%',
      y: '79%',
      width: '15%',
      height: '31%',
      z: 3,
      scale: 1.04,
      shadow: shadow('79%', '83%', '14%', '5.5%', 0.24),
    }),
  ];

  if (OFFICE_SUITE_SCENES.has(sceneId)) {
    items.push(createItem({
      id: 'office-plant',
      kind: 'plant',
      label: 'Plant',
      assetId: 'office-plant-basic',
      x: '63%',
      y: '84%',
      width: '10%',
      height: '17%',
      z: 3,
      scale: 0.96,
      shadow: shadow('63%', '88%', '10%', '4%', 0.18),
    }));
  }

  if (OFFICE_BOARD_SCENES.has(sceneId)) {
    items.push(createItem({
      id: 'office-board',
      kind: 'art',
      label: 'Board',
      assetId: 'office-board-basic',
      x: '60%',
      y: '38%',
      width: '15%',
      height: '14%',
      z: 2,
      anchor: 'center',
      scale: 1,
    }));
  }

  return items;
}

function buildRentalLayout(sceneId, ownedItemCount) {
  const items = [
    createItem({
      id: 'rental-bed',
      kind: 'bed',
      label: 'Bed',
      assetId: 'rental-bed-basic',
      x: '17%',
      y: '86%',
      width: '23%',
      height: '20%',
      z: 3,
      scale: 1.04,
      shadow: shadow('17%', '89%', '20%', '5.5%', 0.24),
    }),
    createItem({
      id: 'rental-desk',
      kind: 'desk',
      label: 'Desk',
      assetId: 'rental-desk-basic',
      x: '62%',
      y: '84%',
      width: '20%',
      height: '17%',
      z: 3,
      scale: 1.02,
      shadow: shadow('62%', '87%', '17%', '4.5%', 0.21),
    }),
    createItem({
      id: 'rental-lamp',
      kind: 'lamp',
      label: 'Lamp',
      assetId: 'rental-lamp-basic',
      x: '62%',
      y: '66%',
      width: '7%',
      height: '14%',
      z: 5,
      scale: 1,
    }),
  ];

  if (sceneId === 'upgraded-rental' || ownedItemCount >= 1) {
    items.push(createItem({
      id: 'rental-plant',
      kind: 'plant',
      label: 'Plant',
      assetId: 'rental-plant-basic',
      x: '43%',
      y: '84%',
      width: '9%',
      height: '16%',
      z: 3,
      scale: 0.92,
      shadow: shadow('43%', '88%', '8%', '4%', 0.18),
    }));
  }

  if (sceneId === 'upgraded-rental') {
    items.push(createItem({
      id: 'rental-wall-art',
      kind: 'art',
      label: 'Wall Art',
      assetId: 'rental-wall-art-basic',
      x: '24%',
      y: '31%',
      width: '13%',
      height: '12%',
      z: 2,
      anchor: 'center',
      scale: 1,
    }));
  }

  return items;
}

function buildEstateLayout(sceneId, ownedItemCount) {
  const items = [
    createItem({
      id: 'estate-sofa',
      kind: 'sofa',
      label: 'Sofa',
      assetId: 'estate-sofa-basic',
      x: '27%',
      y: '82%',
      width: '30%',
      height: '22%',
      z: 3,
      scale: 1.02,
      shadow: shadow('27%', '86%', '25%', '6%', 0.24),
    }),
    createItem({
      id: 'estate-table',
      kind: 'table',
      label: 'Table',
      assetId: 'estate-table-basic',
      x: '51%',
      y: '84%',
      width: '12%',
      height: '12%',
      z: 4,
      scale: 0.98,
      shadow: shadow('51%', '88%', '12%', '4.5%', 0.18),
    }),
    createItem({
      id: 'estate-palm',
      kind: 'plant',
      label: 'Palm',
      assetId: 'estate-palm-basic',
      x: '82%',
      y: '79%',
      width: '14%',
      height: '25%',
      z: 3,
      scale: 1,
      shadow: shadow('82%', '84%', '12%', '5%', 0.2),
    }),
  ];

  if (sceneId === 'estate-study') {
    items.push(createItem({
      id: 'estate-private-desk',
      kind: 'desk',
      label: 'Private Desk',
      assetId: 'estate-private-desk',
      x: '70%',
      y: '82%',
      width: '23%',
      height: '18%',
      z: 3,
      scale: 1.02,
      shadow: shadow('70%', '86%', '18%', '5%', 0.22),
    }));
  }

  if (sceneId === 'estate-lounge') {
    items.push(createItem({
      id: 'estate-lounge-art',
      kind: 'art',
      label: 'Lounge Art',
      assetId: 'estate-lounge-art',
      x: '72%',
      y: '31%',
      width: '18%',
      height: '14%',
      z: 2,
      anchor: 'center',
    }));
  }

  if (sceneId === 'estate-game-room') {
    items.push(createItem({
      id: 'estate-console',
      kind: 'console',
      label: 'Game Rig',
      assetId: 'estate-game-console',
      x: '73%',
      y: '83%',
      width: '18%',
      height: '16%',
      z: 3,
      scale: 1,
      shadow: shadow('73%', '87%', '16%', '4.5%', 0.2),
    }));
  }

  if (ownedItemCount >= 3) {
    items.push(createItem({
      id: 'estate-display',
      kind: 'shelf',
      label: 'Display',
      assetId: 'estate-display-shelf',
      x: '13%',
      y: '68%',
      width: '12%',
      height: '24%',
      z: 3,
      scale: 1,
      shadow: shadow('13%', '73%', '11%', '4%', 0.2),
    }));
  }

  return items;
}

function createItem({
  id,
  kind,
  label,
  assetId,
  x,
  y,
  width,
  height,
  z = 3,
  anchor = 'center-bottom',
  scale = 1,
  shadow: shadowConfig = null,
}) {
  return {
    id,
    kind,
    label,
    assetId,
    placement: {
      x,
      y,
      width,
      height,
      z,
      anchor,
      scale,
    },
    shadow: shadowConfig,
  };
}

function shadow(x, y, width, height, opacity) {
  return { x, y, width, height, opacity };
}
