import { savePersonalSpaceState } from '../gameState.js';

export function mountIdleWindowEditor(container, options = {}) {
  const overlay = container.querySelector('[data-idle-window-overlay]');
  const card = container.querySelector('[data-idle-window-card]');
  if (!overlay || !card) return null;

  const openTargets = [
    ...container.querySelectorAll('[data-idle-window-open]'),
    card.querySelector('[data-idle-window-frame]'),
  ].filter(Boolean);
  const editButton = overlay.querySelector('[data-idle-window-edit]');
  const resetButton = overlay.querySelector('[data-idle-window-reset]');
  const closeButton = overlay.querySelector('[data-idle-window-close]');
  const cameraButtons = overlay.querySelectorAll('[data-idle-camera]');
  const selectionPanel = overlay.querySelector('[data-idle-window-selection]');
  const selectedLabel = overlay.querySelector('[data-idle-selected-label]');
  const selectedPlane = overlay.querySelector('[data-idle-selected-plane]');
  const libraryPanel = overlay.querySelector('[data-idle-window-library]');
  const libraryList = overlay.querySelector('[data-idle-library-list]');
  const showAllButton = overlay.querySelector('[data-idle-show-all]');
  const hideAllButton = overlay.querySelector('[data-idle-hide-all]');
  const idleWindow = overlay.querySelector('[data-idle-window]');
  const frame = overlay.querySelector('[data-idle-window-frame]');
  const layoutId = idleWindow?.dataset.idleLayoutId;
  let personalSpaceState = options.personalSpaceState || {};
  let isEditing = false;
  let isDirty = false;
  let activeDrag = null;
  let activeCameraDrag = null;
  let selectedItem = null;

  function openOverlay() {
    overlay.hidden = false;
    document.body.classList.add('space-idle-overlay-open');
    setEditing(false);
  }

  function closeOverlay() {
    overlay.hidden = true;
    document.body.classList.remove('space-idle-overlay-open');
    setEditing(false);
    if (isDirty) {
      isDirty = false;
      options.onCloseRefresh?.();
    }
  }

  function setEditing(nextValue) {
    isEditing = Boolean(nextValue);
    idleWindow?.classList.toggle('is-editing', isEditing);
    idleWindow?.classList.toggle('is-camera-adjustable', !isEditing);
    overlay.classList.toggle('is-editing', isEditing);
    overlay.classList.toggle('is-camera-adjustable', !isEditing);
    overlay.setAttribute('data-idle-window-editing', isEditing ? 'true' : 'false');
    overlay.querySelectorAll('[data-idle-item-kind="prop"]').forEach(item => {
      item.dataset.idleDraggable = isEditing ? 'true' : 'false';
    });
    if (libraryPanel) libraryPanel.hidden = !isEditing;
    if (isEditing) refreshLibrary();
    if (!isEditing) selectItem(null);
    if (editButton) editButton.textContent = isEditing ? 'Done' : 'Edit';
  }

  function resetPlacements() {
    if (!layoutId) return;
    personalSpaceState = clearIdleWindowPlacementOverrides(personalSpaceState, layoutId);
    isDirty = false;
    overlay.hidden = true;
    document.body.classList.remove('space-idle-overlay-open');
    setEditing(false);
    options.onCloseRefresh?.();
  }

  function handleEditClick() {
    setEditing(!isEditing);
  }

  function handleCameraClick(event) {
    switchCameraProfile(Number.parseInt(event.currentTarget.dataset.idleCamera, 10));
  }

  function handlePointerDown(event) {
    if (!frame) return;

    const target = event.target.closest('[data-idle-draggable="true"]');

    if (!isEditing) {
      if (event.target === frame || event.target.closest('[data-idle-window-frame]') === frame) startCameraDrag(event);
      return;
    }

    if (!target || !frame.contains(target)) return;

    const frameRect = frame.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height) return;

    event.preventDefault();
    selectItem(target);
    target.setPointerCapture?.(event.pointerId);
    target.classList.add('is-dragging');
    activeDrag = {
      target,
      pointerId: event.pointerId,
      frameRect,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: readPercent(target.style.left, 50),
      startTop: readPercent(target.style.top, 50),
    };
  }

  function handlePointerMove(event) {
    if (activeCameraDrag && event.pointerId === activeCameraDrag.pointerId) {
      return;
    }

    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

    const bounds = getDragBounds(activeDrag.target);
    const nextLeft = clamp(
      activeDrag.startLeft + ((event.clientX - activeDrag.startX) / activeDrag.frameRect.width) * 100,
      bounds.minX,
      bounds.maxX
    );
    const nextTop = clamp(
      activeDrag.startTop + ((event.clientY - activeDrag.startY) / activeDrag.frameRect.height) * 100,
      bounds.minY,
      bounds.maxY
    );

    activeDrag.target.style.left = formatPercent(nextLeft);
    activeDrag.target.style.top = formatPercent(nextTop);
    updateCharacterAnchorsForParent(activeDrag.target);
    updatePlacementFeedback(activeDrag.target);
  }

  function handlePointerUp(event) {
    if (activeCameraDrag && event.pointerId === activeCameraDrag.pointerId) {
      const deltaX = event.clientX - activeCameraDrag.startX;
      const deltaY = event.clientY - activeCameraDrag.startY;
      frame?.releasePointerCapture?.(event.pointerId);
      frame?.classList.remove('is-camera-dragging');
      activeCameraDrag = null;
      if (Math.abs(deltaX) >= 34 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        switchCameraProfile(deltaX > 0 ? 1 : -1);
      }
      return;
    }

    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

    const target = activeDrag.target;
    target.releasePointerCapture?.(event.pointerId);
    target.classList.remove('is-dragging');
    activeDrag = null;
    applyNearestSupportSurfaceSnap(target);
    updateDepthHint(target);
    updateCharacterAnchorsForParent(target);
    updatePlacementFeedback(target);

    if (!layoutId || !target.dataset.idleItemId) return;

    personalSpaceState = saveIdleWindowPlacementOverride(
      personalSpaceState,
      layoutId,
      target.dataset.idleItemId,
      readPlacementFromElement(target)
    );
    isDirty = true;
  }

  function handleSelectionClick(event) {
    const rotateButton = event.target.closest('[data-idle-rotate]');
    if (rotateButton) {
      rotateSelected(Number.parseInt(rotateButton.dataset.idleRotate, 10));
      return;
    }

    const variantButton = event.target.closest('[data-idle-variant]');
    if (variantButton) {
      switchSelectedVariant(Number.parseInt(variantButton.dataset.idleVariant, 10));
      return;
    }

    const layerButton = event.target.closest('[data-idle-layer]');
    if (layerButton) {
      adjustSelectedLayer(layerButton.dataset.idleLayer);
    }
  }

  function selectItem(item) {
    if (selectedItem) selectedItem.classList.remove('is-selected');
    selectedItem = item;

    if (!selectedItem) {
      if (selectionPanel) selectionPanel.hidden = true;
      return;
    }

    selectedItem.classList.add('is-selected');
    if (selectionPanel) selectionPanel.hidden = false;
    if (selectedLabel) selectedLabel.textContent = selectedItem.dataset.idleLabel || selectedItem.dataset.idleItemId || 'Item';
    if (selectedPlane) selectedPlane.textContent = selectedItem.dataset.idlePlaneLabel || '';
    updateSelectionButtons();
  }

  function updateSelectionButtons() {
    const canRotate = selectedItem?.dataset.idleCanRotate === 'true';
    const canChangeVariant = selectedItem?.dataset.idleCanChangeVariant === 'true'
      && getVariants(selectedItem).length > 1;

    selectionPanel?.querySelectorAll('[data-idle-rotate]').forEach(button => {
      button.disabled = !canRotate;
    });
    selectionPanel?.querySelectorAll('[data-idle-variant]').forEach(button => {
      button.disabled = !canChangeVariant;
    });
    selectionPanel?.querySelectorAll('[data-idle-layer]').forEach(button => {
      button.disabled = !selectedItem;
    });
  }

  function rotateSelected(direction) {
    if (!selectedItem || selectedItem.dataset.idleCanRotate !== 'true') return;

    const step = readNumber(selectedItem.dataset.idleRotationStep, 15);
    const min = readNumber(selectedItem.dataset.idleRotationMin, -45);
    const max = readNumber(selectedItem.dataset.idleRotationMax, 45);
    const current = readNumber(selectedItem.dataset.idleRotation, 0);
    const next = clamp(current + step * direction, min, max);

    selectedItem.dataset.idleRotation = String(next);
    writeElementTransform(selectedItem);
    saveSelectedPlacement();
  }

  function switchSelectedVariant(direction) {
    if (!selectedItem || selectedItem.dataset.idleCanChangeVariant !== 'true') return;

    const variants = getVariants(selectedItem);
    if (variants.length < 2) return;

    const currentIndex = Math.max(0, variants.findIndex(variant => variant.id === selectedItem.dataset.idleVariantId));
    const nextVariant = variants[(currentIndex + direction + variants.length) % variants.length];
    selectedItem.src = nextVariant.path;
    selectedItem.dataset.idleVariantId = nextVariant.id;
    selectedItem.dataset.idleFlipX = nextVariant.flipX ? 'true' : 'false';
    writeElementTransform(selectedItem);
    saveSelectedPlacement();
  }

  function adjustSelectedLayer(action) {
    if (!selectedItem) return;

    const current = Number.parseInt(selectedItem.style.zIndex || selectedItem.style.getPropertyValue('z-index'), 10);
    const base = Number.isFinite(current) ? current : 20;
    const zByAction = {
      back: 1,
      down: clamp(base - 1, 1, 120),
      up: clamp(base + 1, 1, 120),
      front: 120,
    };
    selectedItem.style.zIndex = String(zByAction[action] ?? base);
    saveSelectedPlacement();
  }

  function saveSelectedPlacement() {
    if (!layoutId || !selectedItem?.dataset.idleItemId) return;

    personalSpaceState = saveIdleWindowPlacementOverride(
      personalSpaceState,
      layoutId,
      selectedItem.dataset.idleItemId,
      readPlacementFromElement(selectedItem)
    );
    isDirty = true;
  }

  function switchCameraProfile(direction) {
    if (!layoutId || !idleWindow) return;
    const profiles = getCameraProfiles(idleWindow);
    if (profiles.length < 2) return;

    const currentIndex = Math.max(0, profiles.findIndex(profile => profile.id === idleWindow.dataset.idleCameraProfileId));
    const nextProfile = profiles[(currentIndex + direction + profiles.length) % profiles.length];
    idleWindow.dataset.idleCameraProfileId = nextProfile.id;
    writeCameraStyle(idleWindow, nextProfile);
    writeCameraBackground(idleWindow, nextProfile);
    personalSpaceState = applyPreferredCameraVariants(idleWindow, nextProfile, layoutId, personalSpaceState);
    personalSpaceState = saveIdleWindowCameraProfile(personalSpaceState, layoutId, nextProfile.id);
    isDirty = true;
  }

  function startCameraDrag(event) {
    const frameRect = frame.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height) return;
    event.preventDefault();
    frame.setPointerCapture?.(event.pointerId);
    frame.classList.add('is-camera-dragging');
    activeCameraDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handleLibraryChange(event) {
    const toggle = event.target.closest('[data-idle-library-toggle]');
    if (!toggle) return;
    setItemHidden(toggle.dataset.idleLibraryToggle, !toggle.checked);
  }

  function handleLibraryClick(event) {
    const action = event.target.closest('[data-idle-library-group-action]');
    if (!action) return;
    setGroupItemsHidden(action.dataset.idleLibraryGroupAction, action.dataset.idleLibraryGroupHidden === 'true');
  }

  function showAllItems() {
    setAllItemsHidden(false);
  }

  function hideAllItems() {
    setAllItemsHidden(true);
  }

  function preventImageDrag(event) {
    if (event.target.closest('.space-idle-background, .space-idle-prop, .space-idle-character')) {
      event.preventDefault();
    }
  }

  function refreshLibrary() {
    if (!libraryList || !idleWindow) return;
    const props = [...idleWindow.querySelectorAll('[data-idle-item-kind="prop"]')];
    libraryList.innerHTML = '';
    buildLibraryGroups(props).forEach((group, index) => {
      const details = document.createElement('details');
      details.className = 'space-idle-library-group';
      details.open = index === 0;
      details.dataset.idleLibraryGroup = group.id;

      const summary = document.createElement('summary');
      summary.className = 'space-idle-library-summary';

      const title = document.createElement('span');
      title.textContent = group.label;

      const count = document.createElement('small');
      count.textContent = `${group.visibleCount}/${group.items.length}`;

      summary.append(title, count);

      const actions = document.createElement('div');
      actions.className = 'space-idle-library-group-actions';
      actions.append(
        createLibraryGroupButton(group.id, 'All', false),
        createLibraryGroupButton(group.id, 'None', true)
      );

      const items = document.createElement('div');
      items.className = 'space-idle-library-items';
      group.items.forEach(prop => items.append(createLibraryToggle(prop)));

      details.append(summary, actions, items);
      libraryList.append(details);
    });
  }

  function buildLibraryGroups(props) {
    const groups = new Map();
    props.forEach(prop => {
      const group = getLibraryGroupForProp(prop);
      prop.dataset.idleLibraryGroupId = group.id;
      if (!groups.has(group.id)) {
        groups.set(group.id, {
          ...group,
          items: [],
          visibleCount: 0,
        });
      }
      const current = groups.get(group.id);
      current.items.push(prop);
      if (prop.dataset.idleHidden !== 'true') current.visibleCount += 1;
    });

    return [...groups.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  }

  function getLibraryGroupForProp(prop) {
    const minLevel = readNumber(prop.dataset.idleUnlockLevel, 1);

    if (minLevel < 10) {
      return { id: 'survival-core', label: 'Survival Lv.1-9', sort: 10 };
    }
    if (minLevel < 18) {
      return { id: 'building-foundation', label: 'Building Lv.10-17', sort: 20 };
    }
    if (minLevel < 20) {
      return { id: 'building-proof', label: 'Building Proof Lv.18-19', sort: 30 };
    }
    return { id: 'mastery-proof', label: 'Mastery Lv.20+', sort: 40 };
  }

  function createLibraryGroupButton(groupId, label, hidden) {
    const button = document.createElement('button');
    button.className = 'space-idle-tool-button space-idle-tool-button--tiny';
    button.type = 'button';
    button.textContent = label;
    button.dataset.idleLibraryGroupAction = groupId;
    button.dataset.idleLibraryGroupHidden = hidden ? 'true' : 'false';
    return button;
  }

  function createLibraryToggle(prop) {
    const label = document.createElement('label');
    label.className = 'space-idle-library-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = prop.dataset.idleHidden !== 'true';
    checkbox.dataset.idleLibraryToggle = prop.dataset.idleItemId || '';

    const body = document.createElement('span');
    body.className = 'space-idle-library-toggle-body';

    const name = document.createElement('span');
    name.textContent = prop.dataset.idleLabel || prop.dataset.idleItemId || 'Item';

    const meta = document.createElement('small');
    const minLevel = Math.max(1, Math.round(readNumber(prop.dataset.idleUnlockLevel, 1)));
    meta.textContent = `Lv.${minLevel}`;

    body.append(name, meta);
    label.append(checkbox, body);
    return label;
  }

  function setAllItemsHidden(hidden) {
    idleWindow?.querySelectorAll('[data-idle-item-kind="prop"]').forEach(prop => {
      setItemHidden(prop.dataset.idleItemId, hidden, { refresh: false });
    });
    refreshLibrary();
  }

  function setGroupItemsHidden(groupId, hidden) {
    idleWindow?.querySelectorAll(`[data-idle-library-group-id="${cssEscape(groupId)}"]`).forEach(prop => {
      setItemHidden(prop.dataset.idleItemId, hidden, { refresh: false });
    });
    refreshLibrary();
  }

  function setItemHidden(itemId, hidden, options = {}) {
    if (!itemId) return;
    const item = idleWindow?.querySelector(`[data-idle-item-id="${cssEscape(itemId)}"]`);
    if (!item) return;

    item.dataset.idleHidden = hidden ? 'true' : 'false';
    item.classList.toggle('is-hidden-by-editor', hidden);
    if (hidden && selectedItem === item) selectItem(null);
    if (layoutId) {
      personalSpaceState = saveIdleWindowPlacementOverride(
        personalSpaceState,
        layoutId,
        itemId,
        readPlacementFromElement(item)
      );
      isDirty = true;
    }
    if (options.refresh !== false) refreshLibrary();
  }

  openTargets.forEach(target => {
    target.addEventListener('click', openOverlay);
  });
  editButton?.addEventListener('click', handleEditClick);
  resetButton?.addEventListener('click', resetPlacements);
  closeButton?.addEventListener('click', closeOverlay);
  cameraButtons.forEach(button => button.addEventListener('click', handleCameraClick));
  selectionPanel?.addEventListener('click', handleSelectionClick);
  libraryPanel?.addEventListener('click', handleLibraryClick);
  libraryList?.addEventListener('change', handleLibraryChange);
  showAllButton?.addEventListener('click', showAllItems);
  hideAllButton?.addEventListener('click', hideAllItems);
  overlay.addEventListener('dragstart', preventImageDrag);
  overlay.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);

  return () => {
    document.body.classList.remove('space-idle-overlay-open');
    openTargets.forEach(target => {
      target.removeEventListener('click', openOverlay);
    });
    editButton?.removeEventListener('click', handleEditClick);
    resetButton?.removeEventListener('click', resetPlacements);
    closeButton?.removeEventListener('click', closeOverlay);
    cameraButtons.forEach(button => button.removeEventListener('click', handleCameraClick));
    selectionPanel?.removeEventListener('click', handleSelectionClick);
    libraryPanel?.removeEventListener('click', handleLibraryClick);
    libraryList?.removeEventListener('change', handleLibraryChange);
    showAllButton?.removeEventListener('click', showAllItems);
    hideAllButton?.removeEventListener('click', hideAllItems);
    overlay.removeEventListener('dragstart', preventImageDrag);
    overlay.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  };
}

