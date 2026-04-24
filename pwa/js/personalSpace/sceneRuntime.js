import {
  PERSONAL_SPACE_ACTION_REQUESTED_EVENT,
  PERSONAL_SPACE_NODE_SELECTED_EVENT,
} from './interactionBus.js';
import { getVisualAsset } from './assetRegistry.js';
import { getAssetSlot, getSceneInteractionNodes, getSceneView, getSceneViews, SCENE_ACTION_TYPES } from './world/sceneGraph.js';

export function createSceneRuntime(container, sceneModel = {}) {
  let mounted = false;
  let handleSceneClick = null;
  let visualModel = null;

  return {
    mount() {
      if (!container || mounted) return;
      mounted = true;

      visualModel = buildSceneVisualModel(sceneModel);
      renderScene(container, visualModel);

      handleSceneClick = event => {
        const backButton = event.target.closest('[data-scene-view-back]');
        if (backButton) {
          const view = getSceneView(backButton.dataset.sceneViewBack);
          if (!view) return;

          emitActionRequested(sceneModel.interactionBus, visualModel.sceneId, view.id, view.exitAction, 0);
          renderScene(container, visualModel);
          return;
        }

        const nodeButton = event.target.closest('[data-scene-node-id]');
        if (!nodeButton) return;

        const node = visualModel.interactionNodes.find(item => item.id === nodeButton.dataset.sceneNodeId);
        if (!node) return;

        emitInteractionNodeSelected(sceneModel.interactionBus, visualModel.sceneId, node);

        const switchViewAction = (node.actions || []).find(action => action.type === SCENE_ACTION_TYPES.SWITCH_VIEW);
        const view = switchViewAction?.viewId ? getSceneView(switchViewAction.viewId) : null;
        if (view) renderSceneView(container, visualModel, view);
      };
      container.addEventListener('click', handleSceneClick);
    },
    destroy() {
      if (!container || !mounted) return;
      if (handleSceneClick) {
        container.removeEventListener('click', handleSceneClick);
        handleSceneClick = null;
      }
      mounted = false;
      visualModel = null;
      container.innerHTML = '';
    },
  };
}

function renderScene(container, visualModel) {
  const furnitureMarkup = visualModel.furniture
    .map(item => `
      <div
        class="space-scene-item space-scene-item--${item.kind}${item.asset?.path ? ' space-scene-item--with-asset' : ''}"
        style="${item.style}"
        aria-label="${escapeHtml(item.label)}"
      >
        ${item.asset?.path ? `<img class="space-scene-item-image" src="${escapeHtml(item.asset.path)}" alt="" aria-hidden="true" />` : `<span>${escapeHtml(item.label)}</span>`}
      </div>
    `)
    .join('');
  const workerMarkup = visualModel.workerSilhouettes
    .map(worker => `<div class="space-scene-worker" style="${worker}"></div>`)
    .join('');
  const interactionMarkup = visualModel.interactionNodes
    .map(node => `
      <button
        class="space-scene-node space-scene-node--${escapeHtml(node.type)}"
        type="button"
        data-scene-node-id="${escapeHtml(node.id)}"
        style="${buildPlacementStyle(node.placement)}"
        aria-label="${escapeHtml(node.label)}"
      >
        <span>${escapeHtml(node.label)}</span>
      </button>
    `)
    .join('');

  container.innerHTML = `
    <div class="space-scene-placeholder space-scene-placeholder--${visualModel.palette}" data-scene-id="${visualModel.sceneId}">
      <div class="space-scene-grid"></div>
      <div class="space-scene-visual">
        <div class="space-scene-backdrop">
          <div class="space-scene-window space-scene-window--${visualModel.windowMood}"></div>
          <div class="space-scene-floor"></div>
          <div class="space-scene-silhouette space-scene-silhouette--${visualModel.silhouette}"></div>
          ${workerMarkup}
          ${furnitureMarkup}
          ${interactionMarkup}
        </div>
      </div>
    </div>
  `;
}

