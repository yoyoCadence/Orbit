export const IDLE_WINDOW_LAYOUT_KIND = Object.freeze({
  LAYERED_RASTER: 'layered_raster',
});

export const IDLE_WINDOW_OBJECT_MODEL = Object.freeze({
  SEPARATE_PROPS: 'separate_props',
});

const DEFAULT_LAYOUT_BY_STAGE = {
  survival: 'building-office-prototype',
  building: 'building-office-prototype',
  mastery: 'building-office-prototype',
};

const BACKGROUND_SET_BY_STAGE = {
  survival: {
    center: 'survival-rental-center',
    left: 'survival-rental-left',
    right: 'survival-rental-right',
  },
  building: {
    center: 'office-angle-center-v2',
    left: 'office-angle-left-v2',
    right: 'office-angle-right-v2',
  },
  mastery: {
    center: 'mastery-estate-center',
    left: 'mastery-estate-left',
    right: 'mastery-estate-right',
  },
};

export const idleWindowLayouts = {
  'building-office-prototype': {
    id: 'building-office-prototype',
    label: 'Building Office Idle Window Prototype',
    stage: 'building',
    visualModel: IDLE_WINDOW_LAYOUT_KIND.LAYERED_RASTER,
    runtimeObjectModel: IDLE_WINDOW_OBJECT_MODEL.SEPARATE_PROPS,
    engineTarget: 'project-native',
    backgroundAssetId: 'office-angle-center-v2',
    coordinateSystem: {
      units: 'percent',
      origin: 'top-left',
      sort: 'z-index-then-y',
      designSize: { width: 1672, height: 941 },
    },
    defaultCameraProfileId: 'center',
    cameraProfiles: [
      cameraProfile({
        id: 'left',
        label: 'Left angle',
        rotateY: -5,
        backgroundShiftX: -0.8,
        itemSkew: -0.7,
        backgroundAssetId: 'office-angle-left-v2',
        preferredVariants: {
          'corner-desk': 'left-wall-flush',
          'pattern-rug': 'left-wall-flush',
          'leather-sofa': 'left-wall-flush',
          'low-coffee-table': 'left-wall-flush',
          'office-shelf': 'left-wall-flush',
          'trophy-display': 'left-wall-flush',
        },
      }),
      cameraProfile({
        id: 'center',
        label: 'Center angle',
        rotateY: 0,
        backgroundShiftX: 0,
        itemSkew: 0,
        backgroundAssetId: 'office-angle-center-v2',
        preferredVariants: {
          'corner-desk': 'front',
          'pattern-rug': 'front',
          'leather-sofa': 'front',
          'low-coffee-table': 'front',
          'office-shelf': 'front',
          'trophy-display': 'front',
        },
      }),
      cameraProfile({
        id: 'right',
        label: 'Right angle',
        rotateY: 5,
        backgroundShiftX: 0.8,
        itemSkew: 0.7,
        backgroundAssetId: 'office-angle-right-v2',
        preferredVariants: {
          'corner-desk': 'right-wall-flush',
          'pattern-rug': 'right-wall-flush',
          'leather-sofa': 'right-wall-flush',
          'low-coffee-table': 'right-wall-flush',
          'office-shelf': 'right-wall-flush',
          'trophy-display': 'right-wall-flush',
        },
      }),
    ],
    placementPlanes: [
      plane({
        id: 'wall-main',
        label: 'Wall',
        kind: 'wall',
        bounds: { minX: 20, maxX: 74, minY: 25, maxY: 54 },
      }),
      plane({
        id: 'floor-main',
        label: 'Floor',
        kind: 'floor',
        bounds: { minX: 18, maxX: 88, minY: 62, maxY: 91 },
      }),
      plane({
        id: 'desktop-main',
        label: 'Desktop',
        kind: 'surface',
        bounds: { minX: 29, maxX: 52, minY: 62, maxY: 76 },
      }),
    ],
    layers: [
      {
        id: 'background',
        type: 'background',
        z: 0,
        assetId: 'office-angle-center-v2',
      },
      {
        id: 'wall-props',
        type: 'props',
        z: 10,
        items: [
          {
            id: 'planning-board',
            propAssetId: 'office-board',
            placement: place({ x: 39, y: 43, width: 17, z: 10, anchor: 'center' }),
            placementPlaneId: 'wall-main',
            footprint: footprint({ width: 18, depth: 3, height: 14 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -8, rotationMax: 8 }),
            unlock: { minLevel: 10, meaning: 'planning discipline' },
          },
          {
            id: 'achievement-board',
            propAssetId: 'office-achievement-board',
            placement: place({ x: 62, y: 42, width: 16, z: 11, anchor: 'center' }),
            placementPlaneId: 'wall-main',
            footprint: footprint({ width: 16, depth: 3, height: 13 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -8, rotationMax: 8 }),
            unlock: { minLevel: 18, meaning: 'visible proof' },
          },
          {
            id: 'mountain-wall-art',
            propAssetId: 'office-mountain-wall-art',
            placement: place({ x: 25, y: 43, width: 13, z: 11, anchor: 'center' }),
            placementPlaneId: 'wall-main',
            footprint: footprint({ width: 13, depth: 3, height: 13 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -8, rotationMax: 8 }),
            unlock: { minLevel: 20, meaning: 'long view' },
          },
        ],
      },
      {
        id: 'floor-props',
        type: 'props',
        z: 20,
        items: [
          {
            id: 'pattern-rug',
            propAssetId: 'office-pattern-rug',
            placement: place({ x: 43, y: 91, width: 38, z: 19, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 38, depth: 16, height: 1 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -10, rotationMax: 10 }),
            unlock: { minLevel: 10, meaning: 'grounded routine' },
          },
          {
            id: 'corner-desk',
            propAssetId: 'office-corner-desk-v3',
            placement: place({ x: 42, y: 83, width: 33, z: 24, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 33, depth: 18, height: 20 }),
            characterAnchors: [
              characterAnchor({ id: 'desk-work', label: 'Work', offsetX: 12, offsetY: 5, width: 14, facing: 'front' }),
            ],
            supportSurfaces: [
              supportSurface({
                id: 'desktop',
                label: 'Desktop',
                kind: 'tabletop',
                bounds: { minX: -12, maxX: 10, minY: -19, maxY: -10 },
              }),
            ],
            editing: edit({ canChangeVariant: true }),
            unlock: { minLevel: 10, meaning: 'daily work anchor' },
          },
          {
            id: 'office-chair',
            propAssetId: 'office-chair',
            placement: place({ x: 38, y: 84, width: 9, z: 26, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 9, depth: 9, height: 15 }),
            editing: edit({ canRotate: true, rotationStep: 10, rotationMin: -20, rotationMax: 20 }),
            unlock: { minLevel: 10, meaning: 'focus posture' },
          },
          {
            id: 'single-monitor',
            propAssetId: 'office-monitor-single',
            placement: surfacePlace({ parentItemId: 'corner-desk', surfaceId: 'desktop', localX: 0.42, localY: 0.58, width: 10, z: 27, anchor: 'center-bottom' }),
            placementPlaneId: 'desktop-main',
            footprint: footprint({ width: 10, depth: 4, height: 12 }),
            editing: edit({ canRotate: true, canChangeVariant: true, rotationStep: 5, rotationMin: -12, rotationMax: 12 }),
            unlock: { minLevel: 10, meaning: 'work visibility' },
          },
          {
            id: 'office-shelf',
            propAssetId: 'office-shelf',
            placement: place({ x: 72, y: 78, width: 13, z: 22, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 13, depth: 8, height: 25 }),
            supportSurfaces: [
              supportSurface({
                id: 'top',
                label: 'Shelf top',
                kind: 'shelf',
                bounds: { minX: -5.8, maxX: 5.8, minY: -24, maxY: -20 },
              }),
              supportSurface({
                id: 'middle',
                label: 'Middle shelf',
                kind: 'shelf',
                bounds: { minX: -5.4, maxX: 5.4, minY: -16, maxY: -11 },
              }),
            ],
            editing: edit({ canChangeVariant: true }),
            unlock: { minLevel: 12, meaning: 'knowledge accumulation' },
          },
          {
            id: 'office-plant',
            propAssetId: 'office-plant',
            placement: place({ x: 82, y: 84, width: 10, z: 23, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 10, depth: 8, height: 18 }),
            editing: edit({ canRotate: true, rotationStep: 15, rotationMin: -30, rotationMax: 30, allowedSurfaceKinds: ['floor', 'shelf'] }),
            unlock: { minLevel: 12, meaning: 'environment care' },
          },
          {
            id: 'desk-lamp',
            propAssetId: 'office-desk-lamp',
            placement: surfacePlace({ parentItemId: 'corner-desk', surfaceId: 'desktop', localX: 0.1, localY: 0.4, width: 7, z: 29, anchor: 'center-bottom' }),
            placementPlaneId: 'desktop-main',
            footprint: footprint({ width: 7, depth: 5, height: 14 }),
            editing: edit({ canRotate: true, canChangeVariant: true, rotationStep: 10, rotationMin: -30, rotationMax: 30, allowedSurfaceKinds: ['tabletop', 'shelf'] }),
            unlock: { minLevel: 15, meaning: 'late-night craft' },
          },
          {
            id: 'coffee-cup',
            propAssetId: 'office-coffee-cup',
            placement: surfacePlace({ parentItemId: 'corner-desk', surfaceId: 'desktop', localX: 0.86, localY: 0.42, width: 5, z: 30, anchor: 'center-bottom' }),
            placementPlaneId: 'desktop-main',
            footprint: footprint({ width: 5, depth: 4, height: 5 }),
            editing: edit({ canRotate: true, canChangeVariant: true, rotationStep: 15, rotationMin: -45, rotationMax: 45, allowedSurfaceKinds: ['tabletop', 'shelf'] }),
            unlock: { minLevel: 15, meaning: 'sustained effort' },
          },
          {
            id: 'leather-sofa',
            propAssetId: 'office-leather-sofa',
            placement: place({ x: 24, y: 84, width: 22, z: 23, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 22, depth: 11, height: 14 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -10, rotationMax: 10 }),
            unlock: { minLevel: 18, meaning: 'recovery space' },
          },
          {
            id: 'low-coffee-table',
            propAssetId: 'office-low-coffee-table',
            placement: place({ x: 29, y: 88, width: 15, z: 28, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 15, depth: 8, height: 6 }),
            supportSurfaces: [
              supportSurface({
                id: 'tabletop',
                label: 'Coffee table top',
                kind: 'tabletop',
                bounds: { minX: -6, maxX: 6, minY: -11, maxY: -7 },
              }),
            ],
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -10, rotationMax: 10 }),
            unlock: { minLevel: 18, meaning: 'reflection pause' },
          },
          {
            id: 'trophy-display',
            propAssetId: 'office-trophy-display',
            placement: place({ x: 78, y: 80, width: 14, z: 24, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 14, depth: 8, height: 23 }),
            supportSurfaces: [
              supportSurface({
                id: 'display-shelf',
                label: 'Display shelf',
                kind: 'shelf',
                bounds: { minX: -5.5, maxX: 5.5, minY: -18, maxY: -11 },
              }),
            ],
            editing: edit({ canChangeVariant: false }),
            unlock: { minLevel: 20, meaning: 'earned evidence' },
          },
          {
            id: 'floor-lamp',
            propAssetId: 'office-floor-lamp',
            placement: place({ x: 18, y: 82, width: 7, z: 23, anchor: 'center-bottom' }),
            placementPlaneId: 'floor-main',
            footprint: footprint({ width: 7, depth: 5, height: 24 }),
            editing: edit({ canRotate: true, rotationStep: 5, rotationMin: -10, rotationMax: 10 }),
            unlock: { minLevel: 20, meaning: 'calm focus' },
          },
          {
            id: 'open-notebook',
            propAssetId: 'office-open-notebook',
            placement: surfacePlace({ parentItemId: 'corner-desk', surfaceId: 'desktop', localX: 0.28, localY: 0.72, width: 6, z: 31, anchor: 'center-bottom' }),
            placementPlaneId: 'desktop-main',
            footprint: footprint({ width: 6, depth: 4, height: 2 }),
            editing: edit({ canRotate: true, rotationStep: 10, rotationMin: -30, rotationMax: 30, allowedSurfaceKinds: ['tabletop', 'shelf'] }),
            unlock: { minLevel: 18, meaning: 'reflection notes' },
          },
          {
            id: 'tiny-trophy',
            propAssetId: 'office-tiny-trophy',
            placement: surfacePlace({ parentItemId: 'office-shelf', surfaceId: 'top', localX: 0.65, localY: 0.55, width: 4, z: 31, anchor: 'center-bottom' }),
            placementPlaneId: 'desktop-main',
            footprint: footprint({ width: 4, depth: 3, height: 6 }),
            editing: edit({ canRotate: true, rotationStep: 10, rotationMin: -20, rotationMax: 20, allowedSurfaceKinds: ['tabletop', 'shelf'] }),
            unlock: { minLevel: 20, meaning: 'small wins' },
          },
        ],
      },
      {
        id: 'character',
        type: 'character',
        z: 40,
        characterAssetId: 'building-protagonist-idle',
        placement: place({ x: 54, y: 88, width: 14, z: 40, anchor: 'center-bottom' }),
        anchorTarget: { itemId: 'corner-desk', anchorId: 'desk-work' },
        defaultAnimation: 'idle',
      },
      {
        id: 'effects',
        type: 'effects',
        z: 50,
        items: [],
      },
    ],
  },
};