export function saveIdleWindowPlacementOverride(personalSpaceState, layoutId, itemId, placement) {
  const nextState = buildIdleWindowPlacementState(personalSpaceState, layoutId, itemId, placement);
  return savePersonalSpaceState(nextState);
}

export function clearIdleWindowPlacementOverrides(personalSpaceState, layoutId) {
  const nextLayouts = { ...(personalSpaceState.idleWindowLayouts || {}) };
  delete nextLayouts[layoutId];

  return savePersonalSpaceState({
    ...personalSpaceState,
    idleWindowLayouts: nextLayouts,
  });
}

export function buildIdleWindowPlacementState(personalSpaceState, layoutId, itemId, placement) {
  const currentLayouts = personalSpaceState.idleWindowLayouts || {};
  const currentLayout = currentLayouts[layoutId] || {};

  return {
    ...personalSpaceState,
    idleWindowLayouts: {
      ...currentLayouts,
      [layoutId]: {
        ...currentLayout,
        placements: {
          ...(currentLayout.placements || {}),
          [itemId]: placement,
        },
      },
    },
  };
}

export function saveIdleWindowCameraProfile(personalSpaceState, layoutId, cameraProfileId) {
  const nextState = buildIdleWindowCameraState(personalSpaceState, layoutId, cameraProfileId);
  return savePersonalSpaceState(nextState);
}

