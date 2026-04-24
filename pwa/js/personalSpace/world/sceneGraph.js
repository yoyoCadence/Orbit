export const INTERACTION_NODE_TYPES = Object.freeze({
  EXIT: 'exit',
  VIEW: 'view',
  INSPECT: 'inspect',
  NPC: 'npc',
});

export const SCENE_ACTION_TYPES = Object.freeze({
  WALK_TO: 'walkTo',
  SWITCH_VIEW: 'switchView',
  CHANGE_SCENE: 'changeScene',
  OPEN_PANEL: 'openPanel',
  BACK_TO_SCENE: 'backToScene',
});

export const personalSpaceSceneGraph = {
  scenes: {
    'rough-room': {
      id: 'rough-room',
      label: '租屋處',
      category: 'home',
      family: 'rental',
      visualPack: 'rental-basic',
      nodes: ['rough-room-door', 'rough-room-desk'],
      anchors: ['rough-room-entry', 'rough-room-door-side', 'rough-room-desk-front'],
    },
    'upgraded-rental': {
      id: 'upgraded-rental',
      label: '升級租屋處',
      category: 'home',
      family: 'rental',
      visualPack: 'rental-upgraded',
      nodes: ['upgraded-rental-door'],
      anchors: ['upgraded-rental-entry', 'upgraded-rental-door-side'],
    },
    'office-corner': {
      id: 'office-corner',
      label: '公司一樓辦公角',
      category: 'work',
      family: 'office',
      visualPack: 'office-floor',
      nodes: ['office-corner-elevator', 'office-window', 'office-desk', 'office-companion'],
      anchors: ['office-entry', 'elevator-door', 'window-side', 'desk-front', 'companion-side'],
      views: ['office-window-view'],
    },
  },
  nodes: {
    'rough-room-door': {
      id: 'rough-room-door',
      sceneId: 'rough-room',
      type: INTERACTION_NODE_TYPES.EXIT,
      label: '前往公司',
      anchorId: 'rough-room-door-side',
      placement: { left: '82%', top: '46%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'rough-room-door-side' },
        { type: SCENE_ACTION_TYPES.CHANGE_SCENE, sceneId: 'office-corner', entryAnchorId: 'office-entry' },
      ],
    },
    'rough-room-desk': {
      id: 'rough-room-desk',
      sceneId: 'rough-room',
      type: INTERACTION_NODE_TYPES.INSPECT,
      label: '查看書桌',
      anchorId: 'rough-room-desk-front',
      placement: { left: '68%', top: '58%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'rough-room-desk-front' },
        { type: SCENE_ACTION_TYPES.OPEN_PANEL, panelId: 'desk-inspection' },
      ],
    },
    'upgraded-rental-door': {
      id: 'upgraded-rental-door',
      sceneId: 'upgraded-rental',
      type: INTERACTION_NODE_TYPES.EXIT,
      label: '前往公司',
      anchorId: 'upgraded-rental-door-side',
      placement: { left: '84%', top: '44%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'upgraded-rental-door-side' },
        { type: SCENE_ACTION_TYPES.CHANGE_SCENE, sceneId: 'office-corner', entryAnchorId: 'office-entry' },
      ],
    },
    'office-corner-elevator': {
      id: 'office-corner-elevator',
      sceneId: 'office-corner',
      type: INTERACTION_NODE_TYPES.EXIT,
      label: '回到住處',
      anchorId: 'elevator-door',
      placement: { left: '86%', top: '40%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'elevator-door' },
        { type: SCENE_ACTION_TYPES.CHANGE_SCENE, sceneId: 'upgraded-rental', entryAnchorId: 'upgraded-rental-entry' },
      ],
    },
    'office-window': {
      id: 'office-window',
      sceneId: 'office-corner',
      type: INTERACTION_NODE_TYPES.VIEW,
      label: '看窗外',
      anchorId: 'window-side',
      placement: { left: '66%', top: '24%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'window-side' },
        { type: SCENE_ACTION_TYPES.SWITCH_VIEW, viewId: 'office-window-view' },
      ],
    },
    'office-desk': {
      id: 'office-desk',
      sceneId: 'office-corner',
      type: INTERACTION_NODE_TYPES.INSPECT,
      label: '查看工位',
      anchorId: 'desk-front',
      placement: { left: '28%', top: '58%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'desk-front' },
        { type: SCENE_ACTION_TYPES.OPEN_PANEL, panelId: 'workstation-inspection' },
      ],
    },
    'office-companion': {
      id: 'office-companion',
      sceneId: 'office-corner',
      type: INTERACTION_NODE_TYPES.NPC,
      label: '夥伴互動',
      anchorId: 'companion-side',
      placement: { left: '48%', top: '48%' },
      actions: [
        { type: SCENE_ACTION_TYPES.WALK_TO, anchorId: 'companion-side' },
        { type: SCENE_ACTION_TYPES.OPEN_PANEL, panelId: 'companion-presence' },
      ],
    },
  },
  anchors: {
    'rough-room-entry': {
      id: 'rough-room-entry',
      sceneId: 'rough-room',
      position2d: { left: '18%', bottom: '10%' },
      future3d: { position: [0, 0, 1.2], rotation: [0, 0, 0] },
    },
    'rough-room-door-side': {
      id: 'rough-room-door-side',
      sceneId: 'rough-room',
      position2d: { left: '82%', bottom: '20%' },
      future3d: { position: [2.2, 0, -0.5], rotation: [0, -0.8, 0] },
    },
    'rough-room-desk-front': {
      id: 'rough-room-desk-front',
      sceneId: 'rough-room',
      position2d: { left: '68%', bottom: '16%' },
      future3d: { position: [1.2, 0, 0.4], rotation: [0, 0.2, 0] },
    },
    'upgraded-rental-entry': {
      id: 'upgraded-rental-entry',
      sceneId: 'upgraded-rental',
      position2d: { left: '18%', bottom: '10%' },
      future3d: { position: [0, 0, 1.2], rotation: [0, 0, 0] },
    },
    'upgraded-rental-door-side': {
      id: 'upgraded-rental-door-side',
      sceneId: 'upgraded-rental',
      position2d: { left: '84%', bottom: '20%' },
      future3d: { position: [2.2, 0, -0.5], rotation: [0, -0.8, 0] },
    },
    'office-entry': {
      id: 'office-entry',
      sceneId: 'office-corner',
      position2d: { left: '80%', bottom: '12%' },
      future3d: { position: [2.4, 0, 1.1], rotation: [0, -1.2, 0] },
    },
    'elevator-door': {
      id: 'elevator-door',
      sceneId: 'office-corner',
      position2d: { left: '86%', bottom: '18%' },
      future3d: { position: [2.8, 0, 0], rotation: [0, -1.57, 0] },
    },
    'window-side': {
      id: 'window-side',
      sceneId: 'office-corner',
      position2d: { left: '66%', bottom: '34%' },
      future3d: { position: [1.5, 0, -1.4], rotation: [0, 0, 0] },
    },
    'desk-front': {
      id: 'desk-front',
      sceneId: 'office-corner',
      position2d: { left: '28%', bottom: '18%' },
      future3d: { position: [-0.8, 0, 0.8], rotation: [0, 0.4, 0] },
    },
    'companion-side': {
      id: 'companion-side',
      sceneId: 'office-corner',
      position2d: { left: '48%', bottom: '22%' },
      future3d: { position: [0.2, 0, 0.2], rotation: [0, 0, 0] },
    },
  },
  views: {
    'office-window-view': {
      id: 'office-window-view',
      sceneId: 'office-corner',
      label: '窗外風景',
      backgroundAssetId: 'office-window-skyline-default',
      foregroundSlotId: 'window-view-portrait',
      cameraPreset: {
        mode: 'look-at',
        targetAnchorId: 'window-side',
        future3d: {
          position: [1.5, 1.5, -2.5],
          lookAt: [1.5, 1.2, -4],
        },
      },
      exitAction: { type: SCENE_ACTION_TYPES.BACK_TO_SCENE, sceneId: 'office-corner' },
    },
  },
  assetSlots: {
    'window-view-portrait': {
      id: 'window-view-portrait',
      label: '窗外立繪',
      accepts: ['image'],
      defaultAssetId: 'office-window-portrait-default',
    },
  },
};

export function getSceneGraph() {
  return personalSpaceSceneGraph;
}

export function getSceneDescriptor(sceneId) {
  return personalSpaceSceneGraph.scenes[sceneId] || null;
}

export function getSceneInteractionNodes(sceneId) {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return [];

  return scene.nodes
    .map(nodeId => personalSpaceSceneGraph.nodes[nodeId])
    .filter(Boolean);
}

export function getSceneAnchors(sceneId) {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return [];

  return scene.anchors
    .map(anchorId => personalSpaceSceneGraph.anchors[anchorId])
    .filter(Boolean);
}

export function getSceneViews(sceneId) {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return [];

  return (scene.views || [])
    .map(viewId => personalSpaceSceneGraph.views[viewId])
    .filter(Boolean);
}

export function getInteractionNode(nodeId) {
  return personalSpaceSceneGraph.nodes[nodeId] || null;
}

export function getSceneView(viewId) {
  return personalSpaceSceneGraph.views[viewId] || null;
}

export function getAssetSlot(slotId) {
  return personalSpaceSceneGraph.assetSlots[slotId] || null;
}