export function getIdleWindowLayout(layoutId) {
  return idleWindowLayouts[layoutId] || null;
}

export function getDefaultIdleWindowLayoutForStage(stage) {
  const layout = getIdleWindowLayout(DEFAULT_LAYOUT_BY_STAGE[stage] || DEFAULT_LAYOUT_BY_STAGE.building);
  return applyIdleWindowStageBackgroundSet(layout, stage);
}

export function applyIdleWindowStageBackgroundSet(layout, stage) {
  const backgroundSet = BACKGROUND_SET_BY_STAGE[stage];
  if (!layout || !backgroundSet) return layout;

  return {
    ...layout,
    stage,
    backgroundAssetId: backgroundSet.center,
    cameraProfiles: (layout.cameraProfiles || []).map(profile => ({
      ...profile,
      backgroundAssetId: backgroundSet[profile.id] || profile.backgroundAssetId,
    })),
    layers: layout.layers.map(layer => layer.type === 'background'
      ? { ...layer, assetId: backgroundSet.center }
      : layer),
  };
}

export function getIdleWindowLayoutAssetIds(layout) {
  if (!layout) {
    return {
      backgrounds: [],
      props: [],
      characters: [],
    };
  }

  const assetIds = {
    backgrounds: new Set((layout.cameraProfiles || []).map(profile => profile.backgroundAssetId).filter(Boolean)),
    props: new Set(),
    characters: new Set(),
  };

  layout.layers.forEach(layer => {
    if (layer.type === 'background' && layer.assetId) assetIds.backgrounds.add(layer.assetId);
    if (layer.type === 'character' && layer.characterAssetId) assetIds.characters.add(layer.characterAssetId);
    if (layer.type === 'props') {
      layer.items.forEach(item => {
        if (item.propAssetId) assetIds.props.add(item.propAssetId);
      });
    }
  });

  return {
    backgrounds: [...assetIds.backgrounds],
    props: [...assetIds.props],
    characters: [...assetIds.characters],
  };
}