export function buildIdleWindowCameraState(personalSpaceState, layoutId, cameraProfileId) {
  const currentLayouts = personalSpaceState.idleWindowLayouts || {};
  const currentLayout = currentLayouts[layoutId] || {};

  return {
    ...personalSpaceState,
    idleWindowLayouts: {
      ...currentLayouts,
      [layoutId]: {
        ...currentLayout,
        cameraProfileId,
      },
    },
  };
}

function readPlacementFromElement(element) {
  const z = Number.parseInt(element.style.zIndex || element.style.getPropertyValue('z-index'), 10);
  const placement = {
    x: element.style.left,
    y: element.style.top,
    width: element.style.width,
    anchor: element.dataset.idleAnchor || 'center-bottom',
    planeId: element.dataset.idlePlaneId || undefined,
    variantId: element.dataset.idleVariantId || undefined,
    hidden: element.dataset.idleHidden === 'true',
  };

  if (element.dataset.idleParentItemId && element.dataset.idleSurfaceId) {
    placement.parentItemId = element.dataset.idleParentItemId;
    placement.surfaceId = element.dataset.idleSurfaceId;
  }

  if (Number.isFinite(z)) placement.z = z;
  const rotation = readNumber(element.dataset.idleRotation, 0);
  if (rotation) placement.rotation = rotation;
  if (placement.parentItemId && placement.surfaceId) {
    const bounds = getPlaneBounds(element);
    placement.localX = toLocalPercent(readPercent(element.style.left, 50), bounds.minX, bounds.maxX);
    placement.localY = toLocalPercent(readPercent(element.style.top, 50), bounds.minY, bounds.maxY);
  }
  return placement;
}

