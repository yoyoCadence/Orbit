import { getWorkspaceSceneAssets, ORBIT_WINDOW_LOGICAL_SIZE } from '../content/assetManifest.js';

const PIXI_MODULE_PATH = '../../../../vendor/pixi.js';

export function createPixiSceneRuntime(options = {}) {
  const loadPixi = options.loadPixi || (() => import(PIXI_MODULE_PATH));
  let pixi = null;
  let pixiLoadPromise = null;
  let app = null;
  let appInitPromise = null;
  let host = null;
  let tickerUpdate = null;
  let contextLostHandler = null;
  let contextRestoredHandler = null;
  let contextLost = false;
  let resumeAfterContextRestore = false;
  let latestModel = {};
  // INFRA-106: under reduced motion the stage never moves, so draw it once
  // instead of re-rendering an identical frame on every tick.
  let animating = true;
  let status = 'idle';
  let lifecycleRevision = 0;
  let renderRevision = 0;

  async function mount(nextHost, model = {}) {
    if (!nextHost) throw new Error('Orbit Window runtime host is required');
    const mountRevision = ++lifecycleRevision;
    host = nextHost;
    host.dataset.runtimeStatus = 'loading';
    host.closest('[data-orbit-window]')?.classList.remove('is-runtime-ready', 'is-runtime-fallback');

    try {
      if (!pixi) {
        pixiLoadPromise ||= loadPixi();
        pixi = await pixiLoadPromise;
      }
      if (mountRevision !== lifecycleRevision || host !== nextHost) return api;

      if (!app) {
        app = new pixi.Application();
        const initializingApp = app;
        const initPromise = app.init({
          width: ORBIT_WINDOW_LOGICAL_SIZE.width,
          height: ORBIT_WINDOW_LOGICAL_SIZE.height,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
          backgroundAlpha: 0,
          preference: 'webgl',
        });
        appInitPromise = initPromise;
        try {
          await initPromise;
        } catch (error) {
          if (app === initializingApp) {
            app = null;
            disposeApplication(initializingApp);
          }
          throw error;
        } finally {
          if (appInitPromise === initPromise) appInitPromise = null;
        }
        if (app !== initializingApp) return api;
        app.canvas.className = 'orbit-window-canvas';
        app.canvas.setAttribute('aria-hidden', 'true');
        // Pixi writes the logical renderer dimensions as inline CSS. Keep the
        // 960x640 backing coordinate system while fitting the visible canvas
        // to the responsive Orbit Window host.
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
      } else if (appInitPromise) {
        const initPromise = appInitPromise;
        await initPromise;
      }

      if (mountRevision !== lifecycleRevision || host !== nextHost) {
        app?.stop();
        return api;
      }

      if (app.canvas.parentElement !== host) host.appendChild(app.canvas);
      bindContextLifecycle();
      await render(model, mountRevision);
      if (mountRevision !== lifecycleRevision || host !== nextHost) return api;
      // PS-211B: a retained canvas still holds the previous room until the next
      // tick; draw the new stage now, before is-runtime-ready reveals it.
      app.render();
      if (animating) app.start();
      else app.stop();
      contextLost = false;
      status = 'ready';
      host.dataset.runtimeStatus = status;
      host.closest('[data-orbit-window]')?.classList.add('is-runtime-ready');
      return api;
    } catch (error) {
      if (mountRevision !== lifecycleRevision) return api;
      status = 'fallback';
      if (host) host.dataset.runtimeStatus = status;
      host?.closest('[data-orbit-window]')?.classList.add('is-runtime-fallback');
      throw error;
    }
  }

  async function render(model, expectedLifecycleRevision = lifecycleRevision) {
    if (!app || !pixi || !host) return;
    if (model !== undefined) latestModel = model;
    const renderModel = latestModel;
    const activeApp = app;
    const activeRenderRevision = ++renderRevision;

    const project = renderModel.activeProject || renderModel.project || {};
    const placements = renderModel.placements || renderModel.world?.placements || {};
    const protagonistState = renderModel.protagonist?.state || renderModel.playerState || 'idle';
    const companionState = renderModel.companion?.state || renderModel.companionState || 'observe';
    const weather = renderModel.weather || renderModel.world?.weather || 'clear';
    const visualState = {
      protagonist: {
        state: protagonistState,
        facing: renderModel.protagonist?.facing || renderModel.playerFacing,
      },
      companion: { state: companionState },
      weather,
      appearance: renderModel.appearance || renderModel.world?.appearance || null,
    };
    // PS-250E1: the time band picks the day or night room, as in the poster.
    // PS-250F: the decorations hidden in Edit Mode.
    const hiddenDecorations = renderModel.hiddenDecorations || renderModel.world?.hiddenDecorations;
    const sceneOptions = { timeBand: renderModel.timeBand, hiddenDecorations };
    // PS-250E2: the room style; the fallback is the default room.
    const chosen = getWorkspaceSceneAssets(project.progress || 0, placements, visualState, {
      ...sceneOptions,
      roomStyle: renderModel.selectedThemeId || renderModel.world?.selectedThemeId,
    });
    const fallback = getWorkspaceSceneAssets(
      project.progress || 0,
      placements,
      { ...visualState, appearance: null },
      sceneOptions,
    );
    // The day room is the last resort for the room: a night room that is not
    // cached (an interrupted update, offline) is drawn as the day room, as
    // before PS-250E1, instead of failing over to the poster.
    const dayFallback = getWorkspaceSceneAssets(project.progress || 0, placements, { ...visualState, appearance: null }, {
      hiddenDecorations,
    });
    // PS-250B/D: only the default style is precached. The room with its props,
    // the protagonist and the Companion load separately; a part that cannot
    // load (offline, not cached yet) is drawn from the default style and the
    // other parts stay as chosen. (The poster falls back per image, so with a
    // partly cached pixel room the two can differ until the next render.)
    const sceneryTiers = [chosen, fallback, dayFallback];
    const [scenery, protagonistPart, companionPart, chosenDecorations] = await Promise.all([
      loadPart(pixi, sceneryTiers.map(sceneryPaths)),
      loadPart(pixi, [[chosen.protagonist], [fallback.protagonist]]),
      loadPart(pixi, [[chosen.companion.path], [fallback.companion.path]]),
      loadEach(pixi, decorationPaths(chosen)),
    ]);
    const drawnScenery = sceneryTiers[scenery.tier];
    // PS-250F: the decorations of the room that is drawn. Each loads on its
    // own: one that cannot load is left out, and the room stays as it is.
    const decorations = drawnScenery.decorations || [];
    const decorationTextures = scenery.usedFallback
      ? await loadEach(pixi, decorationPaths(drawnScenery))
      : chosenDecorations;
    const scene = {
      ...chosen,
      ...(scenery.usedFallback ? { background: drawnScenery.background, props: drawnScenery.props } : {}),
      ...(protagonistPart.usedFallback
        ? { protagonist: fallback.protagonist, protagonistVariant: fallback.protagonistVariant }
        : {}),
      ...(companionPart.usedFallback ? { companion: fallback.companion } : {}),
    };
    const textures = {
      ...decorationTextures,
      ...scenery.textures,
      ...protagonistPart.textures,
      ...companionPart.textures,
    };
    // PS-250D: pixel images keep hard pixel edges when the stage is scaled.
    if (chosen.appearance?.style === 'pixel') {
      const pixelPaths = [
        ...(scenery.usedFallback ? [] : [
          chosen.background,
          ...chosen.props.map(entry => entry.path),
          ...decorationPaths(chosen),
        ]),
        ...(protagonistPart.usedFallback ? [] : [chosen.protagonist]),
        ...(companionPart.usedFallback ? [] : [chosen.companion.path]),
      ];
      pixelPaths.forEach(path => useNearestSampling(textures[path]));
    }
    if (
      activeApp !== app
      || activeRenderRevision !== renderRevision
      || expectedLifecycleRevision !== lifecycleRevision
    ) return;

    if (tickerUpdate) {
      app.ticker.remove(tickerUpdate);
      tickerUpdate = null;
    }

    const oldChildren = app.stage.removeChildren();
    oldChildren.forEach(child => child.destroy({ children: true }));
    app.stage.sortableChildren = true;

    const background = new pixi.Sprite(textures[scene.background]);
    const backgroundCover = getCoverTransform(
      background.texture.width,
      background.texture.height,
    );
    background.anchor.set(0.5);
    background.x = backgroundCover.x;
    background.y = backgroundCover.y;
    background.scale.set(backgroundCover.scale);
    background.zIndex = 0;
    app.stage.addChild(background);

    scene.props.forEach(entry => {
      const sprite = new pixi.Sprite(textures[entry.path]);
      applyPlacement(sprite, entry.placement);
      app.stage.addChild(sprite);
    });

    decorations.filter(entry => decorationTextures[entry.path]).forEach(entry => {
      const sprite = new pixi.Sprite(textures[entry.path]);
      applyPlacement(sprite, entry.placement);
      sprite.label = `orbit-decoration-${entry.id}`;
      app.stage.addChild(sprite);
    });

    const protagonist = new pixi.Sprite(textures[scene.protagonist]);
    applyPlacement(protagonist, scene.protagonistPlacement);
    protagonist.label = 'orbit-protagonist';
    app.stage.addChild(protagonist);

    const companion = new pixi.Sprite(textures[scene.companion.path]);
    applyPlacement(companion, scene.companionPlacement);
    companion.label = 'orbit-companion';
    app.stage.addChild(companion);

    const weatherOverlay = scene.weatherOverlay
      ? buildWeatherOverlay(pixi, textures[scene.weatherOverlay], scene.weatherVariant.state)
      : null;
    if (weatherOverlay) app.stage.addChild(weatherOverlay);

    const timeBand = renderModel.timeBand || 'day';
    // PS-250E1: the night room is already dark, so its layer only tints the
    // characters and weather toward it. A scene without `lighting` (an older
    // assetManifest.js), or the day room drawn as the last resort, keeps the
    // full night layer.
    const nightRoom = drawnScenery.lighting === 'night';
    const lightingLayer = nightRoom
      ? { color: 0x172449, alpha: 0.1 }
      : { color: timeBand === 'night' ? 0x172449 : 0xf6d58b, alpha: timeBand === 'night' ? 0.2 : 0.05 };
    const lighting = new pixi.Graphics()
      .rect(0, 0, ORBIT_WINDOW_LOGICAL_SIZE.width, ORBIT_WINDOW_LOGICAL_SIZE.height)
      .fill(lightingLayer);
    lighting.zIndex = 80;
    app.stage.addChild(lighting);
    app.stage.sortChildren();

    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    animating = !reducedMotion;
    if (protagonistState === 'inspect') protagonist.rotation += -0.025;
    if (protagonistState === 'rest') protagonist.alpha = 0.88;
    if (companionState === 'rest') companion.alpha = 0.72;
    if (!reducedMotion) {
      let elapsed = 0;
      const protagonistX = protagonist.x;
      const protagonistY = protagonist.y;
      const companionX = companion.x;
      const companionY = companion.y;
      const weatherX = weatherOverlay?.x || 0;
      const weatherY = weatherOverlay?.y || 0;
      const protagonistRotation = protagonist.rotation;
      tickerUpdate = ticker => {
        elapsed += ticker.deltaMS;
        // The view model decides when the protagonist celebrates; an undone
        // Session or a reward that is not progress does not (BUG-113).
        const celebrate = protagonistState === 'celebrate';
        const stateSpeed = protagonistState === 'rest' ? 1100 : protagonistState === 'work' ? 340 : 600;
        const stateLift = celebrate ? 6 : protagonistState === 'rest' ? 0.6 : protagonistState === 'work' ? 2.2 : 1.5;
        protagonist.y = protagonistY + Math.sin(elapsed / (celebrate ? 110 : stateSpeed)) * stateLift;
        protagonist.x = protagonistX + (protagonistState === 'work' ? Math.sin(elapsed / 480) * 1.8 : 0);
        protagonist.rotation = protagonistRotation
          + (protagonistState === 'inspect' ? Math.sin(elapsed / 520) * 0.025 : 0);

        const companionApproach = companionState === 'approach' || companionState === 'remind';
        const approachOffset = companionApproach ? Math.max(0, 20 - elapsed / 45) : 0;
        const companionLift = companionState === 'congratulate' ? 4.5 : companionState === 'rest' ? 1 : 2;
        companion.x = companionX + approachOffset + Math.sin(elapsed / 520) * 3;
        companion.y = companionY + Math.sin(elapsed / (companionState === 'congratulate' ? 180 : 720)) * companionLift;
        companion.rotation = Math.sin(elapsed / 700) * (companionState === 'work' ? 0.025 : 0.05);
        if (weatherOverlay) {
          const weatherSpeed = scene.weatherVariant.state === 'rain' ? 220 : 1200;
          const weatherDrift = scene.weatherVariant.state === 'rain' ? 3 : 1.5;
          weatherOverlay.x = weatherX + Math.sin(elapsed / (weatherSpeed * 1.7)) * weatherDrift;
          weatherOverlay.y = weatherY + Math.sin(elapsed / weatherSpeed) * weatherDrift;
        }
      };
      app.ticker.add(tickerUpdate);
    }
    // A still stage has no ticker to pick up the change; draw it now.
    if (!animating && status === 'ready') app.render();
  }

  function suspend() {
    if (app?.ticker) app.stop();
    if (contextLost) resumeAfterContextRestore = false;
    if (status === 'ready' || status === 'loading') status = 'suspended';
    if (host) host.dataset.runtimeStatus = status;
  }

  function resume() {
    if (contextLost && status === 'fallback') {
      resumeAfterContextRestore = true;
      return;
    }
    if (!app?.ticker || !host || status === 'fallback' || status === 'destroyed') return;
    if (animating) app.start();
    else app.render();
    status = 'ready';
    if (host) host.dataset.runtimeStatus = status;
  }

  function release(releasedHost) {
    if (releasedHost && releasedHost !== host) return;
    const previousHost = host;
    const isInitializing = Boolean(appInitPromise);
    lifecycleRevision += 1;
    renderRevision += 1;
    if (isInitializing) status = 'suspended';
    else suspend();
    if (!isInitializing && app) {
      let canvas = null;
      try { canvas = app.canvas; } catch { /* Pixi has no renderer before init. */ }
      if (canvas?.parentElement === previousHost) previousHost.removeChild(canvas);
    }
    host = null;
    status = app ? 'suspended' : 'idle';
  }

  function destroy() {
    lifecycleRevision += 1;
    renderRevision += 1;
    const destroyedApp = app;
    const pendingInit = appInitPromise;
    const disposal = {
      tickerHandler: tickerUpdate,
      lostHandler: contextLostHandler,
      restoredHandler: contextRestoredHandler,
    };
    app = null;
    appInitPromise = null;
    host = null;
    tickerUpdate = null;
    contextLostHandler = null;
    contextRestoredHandler = null;
    contextLost = false;
    resumeAfterContextRestore = false;
    latestModel = {};
    status = 'destroyed';

    if (!destroyedApp) return;
    if (pendingInit) {
      // Pixi's Application.canvas and destroy() require a renderer, which does
      // not exist until init settles. Invalidate immediately, then dispose the
      // captured instance after the pending init can no longer race a route.
      void Promise.resolve(pendingInit).then(
        () => disposeApplication(destroyedApp, disposal),
        () => disposeApplication(destroyedApp, disposal),
      );
      return;
    }
    disposeApplication(destroyedApp, disposal);
  }

  function bindContextLifecycle() {
    if (!app || contextLostHandler) return;
    contextLostHandler = event => {
      event.preventDefault();
      if (!contextLost) {
        resumeAfterContextRestore = status === 'ready' || status === 'loading';
      }
      contextLost = true;
      renderRevision += 1;
      if (app?.ticker) app.stop();
      status = 'fallback';
      if (host) host.dataset.runtimeStatus = status;
      host?.closest('[data-orbit-window]')?.classList.remove('is-runtime-ready');
      host?.closest('[data-orbit-window]')?.classList.add('is-runtime-fallback');
    };
    contextRestoredHandler = async () => {
      if (!contextLost || !app || !host || status === 'destroyed') return;
      const restoreApp = app;
      const restoreHost = host;
      const restoreLifecycleRevision = lifecycleRevision;
      const shouldResume = resumeAfterContextRestore;
      contextLost = false;
      status = 'loading';
      restoreHost.dataset.runtimeStatus = status;

      try {
        await render(latestModel, restoreLifecycleRevision);
        if (
          restoreApp !== app
          || restoreHost !== host
          || restoreLifecycleRevision !== lifecycleRevision
        ) return;
        // suspend() or resume() may have run while the stage reloaded; the
        // latest call wins over the state captured when the context was lost.
        const resumeNow = status === 'loading' ? shouldResume : status === 'ready';
        restoreApp.render();
        if (resumeNow && animating) restoreApp.start();
        else restoreApp.stop();
        status = resumeNow ? 'ready' : 'suspended';
        restoreHost.dataset.runtimeStatus = status;
        restoreHost.closest('[data-orbit-window]')?.classList.remove('is-runtime-fallback');
        restoreHost.closest('[data-orbit-window]')?.classList.add('is-runtime-ready');
      } catch {
        if (
          restoreApp !== app
          || restoreHost !== host
          || restoreLifecycleRevision !== lifecycleRevision
        ) return;
        status = 'fallback';
        restoreHost.dataset.runtimeStatus = status;
        restoreHost.closest('[data-orbit-window]')?.classList.remove('is-runtime-ready');
        restoreHost.closest('[data-orbit-window]')?.classList.add('is-runtime-fallback');
      }
    };
    app.canvas.addEventListener('webglcontextlost', contextLostHandler);
    app.canvas.addEventListener('webglcontextrestored', contextRestoredHandler);
  }

  const api = {
    mount,
    render,
    suspend,
    resume,
    release,
    destroy,
    getStatus: () => status,
    getApplication: () => app,
  };
  return api;
}