function place({ x, y, width, z, anchor }) {
  return {
    x,
    y,
    width,
    z,
    anchor,
  };
}

function surfacePlace({ parentItemId, surfaceId, localX, localY, width, z, anchor }) {
  return {
    parentItemId,
    surfaceId,
    localX,
    localY,
    width,
    z,
    anchor,
  };
}

function cameraProfile({ id, label, rotateY, backgroundShiftX, itemSkew, backgroundAssetId, preferredVariants }) {
  return {
    id,
    label,
    rotateY,
    backgroundShiftX,
    itemSkew,
    backgroundAssetId,
    preferredVariants: preferredVariants || {},
  };
}

function plane({ id, label, kind, bounds }) {
  return {
    id,
    label,
    kind,
    bounds,
  };
}

function footprint({ width, depth, height }) {
  return {
    width,
    depth,
    height,
    units: 'percent',
  };
}

function supportSurface({ id, label, kind, bounds }) {
  return {
    id,
    label,
    kind,
    bounds,
  };
}

function characterAnchor({ id, label, offsetX, offsetY, width, facing }) {
  return {
    id,
    label,
    offsetX,
    offsetY,
    width,
    facing,
  };
}

function edit({
  canRotate = false,
  canChangeVariant = false,
  rotationStep = 15,
  rotationMin = 0,
  rotationMax = 0,
  allowedSurfaceKinds = [],
} = {}) {
  return {
    canRotate,
    canChangeVariant,
    rotationStep,
    rotationMin,
    rotationMax,
    allowedSurfaceKinds,
  };
}
