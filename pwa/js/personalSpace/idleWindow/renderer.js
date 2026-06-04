const STAGE_LABELS = {
  survival: 'Survival',
  building: 'Building',
  mastery: 'Mastery',
};

export function renderIdleWindow(model, options = {}) {
  if (!model?.layout) return '';

  const variant = options.variant || 'card';
  const isEditing = Boolean(options.isEditing);
  const cameraProfile = model.layout.activeCameraProfile || {};
  const background = resolveCameraBackground(model, cameraProfile);
  const progressItems = buildProgressItems(model, { variant });
  const propLayers = model.layout.layers
    .filter(layer => layer.type === 'props')
    .map(layer => renderPropLayer(layer, model, { isEditing }))
    .join('');
  const placementPlanes = renderPlacementPlanes(model.layout.placementPlanes || []);
  const characterLayer = model.layout.layers
    .filter(layer => layer.type === 'character')
    .map(layer => renderCharacterLayer(layer, model))
    .join('');
  const fallbackMarkup = model.prototypeFallback
    ? '<span class="space-idle-badge">Prototype visual</span>'
    : '';

  return `
    <div
      class="space-idle-window space-idle-window--${escapeHtml(variant)} ${isEditing ? 'is-editing' : ''}"
      data-idle-window
      data-idle-window-stage="${escapeHtml(model.stage)}"
      data-idle-layout-id="${escapeHtml(model.layout.id)}"
      data-idle-camera-profile-id="${escapeHtml(model.layout.activeCameraProfileId || '')}"
      data-idle-camera-profiles="${escapeHtml(encodeCameraProfiles(model.layout.cameraProfiles || []))}"
      data-idle-background-assets="${escapeHtml(encodeBackgroundAssets(model.assets.backgrounds || []))}"
      style="${buildCameraStyle(cameraProfile)}"
    >
      <div class="space-idle-window-frame" data-idle-window-frame>
        ${background?.path ? `<img class="space-idle-background" src="${escapeHtml(background.path)}" alt="" aria-hidden="true" draggable="false" />` : ''}
        <div class="space-idle-light" aria-hidden="true"></div>
        ${placementPlanes}
        ${propLayers}
        ${characterLayer}
      </div>
      <div class="space-idle-status">
        <div>
          <span>${escapeHtml(STAGE_LABELS[model.stage] || model.stage)} stage</span>
          <strong>Idle Growth Window</strong>
        </div>
        <div class="space-idle-level">
          <span>Lv.</span>
          <strong>${model.level}</strong>
        </div>
      </div>
      <div class="space-idle-progress">
        ${progressItems.map(renderProgressItem).join('')}
      </div>
      ${fallbackMarkup}
    </div>
  `;
}