function renderSceneView(container, visualModel, view) {
  const backgroundAsset = getVisualAsset(view.backgroundAssetId);
  const foregroundSlot = getAssetSlot(view.foregroundSlotId);
  const foregroundAsset = foregroundSlot ? getVisualAsset(foregroundSlot.defaultAssetId) : null;
  const skylineStyle = backgroundAsset?.path ? ` style="background-image: linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(0,0,0,0.42)), url('${escapeHtml(backgroundAsset.path)}');"` : '';
  const portraitMarkup = foregroundAsset?.path
    ? `<img class="space-scene-view-portrait-image" src="${escapeHtml(foregroundAsset.path)}" alt="" aria-hidden="true" />`
    : `<span>${escapeHtml(foregroundAsset?.label || 'Portrait Slot')}</span>`;

  container.innerHTML = `
    <div class="space-scene-placeholder space-scene-placeholder--${visualModel.palette}" data-scene-id="${visualModel.sceneId}">
      <div class="space-scene-view" data-scene-view-id="${escapeHtml(view.id)}">
        <div class="space-scene-view-skyline" aria-hidden="true"${skylineStyle}></div>
        <div class="space-scene-view-glass" aria-hidden="true"></div>
        <div class="space-scene-view-portrait" aria-label="${escapeHtml(foregroundAsset?.label || foregroundSlot?.label || 'Window view portrait')}">
          ${portraitMarkup}
        </div>
        <div class="space-scene-view-caption">
          <span>${escapeHtml(backgroundAsset?.label || view.label)}</span>
          <strong>${escapeHtml(view.label)}</strong>
        </div>
        <button
          class="space-scene-view-back"
          type="button"
          data-scene-view-back="${escapeHtml(view.id)}"
        >
          返回場景
        </button>
      </div>
    </div>
  `;
}

function buildSceneVisualModel(sceneModel) {
  const level = sceneModel.level || 1;
  const stage = sceneModel.stage || 'survival';
  const sceneId = sceneModel.sceneId || defaultSceneId(stage);
  const sceneRole = sceneModel.sceneRole || 'home';
  const sceneLabel = sceneModel.sceneLabel || sceneId;
  const ownedItemCount = sceneModel.ownedItemCount || 0;
  const isMemoryScene = Boolean(sceneModel.isMemoryScene);

  return {
    sceneId,
    title: sceneLabel || sceneId,
    palette: paletteForScene(sceneId, sceneRole, stage),
    silhouette: silhouetteForScene(sceneId, sceneRole, stage),
    windowMood: windowMoodForScene(level, sceneRole),
    furniture: buildFurnitureLayout({ sceneId, sceneRole, ownedItemCount, level }).map(item => ({
      ...item,
      asset: item.assetId ? getVisualAsset(item.assetId) : null,
    })),
    workerSilhouettes: buildWorkerSilhouettes({ sceneRole, isMemoryScene }),
    interactionNodes: getSceneInteractionNodes(sceneId),
    views: getSceneViews(sceneId),
  };
}

function emitInteractionNodeSelected(interactionBus, sceneId, node) {
  if (!interactionBus) return;

  interactionBus.emit(PERSONAL_SPACE_NODE_SELECTED_EVENT, {
    sceneId,
    node,
  });

  (node.actions || []).forEach((action, index) => {
    emitActionRequested(interactionBus, sceneId, node.id, action, index);
  });
}

function emitActionRequested(interactionBus, sceneId, sourceId, action, actionIndex) {
  if (!interactionBus || !action) return;

  interactionBus.emit(PERSONAL_SPACE_ACTION_REQUESTED_EVENT, {
    sceneId,
    nodeId: sourceId,
    action,
    actionIndex,
  });
}

function buildPlacementStyle(placement = {}) {
  const left = placement.left || '50%';
  const top = placement.top || '50%';

  return `left: ${left}; top: ${top};`;
}

function buildFurnitureLayout({ sceneId, sceneRole, ownedItemCount, level }) {
  if (sceneRole === 'work') {
    return buildOfficeFurniture(sceneId, level);
  }

  if (sceneId.startsWith('estate-')) {
    return buildEstateFurniture(sceneId, ownedItemCount);
  }

  return buildRentalFurniture(sceneId, ownedItemCount);
}

function buildOfficeFurniture(sceneId, level) {
  const items = [
    { kind: 'desk', label: sceneId === 'office-corner' ? 'Corner Desk' : 'Desk', style: 'left: 14%; bottom: 10%; width: 42%; height: 18%;', assetId: 'office-corner-desk' },
    { kind: 'chair', label: 'Chair', style: 'left: 24%; bottom: 2%; width: 18%; height: 12%;', assetId: 'office-chair-basic' },
    { kind: 'monitor', label: level >= 15 ? 'Dual Screen' : 'Screen', style: 'left: 24%; bottom: 30%; width: 20%; height: 11%;', assetId: level >= 15 ? 'office-monitor-dual' : 'office-monitor-single' },
    { kind: 'shelf', label: 'Shelf', style: 'right: 8%; bottom: 12%; width: 16%; height: 34%;', assetId: 'office-shelf-basic' },
  ];

  if (sceneId === 'small-office' || sceneId === 'mid-office' || sceneId === 'manager-room' || sceneId === 'large-office-suite') {
    items.push({ kind: 'plant', label: 'Plant', style: 'right: 28%; bottom: 10%; width: 12%; height: 18%;', assetId: 'office-plant-basic' });
  }

  if (sceneId === 'mid-office' || sceneId === 'manager-room' || sceneId === 'large-office-suite') {
    items.push({ kind: 'art', label: 'Board', style: 'right: 26%; top: 18%; width: 20%; height: 12%;', assetId: 'office-board-basic' });
  }

  return items;
}

