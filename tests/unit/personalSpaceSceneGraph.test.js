/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getVisualAsset } from '../../pwa/js/personalSpace/assetRegistry.js';
import {
  createInteractionBus,
  PERSONAL_SPACE_ACTION_REQUESTED_EVENT,
  PERSONAL_SPACE_NODE_SELECTED_EVENT,
} from '../../pwa/js/personalSpace/interactionBus.js';
import { createSceneRuntime } from '../../pwa/js/personalSpace/sceneRuntime.js';
import {
  getAssetSlot,
  getSceneInteractionNodes,
  getSceneView,
  getSceneViews,
  INTERACTION_NODE_TYPES,
  SCENE_ACTION_TYPES,
} from '../../pwa/js/personalSpace/world/sceneGraph.js';

describe('personal space scene graph', () => {
  it('defines exit and view interaction nodes for early personal space scenes', () => {
    const rentalNodes = getSceneInteractionNodes('rough-room');
    const officeNodes = getSceneInteractionNodes('office-corner');

    expect(rentalNodes.find(node => node.id === 'rough-room-door')).toMatchObject({
      type: INTERACTION_NODE_TYPES.EXIT,
      anchorId: 'rough-room-door-side',
    });
    expect(officeNodes.find(node => node.id === 'office-corner-elevator')).toMatchObject({
      type: INTERACTION_NODE_TYPES.EXIT,
      anchorId: 'elevator-door',
    });
    expect(officeNodes.find(node => node.id === 'office-window')).toMatchObject({
      type: INTERACTION_NODE_TYPES.VIEW,
      anchorId: 'window-side',
    });
    expect(officeNodes.find(node => node.id === 'office-companion')).toMatchObject({
      type: INTERACTION_NODE_TYPES.NPC,
      anchorId: 'companion-side',
    });
  });

  it('keeps window views connected to replaceable assets and future camera metadata', () => {
    const [windowView] = getSceneViews('office-corner');
    const backgroundAsset = getVisualAsset(windowView.backgroundAssetId);

    expect(windowView).toEqual(getSceneView('office-window-view'));
    expect(windowView.backgroundAssetId).toBe('office-window-skyline-default');
    expect(windowView.foregroundSlotId).toBe('window-view-portrait');
    expect(windowView.cameraPreset.future3d.position).toEqual([1.5, 1.5, -2.5]);
    expect(backgroundAsset?.type).toBe('background');
    expect(backgroundAsset?.path).toContain('assets/personal-space/window/office-window-bg-day.png');
    expect(getAssetSlot(windowView.foregroundSlotId)?.defaultAssetId).toBe('office-window-portrait-default');
    expect(getVisualAsset('office-corner-desk')?.path).toContain('assets/personal-space/props/office-corner-desk.png');
  });

  it('emits node and action events from runtime-rendered interaction nodes', () => {
    const container = document.createElement('div');
    const interactionBus = createInteractionBus();
    const selectedNodes = [];
    const requestedActions = [];
    interactionBus.on(PERSONAL_SPACE_NODE_SELECTED_EVENT, payload => selectedNodes.push(payload));
    interactionBus.on(PERSONAL_SPACE_ACTION_REQUESTED_EVENT, payload => requestedActions.push(payload));

    const runtime = createSceneRuntime(container, {
      sceneId: 'office-corner',
      sceneRole: 'work',
      interactionBus,
    });

    runtime.mount();
    container.querySelector('[data-scene-node-id="office-window"]')?.click();

    expect(container.querySelector('[data-scene-view-id="office-window-view"]')).not.toBeNull();
    expect(selectedNodes[0].node.id).toBe('office-window');
    expect(requestedActions.map(payload => payload.action.type)).toEqual([
      SCENE_ACTION_TYPES.WALK_TO,
      SCENE_ACTION_TYPES.SWITCH_VIEW,
    ]);
    expect(requestedActions[1].action.viewId).toBe('office-window-view');

    container.querySelector('[data-scene-view-back="office-window-view"]')?.click();

    expect(container.querySelector('[data-scene-view-id="office-window-view"]')).toBeNull();
    expect(container.querySelector('[data-scene-node-id="office-window"]')).not.toBeNull();
    expect(requestedActions.at(-1).action.type).toBe(SCENE_ACTION_TYPES.BACK_TO_SCENE);

    runtime.destroy();
  });
});