function renderPropLayer(layer, model, options = {}) {
  const planeById = new Map((model.layout.placementPlanes || []).map(plane => [plane.id, plane]));

  return (layer.items || [])
    .filter(item => isUnlocked(item, model.level))
    .map(item => {
      const asset = model.assets.props.find(prop => prop.id === item.propAssetId);
      if (!asset?.path) return '';
      const placement = item.placement || {};
      const isHidden = placement.hidden === true;
      const variant = resolveAssetVariant(asset, placement.variantId || item.defaultVariantId);
      const plane = planeById.get(placement.planeId || item.placementPlaneId);
      const editing = item.editing || {};
      const support = item.resolvedSupportSurface;
      const bounds = support?.bounds || plane?.bounds || {};

      return `
        <img
          class="space-idle-prop ${options.isEditing ? 'is-draggable' : ''} ${isHidden ? 'is-hidden-by-editor' : ''}"
          src="${escapeHtml(variant.path)}"
          alt=""
          aria-hidden="true"
          draggable="false"
          style="${buildPlacementStyle(placement, { flipX: variant.flipX })}"
          data-idle-prop-id="${escapeHtml(item.id)}"
          data-idle-item-id="${escapeHtml(item.id)}"
          data-idle-item-kind="prop"
          data-idle-label="${escapeHtml(asset.label || item.id)}"
          data-idle-unlock-level="${toNumber(item.unlock?.minLevel, 1)}"
          data-idle-unlock-meaning="${escapeHtml(item.unlock?.meaning || '')}"
          data-idle-layer-id="${escapeHtml(layer.id)}"
          data-idle-anchor="${escapeHtml(placement.anchor || 'center-bottom')}"
          data-idle-rotation="${toNumber(placement.rotation, 0)}"
          data-idle-scale="${toNumber(placement.scale, 1)}"
          data-idle-flip-x="${variant.flipX ? 'true' : 'false'}"
          data-idle-variant-id="${escapeHtml(variant.id)}"
          data-idle-hidden="${isHidden ? 'true' : 'false'}"
          data-idle-variants="${escapeHtml(encodeVariants(asset.variants))}"
          data-idle-support-surfaces="${escapeHtml(encodeSupportSurfaces(item.supportSurfaces || []))}"
          data-idle-character-anchors="${escapeHtml(encodeCharacterAnchors(item.characterAnchors || []))}"
          data-idle-can-rotate="${editing.canRotate ? 'true' : 'false'}"
          data-idle-can-change-variant="${editing.canChangeVariant ? 'true' : 'false'}"
          data-idle-allowed-surface-kinds="${escapeHtml((editing.allowedSurfaceKinds || []).join(','))}"
          data-idle-rotation-step="${toNumber(editing.rotationStep, 15)}"
          data-idle-rotation-min="${toNumber(editing.rotationMin, 0)}"
          data-idle-rotation-max="${toNumber(editing.rotationMax, 0)}"
          data-idle-plane-id="${escapeHtml(plane?.id || '')}"
          data-idle-plane-label="${escapeHtml(support?.label || plane?.label || '')}"
          data-idle-plane-min-x="${toNumber(bounds.minX, 0)}"
          data-idle-plane-max-x="${toNumber(bounds.maxX, 100)}"
          data-idle-plane-min-y="${toNumber(bounds.minY, 0)}"
          data-idle-plane-max-y="${toNumber(bounds.maxY, 100)}"
          data-idle-parent-item-id="${escapeHtml(placement.parentItemId || '')}"
          data-idle-surface-id="${escapeHtml(placement.surfaceId || '')}"
          data-idle-local-x="${toNumber(placement.localX, 0.5)}"
          data-idle-local-y="${toNumber(placement.localY, 0.5)}"
          data-idle-footprint-width="${toNumber(item.footprint?.width, 0)}"
          data-idle-footprint-depth="${toNumber(item.footprint?.depth, 0)}"
          data-idle-footprint-height="${toNumber(item.footprint?.height, 0)}"
          data-idle-draggable="${options.isEditing ? 'true' : 'false'}"
        />
      `;
    })
    .join('');
}

function renderCharacterLayer(layer, model) {
  const character = model.assets.characters.find(asset => asset.id === layer.characterAssetId);
  if (!character) return '';

  return `
    <img
      class="space-idle-character"
      src="${escapeHtml(character.previewPath || character.framePaths?.[0] || character.path)}"
      alt=""
      aria-hidden="true"
      draggable="false"
      style="${buildPlacementStyle(layer.placement)}"
      data-idle-character-id="${escapeHtml(character.id)}"
      data-idle-item-id="${escapeHtml(layer.id)}"
      data-idle-item-kind="character"
      data-idle-anchor-target-item-id="${escapeHtml(layer.resolvedCharacterAnchor?.itemId || '')}"
      data-idle-anchor-target-anchor-id="${escapeHtml(layer.resolvedCharacterAnchor?.anchorId || '')}"
    />
  `;
}

function renderPlacementPlanes(planes) {
  return planes.map(plane => {
    const bounds = plane.bounds || {};

    return `
      <div
        class="space-idle-plane"
        aria-hidden="true"
        data-idle-plane="${escapeHtml(plane.id)}"
        style="
          left: ${toPercent(bounds.minX ?? 0)};
          top: ${toPercent(bounds.minY ?? 0)};
          width: ${toPercent((bounds.maxX ?? 100) - (bounds.minX ?? 0))};
          height: ${toPercent((bounds.maxY ?? 100) - (bounds.minY ?? 0))};
        "
      ></div>
    `;
  }).join('');
}

