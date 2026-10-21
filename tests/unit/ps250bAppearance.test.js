/**
 * @vitest-environment jsdom
 *
 * PS-250B: the user chooses the character style (全 Q 版 by default, or 全像素)
 * and the protagonist and Companion in Edit Mode. The choice is stored locally,
 * the scene resolves it, and only the default characters are precached, so a
 * chosen character that cannot load falls back to the default.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceSceneAssets,
  resolveWorkspaceVisualState,
  WORKSPACE_VISUAL_STATES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import {
  TOON_COMPANIONS,
  TOON_PROTAGONISTS,
  toonCompanionPath,
  toonProtagonistPath,
} from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';
import {
  createDefaultPersonalSpaceV2State,
  normalizePersonalSpaceV2State,
} from '../../pwa/js/personalSpace/v2/stateSchema.js';
import { loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import { buildPersonalSpaceV2Snapshot, buildHomeWindowViewModel } from '../../pwa/js/personalSpace/v2/viewModels.js';
import { mountOrbitWindow, renderOrbitWindow } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { describeControl, findControl } from '../../pwa/js/personalSpace/v2/remindWindow.js';
import {
  APPEARANCE_STYLES,
  readAppearanceChange,
  renderAppearancePicker,
  resolveAppearanceChoice,
  saveAppearanceChange,
} from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';

const TOON = 'assets/personal-space/v2/characters/toon';
const PIXEL = 'assets/personal-space/v2/characters';

function scene(appearance, protagonist = 'idle', companion = 'observe', facing = 'left') {
  return getWorkspaceSceneAssets(50, {}, { appearance, protagonist: { state: protagonist, facing }, companion: { state: companion } });
}

describe('PS-250B appearance resolution', () => {
  it('draws the Q-style office worker and Orbit by default', () => {
    expect(scene(undefined).protagonist).toBe(`${TOON}/protagonist/office-idle-left.webp`);
    expect(scene(undefined).companion.path).toBe(`${TOON}/companion/orbit-observe.webp`);
    expect(resolveWorkspaceVisualState({}).appearance).toEqual({ style: 'toon', protagonistId: 'office', companionId: 'orbit' });
  });

  it('draws the chosen Q-style characters and the PS-242 pixel characters', () => {
    const toon = scene({ style: 'toon', protagonistId: 'artist', companionId: 'fox' }, 'work', 'remind', 'right');
    expect(toon.protagonist).toBe(`${TOON}/protagonist/artist-work-right.webp`);
    expect(toon.companion.path).toBe(`${TOON}/companion/fox-remind.webp`);
    const pixel = scene({ style: 'pixel' }, 'rest', 'congratulate');
    expect(pixel.protagonist).toBe(`${PIXEL}/protagonist/player-default-rest-left.png`);
    expect(pixel.companion.path).toBe(`${PIXEL}/companion/orbit-guide-congratulate.png`);
  });

  it('falls back to the default style, or the style\'s first character, for anything unknown', () => {
    expect(scene({ style: 'watercolor', protagonistId: 'artist' }).appearance)
      .toEqual({ style: 'toon', protagonistId: 'artist', companionId: 'orbit' });
    // A Q-style id under the pixel style keeps working after a style switch.
    expect(scene({ style: 'pixel', protagonistId: 'artist', companionId: 'fox' }).appearance)
      .toEqual({ style: 'pixel', protagonistId: 'default', companionId: 'orbit-guide' });
    expect(scene({ style: 'toon', protagonistId: '../x', companionId: 7 }).appearance)
      .toEqual({ style: 'toon', protagonistId: 'office', companionId: 'orbit' });
  });

  it('builds the same Q-style paths as characterCatalog.js for every character, state and facing', () => {
    for (const { id } of TOON_PROTAGONISTS) {
      for (const state of WORKSPACE_VISUAL_STATES.protagonist) {
        for (const facing of WORKSPACE_VISUAL_STATES.facings) {
          expect(scene({ style: 'toon', protagonistId: id }, state, 'observe', facing).protagonist)
            .toBe(toonProtagonistPath(id, state, facing));
        }
      }
    }
    for (const { id } of TOON_COMPANIONS) {
      for (const state of WORKSPACE_VISUAL_STATES.companion.filter(state => state !== 'idle')) {
        expect(scene({ style: 'toon', companionId: id }, 'idle', state).companion.path).toBe(toonCompanionPath(id, state));
      }
    }
  });

  it('offers in the picker exactly the characters the scene can draw', () => {
    for (const style of APPEARANCE_STYLES) {
      for (const { id } of style.protagonists) {
        expect(scene({ style: style.id, protagonistId: id }).appearance.protagonistId).toBe(id);
      }
      for (const { id } of style.companions) {
        expect(scene({ style: style.id, companionId: id }).appearance.companionId).toBe(id);
      }
      expect(scene({ style: style.id }).appearance.style).toBe(style.id);
    }
    expect(APPEARANCE_STYLES.map(style => style.id)).toEqual(['toon', 'pixel']);
    expect(resolveAppearanceChoice({ style: 'pixel', protagonistId: 'artist' }))
      .toEqual(scene({ style: 'pixel', protagonistId: 'artist' }).appearance);
  });
});

describe('PS-250B appearance state', () => {
  it('stores no choice until the user makes one, so the state follows the default', () => {
    const fresh = createDefaultPersonalSpaceV2State('user-1');
    expect(fresh.world.appearance).toBeNull();
    // A state saved before PS-250B has no choice either; the scene draws the default.
    const old = normalizePersonalSpaceV2State({ ownerId: 'user-1', world: {} }, { ownerId: 'user-1' });
    expect(old.world.appearance).toBeNull();
    expect(resolveWorkspaceVisualState({ appearance: old.world.appearance }).appearance)
      .toEqual({ style: 'toon', protagonistId: 'office', companionId: 'orbit' });
    expect(normalizePersonalSpaceV2State({ ownerId: 'user-1', world: { appearance: [] } }, { ownerId: 'user-1' })
      .world.appearance).toBeNull();
  });

  it('keeps every style the picker offers through normalization', () => {
    for (const style of APPEARANCE_STYLES) {
      expect(normalizePersonalSpaceV2State({ ownerId: 'user-1', world: { appearance: { style: style.id } } }, { ownerId: 'user-1' })
        .world.appearance.style).toBe(style.id);
    }
  });

  it('normalizes a stored choice', () => {
    expect(normalizePersonalSpaceV2State({
      ownerId: 'user-1',
      world: { appearance: { style: 'oil', protagonistId: ' artist ', companionId: null } },
    }, { ownerId: 'user-1' }).world.appearance)
      .toEqual({ style: 'toon', protagonistId: 'artist', companionId: 'orbit' });
  });

  it('carries the choice into the Orbit Window model', () => {
    const v2State = createDefaultPersonalSpaceV2State('user-1');
    v2State.world.appearance = { style: 'toon', protagonistId: 'sporty', companionId: 'owl' };
    const snapshot = buildPersonalSpaceV2Snapshot({
      coreState: { user: { id: 'user-1' }, tasks: [], sessions: [], dailyPlan: [] },
      v2State,
      ledgerSnapshot: {},
      effectiveDate: '2026-10-21',
    });
    const model = buildHomeWindowViewModel(snapshot);
    expect(model.appearance).toEqual({ style: 'toon', protagonistId: 'sporty', companionId: 'owl' });
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow(model);
    expect(host.querySelector('.orbit-window-protagonist').getAttribute('src')).toContain('/toon/protagonist/sporty-');
    expect(host.querySelector('.orbit-window-companion').getAttribute('src')).toContain('/toon/companion/owl-');
  });
});

describe('PS-250B offline fallback in the poster', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('swaps a character that fails to load for the precached default', () => {
    const model = { appearance: { style: 'pixel' }, protagonist: { state: 'work' }, companion: { state: 'remind' } };
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow(model);
    document.body.appendChild(host);
    const root = host.querySelector('[data-orbit-window]');
    const protagonist = root.querySelector('.orbit-window-protagonist');
    const companion = root.querySelector('.orbit-window-companion');
    expect(protagonist.getAttribute('src')).toBe(`${PIXEL}/protagonist/player-default-work-left.png`);
    expect(protagonist.dataset.fallbackSrc).toBe(`${TOON}/protagonist/office-work-left.webp`);
    expect(companion.dataset.fallbackSrc).toBe(`${TOON}/companion/orbit-remind.webp`);

    const cleanup = mountOrbitWindow(root, { model, runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() } });
    protagonist.dispatchEvent(new Event('error'));
    expect(protagonist.getAttribute('src')).toBe(`${TOON}/protagonist/office-work-left.webp`);
    // The default itself never loops: a second error leaves it alone.
    protagonist.dispatchEvent(new Event('error'));
    expect(protagonist.getAttribute('src')).toBe(`${TOON}/protagonist/office-work-left.webp`);
    expect(companion.getAttribute('src')).toBe(`${PIXEL}/companion/orbit-guide-remind.png`);
    cleanup();
  });

  it('marks the default characters as their own fallback', () => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({});
    const protagonist = host.querySelector('.orbit-window-protagonist');
    expect(protagonist.dataset.fallbackSrc).toBe(protagonist.getAttribute('src'));
  });
});

describe('PS-250B Edit Mode picker', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('marks the current choice and shows the style\'s characters with thumbnails', () => {
    const host = document.createElement('div');
    host.innerHTML = renderAppearancePicker({ style: 'toon', protagonistId: 'hoodie', companionId: 'cube' });
    const pressed = [...host.querySelectorAll('[aria-pressed="true"]')].map(button => button.dataset.value);
    expect(pressed).toEqual(['toon', 'hoodie', 'cube']);
    const protagonists = host.querySelectorAll('[data-v2-appearance="protagonist"]');
    expect([...protagonists].map(button => button.dataset.value)).toEqual(TOON_PROTAGONISTS.map(entry => entry.id));
    expect(protagonists[0].querySelector('img').getAttribute('src')).toBe(`${TOON}/protagonist/office-idle-left.webp`);
    expect(host.querySelector('[data-v2-appearance="companion"][data-value="fox"] img').getAttribute('src'))
      .toBe(`${TOON}/companion/fox-observe.webp`);
    expect([...host.querySelectorAll('img')].every(image => image.getAttribute('loading') === 'lazy')).toBe(true);

    host.innerHTML = renderAppearancePicker({ style: 'pixel', protagonistId: 'hoodie' });
    expect([...host.querySelectorAll('[aria-pressed="true"]')].map(button => button.dataset.value))
      .toEqual(['pixel', 'default', 'orbit-guide']);
  });

  it('reads a button into a change and saves it on top of the stored state', () => {
    const button = document.createElement('button');
    button.dataset.v2Appearance = 'companion';
    button.dataset.value = 'jelly';
    expect(readAppearanceChange(button)).toEqual({ companionId: 'jelly' });
    button.dataset.v2Appearance = 'other';
    expect(readAppearanceChange(button)).toBeNull();
    button.dataset.v2Appearance = 'companion';
    button.setAttribute('aria-pressed', 'true');
    expect(readAppearanceChange(button)).toBeNull();

    const stored = createDefaultPersonalSpaceV2State('user-1');
    stored.worldRevision = 9;
    savePersonalSpaceV2State('user-1', stored);
    expect(stored.world.appearance).toBeNull();
    saveAppearanceChange('user-1', { style: 'pixel' });
    const saved = saveAppearanceChange('user-1', { protagonistId: 'artist' });
    expect(saved.world.appearance).toEqual({ style: 'pixel', protagonistId: 'artist', companionId: 'orbit' });
    expect(loadPersonalSpaceV2State('user-1').world.appearance).toEqual(saved.world.appearance);
    // Choosing a look is not a world change.
    expect(saved.worldRevision).toBe(9);
  });

  it('keeps focus on the same option when the reminder window re-renders the page (AI-203B)', () => {
    const root = document.createElement('div');
    root.innerHTML = renderAppearancePicker(null);
    document.body.appendChild(root);
    const owl = root.querySelector('[data-v2-appearance="companion"][data-value="owl"]');
    const key = describeControl(root, owl);
    root.innerHTML = renderAppearancePicker(null);
    expect(findControl(root, key)).toBe(root.querySelector('[data-v2-appearance="companion"][data-value="owl"]'));
  });

  it('does not create a state that was never migrated', () => {
    expect(saveAppearanceChange('user-1', { style: 'pixel' })).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
