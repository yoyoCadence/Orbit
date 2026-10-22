/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_PERSONAL_SPACE_RUNTIME } from '../../pwa/js/flags.js';
import { renderPersonalSpace } from '../../pwa/js/pages/personalSpace.js';
import { renderPersonalSpaceV2 } from '../../pwa/js/pages/personalSpaceV2.js';
import { ASSET_GALLERY_FLAG } from '../../pwa/js/personalSpace/v2/ui/assetGallery.js';
import { state } from '../../pwa/js/state.js';
import { loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import {
  createLocalTelemetryAdapter,
  setPersonalSpaceTelemetryAdapter,
} from '../../pwa/js/personalSpace/v2/telemetry.js';

function v2State(overrides = {}) {
  return {
    version: 2,
    ownerId: 'user-1',
    worldRevision: 3,
    weather: 'clear',
    economy: { openingGold: 50, earnedGold: 100, spentGold: 0, balanceGold: 150 },
    hiddenStats: { discipline: 1, depth: 3, vitality: 0, order: 0, courage: 0, craft: 0 },
    companion: { relationshipStage: 'stranger-observer' },
    activeProject: { id: 'workspace-upgrade', label: 'Workspace Upgrade', progress: 50 },
    inventory: { ownedItems: [{ id: 'plant' }] },
    world: {
      selectedSceneId: 'office-corner',
      selectedThemeId: 'default',
      placedItems: [{
        id: 'corner-desk',
        label: 'Corner Desk',
        placement: { x: '20%', y: '60%', anchor: 'center-bottom' },
      }],
      idleWindowLayouts: {
        office: {
          cameraProfileId: 'center',
          placements: { 'desk-lamp': { x: '40%', y: '55%', planeId: 'desktop' } },
        },
      },
    },
    rewardLedger: [{ id: 'reward-1', rewardType: 'project_progress', amount: 25 }],
    rewardTombstones: [],
    pendingRewardReveals: [],
    ...overrides,
  };
}

function coreState() {
  return {
    user: { id: 'user-1', name: 'Tester', totalXP: 600, streakDays: 3, newDayHour: 5 },
    tasks: [{
      id: 'focus-a',
      name: 'Deep Work',
      category: 'focus',
      impactType: 'task',
      value: 'A',
    }],
    dailyPlan: ['focus-a'],
    sessions: [],
  };
}

function controllerResult(personalSpaceState = v2State()) {
  return {
    state: personalSpaceState,
    reconciliation: { ledger: personalSpaceState.rewardLedger, summary: {}, project: personalSpaceState.activeProject },
    ledgerSnapshot: {
      ledger: personalSpaceState.rewardLedger,
      summary: {},
      project: personalSpaceState.activeProject,
      wallet: personalSpaceState.economy,
      hiddenStats: personalSpaceState.hiddenStats,
      companion: personalSpaceState.companion,
      pendingRewardReveals: personalSpaceState.pendingRewardReveals,
      worldRevision: personalSpaceState.worldRevision,
    },
  };
}

describe('Personal Space V2 full page', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    delete globalThis.IntersectionObserver;
    delete window.startFocus;
    setPersonalSpaceTelemetryAdapter(null);
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders scene-first World Mode and returns runtime cleanup', () => {
    const release = vi.fn();
    const destroyRuntime = vi.fn();
    const mountWindow = vi.fn(() => release);
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow,
      destroyRuntime,
      effectiveDate: '2026-07-17',
      now: new Date(2026, 6, 17, 12),
    });

    expect(container.querySelector('[data-personal-space-v2]').dataset.mode).toBe('full-world');
    expect(container.querySelector('[data-orbit-window]')).not.toBeNull();
    expect(container.querySelector('[data-v2-editor]')).toBeNull();
    expect(container.textContent).toContain('世界模式');
    expect(container.textContent).toContain('金幣 150');
    expect(mountWindow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ renderMode: 'full-world' })
    );

    cleanup();
    cleanup();
    expect(release).toHaveBeenCalledTimes(1);
    expect(destroyRuntime).toHaveBeenCalledTimes(1);
  });

  it('shows the developer asset gallery only when the developer panel turned it on (PS-250A)', () => {
    const render = () => renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow: () => () => {},
      destroyRuntime: () => {},
      effectiveDate: '2026-07-17',
      now: new Date(2026, 6, 17, 12),
    });

    let cleanup = render();
    expect(container.querySelector('[data-v2-asset-gallery]')).toBeNull();
    cleanup();

    localStorage.setItem(ASSET_GALLERY_FLAG, '1');
    cleanup = render();
    const gallery = container.querySelector('[data-v2-asset-gallery]');
    expect(gallery).not.toBeNull();
    expect(gallery.querySelectorAll('img').length).toBeGreaterThan(20);
    cleanup();
  });

  it('still removes page bindings and destroys the runtime when scene release throws', () => {
    const release = vi.fn(() => { throw new Error('release failed'); });
    const destroyRuntime = vi.fn();
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow: () => release,
      destroyRuntime,
      effectiveDate: '2026-07-17',
    });
    const openDetail = container.querySelector('[data-v2-open-detail="project"]');

    expect(() => cleanup()).toThrow('release failed');
    expect(destroyRuntime).toHaveBeenCalledTimes(1);
    openDetail.click();
    expect(container.querySelector('[data-v2-detail-panel]').hidden).toBe(true);
  });

  it('opens the last readable snapshot when reconciliation persistence fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => { throw new Error('quota'); },
      mountWindow: () => () => {},
      effectiveDate: '2026-07-17',
    });

    expect(container.querySelector('[data-personal-space-v2]')).not.toBeNull();
    expect(container.textContent).toContain('世界模式');
    cleanup();
    warn.mockRestore();
  });

  it('switches to a separate Edit Mode that explains the fixed layout and writes nothing', () => {
    const source = v2State();
    const releases = [];
    const destroyRuntime = vi.fn();
    const reconcile = vi.fn(() => controllerResult(source));
    const before = JSON.stringify(source);
    const mountWindow = vi.fn(() => {
      const cleanup = vi.fn();
      releases.push(cleanup);
      return cleanup;
    });
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile,
      mountWindow,
      destroyRuntime,
      effectiveDate: '2026-07-17',
    });

    container.querySelector('[data-v2-mode="edit"]').click();
    expect(container.querySelector('[data-personal-space-v2]').dataset.mode).toBe('edit');
    expect(container.querySelector('[data-v2-editor]')).not.toBeNull();
    expect(container.querySelector('[data-orbit-window]').classList.contains('is-revealing')).toBe(false);
    expect(mountWindow.mock.calls[1][1].model.pendingReveal).toBeNull();
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(destroyRuntime).not.toHaveBeenCalled();

    // PS-246: legacy idle-window overrides are neither listed nor editable, and
    // nothing in Edit Mode can clear them.
    const editor = container.querySelector('[data-v2-editor]');
    expect(editor.textContent).toContain('目前不能移動');
    expect(editor.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-v2-nudge], [data-v2-reset-item], [data-v2-reset-all]')).toBeNull();
    editor.click();
    container.querySelector('[data-v2-mode="full-world"]').click();
    expect(container.querySelector('[data-personal-space-v2]').dataset.mode).toBe('full-world');
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(source)).toBe(before);
    expect(localStorage.length).toBe(0);

    cleanup();
    cleanup();
    expect(destroyRuntime).toHaveBeenCalledTimes(1);
  });

  it('lets Edit Mode choose the style and characters, stored locally and drawn at once (PS-250B)', () => {
    const source = v2State();
    savePersonalSpaceV2State('user-1', source);
    const mountWindow = vi.fn(() => () => {});
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(loadPersonalSpaceV2State('user-1')),
      mountWindow,
      destroyRuntime: vi.fn(),
      effectiveDate: '2026-07-17',
    });
    const poster = () => container.querySelector('.orbit-window-protagonist').getAttribute('src');
    expect(container.querySelector('[data-v2-appearance-picker]')).toBeNull();
    expect(poster()).toContain('/toon/protagonist/office-');

    container.querySelector('[data-v2-mode="edit"]').click();
    const picker = container.querySelector('[data-v2-appearance-picker]');
    expect(picker).not.toBeNull();
    expect(picker.querySelector('[data-v2-appearance="style"][aria-pressed="true"]').dataset.value).toBe('toon');

    container.querySelector('[data-v2-appearance="style"][data-value="pixel"]').click();
    expect(loadPersonalSpaceV2State('user-1').world.appearance.style).toBe('pixel');
    expect(container.querySelector('[data-personal-space-v2]').dataset.mode).toBe('edit');
    // PS-250D: the pixel style has the pixel version of the same office worker.
    expect(poster()).toContain('characters/pixel/protagonist/office-');
    expect(container.querySelector('.orbit-window-background').getAttribute('src')).toContain('/workspace/pixel/');
    expect(document.activeElement).toBe(container.querySelector('[data-v2-appearance="style"][data-value="pixel"]'));
    expect(mountWindow.mock.calls.at(-1)[1].model.appearance.style).toBe('pixel');

    container.querySelector('[data-v2-appearance="style"][data-value="toon"]').click();
    container.querySelector('[data-v2-appearance="protagonist"][data-value="scientist"]').click();
    container.querySelector('[data-v2-appearance="companion"][data-value="catbot"]').click();
    expect(loadPersonalSpaceV2State('user-1').world.appearance)
      .toEqual({ style: 'toon', protagonistId: 'scientist', companionId: 'catbot' });
    expect(poster()).toContain('/toon/protagonist/scientist-');

    // The pixel style shows the same characters; tapping the ones already
    // shown changes nothing, so switching back keeps the choice.
    container.querySelector('[data-v2-appearance="style"][data-value="pixel"]').click();
    expect(poster()).toContain('characters/pixel/protagonist/scientist-');
    container.querySelector('[data-v2-appearance="protagonist"][data-value="scientist"]').click();
    container.querySelector('[data-v2-appearance="companion"][data-value="catbot"]').click();
    container.querySelector('[data-v2-appearance="style"][data-value="toon"]').click();
    expect(loadPersonalSpaceV2State('user-1').world.appearance)
      .toEqual({ style: 'toon', protagonistId: 'scientist', companionId: 'catbot' });

    // The classic pixel office worker is the office worker in the Q style.
    container.querySelector('[data-v2-appearance="style"][data-value="pixel"]').click();
    container.querySelector('[data-v2-appearance="protagonist"][data-value="default"]').click();
    expect(poster()).toContain('characters/protagonist/player-default-');
    container.querySelector('[data-v2-appearance="style"][data-value="toon"]').click();
    expect(poster()).toContain('/toon/protagonist/office-');
    expect(container.querySelector('[data-v2-appearance="protagonist"][data-value="office"]').getAttribute('aria-pressed'))
      .toBe('true');
    expect(container.querySelector('.orbit-window-companion').getAttribute('src')).toContain('/toon/companion/catbot-');
    // Choosing a look grants nothing and leaves the world revision alone.
    expect(loadPersonalSpaceV2State('user-1').worldRevision).toBe(source.worldRevision);
    expect(loadPersonalSpaceV2State('user-1').rewardLedger).toEqual(source.rewardLedger);
    cleanup();
  });

  it('lets Edit Mode choose the room style, stored in world.selectedThemeId and drawn at once (PS-250E2)', () => {
    const source = v2State();
    savePersonalSpaceV2State('user-1', source);
    const mountWindow = vi.fn(() => () => {});
    const cleanup = renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(loadPersonalSpaceV2State('user-1')),
      mountWindow,
      destroyRuntime: vi.fn(),
      effectiveDate: '2026-07-17',
    });
    const room = () => container.querySelector('.orbit-window-background').getAttribute('src');
    expect(room()).not.toContain('/styles/');
    container.querySelector('[data-v2-mode="edit"]').click();
    expect(container.querySelector('[data-v2-appearance="room"][aria-pressed="true"]').dataset.value).toBe('default');

    container.querySelector('[data-v2-appearance="room"][data-value="nordic"]').click();
    const saved = loadPersonalSpaceV2State('user-1');
    expect(saved.world.selectedThemeId).toBe('nordic');
    // An unchosen look stays unchosen, and a room is not a world change.
    expect(saved.world.appearance).toEqual(source.world.appearance ?? null);
    expect(saved.worldRevision).toBe(source.worldRevision);
    expect(saved.rewardLedger).toEqual(source.rewardLedger);
    expect(room()).toContain('/workspace/styles/nordic/background');
    expect(document.activeElement).toBe(container.querySelector('[data-v2-appearance="room"][data-value="nordic"]'));
    expect(mountWindow.mock.calls.at(-1)[1].model.selectedThemeId).toBe('nordic');

    // The pixel style draws the pixel version of the same room.
    container.querySelector('[data-v2-appearance="style"][data-value="pixel"]').click();
    expect(room()).toContain('/workspace/pixel/styles/nordic/background');
    container.querySelector('[data-v2-appearance="room"][data-value="default"]').click();
    expect(loadPersonalSpaceV2State('user-1').world.selectedThemeId).toBe('default');
    expect(room()).toContain('/workspace/pixel/backgrounds/');
    cleanup();
  });

  it('AI-203B: re-renders into the reminder when the daily window opens, and stops after cleanup', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 6, 17, 11, 59, 30));
      const quietDay = date => ({
        id: `quiet-${date}`, date, taskId: 'chore', result: 'complete',
        impactType: 'task', value: 'B', finalXP: 5, completedAt: `${date}T09:00:00.000Z`,
      });
      const core = {
        ...coreState(),
        sessions: ['2026-07-14', '2026-07-15', '2026-07-16'].map(quietDay),
      };
      const mountWindow = vi.fn(() => () => {});
      const cleanup = renderPersonalSpaceV2(container, {
        user: core.user,
        coreState: core,
        reconcile: () => controllerResult(v2State()),
        mountWindow,
        effectiveDate: '2026-07-17',
      });
      expect(mountWindow.mock.lastCall[1].model.companion.state).toBe('observe');

      vi.advanceTimersByTime(60 * 1000);
      expect(mountWindow.mock.lastCall[1].model.companion.state).toBe('remind');
      expect(container.textContent).toContain('你選擇的目標還在這裡，準備好時再開始。');

      cleanup();
      const calls = mountWindow.mock.calls.length;
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(mountWindow.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AI-203B: the reminder refresh keeps an open detail panel and the focused control', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 6, 17, 11, 59, 30));
      const quietDay = date => ({
        id: `quiet-${date}`, date, taskId: 'chore', result: 'complete',
        impactType: 'task', value: 'B', finalXP: 5, completedAt: `${date}T09:00:00.000Z`,
      });
      const core = {
        ...coreState(),
        sessions: ['2026-07-14', '2026-07-15', '2026-07-16'].map(quietDay),
      };
      const cleanup = renderPersonalSpaceV2(container, {
        user: core.user,
        coreState: core,
        reconcile: () => controllerResult(v2State()),
        mountWindow: vi.fn(() => () => {}),
        effectiveDate: '2026-07-17',
      });
      container.querySelector('[data-v2-open-detail="companion"]').click();
      const firstHeading = document.activeElement;
      expect(firstHeading.closest('[data-v2-detail="companion"]')).not.toBeNull();

      vi.advanceTimersByTime(60 * 1000);

      const panel = container.querySelector('[data-v2-detail-panel]');
      const companionDetail = panel.querySelector('[data-v2-detail="companion"]');
      expect(panel.hidden).toBe(false);
      expect(companionDetail.hidden).toBe(false);
      expect(companionDetail.textContent).toContain('你選擇的目標還在這裡，準備好時再開始。');
      expect(document.activeElement).not.toBe(firstHeading);
      expect(document.activeElement).toBe(companionDetail.querySelector('h2'));

      // Closing still returns focus to the (re-rendered) control that opened it.
      container.querySelector('[data-v2-close-detail]').click();
      expect(document.activeElement).toBe(container.querySelector('[data-v2-open-detail="companion"]'));

      // A focused dock control keeps focus across the closing boundary too.
      const editButtons = container.querySelectorAll('[data-v2-mode="edit"]');
      editButtons[1].focus();
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      // Restoring focus must not scroll the page back to the control.
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      focusSpy.mockRestore();
      expect(container.textContent).not.toContain('你選擇的目標還在這裡，準備好時再開始。');
      expect(container.querySelector('[data-v2-detail-panel]').hidden).toBe(true);
      expect(document.activeElement).toBe(container.querySelectorAll('[data-v2-mode="edit"]')[1]);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens Project detail and starts the selected real Focus task', () => {
    window.startFocus = vi.fn();
    renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow: () => () => {},
      effectiveDate: '2026-07-17',
    });

    container.querySelector('[data-v2-open-detail="project"]').click();
    expect(container.querySelector('[data-v2-detail-panel]').hidden).toBe(false);
    expect(container.querySelector('[data-v2-detail="project"]').hidden).toBe(false);

    container.querySelector('[data-v2-main-quest]').click();
    expect(window.startFocus).toHaveBeenCalledWith('focus-a');
  });

  it('emits edit_mode_opened for a high-level estate scene instead of dropping it', () => {
    const telemetry = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(telemetry);
    const source = v2State({
      world: {
        selectedSceneId: 'estate-hall',
        selectedThemeId: 'default',
        placedItems: [],
        idleWindowLayouts: {},
      },
    });
    renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(source),
      mountWindow: () => () => {},
      effectiveDate: '2026-07-17',
    });

    container.querySelector('[data-v2-mode="edit"]').click();

    const editEvents = telemetry.getEvents().filter(event => event.eventName === 'edit_mode_opened');
    expect(editEvents).toHaveLength(1);
    expect(editEvents[0].properties.sceneId).toBe('estate-hall');
  });

  it('returns focus to the invoking control when the detail panel is closed', () => {
    renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow: () => () => {},
      effectiveDate: '2026-07-17',
    });

    const projectButton = container.querySelector('[data-v2-open-detail="project"]');
    projectButton.focus();
    projectButton.click();

    const panel = container.querySelector('[data-v2-detail-panel]');
    const heading = container.querySelector('[data-v2-detail="project"] h2');
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(heading);

    container.querySelector('[data-v2-close-detail]').click();
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(projectButton);
  });

  it('closes the detail panel and restores focus on Escape', () => {
    renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(),
      mountWindow: () => () => {},
      effectiveDate: '2026-07-17',
    });

    const companionButton = container.querySelector('[data-v2-open-detail="companion"]');
    companionButton.focus();
    companionButton.click();
    const panel = container.querySelector('[data-v2-detail-panel]');
    expect(panel.hidden).toBe(false);

    container.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(companionButton);
  });

  it('consumes a reveal through the controller without changing world revision', () => {
    const reveal = {
      id: 'reveal-1',
      direction: 'forward',
      rewards: [{ rewardType: 'gold', amount: 10 }],
    };
    const source = v2State({ pendingRewardReveals: [reveal] });
    const consumeReveal = vi.fn(({ revealId }) => ({
      state: { ...source, pendingRewardReveals: [] },
      consumedReveal: revealId === reveal.id ? reveal : null,
      persisted: revealId === reveal.id,
    }));
    const mountWindow = vi.fn(() => () => {});
    renderPersonalSpaceV2(container, {
      user: coreState().user,
      coreState: coreState(),
      reconcile: () => controllerResult(source),
      consumeReveal,
      mountWindow,
      effectiveDate: '2026-07-17',
    });

    expect(mountWindow.mock.calls[0][1].model.pendingReveal.id).toBe(reveal.id);
    mountWindow.mock.calls[0][1].onRevealConsumed(reveal.id);

    expect(consumeReveal).toHaveBeenCalledWith({
      user: coreState().user,
      revealId: reveal.id,
    });
    expect(mountWindow.mock.calls[1][1].model.pendingReveal).toBeNull();
    expect(mountWindow.mock.calls[1][1].model.worldRevision).toBe(source.worldRevision);
  });

  it('dispatches the existing Personal Space route to V2 only when the flag is enabled', () => {
    state.user = coreState().user;
    state.tasks = coreState().tasks;
    state.dailyPlan = coreState().dailyPlan;
    state.sessions = [];
    localStorage.setItem(FLAG_PERSONAL_SPACE_RUNTIME, 'v2');

    const cleanup = renderPersonalSpace(container);

    expect(container.querySelector('[data-personal-space-v2]')).not.toBeNull();
    cleanup();
  });
});