function applyNearestSupportSurfaceSnap(element) {
  const allowedSurfaceKinds = readCsv(element.dataset.idleAllowedSurfaceKinds);
  if (!allowedSurfaceKinds.length) return;

  const itemId = element.dataset.idleItemId;
  const x = readPercent(element.style.left, 50);
  const y = readPercent(element.style.top, 50);
  const candidates = getSupportSurfaceCandidates(element)
    .filter(candidate => candidate.parentItemId !== itemId)
    .filter(candidate => allowedSurfaceKinds.includes(candidate.kind))
    .map(candidate => ({
      ...candidate,
      distance: distanceToBounds({ x, y }, candidate.bounds),
    }))
    .sort((a, b) => a.distance - b.distance);

  const nearest = candidates[0];
  if (!nearest || nearest.distance > 5.5) {
    element.dataset.idleParentItemId = '';
    element.dataset.idleSurfaceId = '';
    element.dataset.idlePlaneId = 'floor-main';
    element.dataset.idlePlaneLabel = 'Free placement';
    element.dataset.idlePlaneMinX = '6';
    element.dataset.idlePlaneMaxX = '94';
    element.dataset.idlePlaneMinY = '28';
    element.dataset.idlePlaneMaxY = '92';
    return;
  }

  const nextX = clamp(x, nearest.bounds.minX, nearest.bounds.maxX);
  const nextY = clamp(y, nearest.bounds.minY, nearest.bounds.maxY);
  element.style.left = formatPercent(nextX);
  element.style.top = formatPercent(nextY);
  element.dataset.idleParentItemId = nearest.parentItemId;
  element.dataset.idleSurfaceId = nearest.id;
  element.dataset.idlePlaneLabel = nearest.label;
  element.dataset.idlePlaneMinX = String(nearest.bounds.minX);
  element.dataset.idlePlaneMaxX = String(nearest.bounds.maxX);
  element.dataset.idlePlaneMinY = String(nearest.bounds.minY);
  element.dataset.idlePlaneMaxY = String(nearest.bounds.maxY);
}

