import {
  PERSONAL_SPACE_ACTION_REQUESTED_EVENT,
  PERSONAL_SPACE_NODE_SELECTED_EVENT,
} from './interactionBus.js';
import { getVisualAsset } from './assetRegistry.js';
import { getPlacedFurnitureForScene } from './furnitureState.js';
import { getSceneFurnitureLayout } from './world/furnitureLayout.js';
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
        style="${buildFurnitureStyle(item.placement)}"
        data-scene-item-id="${escapeHtml(item.id)}"
        aria-label="${escapeHtml(item.label)}"
      >
        ${item.shadow ? `<span class="space-scene-item-shadow" style="${buildShadowStyle(item.shadow)}" aria-hidden="true"></span>` : ''}
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
  const ownedItems = sceneModel.ownedItems || [];
  const placedItems = sceneModel.placedItems || [];
  const isMemoryScene = Boolean(sceneModel.isMemoryScene);
  const layoutItems = getSceneFurnitureLayout({ sceneId, sceneRole, ownedItemCount, level });

  return {
    sceneId,
    title: sceneLabel || sceneId,
    palette: paletteForScene(sceneId, sceneRole, stage),
    silhouette: silhouetteForScene(sceneId, sceneRole, stage),
    windowMood: windowMoodForScene(level, sceneRole),
    furniture: getPlacedFurnitureForScene({ sceneId, layoutItems, placedItems, ownedItems }).map(item => ({
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

function buildFurnitureStyle(placement = {}) {
  const {
    x = '50%',
    y = '84%',
    width = '20%',
    height = '18%',
    z = 3,
    anchor = 'center-bottom',
    scale = 1,
  } = placement;

  return [
    `left: ${x}`,
    `top: ${y}`,
    `width: ${width}`,
    `height: ${height}`,
    `z-index: ${z}`,
    `transform: ${buildFurnitureTransform(anchor, scale)}`,
  ].join('; ');
}

function buildFurnitureTransform(anchor, scale) {
  const anchorMap = {
    'center-bottom': '-50%, -100%',
    center: '-50%, -50%',
    'left-bottom': '0, -100%',
    'right-bottom': '-100%, -100%',
  };

  return `translate(${anchorMap[anchor] || anchorMap['center-bottom']}) scale(${scale})`;
}

function buildShadowStyle(shadow = {}) {
  return [
    `left: ${shadow.x || '50%'}`,
    `top: ${shadow.y || '88%'}`,
    `width: ${shadow.width || '14%'}`,
    `height: ${shadow.height || '4%'}`,
    `opacity: ${shadow.opacity ?? 0.2}`,
  ].join('; ');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