function buildProgressItems(model, options = {}) {
  const propItems = model.layout.layers
    .filter(layer => layer.type === 'props')
    .flatMap(layer => layer.items || []);

  const items = propItems
    .filter(item => item.unlock)
    .map(item => ({
      id: item.id,
      label: item.unlock.meaning || item.id,
      level: item.unlock.minLevel,
      unlocked: isUnlocked(item, model.level),
    }))
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  const unlocked = items.filter(item => item.unlocked);
  const locked = items.filter(item => !item.unlocked);

  if (options.variant === 'expanded') {
    return [...unlocked, ...locked.slice(0, 4)];
  }

  return [
    ...unlocked.slice(-6),
    ...locked.slice(0, 3),
  ].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

function renderProgressItem(item) {
  return `
    <span class="space-idle-progress-item ${item.unlocked ? 'is-unlocked' : 'is-locked'}">
      Lv.${item.level} - ${escapeHtml(item.label)}
    </span>
  `;
}

function isUnlocked(item, level) {
  return level >= (item.unlock?.minLevel || 1);
}

function buildPlacementStyle(placement = {}, options = {}) {
  const transform = buildTransform({
    anchor: placement.anchor,
    scale: placement.scale,
    rotation: placement.rotation,
    flipX: options.flipX,
  });

  return [
    `left: ${toPercent(placement.x ?? 50)}`,
    `top: ${toPercent(placement.y ?? 50)}`,
    `width: ${toPercent(placement.width ?? 10)}`,
    `z-index: ${placement.z ?? 1}`,
    `--idle-transform: ${transform}`,
    'transform: var(--idle-transform) var(--idle-camera-item-transform, )',
  ].join('; ');
}

function buildTransform({
  anchor = 'center-bottom',
  scale = 1,
  rotation = 0,
  flipX = false,
} = {}) {
  const translate = anchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
  const transforms = [translate];
  if (rotation) transforms.push(`rotate(${rotation}deg)`);
  if (flipX) transforms.push('scaleX(-1)');
  if (scale && scale !== 1) transforms.push(`scale(${scale})`);
  return transforms.join(' ');
}

function toPercent(value) {
  return typeof value === 'number' ? `${value}%` : value;
}

function resolveAssetVariant(asset, variantId) {
  return asset.variants?.find(variant => variant.id === variantId)
    || asset.variants?.[0]
    || {
      id: 'front',
      label: 'Front',
      path: asset.path,
      dimensions: asset.dimensions,
      flipX: false,
    };
}

function resolveCameraBackground(model, cameraProfile) {
  const backgroundAssetId = cameraProfile?.backgroundAssetId || model.layout.backgroundAssetId;
  return model.assets.backgrounds.find(asset => asset.id === backgroundAssetId)
    || model.assets.backgrounds.find(asset => asset.id === model.layout.backgroundAssetId)
    || model.assets.backgrounds[0];
}

function encodeVariants(variants = []) {
  return encodeURIComponent(JSON.stringify(variants.map(variant => ({
    id: variant.id,
    label: variant.label,
    path: variant.path,
    flipX: Boolean(variant.flipX),
    cameraProfileId: variant.cameraProfileId || null,
  }))));
}

function encodeCameraProfiles(profiles = []) {
  return encodeURIComponent(JSON.stringify(profiles.map(profile => ({
    id: profile.id,
    label: profile.label,
    rotateY: profile.rotateY || 0,
    backgroundShiftX: profile.backgroundShiftX || 0,
    itemSkew: profile.itemSkew || 0,
    backgroundAssetId: profile.backgroundAssetId || null,
  }))));
}

function encodeBackgroundAssets(backgrounds = []) {
  return encodeURIComponent(JSON.stringify(backgrounds.map(background => ({
    id: background.id,
    path: background.path,
  }))));
}

function encodeSupportSurfaces(surfaces = []) {
  return encodeURIComponent(JSON.stringify(surfaces.map(surface => ({
    id: surface.id,
    label: surface.label,
    kind: surface.kind,
    bounds: surface.bounds,
  }))));
}

function encodeCharacterAnchors(anchors = []) {
  return encodeURIComponent(JSON.stringify(anchors.map(anchor => ({
    id: anchor.id,
    label: anchor.label,
    offsetX: anchor.offsetX,
    offsetY: anchor.offsetY,
    width: anchor.width,
    facing: anchor.facing,
  }))));
}

function buildCameraStyle(profile = {}) {
  return [
    `--idle-camera-rotate-y: ${toNumber(profile.rotateY, 0)}deg`,
    `--idle-camera-bg-shift-x: ${toNumber(profile.backgroundShiftX, 0)}%`,
    `--idle-camera-item-transform: skewY(${toNumber(profile.itemSkew, 0)}deg)`,
  ].join('; ');
}

function toNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