function updateDepthHint(element) {
  const footprintDepth = readNumber(element.dataset.idleFootprintDepth, 0);
  if (!footprintDepth) return;

  const top = readPercent(element.style.top, 50);
  element.style.zIndex = String(Math.round(10 + top + footprintDepth / 2));
}

function updateCharacterAnchorsForParent(parent) {
  const parentItemId = parent.dataset.idleItemId;
  if (!parentItemId) return;

  const anchors = readJsonDataset(parent.dataset.idleCharacterAnchors, []);
  if (!anchors.length) return;

  const frame = parent.closest('[data-idle-window-frame]');
  const parentX = readPercent(parent.style.left, 50);
  const parentY = readPercent(parent.style.top, 50);

  frame?.querySelectorAll(`[data-idle-anchor-target-item-id="${parentItemId}"]`).forEach(character => {
    const anchor = anchors.find(entry => entry.id === character.dataset.idleAnchorTargetAnchorId) || anchors[0];
    character.style.left = formatPercent(parentX + readNumber(anchor.offsetX, 0));
    character.style.top = formatPercent(parentY + readNumber(anchor.offsetY, 0));
    if (anchor.width) character.style.width = formatPercent(readNumber(anchor.width, 14));
  });
}

function updatePlacementFeedback(element) {
  const hasCollision = hasMajorFurnitureOverlap(element);
  element.classList.toggle('has-placement-warning', hasCollision);
  element.dataset.idlePlacementWarning = hasCollision ? 'overlap' : '';
}