function disposeApplication(application, options = {}) {
  if (!application) return;
  const { tickerHandler, lostHandler, restoredHandler } = options;
  try {
    if (tickerHandler && application.ticker) application.ticker.remove(tickerHandler);
  } catch { /* Best-effort cleanup for a partially initialized renderer. */ }

  let canvas = null;
  try { canvas = application.canvas; } catch { /* Renderer was never created. */ }
  try {
    if (canvas && lostHandler) canvas.removeEventListener('webglcontextlost', lostHandler);
    if (canvas && restoredHandler) canvas.removeEventListener('webglcontextrestored', restoredHandler);
  } catch { /* Detached or partially initialized canvas. */ }

  try {
    application.destroy(
      { removeView: true },
      { children: true, texture: false, textureSource: false, context: true },
    );
  } catch { /* Pixi init may have failed before renderer allocation. */ }
}

export const orbitWindowRuntime = createPixiSceneRuntime();

export function createDeferredRuntimeDestroyer(runtime, timers = globalThis) {
  let timerId = null;
  let holds = 0;
  let destroyWhenReleased = false;

  function retain() {
    destroyWhenReleased = false;
    if (timerId === null) return;
    timers.clearTimeout(timerId);
    timerId = null;
  }

  return {
    retain,
    schedule(delayMs = 0) {
      if (timerId !== null || destroyWhenReleased) return;
      timerId = timers.setTimeout(() => {
        timerId = null;
        if (holds > 0) destroyWhenReleased = true;
        else runtime.destroy();
      }, delayMs);
    },
    // PS-211B: Home's cleanup schedules destruction, then the router awaits the
    // lazy full-World route before that page mounts and retains the runtime. A
    // hold keeps a scheduled destruction waiting until the route has rendered,
    // however long the import takes; if nothing retained the runtime by then,
    // releasing the last hold destroys it.
    hold() {
      holds += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0 && destroyWhenReleased) {
          destroyWhenReleased = false;
          runtime.destroy();
        }
      };
    },
    destroyNow() {
      retain();
      runtime.destroy();
    },
    isScheduled: () => timerId !== null || destroyWhenReleased,
  };
}

