/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceSceneAssets } from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  getRevealDurationMs,
  mountOrbitWindow,
  normalizeOrbitWindowModel,
  renderOrbitWindow,
} from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

describe('Personal Space V2 Orbit Window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete globalThis.IntersectionObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders the shared project, Main Quest, protagonist, and Companion in the home surface', () => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({
      activeProject: { progress: 75, label: 'Workspace Upgrade' },
      mainQuest: { taskId: 'focus-a', label: '完成 25 分鐘 A 級任務' },
      companion: { state: 'approach', message: '快完成了。' },
      momentum: 'strong',
    });

    expect(host.querySelector('[data-orbit-window]')).not.toBeNull();
    expect(host.querySelector('[data-orbit-window]').dataset.projectProgress).toBe('75');
    expect(host.querySelector('[data-orbit-main-quest]').dataset.taskId).toBe('focus-a');
    expect(host.querySelector('.orbit-window-protagonist')).not.toBeNull();
    expect(host.querySelector('[data-companion-state="approach"]')).not.toBeNull();
    expect(host.textContent).toContain('Workspace Upgrade');
  });

  it('uses cumulative five-stage Workspace Upgrade visuals', () => {
    expect(getWorkspaceSceneAssets(0).props).toHaveLength(0);
    expect(getWorkspaceSceneAssets(25).props.map(item => item.id)).toEqual(['corner-desk', 'office-chair']);
    expect(getWorkspaceSceneAssets(75).props.map(item => item.id)).toContain('single-monitor');

    const completed = getWorkspaceSceneAssets(100).props.map(item => item.id);
    expect(completed).toContain('dual-monitor');
    expect(completed).not.toContain('single-monitor');
  });

  it('normalizes all three presentations from the same data without mutating it', () => {
    const source = Object.freeze({ activeProject: Object.freeze({ progress: 50 }) });
    expect(normalizeOrbitWindowModel(source, 'home-window').activeProject.progress).toBe(50);
    expect(normalizeOrbitWindowModel(source, 'full-world').renderMode).toBe('full-world');
    expect(normalizeOrbitWindowModel(source, 'edit').renderMode).toBe('edit');
    expect(source.activeProject.progress).toBe(50);
  });

  it('projects protagonist, Companion, weather, and distinct reveal tiers into the shared surface', () => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({
      playerState: 'work',
      companion: { state: 'remind' },
      weather: 'rain',
      pendingReveal: { id: 'major-1', kind: 'major', title: '新區域開放' },
    });
    const root = host.querySelector('[data-orbit-window]');

    expect(root.dataset.playerState).toBe('work');
    expect(root.dataset.companionState).toBe('remind');
    expect(root.dataset.weather).toBe('rain');
    expect(root.dataset.revealKind).toBe('major');
    expect(root.querySelector('.orbit-window-major-reveal')).not.toBeNull();
    expect(root.querySelector('[data-weather="rain"]')).not.toBeNull();
    expect(getRevealDurationMs('small')).toBeLessThan(getRevealDurationMs('medium'));
    expect(getRevealDurationMs('medium')).toBeLessThan(getRevealDurationMs('major'));
    expect(getRevealDurationMs('major', true)).toBe(1000);
  });

  it('lazy-mounts the runtime and keeps high-value actions in semantic DOM buttons', async () => {
    const mount = vi.fn(() => Promise.resolve());
    const release = vi.fn();
    const onOpenWorld = vi.fn();
    const onMainQuest = vi.fn();
    const shell = document.createElement('div');
    const model = { mainQuest: { taskId: 'focus-a' } };
    shell.innerHTML = renderOrbitWindow(model);
    document.body.appendChild(shell);
    const root = shell.querySelector('[data-orbit-window]');

    const cleanup = mountOrbitWindow(root, {
      model,
      runtime: { mount, release },
      onOpenWorld,
      onMainQuest,
    });

    vi.runOnlyPendingTimers();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledTimes(1);

    root.querySelector('[data-orbit-open-world]').click();
    root.querySelector('[data-orbit-main-quest]').click();
    expect(onOpenWorld).toHaveBeenCalledTimes(1);
    expect(onMainQuest).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'focus-a' }));

    cleanup();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps the poster and acknowledges a persisted reveal after its animation', () => {
    const onRevealConsumed = vi.fn();
    const shell = document.createElement('div');
    const model = {
      pendingReveal: {
        id: 'reveal:session-1',
        title: '工作站更新',
        lines: ['+126 XP', 'Depth +3', 'Workspace +25%'],
      },
    };
    shell.innerHTML = renderOrbitWindow(model);
    const root = shell.querySelector('[data-orbit-window]');
    const cleanup = mountOrbitWindow(root, {
      model,
      runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() },
      onRevealConsumed,
    });

    expect(root.classList.contains('is-revealing')).toBe(true);
    expect(root.querySelector('.orbit-window-poster')).not.toBeNull();
    expect(root.textContent).toContain('Depth +3');
    vi.advanceTimersByTime(3500);
    expect(onRevealConsumed).toHaveBeenCalledWith('reveal:session-1');
    cleanup();
  });
});