function hasMajorFurnitureOverlap(element) {
  const ownFootprint = readFootprintRect(element);
  if (!ownFootprint) return false;

  return [...element.closest('[data-idle-window-frame]')?.querySelectorAll('[data-idle-item-kind="prop"]') || []]
    .filter(other => other !== element)
    .filter(other => other.dataset.idleHidden !== 'true')
    .map(readFootprintRect)
    .filter(Boolean)
    .some(otherRect => rectsOverlap(ownFootprint, otherRect));
}

function readFootprintRect(element) {
  const width = readNumber(element.dataset.idleFootprintWidth, 0);
  const depth = readNumber(element.dataset.idleFootprintDepth, 0);
  if (width < 8 || depth < 7) return null;

  const x = readPercent(element.style.left, 50);
  const y = readPercent(element.style.top, 50);
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - depth,
    maxY: y,
  };
}

export function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function getSupportSurfaceCandidates(element) {
  const frame = element.closest('[data-idle-window-frame]');
  if (!frame) return [];

  return [...frame.querySelectorAll('[data-idle-support-surfaces]')]
    .filter(parent => parent.dataset.idleHidden !== 'true')
    .flatMap(parent => {
      const surfaces = readJsonDataset(parent.dataset.idleSupportSurfaces, []);
      return surfaces.map(surface => ({
        ...surface,
        parentItemId: parent.dataset.idleItemId,
        bounds: buildAbsoluteSurfaceBounds(parent, surface.bounds || {}),
      }));
    });
}

