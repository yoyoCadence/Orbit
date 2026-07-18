/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountOrbitWindow,
  normalizeOrbitWindowModel,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

describe('Orbit Window lifecycle', () => {
  let originalHidden;
  let hidden;

  beforeEach(() => {
    vi.useFakeTimers();
    delete globalThis.IntersectionObserver;
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else delete document.hidden;
  });

  it('honors input renderMode and formats object world-change aliases', () => {
    const normalized = normalizeOrbitWindowModel({
      renderMode: 'edit',
      recentWorldChangeEvent: { label: 'Workspace wall unlocked', amount: 1 },
      mainQuest: { actionTarget: { kind: 'create-focus-task' } },
      companion: { dialogueKey: 'companion.momentum.low' },
    });

    expect(normalized.renderMode).toBe('edit');
    expect(normalized.recentWorldChange).toBe('Workspace wall unlocked');
    expect(normalized.mainQuest.actionTarget).toEqual({ kind: 'create-focus-task' });
    expect(normalized.companion.message).toContain('不用急');
    expect(renderOrbitWindow(normalized)).toContain('Workspace wall unlocked');
    expect(renderOrbitWindow(normalized)).not.toContain('[object Object]');
    expect(normalizeOrbitWindowModel({
      recentWorldChange: { key: 'depth', amount: -3 },
    }).recentWorldChange).toBe('depth -3');
  });

  it('suspends and resumes once per visibility transition and removes every binding on cleanup', async () => {
    const runtime = {
      mount: vi.fn(() => Promise.resolve()),
      suspend: vi.fn(),
      resume: vi.fn(),
      release: vi.fn(),
    };
    const onOpenWorld = vi.fn();
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow({});
    document.body.appendChild(shell);
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { runtime, onOpenWorld });

    await vi.runAllTimersAsync();
    expect(runtime.mount).toHaveBeenCalledTimes(1);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(runtime.suspend).toHaveBeenCalledTimes(1);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(runtime.resume).toHaveBeenCalledTimes(1);

    root.querySelector('[data-orbit-open-world]').click();
    expect(onOpenWorld).toHaveBeenCalledTimes(1);

    cleanup();
    cleanup();
    expect(runtime.release).toHaveBeenCalledTimes(1);

    root.querySelector('[data-orbit-open-world]').click();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onOpenWorld).toHaveBeenCalledTimes(1);
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
  });

  it('disconnects a pending observer and cancels reveal work before runtime mount', () => {
    let observerCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor(callback) { observerCallback = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const runtime = { mount: vi.fn(), release: vi.fn() };
    const onRevealConsumed = vi.fn();
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow({});
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { runtime, onRevealConsumed });

    expect(observe).toHaveBeenCalledWith(root);
    cleanup();
    observerCallback([{ isIntersecting: true }]);
    vi.runOnlyPendingTimers();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.mount).not.toHaveBeenCalled();
    expect(onRevealConsumed).not.toHaveBeenCalled();
    expect(runtime.release).toHaveBeenCalledTimes(1);
  });

  it('keeps observing after lazy mount and suspends or resumes on viewport transitions', async () => {
    let observerCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor(callback) { observerCallback = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const runtime = {
      mount: vi.fn(() => Promise.resolve()),
      suspend: vi.fn(),
      resume: vi.fn(),
      release: vi.fn(),
    };
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow({});
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { runtime });

    observerCallback([{ isIntersecting: false }]);
    expect(runtime.mount).not.toHaveBeenCalled();

    observerCallback([{ isIntersecting: true }]);
    await vi.runAllTimersAsync();
    expect(runtime.mount).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();

    observerCallback([{ isIntersecting: false }]);
    observerCallback([{ isIntersecting: false }]);
    expect(runtime.suspend).toHaveBeenCalledTimes(1);

    observerCallback([{ isIntersecting: true }]);
    observerCallback([{ isIntersecting: true }]);
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    expect(runtime.mount).toHaveBeenCalledTimes(1);

    cleanup();
    cleanup();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.release).toHaveBeenCalledTimes(1);
    observerCallback([{ isIntersecting: false }]);
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
  });

  it('only consumes a reveal after its full visible-tab presentation time', () => {
    hidden = true;
    const onRevealConsumed = vi.fn();
    const model = { pendingReveal: { id: 'reveal:hidden-tab' } };
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow(model);
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, {
      model,
      runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() },
      onRevealConsumed,
    });

    vi.advanceTimersByTime(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2199);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRevealConsumed).toHaveBeenCalledWith('reveal:hidden-tab');
    cleanup();
  });

  it('pauses reveal presentation while the Orbit Window is outside the viewport', () => {
    let observerCallback;
    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor(callback) { observerCallback = callback; }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    const onRevealConsumed = vi.fn();
    const model = { pendingReveal: { id: 'reveal:offscreen' } };
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow(model);
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, {
      model,
      runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() },
      onRevealConsumed,
    });

    vi.advanceTimersByTime(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    observerCallback([{ isIntersecting: true }]);
    vi.advanceTimersByTime(1500);
    observerCallback([{ isIntersecting: false }]);
    vi.advanceTimersByTime(10_000);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    observerCallback([{ isIntersecting: true }]);
    vi.advanceTimersByTime(699);
    expect(onRevealConsumed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRevealConsumed).toHaveBeenCalledWith('reveal:offscreen');
    cleanup();
  });

  it('keeps the semantic poster and actions usable when Pixi mount fails', async () => {
    const runtime = {
      mount: vi.fn(() => Promise.reject(new Error('webgl unavailable'))),
      release: vi.fn(),
    };
    const onOpenWorld = vi.fn();
    const shell = document.createElement('div');
    shell.innerHTML = renderOrbitWindow({});
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, { runtime, onOpenWorld });

    await vi.runAllTimersAsync();

    expect(root.querySelector('.orbit-window-poster')).not.toBeNull();
    expect(root.querySelector('[data-orbit-runtime-host]').dataset.runtimeStatus).toBe('fallback');
    root.querySelector('[data-orbit-open-world]').click();
    expect(onOpenWorld).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
