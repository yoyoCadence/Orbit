/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createDeferredRuntimeDestroyer,
  createPixiSceneRuntime,
  getCoverTransform,
} from '../../pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js';

describe('deferred Orbit runtime destruction', () => {
  it('cancels teardown when the next same-route render retains the runtime', () => {
    vi.useFakeTimers();
    const runtime = { destroy: vi.fn() };
    const destroyer = createDeferredRuntimeDestroyer(runtime);

    destroyer.schedule();
    destroyer.retain();
    vi.runAllTimers();
    expect(runtime.destroy).not.toHaveBeenCalled();

    destroyer.schedule();
    vi.runAllTimers();
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('holds a scheduled teardown while a lazy route renders (PS-211B)', () => {
    vi.useFakeTimers();
    const runtime = { destroy: vi.fn() };
    const destroyer = createDeferredRuntimeDestroyer(runtime);

    // Home → 空間 with a slow lazy import: the route mounts and retains in the end.
    destroyer.schedule();
    const releaseSlowRoute = destroyer.hold();
    vi.advanceTimersByTime(10_000);
    expect(runtime.destroy).not.toHaveBeenCalled();
    destroyer.retain();
    releaseSlowRoute();
    vi.runAllTimers();
    expect(runtime.destroy).not.toHaveBeenCalled();

    // A lazy route that renders without an Orbit Window: destroyed on release, once.
    destroyer.schedule();
    const releaseOtherRoute = destroyer.hold();
    vi.runAllTimers();
    expect(runtime.destroy).not.toHaveBeenCalled();
    releaseOtherRoute();
    releaseOtherRoute();
    expect(runtime.destroy).toHaveBeenCalledTimes(1);

    // Without a hold (a page without an Orbit Window), teardown runs on the timer.
    destroyer.schedule();
    vi.runAllTimers();
    expect(runtime.destroy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

function createFakePixi(options = {}) {
  const applications = [];

  class DisplayObject {
    constructor() {
      this.anchor = { set: vi.fn() };
      this.scale = { set: vi.fn() };
      this.destroy = vi.fn();
      this.x = 0;
      this.y = 0;
      this.rotation = 0;
    }
  }

  class Sprite extends DisplayObject {
    constructor(texture) {
      super();
      this.texture = texture;
    }
  }

  class Graphics extends DisplayObject {
    rect() { return this; }
    fill(style) {
      this.fillStyle = style;
      return this;
    }
    circle() { return this; }
    stroke() { return this; }
  }

  class Container extends DisplayObject {
    constructor() {
      super();
      this.children = [];
    }
    addChild(...children) {
      this.children.push(...children);
      return children.at(-1);
    }
  }

  class Application {
    constructor() {
      const canvas = document.createElement('canvas');
      let initialized = false;
      Object.defineProperty(this, 'canvas', {
        configurable: true,
        get: () => {
          if (options.throwBeforeInit && !initialized) {
            throw new TypeError('renderer is not initialized');
          }
          return canvas;
        },
      });
      this.stage = new Container();
      this.stage.removeChildren = vi.fn(() => this.stage.children.splice(0));
      this.stage.sortChildren = vi.fn();
      this.ticker = { add: vi.fn(), remove: vi.fn() };
      this.init = vi.fn(async (...args) => {
        await (options.init?.(...args) ?? Promise.resolve());
        canvas.style.width = '960px';
        canvas.style.height = '640px';
        initialized = true;
      });
      this.start = vi.fn();
      this.stop = vi.fn();
      this.render = vi.fn(() => options.onRender?.(this));
      this.destroy = vi.fn();
      applications.push(this);
    }
  }

  const textures = new Map();
  const Assets = {
    // Like Pixi, one cached texture per path.
    load: vi.fn(async paths => Object.fromEntries(paths.map(path => {
      if (!textures.has(path)) {
        textures.set(path, {
          path,
          width: 1536,
          height: 1024,
          source: { scaleMode: 'linear', style: { update: vi.fn() } },
        });
      }
      return [path, textures.get(path)];
    }))),
  };

  return {
    applications,
    pixi: { Application, Assets, Sprite, Graphics, Container },
  };
}

function createRuntimeHost() {
  const root = document.createElement('section');
  root.dataset.orbitWindow = '';
  const host = document.createElement('span');
  host.dataset.orbitRuntimeHost = '';
  root.appendChild(host);
  document.body.appendChild(root);
  return { root, host };
}

async function flushMicrotasks() {
  // PS-250D: a render loads the room, the protagonist and the Companion as
  // three parts, which takes a few more turns of the microtask queue.
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

// Every path a render asked Pixi to load, across its separate part loads.
function loadedSince(fake, callCount = 0) {
  return fake.pixi.Assets.load.mock.calls.slice(callCount).flatMap(([paths]) => paths);
}

describe('Personal Space V2 Pixi scene runtime', () => {
  it('fits the authored 3:2 production background without proof-era side cropping', () => {
    const cover = getCoverTransform(1536, 1024, 960, 640);

    expect(cover.x).toBe(480);
    expect(cover.y).toBe(320);
    expect(cover.scale).toBe(0.625);
    expect(1536 * cover.scale).toBe(960);
    expect(1024 * cover.scale).toBe(640);
  });

  it('reuses one Pixi Application when the next route takes over (PS-211B)', async () => {
    vi.useFakeTimers();
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const destroyer = createDeferredRuntimeDestroyer(runtime);
    const home = createRuntimeHost();
    const world = createRuntimeHost();

    try {
      await runtime.mount(home.host, { activeProject: { progress: 25 } });
      runtime.release(home.host);
      destroyer.schedule();
      const releaseRoute = destroyer.hold();
      vi.advanceTimersByTime(10_000); // the router awaits a slow lazy route import
      destroyer.retain();
      await runtime.mount(world.host, { activeProject: { progress: 25 } });
      releaseRoute();

      expect(fake.applications).toHaveLength(1);
      expect(fake.applications[0].destroy).not.toHaveBeenCalled();
      expect(world.host.querySelector('canvas')).toBe(fake.applications[0].canvas);
      expect(home.host.querySelector('canvas')).toBeNull();
      expect(world.root.classList.contains('is-runtime-ready')).toBe(true);
    } finally {
      runtime.destroy();
      vi.useRealTimers();
    }
  });

  it('draws the new stage before revealing a retained canvas (PS-211B)', async () => {
    const readyAtRender = [];
    const fake = createFakePixi({
      onRender: app => readyAtRender.push(app.canvas.closest('[data-orbit-window]')?.classList.contains('is-runtime-ready')),
    });
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const home = createRuntimeHost();
    const world = createRuntimeHost();

    await runtime.mount(home.host, { activeProject: { progress: 25 } });
    runtime.release(home.host);
    await runtime.mount(world.host, { activeProject: { progress: 100 } });

    expect(fake.applications).toHaveLength(1);
    expect(readyAtRender).toEqual([false, false]);
    expect(world.root.classList.contains('is-runtime-ready')).toBe(true);
    runtime.destroy();
  });

  it('renders weather and drives protagonist and Companion motion from shared state', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();

    await runtime.mount(host, {
      activeProject: { progress: 50 },
      protagonist: { state: 'work' },
      companion: { state: 'congratulate' },
      weather: 'rain',
    });
    const app = fake.applications[0];
    expect(app.canvas.style.width).toBe('100%');
    expect(app.canvas.style.height).toBe('100%');
    const protagonist = app.stage.children.find(child => child.label === 'orbit-protagonist');
    const companion = app.stage.children.find(child => child.label === 'orbit-companion');
    const rain = app.stage.children.find(child => child.label === 'orbit-weather-rain');
    const loadedPaths = loadedSince(fake);
    const ticker = app.ticker.add.mock.calls[0][0];
    const initialProtagonistX = protagonist.x;
    const initialCompanionY = companion.y;
    const initialRainY = rain.y;

    ticker({ deltaMS: 200 });

    expect(loadedPaths.some(path => path.includes('toon/protagonist/office-work-left.webp'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('toon/companion/orbit-congratulate.webp'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('weather-building-rain.png'))).toBe(true);
    expect(companion.texture.path).toContain('toon/companion/orbit-congratulate.webp');
    expect(rain.texture.path).toContain('weather-building-rain.png');
    expect(protagonist.x).not.toBe(initialProtagonistX);
    expect(companion.y).not.toBe(initialCompanionY);
    expect(rain.y).not.toBe(initialRainY);
    runtime.destroy();
  });

  it('draws the chosen characters, and the precached default when they cannot load (PS-250B)', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    const model = {
      activeProject: { progress: 50 },
      protagonist: { state: 'work' },
      companion: { state: 'observe' },
      appearance: { style: 'toon', protagonistId: 'hoodie', companionId: 'owl' },
    };

    await runtime.mount(host, model);
    let paths = loadedSince(fake);
    expect(paths).toContain('assets/personal-space/v2/characters/toon/protagonist/hoodie-work-left.webp');
    expect(paths).toContain('assets/personal-space/v2/characters/toon/companion/owl-observe.webp');

    // Offline, and only the chosen companion is cached: Pixi rejects any load
    // that includes the artist, so the default protagonist is drawn next to
    // the chosen owl.
    const load = fake.pixi.Assets.load.getMockImplementation();
    fake.pixi.Assets.load.mockImplementation(async requested => {
      if (requested.some(path => path.includes('/artist-'))) throw new Error('[Loader.load] Failed to load artist-work-left.webp');
      return load(requested);
    });
    let calls = fake.pixi.Assets.load.mock.calls.length;
    await runtime.render({ ...model, appearance: { style: 'toon', protagonistId: 'artist', companionId: 'owl' } });
    paths = loadedSince(fake, calls);
    expect(paths).toContain('assets/personal-space/v2/characters/toon/protagonist/office-work-left.webp');
    expect(paths).toContain('assets/personal-space/v2/characters/toon/companion/owl-observe.webp');
    const app = fake.applications[0];
    expect(app.stage.children.find(child => child.label === 'orbit-protagonist').texture.path)
      .toContain('office-work-left.webp');
    expect(app.stage.children.find(child => child.label === 'orbit-companion').texture.path)
      .toContain('owl-observe.webp');

    // Nothing but the defaults loads: both are drawn as the default.
    fake.pixi.Assets.load.mockImplementation(async requested => {
      if (requested.some(path => /\/(artist|fox)-/.test(path))) throw new Error('[Loader.load] offline');
      return load(requested);
    });
    calls = fake.pixi.Assets.load.mock.calls.length;
    await runtime.render({ ...model, appearance: { style: 'toon', protagonistId: 'artist', companionId: 'fox' } });
    paths = loadedSince(fake, calls);
    expect(paths).toContain('assets/personal-space/v2/characters/toon/protagonist/office-work-left.webp');
    expect(paths).toContain('assets/personal-space/v2/characters/toon/companion/orbit-observe.webp');
    runtime.destroy();
  });

  it('samples pixel images with nearest neighbour, and nothing else (PS-250D)', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    await runtime.mount(host, { activeProject: { progress: 100 }, weather: 'rain', appearance: { style: 'pixel' } });
    const app = fake.applications[0];
    const sprites = app.stage.children.filter(child => child.texture?.path);
    const pixel = sprites.filter(child => child.texture.path.includes('/pixel/'));
    expect(pixel.length).toBe(1 + 7 + 2); // room, the seven props shown at 100%, two characters
    pixel.forEach(sprite => {
      expect(sprite.texture.source.scaleMode, sprite.texture.path).toBe('nearest');
      expect(sprite.texture.source.style.update).toHaveBeenCalled();
    });
    const rain = app.stage.children.find(child => child.label === 'orbit-weather-rain');
    expect(rain.texture.source.scaleMode).toBe('linear');

    await runtime.render({ activeProject: { progress: 100 } });
    const toon = app.stage.children.filter(child => child.texture?.path);
    expect(toon.every(child => child.texture.source.scaleMode === 'linear')).toBe(true);
    runtime.destroy();
  });

  it('draws the night room in the evening and at night under a weaker layer (PS-250E1)', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    const app = () => fake.applications[0];
    const room = () => app().stage.children.find(child => child.zIndex === 0).texture.path;
    const layer = () => app().stage.children.find(child => child.zIndex === 80).fillStyle;
    const props = () => app().stage.children
      .filter(child => child.texture?.path.includes('/workspace/props/'))
      .map(child => child.texture.path);

    await runtime.mount(host, { activeProject: { progress: 100 }, timeBand: 'evening' });
    expect(room()).toMatch(/building-formal-workstation-room-v2-night\.webp$/);
    expect(props()).toHaveLength(7);
    expect(props().every(path => path.endsWith('-night.png'))).toBe(true);
    expect(layer()).toEqual({ color: 0x172449, alpha: 0.1 });

    await runtime.render({ activeProject: { progress: 100 }, timeBand: 'night', appearance: { style: 'pixel' } });
    expect(room()).toMatch(/building-formal-workstation-room-pixel-night\.png$/);
    expect(layer()).toEqual({ color: 0x172449, alpha: 0.1 });

    // Pixel night images keep hard edges like the day ones.
    const pixelSprites = app().stage.children.filter(child => child.texture?.path.includes('/pixel/'));
    expect(pixelSprites.length).toBe(1 + 7 + 2);
    pixelSprites.forEach(sprite => expect(sprite.texture.source.scaleMode, sprite.texture.path).toBe('nearest'));

    await runtime.render({ activeProject: { progress: 100 }, timeBand: 'morning' });
    expect(room()).toMatch(/building-formal-workstation-room-v2\.webp$/);
    expect(props().some(path => path.endsWith('-night.png'))).toBe(false);
    expect(layer()).toEqual({ color: 0xf6d58b, alpha: 0.05 });
    runtime.destroy();
  });

  it('draws the day room under the full night layer when the night room cannot load (PS-250E1)', async () => {
    const fake = createFakePixi();
    const load = fake.pixi.Assets.load.getMockImplementation();
    fake.pixi.Assets.load.mockImplementation(async requested => {
      if (requested.some(path => /-night\.(png|webp)$/.test(path))) throw new Error('[Loader.load] offline');
      return load(requested);
    });
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    await runtime.mount(host, { activeProject: { progress: 100 }, timeBand: 'night', appearance: { style: 'pixel' } });
    const app = fake.applications[0];
    expect(runtime.getStatus()).toBe('ready');
    expect(app.stage.children.find(child => child.zIndex === 0).texture.path)
      .toMatch(/building-formal-workstation-room-v2\.webp$/);
    const props = app.stage.children.filter(child => child.texture?.path.includes('/workspace/'))
      .map(child => child.texture.path);
    expect(props.every(path => !path.includes('-night') && !path.includes('/pixel/'))).toBe(true);
    // The pixel characters stay; the layer is the one for a day room at night.
    expect(app.stage.children.filter(child => child.texture?.path.includes('/characters/pixel/'))).toHaveLength(2);
    expect(app.stage.children.find(child => child.zIndex === 80).fillStyle).toEqual({ color: 0x172449, alpha: 0.2 });
    runtime.destroy();
  });

  it('keeps today\'s layer with an older manifest that returns no `lighting` (PS-250E1, INFRA-105)', async () => {
    vi.resetModules();
    vi.doMock('../../pwa/js/personalSpace/v2/content/assetManifest.js', async importOriginal => {
      const actual = await importOriginal();
      return {
        ...actual,
        getWorkspaceSceneAssets: (progress, overrides, visualState) => {
          const { lighting, ...scene } = actual.getWorkspaceSceneAssets(progress, overrides, visualState);
          expect(lighting).toBe('day');
          return scene;
        },
      };
    });
    try {
      const { createPixiSceneRuntime: createWithOlderManifest } = await import('../../pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js');
      const fake = createFakePixi();
      const runtime = createWithOlderManifest({ loadPixi: () => Promise.resolve(fake.pixi) });
      const { host } = createRuntimeHost();
      await runtime.mount(host, { activeProject: { progress: 100 }, timeBand: 'night' });
      const app = fake.applications[0];
      expect(app.stage.children.find(child => child.zIndex === 0).texture.path)
        .toMatch(/building-formal-workstation-room-v2\.webp$/);
      expect(app.stage.children.find(child => child.zIndex === 80).fillStyle).toEqual({ color: 0x172449, alpha: 0.2 });
      runtime.destroy();
    } finally {
      vi.doUnmock('../../pwa/js/personalSpace/v2/content/assetManifest.js');
      vi.resetModules();
    }
  });

  it('draws the Q-style room when the pixel room cannot load, keeping the pixel characters (PS-250D)', async () => {
    const fake = createFakePixi();
    const load = fake.pixi.Assets.load.getMockImplementation();
    fake.pixi.Assets.load.mockImplementation(async requested => {
      if (requested.some(path => path.includes('/workspace/pixel/'))) throw new Error('[Loader.load] offline');
      return load(requested);
    });
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    await runtime.mount(host, {
      activeProject: { progress: 100 },
      protagonist: { state: 'idle' },
      companion: { state: 'observe' },
      appearance: { style: 'pixel', protagonistId: 'artist' },
    });
    const app = fake.applications[0];
    const background = app.stage.children.find(child => child.texture?.path?.includes('/backgrounds/'));
    expect(background.texture.path).toBe('assets/personal-space/v2/workspace/backgrounds/building-formal-workstation-room-v2.webp');
    expect(app.stage.children.find(child => child.label === 'orbit-protagonist').texture.path)
      .toBe('assets/personal-space/v2/characters/pixel/protagonist/artist-idle-left.png');
    expect(runtime.getStatus()).toBe('ready');
    runtime.destroy();
  });

  it('celebrates only when the view model says the protagonist celebrates (BUG-113)', async () => {
    const liftAfter = async (protagonistState, direction) => {
      const fake = createFakePixi();
      const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
      const { host } = createRuntimeHost();
      await runtime.mount(host, {
        activeProject: { progress: 50 },
        protagonist: { state: protagonistState },
        pendingReveal: { id: `reveal-${direction}`, direction },
      });
      const app = fake.applications[0];
      const protagonist = app.stage.children.find(child => child.label === 'orbit-protagonist');
      const restingY = protagonist.y;
      app.ticker.add.mock.calls[0][0]({ deltaMS: 55 });
      const lift = Math.abs(protagonist.y - restingY);
      runtime.destroy();
      return lift;
    };

    // Celebrating lifts by up to 6 px on a fast cycle; inspecting barely moves.
    expect(await liftAfter('celebrate', 'settlement')).toBeGreaterThan(2);
    // An undone Session, or a reward that is not progress, is shown as inspect.
    expect(await liftAfter('inspect', 'reversal')).toBeLessThan(1);
    expect(await liftAfter('inspect', 'settlement')).toBeLessThan(1);
  });

  it('re-renders the latest model after WebGL context restoration and cleans up once', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { root, host } = createRuntimeHost();

    await runtime.mount(host, { activeProject: { progress: 25 }, timeBand: 'day' });
    await runtime.render({ activeProject: { progress: 75 }, timeBand: 'night' });
    const app = fake.applications[0];
    const canvas = app.canvas;
    const contextLost = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(contextLost);
    expect(contextLost.defaultPrevented).toBe(true);
    expect(runtime.getStatus()).toBe('fallback');
    expect(root.classList.contains('is-runtime-fallback')).toBe(true);

    const callsBeforeRestore = fake.pixi.Assets.load.mock.calls.length;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flushMicrotasks();

    const restoredPaths = loadedSince(fake, callsBeforeRestore);
    // PS-250E1: at night the room and props are the night renders.
    expect(restoredPaths.some(path => path.includes('workspace/props/planning-board-night.png'))).toBe(true);
    expect(restoredPaths.some(path => path.includes('workspace/props/single-monitor-night.png'))).toBe(true);
    expect(runtime.getStatus()).toBe('ready');
    expect(host.dataset.runtimeStatus).toBe('ready');
    expect(root.classList.contains('is-runtime-fallback')).toBe(false);
    expect(root.classList.contains('is-runtime-ready')).toBe(true);

    runtime.destroy();
    runtime.destroy();
    expect(app.destroy).toHaveBeenCalledTimes(1);
    const loadCount = fake.pixi.Assets.load.mock.calls.length;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flushMicrotasks();
    expect(fake.pixi.Assets.load).toHaveBeenCalledTimes(loadCount);
  });

  it('keeps the poster fallback when WebGL context restoration cannot render', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { root, host } = createRuntimeHost();

    await runtime.mount(host, { activeProject: { progress: 50 } });
    const canvas = fake.applications[0].canvas;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    fake.pixi.Assets.load.mockRejectedValueOnce(new Error('textures unavailable'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flushMicrotasks();

    expect(runtime.getStatus()).toBe('fallback');
    expect(host.dataset.runtimeStatus).toBe('fallback');
    expect(root.classList.contains('is-runtime-ready')).toBe(false);
    expect(root.classList.contains('is-runtime-fallback')).toBe(true);
    runtime.destroy();
  });

  it('draws once instead of ticking every frame under reduced motion (INFRA-106)', async () => {
    vi.stubGlobal('matchMedia', query => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    try {
      const fake = createFakePixi();
      const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
      const { host } = createRuntimeHost();

      await runtime.mount(host, { activeProject: { progress: 25 } });
      const app = fake.applications[0];
      expect(runtime.getStatus()).toBe('ready');
      expect(app.ticker.add).not.toHaveBeenCalled();
      expect(app.start).not.toHaveBeenCalled();
      // Real Pixi starts the ticker during init(); a still stage stops it.
      expect(app.stop).toHaveBeenCalled();
      const rendersAfterMount = app.render.mock.calls.length;
      expect(rendersAfterMount).toBeGreaterThan(0);

      runtime.suspend();
      runtime.resume();
      expect(runtime.getStatus()).toBe('ready');
      expect(app.start).not.toHaveBeenCalled();
      expect(app.render).toHaveBeenCalledTimes(rendersAfterMount + 1);

      await runtime.render({ activeProject: { progress: 50 } });
      expect(app.render).toHaveBeenCalledTimes(rendersAfterMount + 2);

      app.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      app.canvas.dispatchEvent(new Event('webglcontextrestored'));
      await flushMicrotasks();
      expect(runtime.getStatus()).toBe('ready');
      expect(app.start).not.toHaveBeenCalled();
      expect(app.render).toHaveBeenCalledTimes(rendersAfterMount + 3);
      runtime.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a suspend that arrives while the stage reloads after a context restore (INFRA-106)', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();

    await runtime.mount(host, { activeProject: { progress: 25 } });
    const app = fake.applications[0];
    app.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    app.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(runtime.getStatus()).toBe('loading');
    runtime.suspend();
    await flushMicrotasks();

    expect(runtime.getStatus()).toBe('suspended');
    expect(host.dataset.runtimeStatus).toBe('suspended');
    expect(app.start).toHaveBeenCalledTimes(1);
    runtime.destroy();
  });

  it('restores rendering without restarting a runtime suspended while context was lost', async () => {
    const fake = createFakePixi();
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();

    await runtime.mount(host, { activeProject: { progress: 25 } });
    const app = fake.applications[0];
    app.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    runtime.suspend();
    app.canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flushMicrotasks();

    expect(runtime.getStatus()).toBe('suspended');
    expect(host.dataset.runtimeStatus).toBe('suspended');
    expect(app.start).toHaveBeenCalledTimes(1);

    runtime.resume();
    expect(runtime.getStatus()).toBe('ready');
    expect(app.start).toHaveBeenCalledTimes(2);
    runtime.destroy();
  });

  it('invalidates immediately and defers destruction during an unfinished Pixi init', async () => {
    let resolveInit;
    const init = new Promise(resolve => { resolveInit = resolve; });
    const fake = createFakePixi({
      init: () => init,
      throwBeforeInit: true,
    });
    const runtime = createPixiSceneRuntime({ loadPixi: () => Promise.resolve(fake.pixi) });
    const { host } = createRuntimeHost();
    const mountPromise = runtime.mount(host, { activeProject: { progress: 25 } });
    await flushMicrotasks();
    const app = fake.applications[0];

    expect(() => runtime.release(host)).not.toThrow();
    expect(() => runtime.destroy()).not.toThrow();
    expect(runtime.getStatus()).toBe('destroyed');
    expect(runtime.getApplication()).toBeNull();
    expect(app.destroy).not.toHaveBeenCalled();

    resolveInit();
    await mountPromise;
    await flushMicrotasks();
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('canvas')).toBeNull();
  });
});
