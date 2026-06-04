import { getLevelInfo } from '../../leveling.js';
import { getCurrentSpaceStage } from '../unlockRules.js';
import {
  getIdleWindowBackground,
  getIdleWindowCharacter,
  getIdleWindowProp,
} from './assetRegistry.js';
import {
  getDefaultIdleWindowLayoutForStage,
  getIdleWindowLayoutAssetIds,
} from './layouts.js';

export function buildIdleWindowViewModel(user, personalSpaceState = {}) {
  const xpInfo = getLevelInfo(user?.totalXP || 0);
  const stage = getCurrentSpaceStage(xpInfo.level);
  const baseLayout = getDefaultIdleWindowLayoutForStage(stage);
  const layoutState = personalSpaceState.idleWindowLayouts?.[baseLayout?.id] || null;
  const layout = resolveIdleWindowSupportPlacements(
    applyIdleWindowPlacementOverrides(baseLayout, layoutState),
    layoutState
  );

  return {
    id: 'personal-space-idle-window',
    stage,
    level: xpInfo.level,
    xpInfo,
    layout,
    assets: resolveIdleWindowAssets(layout),
    layoutState,
    prototypeFallback: baseLayout?.stage !== stage,
  };
}

export function resolveIdleWindowAssets(layout) {
  const assetIds = getIdleWindowLayoutAssetIds(layout);

  return {
    backgrounds: assetIds.backgrounds.map(getIdleWindowBackground).filter(Boolean),
    props: assetIds.props.map(getIdleWindowProp).filter(Boolean),
    characters: assetIds.characters.map(getIdleWindowCharacter).filter(Boolean),
  };
}

export function applyIdleWindowPlacementOverrides(layout, layoutState) {
  if (!layout) return layout;
  const cameraProfileId = layoutState?.cameraProfileId || layout.defaultCameraProfileId || layout.cameraProfiles?.[0]?.id;
  const activeCameraProfile = layout.cameraProfiles?.find(profile => profile.id === cameraProfileId)
    || layout.cameraProfiles?.[0]
    || null;

  return {
    ...layout,
    activeCameraProfileId: activeCameraProfile?.id || null,
    activeCameraProfile,
    layers: layout.layers.map(layer => {
      if (layer.type === 'props') {
        return {
          ...layer,
          items: layer.items.map(item => applyPlacementOverride(
            applyCameraPreferredVariant(item, activeCameraProfile),
            layoutState?.placements?.[item.id]
          )),
        };
      }

      if (layer.type === 'character') {
        return applyPlacementOverride(layer, layoutState?.placements?.[layer.id]);
      }

      return layer;
    }),
  };
}

export function resolveIdleWindowSupportPlacements(layout) {
  if (!layout) return layout;

  const itemById = new Map();
  layout.layers.forEach(layer => {
    if (layer.type !== 'props') return;
    layer.items.forEach(item => itemById.set(item.id, item));
  });

  const resolvedLayout = {
    ...layout,
    layers: layout.layers.map(layer => {
      if (layer.type !== 'props') return layer;

      return {
        ...layer,
        items: layer.items.map(item => resolveSurfacePlacement(item, itemById)),
      };
    }),
  };

  const resolvedItemById = new Map();
  resolvedLayout.layers.forEach(layer => {
    if (layer.type !== 'props') return;
    layer.items.forEach(item => resolvedItemById.set(item.id, item));
  });

  return {
    ...resolvedLayout,
    layers: resolvedLayout.layers.map(layer => {
      if (layer.type !== 'character') return layer;
      return resolveCharacterAnchorPlacement(layer, resolvedItemById);
    }),
  };
}

function resolveSurfacePlacement(item, itemById) {
  const placement = item.placement || {};
  if (!placement.parentItemId || !placement.surfaceId) return item;

  const parentItem = itemById.get(placement.parentItemId);
  const parentPlacement = parentItem?.placement;
  const surface = parentItem?.supportSurfaces?.find(entry => entry.id === placement.surfaceId);
  if (!parentPlacement || !surface?.bounds) return item;

  const bounds = buildAbsoluteSurfaceBounds(parentPlacement, surface.bounds);
  const localX = clamp01(placement.localX ?? 0.5);
  const localY = clamp01(placement.localY ?? 0.5);

  return {
    ...item,
    placement: {
      ...placement,
      x: roundPercent(bounds.minX + (bounds.maxX - bounds.minX) * localX),
      y: roundPercent(bounds.minY + (bounds.maxY - bounds.minY) * localY),
      planeId: placement.planeId || item.placementPlaneId,
    },
    resolvedSupportSurface: {
      parentItemId: placement.parentItemId,
      surfaceId: placement.surfaceId,
      label: surface.label,
      kind: surface.kind,
      bounds,
    },
  };
}

function buildAbsoluteSurfaceBounds(parentPlacement, surfaceBounds) {
  return {
    minX: toNumber(parentPlacement.x) + surfaceBounds.minX,
    maxX: toNumber(parentPlacement.x) + surfaceBounds.maxX,
    minY: toNumber(parentPlacement.y) + surfaceBounds.minY,
    maxY: toNumber(parentPlacement.y) + surfaceBounds.maxY,
  };
}

function resolveCharacterAnchorPlacement(layer, itemById) {
  const target = layer.anchorTarget;
  if (!target?.itemId || !target?.anchorId) return layer;

  const parentItem = itemById.get(target.itemId);
  const parentPlacement = parentItem?.placement;
  const anchor = parentItem?.characterAnchors?.find(entry => entry.id === target.anchorId);
  if (!parentPlacement || !anchor) return layer;

  return {
    ...layer,
    placement: {
      ...layer.placement,
      x: roundPercent(toNumber(parentPlacement.x) + toNumber(anchor.offsetX)),
      y: roundPercent(toNumber(parentPlacement.y) + toNumber(anchor.offsetY)),
      width: anchor.width || layer.placement?.width,
    },
    resolvedCharacterAnchor: {
      itemId: target.itemId,
      anchorId: target.anchorId,
      label: anchor.label,
      facing: anchor.facing,
    },
  };
}

function toNumber(value) {
  return typeof value === 'number' ? value : Number.parseFloat(value) || 0;
}

function roundPercent(value) {
  return Number.parseFloat(value.toFixed(2));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function applyPlacementOverride(item, placementOverride) {
  if (!placementOverride) return item;

  return {
    ...item,
    placement: {
      ...item.placement,
      ...placementOverride,
    },
  };
}

function applyCameraPreferredVariant(item, activeCameraProfile) {
  const variantId = activeCameraProfile?.preferredVariants?.[item.id];
  if (!variantId) return item;

  return {
    ...item,
    placement: {
      ...item.placement,
      variantId: item.placement?.variantId || variantId,
    },
  };
}

export { renderIdleWindow } from './renderer.js';

export {
  getIdleWindowAsset,
  getIdleWindowBackground,
  getIdleWindowCharacter,
  getIdleWindowProp,
  idleWindowAssetRegistry,
} from './assetRegistry.js';

export {
  getDefaultIdleWindowLayoutForStage,
  getIdleWindowLayout,
  getIdleWindowLayoutAssetIds,
  idleWindowLayouts,
  IDLE_WINDOW_LAYOUT_KIND,
  IDLE_WINDOW_OBJECT_MODEL,
} from './layouts.js';

export {
  buildIdleWindowVariantGenerationQueue,
  getIdleWindowVariantReadiness,
  IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS,
  IDLE_WINDOW_VARIANT_REFERENCE_PLAN,
} from './variantReadiness.js';