function buildAbsoluteSurfaceBounds(parent, bounds) {
  const parentX = readPercent(parent.style.left, 50);
  const parentY = readPercent(parent.style.top, 50);
  return {
    minX: roundPercent(parentX + readNumber(bounds.minX, 0)),
    maxX: roundPercent(parentX + readNumber(bounds.maxX, 0)),
    minY: roundPercent(parentY + readNumber(bounds.minY, 0)),
    maxY: roundPercent(parentY + readNumber(bounds.maxY, 0)),
  };
}

function distanceToBounds(point, bounds) {
  const dx = point.x < bounds.minX ? bounds.minX - point.x : point.x > bounds.maxX ? point.x - bounds.maxX : 0;
  const dy = point.y < bounds.minY ? bounds.minY - point.y : point.y > bounds.maxY ? point.y - bounds.maxY : 0;
  return Math.hypot(dx, dy);
}

function writeElementTransform(element) {
  element.style.setProperty('--idle-transform', buildTransformFromDataset(element));
}

function buildTransformFromDataset(element) {
  const anchor = element.dataset.idleAnchor || 'center-bottom';
  const translate = anchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
  const transforms = [translate];
  const rotation = readNumber(element.dataset.idleRotation, 0);
  const scale = readNumber(element.dataset.idleScale, 1);

  if (rotation) transforms.push(`rotate(${rotation}deg)`);
  if (element.dataset.idleFlipX === 'true') transforms.push('scaleX(-1)');
  if (scale && scale !== 1) transforms.push(`scale(${scale})`);
  return transforms.join(' ');
}