export const orbitWindowRuntimeDestroyer = createDeferredRuntimeDestroyer(orbitWindowRuntime);

export function getCoverTransform(
  sourceWidth,
  sourceHeight,
  targetWidth = ORBIT_WINDOW_LOGICAL_SIZE.width,
  targetHeight = ORBIT_WINDOW_LOGICAL_SIZE.height,
) {
  const safeSourceWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : targetWidth;
  const safeSourceHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : targetHeight;
  return {
    x: targetWidth / 2,
    y: targetHeight / 2,
    scale: Math.max(targetWidth / safeSourceWidth, targetHeight / safeSourceHeight),
  };
}

function useNearestSampling(texture) {
  const source = texture?.source;
  if (!source || source.scaleMode === 'nearest') return;
  source.scaleMode = 'nearest';
  source.style?.update?.();
}

function sceneryPaths(scene) {
  return [scene.background, scene.weatherOverlay, ...scene.props.map(entry => entry.path)].filter(Boolean);
}

function decorationPaths(scene) {
  return (scene.decorations || []).map(entry => entry.path);
}

// Loads each path on its own; the result has only the textures that loaded.
async function loadEach(pixi, paths) {
  const loaded = await Promise.all(paths.map(path => pixi.Assets.load([path]).then(
    textures => [path, textures[path]],
    () => null,
  )));
  return Object.fromEntries(loaded.filter(Boolean));
}

