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
      app.start();
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
    const scene = getWorkspaceSceneAssets(project.progress || 0, placements);
    const assetPaths = [scene.background, scene.protagonist, ...scene.props.map(entry => entry.path)];
    const textures = await pixi.Assets.load(assetPaths);
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

    const protagonist = new pixi.Sprite(textures[scene.protagonist]);
    applyPlacement(protagonist, scene.protagonistPlacement);
    protagonist.label = 'orbit-protagonist';
    app.stage.addChild(protagonist);

    const companion = buildCompanion(pixi, scene.companion);
    applyPointPlacement(companion, scene.companionPlacement);
    companion.label = 'orbit-companion';
    companion.zIndex = scene.companionPlacement.z || 42;
    app.stage.addChild(companion);

    const weather = renderModel.weather || renderModel.world?.weather || 'clear';
    const weatherOverlay = weather === 'rain' ? buildRainOverlay(pixi) : null;
    if (weatherOverlay) app.stage.addChild(weatherOverlay);

    const timeBand = renderModel.timeBand || 'day';
    const lighting = new pixi.Graphics()
      .rect(0, 0, ORBIT_WINDOW_LOGICAL_SIZE.width, ORBIT_WINDOW_LOGICAL_SIZE.height)
      .fill({ color: timeBand === 'night' ? 0x172449 : 0xf6d58b, alpha: timeBand === 'night' ? 0.2 : 0.05 });
    lighting.zIndex = 80;
    app.stage.addChild(lighting);
    app.stage.sortChildren();

    const protagonistState = renderModel.protagonist?.state || renderModel.playerState || 'idle';
    const companionState = renderModel.companion?.state || renderModel.companionState || 'observe';
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const shouldCelebrate = Boolean(renderModel.pendingReveal || renderModel.world?.pendingReveal);
    if (protagonistState === 'inspect') protagonist.rotation += -0.025;
    if (protagonistState === 'rest') protagonist.alpha = 0.88;
    if (companionState === 'rest') companion.alpha = 0.72;
    if (!reducedMotion) {
      let elapsed = 0;
      const protagonistX = protagonist.x;
      const protagonistY = protagonist.y;
      const companionX = companion.x;
      const companionY = companion.y;
      const protagonistRotation = protagonist.rotation;
      tickerUpdate = ticker => {
        elapsed += ticker.deltaMS;
        const celebrate = shouldCelebrate || protagonistState === 'celebrate';
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
        if (weatherOverlay) weatherOverlay.y = (elapsed / 24) % 32 - 16;
      };
      app.ticker.add(tickerUpdate);
    }
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
    app.start();
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
        if (shouldResume) restoreApp.start();
        else restoreApp.stop();
        status = shouldResume ? 'ready' : 'suspended';
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

  function retain() {
    if (timerId === null) return;
    timers.clearTimeout(timerId);
    timerId = null;
  }

  return {
    retain,
    schedule(delayMs = 0) {
      if (timerId !== null) return;
      timerId = timers.setTimeout(() => {
        timerId = null;
        runtime.destroy();
      }, delayMs);
    },
    destroyNow() {
      retain();
      runtime.destroy();
    },
    isScheduled: () => timerId !== null,
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

function applyPointPlacement(container, placement = {}) {
  container.x = toLogicalX(placement.x ?? 50);
  container.y = toLogicalY(placement.y ?? 50);
  const scale = toNumber(placement.width, 7) / 7;
  container.scale.set(scale);
}

function buildCompanion(PIXI, definition = {}) {
  const container = new PIXI.Container();
  const halo = new PIXI.Graphics().circle(0, 0, 30).fill({ color: definition.color || 0x8bd5ff, alpha: 0.16 });
  const ring = new PIXI.Graphics().circle(0, 0, 18).stroke({ color: definition.accent || 0xf6d58b, width: 3, alpha: 0.9 });
  const core = new PIXI.Graphics().circle(0, 0, 13).fill({ color: definition.color || 0x8bd5ff, alpha: 0.96 });
  const eyeLeft = new PIXI.Graphics().circle(-4, -1, 1.7).fill({ color: 0x14213d });
  const eyeRight = new PIXI.Graphics().circle(4, -1, 1.7).fill({ color: 0x14213d });
  container.addChild(halo, ring, core, eyeLeft, eyeRight);
  return container;
}

function buildRainOverlay(PIXI) {
  const container = new PIXI.Container();
  container.label = 'orbit-weather-rain';
  container.zIndex = 72;
  container.alpha = 0.46;
  for (let index = 0; index < 18; index += 1) {
    const drop = new PIXI.Graphics()
      .rect(0, 0, index % 3 === 0 ? 2 : 1, 18 + (index % 4) * 5)
      .fill({ color: 0xcde7ff, alpha: 0.72 });
    drop.x = (index * 137 + 41) % ORBIT_WINDOW_LOGICAL_SIZE.width;
    drop.y = (index * 83 + 17) % ORBIT_WINDOW_LOGICAL_SIZE.height;
    drop.rotation = 0.18;
    container.addChild(drop);
  }
  return container;
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