function buildRentalFurniture(sceneId, ownedItemCount) {
  const items = [
    { kind: 'bed', label: 'Bed', style: 'left: 8%; bottom: 8%; width: 36%; height: 18%;', assetId: 'rental-bed-basic' },
    { kind: 'desk', label: 'Desk', style: 'right: 10%; bottom: 9%; width: 26%; height: 16%;', assetId: 'rental-desk-basic' },
    { kind: 'lamp', label: 'Lamp', style: 'right: 18%; bottom: 26%; width: 10%; height: 12%;', assetId: 'rental-lamp-basic' },
  ];

  if (sceneId === 'upgraded-rental' || ownedItemCount >= 1) {
    items.push({ kind: 'plant', label: 'Plant', style: 'left: 48%; bottom: 9%; width: 11%; height: 17%;', assetId: 'rental-plant-basic' });
  }

  if (sceneId === 'upgraded-rental') {
    items.push({ kind: 'art', label: 'Wall Art', style: 'left: 18%; top: 18%; width: 16%; height: 12%;', assetId: 'rental-wall-art-basic' });
  }

  return items;
}

function buildEstateFurniture(sceneId, ownedItemCount) {
  const items = [
    { kind: 'sofa', label: 'Sofa', style: 'left: 12%; bottom: 10%; width: 34%; height: 18%;', assetId: 'estate-sofa-basic' },
    { kind: 'table', label: 'Table', style: 'left: 48%; bottom: 10%; width: 18%; height: 13%;', assetId: 'estate-table-basic' },
    { kind: 'plant', label: 'Palm', style: 'right: 10%; bottom: 12%; width: 12%; height: 25%;', assetId: 'estate-palm-basic' },
  ];

  if (sceneId === 'estate-study') {
    items.push({ kind: 'desk', label: 'Private Desk', style: 'right: 12%; bottom: 10%; width: 28%; height: 16%;', assetId: 'estate-private-desk' });
  }

  if (sceneId === 'estate-lounge') {
    items.push({ kind: 'art', label: 'Lounge Art', style: 'right: 20%; top: 18%; width: 18%; height: 12%;', assetId: 'estate-lounge-art' });
  }

  if (sceneId === 'estate-game-room') {
    items.push({ kind: 'console', label: 'Game Rig', style: 'right: 12%; bottom: 10%; width: 28%; height: 15%;', assetId: 'estate-game-console' });
  }

  if (ownedItemCount >= 3) {
    items.push({ kind: 'shelf', label: 'Display', style: 'left: 8%; top: 18%; width: 14%; height: 28%;', assetId: 'estate-display-shelf' });
  }

  return items;
}

function buildWorkerSilhouettes({ sceneRole, isMemoryScene }) {
  if (sceneRole !== 'work' || !isMemoryScene) return [];

  return [
    'left: 62%; bottom: 22%; width: 6%; height: 22%;',
    'left: 72%; bottom: 20%; width: 5%; height: 18%;',
  ];
}

function paletteForScene(sceneId, sceneRole, stage) {
  if (sceneRole === 'work') return 'office';
  if (sceneId.startsWith('estate-')) return 'mastery';
  if (sceneId === 'upgraded-rental') return 'rental-upgraded';
  return stage === 'survival' ? 'survival' : 'building';
}

function silhouetteForScene(sceneId, sceneRole, stage) {
  if (sceneRole === 'work') return 'office';
  if (sceneId.startsWith('estate-')) return 'suite';
  return stage === 'survival' ? 'room' : 'room-upgraded';
}

function windowMoodForScene(level, sceneRole) {
  if (sceneRole === 'work') return level >= 40 ? 'skyline' : 'day';
  if (level >= 40) return 'sunrise';
  if (level >= 8) return 'day';
  return 'dusk';
}

function defaultSceneId(stage) {
  return {
    survival: 'rough-room',
    building: 'office-corner',
    mastery: 'estate-hall',
  }[stage] || 'rough-room';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
