/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountOrbitWindow,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import {
  createLocalTelemetryAdapter,
  setPersonalSpaceTelemetryAdapter,
} from '../../pwa/js/personalSpace/v2/telemetry.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');

// PS-249A: the Orbit Window treats the app as covered while one of these is
// open; the reveal is held (and replayed afterwards) and the scene suspended.
const OVERLAYS = [
  { name: '#focus-overlay', persistent: 'focus-overlay' },
  { name: '#levelup-overlay', persistent: 'levelup-overlay' },
  { name: '#focus-duration-picker', persistent: 'focus-duration-picker', className: 'modal-overlay' },
  { name: '.modal-overlay', className: 'modal-overlay' },
  { name: '.pro-sheet-overlay', className: 'pro-sheet-overlay' },
  { name: '.shield-confirm-overlay', className: 'shield-confirm-overlay' },
  { name: '.tour-backdrop', className: 'tour-backdrop' },
  { name: '.proof-lightbox', className: 'proof-lightbox' },
];

let revealSequence = 0;

describe('PS-249A Orbit Window under overlays', () => {
  let hidden;
  let originalHidden;
  let telemetry;
  let observers;

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor(callback, options = {}) {
        this.callback = callback;
        this.rootMargin = options.rootMargin;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.disconnected = true; }
    });
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    telemetry = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(telemetry);
    // The persistent overlays as index.html has them: in #app, closed.
    const app = document.createElement('div');
    app.id = 'app';
    app.innerHTML = `
      <div id="focus-duration-picker" class="modal-overlay hidden"></div>
      <div id="focus-overlay" class="hidden"></div>
      <div id="levelup-overlay" class="hidden"></div>
    `;
    document.body.appendChild(app);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setPersonalSpaceTelemetryAdapter(null);
    document.body.innerHTML = '';
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else delete document.hidden;
  });

  const sceneObserver = () => observers.find(observer => observer.rootMargin === '160px');
  const revealObserver = () => observers.find(observer => observer.rootMargin === '0px');
  const report = (observer, isIntersecting) => observer.callback([{ isIntersecting }]);

  async function mount({ reveal = true, renderMode, kind = 'small' } = {}) {
    const runtime = {
      mount: vi.fn(() => Promise.resolve()),
      suspend: vi.fn(),
      resume: vi.fn(),
      release: vi.fn(),
    };
    const onRevealConsumed = vi.fn();
    revealSequence += 1;
    const model = reveal ? { pendingReveal: { id: `reveal:ps249a:${revealSequence}`, kind } } : {};
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow(model, { renderMode });
    document.body.appendChild(shell);
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { model, renderMode, runtime, onRevealConsumed });
    report(sceneObserver(), true);
    if (reveal) report(revealObserver(), true);
    await vi.advanceTimersByTimeAsync(0);
    return { root, runtime, onRevealConsumed, cleanup, revealId: model.pendingReveal?.id };
  }

  function open(overlay) {
    if (overlay.persistent) {
      const element = document.getElementById(overlay.persistent);
      element.classList.remove('hidden');
      return () => element.classList.add('hidden');
    }
    const element = document.createElement('div');
    element.className = overlay.className;
    document.body.appendChild(element);
    return () => element.remove();
  }

  // MutationObserver callbacks are microtasks; the uncover waits two frames.
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const twoFrames = () => vi.advanceTimersByTimeAsync(40);

  it('does not count the closed persistent overlays as covering the app on mount', async () => {
    const { root, runtime, onRevealConsumed, cleanup, revealId } = await mount();
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    expect(runtime.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2200);
    expect(onRevealConsumed).toHaveBeenCalledWith(revealId);
    cleanup();
  });

  it.each(OVERLAYS)('holds and replays the reveal and suspends the scene under $name', async overlay => {
    const { root, runtime, onRevealConsumed, cleanup, revealId } = await mount();
    await vi.advanceTimersByTimeAsync(1000);

    const close = open(overlay);
    await flush();
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();

    close();
    await flush();
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    expect(runtime.resume).not.toHaveBeenCalled();
    await twoFrames();
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    expect(runtime.resume).toHaveBeenCalledTimes(1);

    // Replayed from the start: the whole 2.2 s again, not the 1.2 s left.
    await vi.advanceTimersByTimeAsync(2150);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onRevealConsumed).toHaveBeenCalledWith(revealId);
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    cleanup();
  });

  it('follows the Pro duration picker, which only toggles a class', async () => {
    const { runtime, cleanup } = await mount({ reveal: false });
    const picker = document.getElementById('focus-duration-picker');
    picker.classList.remove('hidden');
    await flush();
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
    picker.classList.add('hidden');
    await flush();
    await twoFrames();
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('ignores hidden overlays and overlays that are not direct children of body', async () => {
    const { root, runtime, onRevealConsumed, cleanup } = await mount();
    const closedModal = document.createElement('div');
    closedModal.className = 'modal-overlay hidden';
    document.body.appendChild(closedModal);
    const nested = document.createElement('div');
    nested.innerHTML = '<div class="modal-overlay"></div>';
    document.body.appendChild(nested);
    await flush();
    expect(runtime.suspend).not.toHaveBeenCalled();
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    await vi.advanceTimersByTimeAsync(2200);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('holds a reveal that mounts under an overlay and plays it in full afterwards', async () => {
    const close = open(OVERLAYS[1]);
    const { root, runtime, onRevealConsumed, cleanup } = await mount();
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
    expect(telemetry.getEvents().map(event => event.eventName)).not.toContain('reward_reveal_started');

    close();
    await flush();
    await twoFrames();
    expect(telemetry.getEvents().map(event => event.eventName)).toContain('reward_reveal_started');
    await vi.advanceTimersByTimeAsync(2150);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('rewinds the reveal animations, and only those, when it replays', async () => {
    const { root, cleanup } = await mount({ kind: 'major' });
    const animations = [
      { animationName: 'orbit-reward-rise', currentTime: 480 },
      { animationName: 'orbit-companion-approach', currentTime: 700 },
      { animationName: 'orbit-medium-reveal', currentTime: 900 },
      { animationName: 'orbit-major-reveal', currentTime: 1000 },
      { animationName: 'orbit-weather-motes', currentTime: 3000 },
    ];
    root.getAnimations = vi.fn(() => animations);
    const close = open(OVERLAYS[4]);
    await flush();
    expect(animations.map(animation => animation.currentTime)).toEqual([480, 700, 900, 1000, 3000]);
    close();
    await flush();
    await twoFrames();
    expect(root.getAnimations).toHaveBeenCalledWith({ subtree: true });
    expect(animations.map(animation => animation.currentTime)).toEqual([0, 0, 0, 0, 3000]);
    cleanup();
  });

  it('sends reward_reveal_started once and completed after the replay', async () => {
    const { onRevealConsumed, cleanup } = await mount();
    await vi.advanceTimersByTimeAsync(1000);
    const close = open(OVERLAYS[3]);
    await flush();
    close();
    await flush();
    await twoFrames();
    await vi.advanceTimersByTimeAsync(2200);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    const names = telemetry.getEvents().map(event => event.eventName);
    expect(names.filter(name => name === 'reward_reveal_started')).toHaveLength(1);
    expect(names.filter(name => name === 'reward_reveal_completed')).toHaveLength(1);
    cleanup();
  });

  it('does not churn when a tour step swaps its backdrop within two frames', async () => {
    const tour = open(OVERLAYS[6]);
    const { root, runtime, onRevealConsumed, cleanup } = await mount();
    tour();
    await flush();
    await vi.advanceTimersByTimeAsync(16);
    open(OVERLAYS[6]);
    await flush();
    await twoFrames();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    cleanup();
  });

  it('holds the reveal by its own zero-margin observer while the scene keeps the 160px one', async () => {
    const { root, runtime, onRevealConsumed, cleanup, revealId } = await mount();
    expect(sceneObserver()).toBeTruthy();
    expect(revealObserver()).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1500);

    // Just off screen: still inside the scene's 160px margin.
    report(revealObserver(), false);
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    expect(runtime.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();

    // Back on screen it resumes (an overlay did not cover it): 0.7 s left.
    report(revealObserver(), true);
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    await vi.advanceTimersByTimeAsync(699);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onRevealConsumed).toHaveBeenCalledWith(revealId);
    cleanup();
  });

  it('holds the reveal in a hidden tab and resumes it there without replaying', async () => {
    const { root, onRevealConsumed, cleanup } = await mount();
    await vi.advanceTimersByTimeAsync(1500);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(700);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('replays after an overlay even when the Orbit Window also left the screen meanwhile', async () => {
    const { onRevealConsumed, cleanup } = await mount();
    await vi.advanceTimersByTimeAsync(1500);
    const close = open(OVERLAYS[1]);
    await flush();
    report(revealObserver(), false);
    close();
    await flush();
    await twoFrames();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    report(revealObserver(), true);
    await vi.advanceTimersByTimeAsync(2150);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('applies the same rules to the Personal Space page', async () => {
    const { root, runtime, onRevealConsumed, cleanup } = await mount({ renderMode: 'full-world' });
    expect(root.classList.contains('orbit-window--full-world')).toBe(true);
    const close = open(OVERLAYS[3]);
    await flush();
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('is-reveal-held')).toBe(true);
    close();
    await flush();
    await twoFrames();
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2200);
    expect(onRevealConsumed).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('stops watching overlays and drops a pending uncover on cleanup', async () => {
    const { runtime, cleanup } = await mount();
    const close = open(OVERLAYS[3]);
    await flush();
    close();
    await flush();
    cleanup();
    await twoFrames();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(revealObserver().disconnected).toBe(true);
    expect(sceneObserver().disconnected).toBe(true);
    open(OVERLAYS[3]);
    await flush();
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
  });

  it('does not add a reveal observer or the held class without a reveal', async () => {
    const { root, cleanup } = await mount({ reveal: false });
    expect(revealObserver()).toBeUndefined();
    open(OVERLAYS[3]);
    await flush();
    expect(root.classList.contains('is-reveal-held')).toBe(false);
    cleanup();
  });

  // A reminder: a new full-screen rule is either an overlay that orbitWindow.js
  // must know about, or belongs in the list of rules that cover nothing.
  // Overlays styled only inline (the proof lightbox) are not found here.
  it('knows every full-screen fixed rule in style.css', () => {
    const covering = [
      '#focus-overlay',
      '#levelup-overlay',
      '.modal-overlay',
      '.pro-sheet-overlay',
      '.shield-confirm-overlay',
      '.tour-backdrop',
    ];
    const notCovering = [
      '.orbit-window-major-reveal', // the reveal's own banner
      '[data-time-band] body::after', // the time-of-day tint, pointer-events: none
      '.space-idle-overlay', // the legacy Personal Space page, no Orbit Window
      '.space-map-window',
    ];
    const css = read('pwa/assets/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const fullScreen = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /position\s*:\s*fixed/.test(body) && /inset\s*:\s*0(?![.\d])/.test(body))
      .map(([, selector]) => selector.trim());
    expect([...fullScreen].sort()).toEqual([...covering, ...notCovering].sort());
    const source = read('pwa/js/personalSpace/v2/ui/orbitWindow.js');
    covering.forEach(selector => expect(source).toContain(selector.replace('#', '')));
  });

  it('gives the proof lightbox a class instead of only inline styles', () => {
    expect(read('pwa/js/ui/proofSheet.js')).toMatch(/overlay\.className = 'proof-lightbox';/);
  });

  it('pauses every reveal animation with selectors that outrank the reveal rules', () => {
    const css = read('pwa/assets/style.css');
    const held = css.indexOf('.orbit-window.is-reveal-held .orbit-window-reward,');
    expect(held).toBeGreaterThan(css.indexOf('.orbit-window.is-revealing .orbit-window-reward'));
    expect(held).toBeGreaterThan(css.indexOf('.orbit-window--reveal-medium .orbit-window-stage-wrap::after'));
    expect(held).toBeGreaterThan(css.indexOf('.orbit-window-major-reveal {'));
    const rule = css.slice(held, css.indexOf('}', held));
    [
      '.orbit-window.is-reveal-held .orbit-window-reward',
      '.orbit-window.is-reveal-held .orbit-window-protagonist',
      '.orbit-window.is-reveal-held .orbit-window-companion',
      '.orbit-window.is-reveal-held .orbit-window-stage-wrap::after',
      '.orbit-window.is-reveal-held .orbit-window-major-reveal',
    ].forEach(selector => expect(rule).toContain(selector));
    expect(rule).toContain('animation-play-state: paused');
    expect(css).toMatch(/\.orbit-window\.is-reveal-held \.orbit-window-major-reveal \{ visibility: hidden; \}/);
  });
});