// Loads the first tier of paths that loads; a tier identical to an earlier
// one is not retried. `tier` is the index of the tier drawn.
async function loadPart(pixi, tiers) {
  let failure;
  for (const [tier, paths] of tiers.entries()) {
    const tried = tiers.slice(0, tier).some(earlier => (
      earlier.length === paths.length && earlier.every((path, index) => path === paths[index])
    ));
    if (tried) continue;
    try {
      return { textures: await pixi.Assets.load(paths), tier, usedFallback: tier > 0 };
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

function applyPlacement(sprite, placement = {}) {
  const anchor = placement.anchor === 'center' ? 0.5 : 1;
  sprite.anchor.set(0.5, anchor);
  sprite.x = toLogicalX(placement.x ?? 50);
  sprite.y = toLogicalY(placement.y ?? 50);
  const targetWidth = ORBIT_WINDOW_LOGICAL_SIZE.width * ((toNumber(placement.width, 10)) / 100);
  sprite.scale.set((targetWidth / Math.max(1, sprite.texture.width)) * toNumber(placement.scale, 1));
  sprite.rotation = toNumber(placement.rotation, 0) * (Math.PI / 180);
  sprite.zIndex = toNumber(placement.z, 1);
}

function buildWeatherOverlay(PIXI, texture, state) {
  const sprite = new PIXI.Sprite(texture);
  const cover = getCoverTransform(texture?.width, texture?.height);
  sprite.anchor.set(0.5);
  sprite.x = cover.x;
  sprite.y = cover.y;
  sprite.scale.set(cover.scale);
  sprite.label = `orbit-weather-${state}`;
  sprite.zIndex = 72;
  sprite.alpha = state === 'rain' ? 0.5 : 0.34;
  return sprite;
}

function toLogicalX(percent) {
  return ORBIT_WINDOW_LOGICAL_SIZE.width * toNumber(percent, 50) / 100;
}

function toLogicalY(percent) {
  return ORBIT_WINDOW_LOGICAL_SIZE.height * toNumber(percent, 50) / 100;
}

function toNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
