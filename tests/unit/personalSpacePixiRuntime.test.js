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
    fill() { return this; }
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

  const Assets = {
    load: vi.fn(async paths => Object.fromEntries(paths.map(path => [
      path,
      { path, width: 1536, height: 1024 },
    ]))),
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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
    const loadedPaths = fake.pixi.Assets.load.mock.calls[0][0];
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
    let [paths] = fake.pixi.Assets.load.mock.calls.at(-1);
    expect(paths).toContain('assets/personal-space/v2/characters/toon/protagonist/hoodie-work-left.webp');
    expect(paths).toContain('assets/personal-space/v2/characters/toon/companion/owl-observe.webp');

    // Offline and not cached yet: Pixi rejects the load, the default is drawn.
    fake.pixi.Assets.load.mockImplementationOnce(async () => {
      throw new Error('[Loader.load] Failed to load owl-observe.webp');
    });
    await runtime.render({ ...model, appearance: { style: 'toon', protagonistId: 'artist', companionId: 'owl' } });
    [paths] = fake.pixi.Assets.load.mock.calls.at(-1);
    expect(paths).toContain('assets/personal-space/v2/characters/toon/protagonist/office-work-left.webp');
    expect(paths).toContain('assets/personal-space/v2/characters/toon/companion/orbit-observe.webp');
    const app = fake.applications[0];
    expect(app.stage.children.find(child => child.label === 'orbit-protagonist').texture.path)
      .toContain('office-work-left.webp');
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

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flushMicrotasks();

    const restoredPaths = fake.pixi.Assets.load.mock.calls.at(-1)[0];
    expect(restoredPaths.some(path => path.includes('workspace/props/planning-board.png'))).toBe(true);
    expect(restoredPaths.some(path => path.includes('workspace/props/single-monitor.png'))).toBe(true);
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
