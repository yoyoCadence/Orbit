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
        initialized = true;
      });
      this.start = vi.fn();
      this.stop = vi.fn();
      this.destroy = vi.fn();
      applications.push(this);
    }
  }

  const Assets = {
    load: vi.fn(async paths => Object.fromEntries(paths.map(path => [
      path,
      { width: 1672, height: 941 },
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
  it('uniformly cover-scales and center-crops the 16:9 proof into the fixed 3:2 canvas', () => {
    const cover = getCoverTransform(1672, 941, 960, 640);

    expect(cover.x).toBe(480);
    expect(cover.y).toBe(320);
    expect(cover.scale).toBeCloseTo(640 / 941, 8);
    expect(1672 * cover.scale).toBeGreaterThan(960);
    expect(941 * cover.scale).toBeCloseTo(640, 8);
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
    const protagonist = app.stage.children.find(child => child.label === 'orbit-protagonist');
    const companion = app.stage.children.find(child => child.label === 'orbit-companion');
    const rain = app.stage.children.find(child => child.label === 'orbit-weather-rain');
    const ticker = app.ticker.add.mock.calls[0][0];
    const initialProtagonistX = protagonist.x;
    const initialCompanionY = companion.y;

    ticker({ deltaMS: 200 });

    expect(rain.children).toHaveLength(18);
    expect(protagonist.x).not.toBe(initialProtagonistX);
    expect(companion.y).not.toBe(initialCompanionY);
    expect(rain.y).not.toBe(0);
    runtime.destroy();
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
    expect(restoredPaths.some(path => path.includes('office-board'))).toBe(true);
    expect(restoredPaths.some(path => path.includes('office-monitor-single'))).toBe(true);
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
