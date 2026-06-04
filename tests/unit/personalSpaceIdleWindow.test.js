/**
 * @vitest-environment jsdom
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { buildIdleWindowCameraState, buildIdleWindowPlacementState, rectsOverlap } from '../../pwa/js/personalSpace/idleWindow/editorRuntime.js';
import {
  buildIdleWindowViewModel,
  buildIdleWindowVariantGenerationQueue,
  getDefaultIdleWindowLayoutForStage,
  getIdleWindowBackground,
  getIdleWindowCharacter,
  getIdleWindowLayoutAssetIds,
  getIdleWindowProp,
  getIdleWindowVariantReadiness,
  idleWindowAssetRegistry,
  renderIdleWindow,
} from '../../pwa/js/personalSpace/idleWindow/index.js';

describe('personal space idle window contract', () => {
  it('builds an additive building-stage idle window view model', () => {
    const model = buildIdleWindowViewModel({ totalXP: 600 });

    expect(model.id).toBe('personal-space-idle-window');
    expect(model.stage).toBe('building');
    expect(model.prototypeFallback).toBe(false);
    expect(model.layout.id).toBe('building-office-prototype');
    expect(model.layout.visualModel).toBe('layered_raster');
    expect(model.layout.runtimeObjectModel).toBe('separate_props');
    expect(model.assets.backgrounds.some(asset => asset.id === 'office-angle-center-v2')).toBe(true);
    expect(model.assets.characters[0].id).toBe('building-protagonist-idle');
    expect(model.assets.props.some(prop => prop.id === 'office-corner-desk-v3')).toBe(true);
  });

  it('uses stage-specific background profiles for survival and mastery', () => {
    const survival = buildIdleWindowViewModel({ totalXP: 0 });
    const mastery = buildIdleWindowViewModel({ totalXP: 10000 });

    expect(survival.prototypeFallback).toBe(false);
    expect(mastery.prototypeFallback).toBe(false);
    expect(survival.layout.backgroundAssetId).toBe('survival-rental-center');
    expect(mastery.layout.backgroundAssetId).toBe('mastery-estate-center');
    expect(getDefaultIdleWindowLayoutForStage('building').id).toBe('building-office-prototype');
  });

  it('resolves every layout asset id to a registered asset', () => {
    const layout = getDefaultIdleWindowLayoutForStage('building');
    const assetIds = getIdleWindowLayoutAssetIds(layout);

    expect(assetIds.backgrounds.map(getIdleWindowBackground).every(Boolean)).toBe(true);
    expect(assetIds.props.map(getIdleWindowProp).every(Boolean)).toBe(true);
    expect(assetIds.characters.map(getIdleWindowCharacter).every(Boolean)).toBe(true);
  });

  it('points registered prototype assets at files that exist in the PWA asset tree', () => {
    Object.values(idleWindowAssetRegistry).forEach(collection => {
      Object.values(collection).forEach(asset => {
        expect(fileExists(asset.path), asset.path).toBe(true);
        asset.variants?.forEach(variant => {
          expect(fileExists(variant.path), variant.path).toBe(true);
        });
        if (asset.previewPath) expect(fileExists(asset.previewPath), asset.previewPath).toBe(true);
        asset.framePaths?.forEach(framePath => {
          expect(fileExists(framePath), framePath).toBe(true);
        });
      });
    });
  });

  it('defines a four-frame idle protagonist sprite contract', () => {
    const character = getIdleWindowCharacter('building-protagonist-idle');

    expect(character.sheet).toEqual({
      rows: 2,
      cols: 2,
      frameWidth: 128,
      frameHeight: 128,
      durationMs: 240,
    });
    expect(character.framePaths).toHaveLength(4);
    expect(character.qc).toBe('passed');
  });

  it('renders the idle window as a separate layered stage', () => {
    const model = buildIdleWindowViewModel({ totalXP: 600 });
    const markup = renderIdleWindow(model);
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(host.querySelector('.space-idle-window')).not.toBeNull();
    expect(host.querySelector('.space-idle-window')?.dataset.idleLayoutId).toBe('building-office-prototype');
    expect(host.querySelector('.space-idle-background')?.getAttribute('src')).toContain('office-angle-center-v2.png');
    expect(host.querySelector('[data-idle-character-id="building-protagonist-idle"]')?.getAttribute('src')).toContain('animation.gif');
    expect(host.querySelector('[data-idle-prop-id="corner-desk"]')).not.toBeNull();
    expect(host.querySelector('[data-idle-prop-id="corner-desk"]')?.dataset.idleDraggable).toBe('false');
    expect(host.querySelector('[data-idle-plane="floor-main"]')).not.toBeNull();
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idlePlaneId).toBe('desktop-main');
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idleParentItemId).toBe('corner-desk');
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idleSurfaceId).toBe('desktop');
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idleCanRotate).toBe('true');
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idleCanChangeVariant).toBe('true');
    expect(host.querySelector('.space-idle-window')?.dataset.idleCameraProfileId).toBe('center');
    expect(host.querySelector('.space-idle-window')?.dataset.idleBackgroundAssets).toContain('office-angle-left-v2');
    expect(host.querySelector('[data-idle-prop-id="corner-desk"]')?.dataset.idleCharacterAnchors).toContain('desk-work');
    expect(host.querySelector('[data-idle-prop-id="desk-lamp"]')).toBeNull();
    expect(host.textContent).toContain('Idle Growth Window');
  });

  it('can render expanded edit-mode props as draggable layers', () => {
    const model = buildIdleWindowViewModel({ totalXP: 600 });
    const markup = renderIdleWindow(model, { variant: 'expanded', isEditing: true });
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(host.querySelector('.space-idle-window--expanded')).not.toBeNull();
    expect(host.querySelector('.space-idle-window')?.classList.contains('is-editing')).toBe(true);
    expect(host.querySelector('[data-idle-prop-id="single-monitor"]')?.dataset.idleDraggable).toBe('true');
  });

  it('applies saved idle-window placement overrides without mutating the base layout', () => {
    const model = buildIdleWindowViewModel(
      { totalXP: 600 },
      {
        idleWindowLayouts: {
          'building-office-prototype': {
            placements: {
              'single-monitor': { x: '44%', y: '74%', width: '11%', rotation: 10, variantId: 'mirror-test', anchor: 'center-bottom' },
            },
          },
        },
      }
    );
    const monitor = findLayoutItem(model.layout, 'single-monitor');
    const baseMonitor = findLayoutItem(getDefaultIdleWindowLayoutForStage('building'), 'single-monitor');

    expect(monitor.placement).toMatchObject({ width: '11%', rotation: 10, variantId: 'mirror-test' });
    expect(monitor.placement.x).toBeCloseTo(39.24);
    expect(monitor.placement.y).toBeCloseTo(69.22);
    expect(baseMonitor.placement).toMatchObject({
      parentItemId: 'corner-desk',
      surfaceId: 'desktop',
      localX: 0.42,
      localY: 0.58,
      width: 10,
    });
  });

  it('persists editor visibility as idle placement state without removing the asset', () => {
    const model = buildIdleWindowViewModel(
      { totalXP: 600 },
      {
        idleWindowLayouts: {
          'building-office-prototype': {
            placements: {
              'corner-desk': { hidden: true },
            },
          },
        },
      }
    );
    const markup = renderIdleWindow(model, { variant: 'expanded', isEditing: true });
    const host = document.createElement('div');
    host.innerHTML = markup;
    const desk = host.querySelector('[data-idle-prop-id="corner-desk"]');

    expect(findLayoutItem(model.layout, 'corner-desk').placement.hidden).toBe(true);
    expect(desk).not.toBeNull();
    expect(desk?.dataset.idleHidden).toBe('true');
    expect(desk?.classList.contains('is-hidden-by-editor')).toBe(true);
  });

  it('resolves supported desktop props from the parent furniture surface', () => {
    const model = buildIdleWindowViewModel({ totalXP: 600 });
    const monitor = findLayoutItem(model.layout, 'single-monitor');

    expect(monitor.placement).toMatchObject({
      parentItemId: 'corner-desk',
      surfaceId: 'desktop',
      localX: 0.42,
      localY: 0.58,
    });
    expect(monitor.placement.x).toBeCloseTo(39.24);
    expect(monitor.placement.y).toBeCloseTo(69.22);
    expect(monitor.resolvedSupportSurface.bounds).toEqual({
      minX: 30,
      maxX: 52,
      minY: 64,
      maxY: 73,
    });
  });

  it('pairs true camera backgrounds with perspective-correct desk variants', () => {
    const model = buildIdleWindowViewModel(
      { totalXP: 1800 },
      {
        idleWindowLayouts: {
          'building-office-prototype': {
            cameraProfileId: 'left',
          },
        },
      }
    );
    const markup = renderIdleWindow(model);
    const host = document.createElement('div');
    host.innerHTML = markup;
    const desk = findLayoutItem(model.layout, 'corner-desk');
    const rug = findLayoutItem(model.layout, 'pattern-rug');
    const sofa = findLayoutItem(model.layout, 'leather-sofa');
    const coffeeTable = findLayoutItem(model.layout, 'low-coffee-table');
    const shelf = findLayoutItem(model.layout, 'office-shelf');
    const trophyDisplay = findLayoutItem(model.layout, 'trophy-display');

    expect(model.layout.activeCameraProfile.backgroundAssetId).toBe('office-angle-left-v2');
    expect(desk.placement.variantId).toBe('left-wall-flush');
    expect(rug.placement.variantId).toBe('left-wall-flush');
    expect(sofa.placement.variantId).toBe('left-wall-flush');
    expect(coffeeTable.placement.variantId).toBe('left-wall-flush');
    expect(shelf.placement.variantId).toBe('left-wall-flush');
    expect(trophyDisplay.placement.variantId).toBe('left-wall-flush');
    expect(host.querySelector('.space-idle-background')?.getAttribute('src')).toContain('office-angle-left-v2.png');
    expect(host.querySelector('[data-idle-prop-id="corner-desk"]')?.getAttribute('src')).toContain('left-wall-flush.png');
    expect(host.querySelector('[data-idle-prop-id="leather-sofa"]')?.getAttribute('src')).toContain('office-leather-sofa/left-wall-flush.png');
    expect(host.querySelector('[data-idle-prop-id="low-coffee-table"]')?.getAttribute('src')).toContain('office-low-coffee-table/left-wall-flush.png');
    expect(host.querySelector('[data-idle-prop-id="trophy-display"]')?.getAttribute('src')).toContain('office-trophy-display/left-wall-flush.png');
  });

  it('tracks controlled generation readiness for large furniture variants', () => {
    const queue = buildIdleWindowVariantGenerationQueue();
    const deskReadiness = getIdleWindowVariantReadiness('office-corner-desk-v3');
    const sofaReadiness = getIdleWindowVariantReadiness('office-leather-sofa');
    const coffeeTableReadiness = getIdleWindowVariantReadiness('office-low-coffee-table');
    const rugReadiness = getIdleWindowVariantReadiness('office-pattern-rug');
    const trophyDisplayReadiness = getIdleWindowVariantReadiness('office-trophy-display');
    const shelfReadiness = getIdleWindowVariantReadiness('office-shelf');
    const queuedAssetIds = queue.map(item => item.assetId);

    expect(deskReadiness.ready).toBe(true);
    expect(sofaReadiness.ready).toBe(true);
    expect(coffeeTableReadiness.ready).toBe(true);
    expect(rugReadiness.ready).toBe(true);
    expect(trophyDisplayReadiness.ready).toBe(true);
    expect(shelfReadiness.ready).toBe(true);
    expect(queuedAssetIds).not.toContain('office-corner-desk-v3');
    expect(queuedAssetIds).not.toContain('office-leather-sofa');
    expect(queuedAssetIds).not.toContain('office-low-coffee-table');
    expect(queuedAssetIds).not.toContain('office-pattern-rug');
    expect(queuedAssetIds).not.toContain('office-trophy-display');
    expect(queuedAssetIds).not.toContain('office-shelf');
    expect(queuedAssetIds).toEqual([
      'office-tall-bookcase',
      'office-filing-cabinet',
    ]);
    expect(queue[0]).toMatchObject({
      assetId: 'office-tall-bookcase',
      missingVariantIds: ['left-wall-flush', 'right-wall-flush'],
      nonFinalVariantIds: ['front'],
      layoutCritical: false,
    });
  });

  it('moves desktop children when the parent desk placement changes', () => {
    const model = buildIdleWindowViewModel(
      { totalXP: 600 },
      {
        idleWindowLayouts: {
          'building-office-prototype': {
            placements: {
              'corner-desk': { x: '48%', y: '80%', width: '33%', anchor: 'center-bottom' },
            },
          },
        },
      }
    );
    const monitor = findLayoutItem(model.layout, 'single-monitor');

    expect(monitor.placement.x).toBeCloseTo(45.24);
    expect(monitor.placement.y).toBeCloseTo(66.22);
  });

  it('defines shelf surfaces and free-snap metadata for small props', () => {
    const model = buildIdleWindowViewModel({ totalXP: 1200 });
    const shelf = findLayoutItem(model.layout, 'office-shelf');
    const plantMarkup = renderIdleWindow(model, { variant: 'expanded', isEditing: true });
    const host = document.createElement('div');
    host.innerHTML = plantMarkup;

    expect(shelf.supportSurfaces.map(surface => surface.id)).toEqual(['top', 'middle']);
    expect(host.querySelector('[data-idle-prop-id="office-plant"]')?.dataset.idleAllowedSurfaceKinds).toBe('floor,shelf');
    expect(host.querySelector('[data-idle-prop-id="office-shelf"]')?.dataset.idleSupportSurfaces).toContain('Shelf%20top');
  });

  it('keeps the protagonist anchored to moved furniture', () => {
    const model = buildIdleWindowViewModel(
      { totalXP: 600 },
      {
        idleWindowLayouts: {
          'building-office-prototype': {
            placements: {
              'corner-desk': { x: '48%', y: '80%', width: '33%', anchor: 'center-bottom' },
            },
          },
        },
      }
    );
    const character = model.layout.layers.find(layer => layer.type === 'character');

    expect(character.placement.x).toBeCloseTo(60);
    expect(character.placement.y).toBeCloseTo(85);
    expect(character.resolvedCharacterAnchor).toMatchObject({
      itemId: 'corner-desk',
      anchorId: 'desk-work',
    });
  });

  it('builds independent idle placement state for editor saves', () => {
    const nextState = buildIdleWindowPlacementState(
      { selectedSceneId: 'office-corner', placedItems: [] },
      'building-office-prototype',
      'corner-desk',
      { x: '43%', y: '84%', width: '33%', z: 24, rotation: -15, variantId: 'mirror-test', planeId: 'floor-main', anchor: 'center-bottom' }
    );

    expect(nextState.placedItems).toEqual([]);
    expect(nextState.idleWindowLayouts['building-office-prototype'].placements['corner-desk']).toEqual({
      x: '43%',
      y: '84%',
      width: '33%',
      z: 24,
      rotation: -15,
      variantId: 'mirror-test',
      planeId: 'floor-main',
      anchor: 'center-bottom',
    });
  });

  it('builds independent camera profile state for editor saves', () => {
    const nextState = buildIdleWindowCameraState(
      { selectedSceneId: 'office-corner', idleWindowLayouts: {} },
      'building-office-prototype',
      'left'
    );

    expect(nextState.selectedSceneId).toBe('office-corner');
    expect(nextState.idleWindowLayouts['building-office-prototype'].cameraProfileId).toBe('left');
  });

  it('detects footprint overlap without persisting invalid state by itself', () => {
    expect(rectsOverlap(
      { minX: 10, maxX: 20, minY: 10, maxY: 20 },
      { minX: 18, maxX: 26, minY: 12, maxY: 22 }
    )).toBe(true);
    expect(rectsOverlap(
      { minX: 10, maxX: 20, minY: 10, maxY: 20 },
      { minX: 22, maxX: 30, minY: 12, maxY: 22 }
    )).toBe(false);
  });

  it('does not mark stages with production background sets as prototype visuals', () => {
    const model = buildIdleWindowViewModel({ totalXP: 0 });
    const markup = renderIdleWindow(model);
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(model.prototypeFallback).toBe(false);
    expect(host.querySelector('.space-idle-badge')).toBeNull();
  });

  it('unlocks higher-level idle props without changing the layout contract', () => {
    const model = buildIdleWindowViewModel({ totalXP: 1200 });
    const markup = renderIdleWindow(model);
    const host = document.createElement('div');
    host.innerHTML = markup;

    expect(model.level).toBeGreaterThanOrEqual(15);
    expect(host.querySelector('[data-idle-prop-id="desk-lamp"]')).not.toBeNull();
    expect(host.querySelector('[data-idle-prop-id="coffee-cup"]')).not.toBeNull();
  });
});

function findLayoutItem(layout, itemId) {
  return layout.layers
    .filter(layer => layer.type === 'props')
    .flatMap(layer => layer.items)
    .find(item => item.id === itemId);
}

function fileExists(assetPath) {
  return existsSync(resolve(process.cwd(), 'pwa', assetPath));
}