function getVariants(element) {
  try {
    return JSON.parse(decodeURIComponent(element.dataset.idleVariants || '[]'));
  } catch {
    return [];
  }
}

function getCameraProfiles(element) {
  return readJsonDataset(element.dataset.idleCameraProfiles, []);
}

function writeCameraStyle(element, profile) {
  element.style.setProperty('--idle-camera-rotate-y', `${readNumber(profile.rotateY, 0)}deg`);
  element.style.setProperty('--idle-camera-bg-shift-x', `${readNumber(profile.backgroundShiftX, 0)}%`);
  element.style.setProperty('--idle-camera-item-transform', `skewY(${readNumber(profile.itemSkew, 0)}deg)`);
}

function writeCameraBackground(element, profile) {
  const background = getBackgroundAssets(element).find(asset => asset.id === profile.backgroundAssetId);
  const backgroundImage = element.querySelector('.space-idle-background');
  if (background?.path && backgroundImage) backgroundImage.src = background.path;
}

function applyPreferredCameraVariants(idleWindow, profile, layoutId, personalSpaceState) {
  if (!profile?.id || !idleWindow) return personalSpaceState;
  let nextState = personalSpaceState;

  idleWindow.querySelectorAll('[data-idle-can-change-variant="true"]').forEach(element => {
    const variants = getVariants(element);
    const profileVariant = variants.find(variant => variant.cameraProfileId === profile.id);
    if (!profileVariant) return;

    element.src = profileVariant.path;
    element.dataset.idleVariantId = profileVariant.id;
    element.dataset.idleFlipX = profileVariant.flipX ? 'true' : 'false';
    writeElementTransform(element);
    if (layoutId && element.dataset.idleItemId) {
      nextState = saveIdleWindowPlacementOverride(
        nextState,
        layoutId,
        element.dataset.idleItemId,
        readPlacementFromElement(element)
      );
    }
  });

  return nextState;
}

function getBackgroundAssets(element) {
  return readJsonDataset(element.dataset.idleBackgroundAssets, []);
}

function getPlaneBounds(element) {
  return {
    minX: readNumber(element.dataset.idlePlaneMinX, 0),
    maxX: readNumber(element.dataset.idlePlaneMaxX, 100),
    minY: readNumber(element.dataset.idlePlaneMinY, 0),
    maxY: readNumber(element.dataset.idlePlaneMaxY, 100),
  };
}

function getDragBounds(element) {
  if (readCsv(element.dataset.idleAllowedSurfaceKinds).length) {
    return {
      minX: 6,
      maxX: 94,
      minY: 28,
      maxY: 92,
    };
  }

  return getPlaneBounds(element);
}

function readPercent(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCsv(value) {
  return String(value || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

function readJsonDataset(value, fallback) {
  try {
    return JSON.parse(decodeURIComponent(value || ''));
  } catch {
    return fallback;
  }
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function roundPercent(value) {
  return Number.parseFloat(value.toFixed(2));
}

function toLocalPercent(value, min, max) {
  if (max === min) return 0.5;
  return Number.parseFloat(clamp((value - min) / (max - min), 0, 1).toFixed(3));
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
