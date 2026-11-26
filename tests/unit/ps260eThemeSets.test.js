/**
 * @vitest-environment jsdom
 *
 * ps260eThemeSets.test.js — PS-260E: the ten themed sets in Personal Space.
 *
 * Each set (art-pipeline/ps260-sets) is a protagonist, its room and the room's
 * two decorations. The picker offers them one by one (protagonist, room,
 * decoration switches) and as a 「主題套組」 that applies all three in one tap.
 * A set's room has its own view out of the window, so no PS-251B view is laid
 * over it, and its two decorations stand only in that room. Nothing of a set is
 * precached: it is downloaded the first time it is shown (PS-250B).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceAssetManifestPaths,
  getWorkspaceSceneAssets,
  WORKSPACE_VISUAL_STATES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { TOON_PROTAGONISTS } from '../../pwa/js/personalSpace/v2/content/characterCatalog.js';
import { createDefaultPersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/stateSchema.js';
import { loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../../pwa/js/personalSpace/v2/store.js';
import {
  DECORATIONS,
  readAppearanceChange,
  renderAppearancePicker,
  resolveAppearanceChoice,
  ROOM_STYLES,
  saveAppearanceChange,
  THEME_SETS,
} from '../../pwa/js/personalSpace/v2/ui/appearancePicker.js';
import { mountOrbitWindow, renderOrbitWindow } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PWA = join(REPO, 'pwa');
const SETS_DIR = join(REPO, 'art-pipeline', 'ps260-sets');
const sets = JSON.parse(readFileSync(join(SETS_DIR, 'outputs.json'), 'utf8'));
const placements = JSON.parse(readFileSync(join(SETS_DIR, 'decor-placements.json'), 'utf8'));
const SHELL = [...readFileSync(join(PWA, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);
const STANDARD = ['deco-trophy', 'deco-globe', 'deco-beanbag', 'deco-floor-lamp', 'deco-succulent', 'deco-coffee'];
const LIGHTINGS = { day: 'day', night: 'night' };

const scene = (set, { style = 'toon', timeBand = 'day', progress = 100, roomStyle = set.room, hidden } = {}) => (
  getWorkspaceSceneAssets(progress, {}, { appearance: { style, protagonistId: set.id } }, {
    roomStyle, timeBand, hiddenDecorations: hidden,
  })
);

function picker(...args) {
  const host = document.createElement('div');
  host.innerHTML = renderAppearancePicker(...args);
  return host;
}

// What poster() mounts, released after each test.
const cleanups = [];

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('PS-260E theme sets: data', () => {
  it('offers the ten sets of the pipeline, five male then five female', () => {
    expect(THEME_SETS.map(({ id, room, decorations }) => ({ protagonist: id, room, decorations })))
      .toEqual(sets.sets);
    expect(sets.protagonist.ids.slice(0, 5).every(entry => entry.gender === 'male')).toBe(true);
    expect(sets.protagonist.ids.slice(5).every(entry => entry.gender === 'female')).toBe(true);
  });

  it('labels each protagonist, room and decoration as the pipeline does', () => {
    const catalog = readFileSync(join(SETS_DIR, 'sets_catalog.py'), 'utf8');
    for (const set of THEME_SETS) {
      const protagonist = TOON_PROTAGONISTS.find(entry => entry.id === set.id);
      expect(protagonist?.label, set.id).toBe(sets.protagonist.ids.find(entry => entry.id === set.id).label);
      const room = ROOM_STYLES.find(entry => entry.id === set.room);
      expect(catalog, set.room).toContain(`'room': ('${set.room}', '${room?.label}')`);
      for (const id of set.decorations) {
        const label = DECORATIONS.find(entry => entry.id === id)?.label;
        expect(catalog, id).toContain(`('${id}', '${label}')`);
      }
    }
  });

  it('places each set decoration where the pipeline trimmed it, by day and by night', () => {
    for (const set of THEME_SETS) {
      for (const [timeBand, lighting] of Object.entries(LIGHTINGS)) {
        const own = scene(set, { timeBand }).decorations.filter(entry => set.decorations.includes(entry.id));
        expect(own.map(entry => entry.id).sort(), set.id).toEqual([...set.decorations].sort());
        for (const entry of own) {
          const record = placements.rooms[set.room][entry.id][lighting];
          expect(entry.path).toBe(record.path);
          expect(entry.placement).toEqual({
            anchor: 'center-bottom', x: record.x, y: record.y, width: record.width, z: record.z,
          });
          expect(entry.support).toBe(null);
          expect(entry.minProgress).toBe(0);
        }
      }
    }
  });
});

describe('PS-260E theme sets: the scene', () => {
  it('draws each set in both styles, by day and by night, from shipped files', () => {
    for (const set of THEME_SETS) {
      for (const style of ['toon', 'pixel']) {
        for (const timeBand of Object.values(LIGHTINGS)) {
          const resolved = scene(set, { style, timeBand });
          expect(resolved.roomStyle).toBe(set.room);
          expect(resolved.appearance.protagonistId).toBe(set.id);
          expect(resolved.decorations.map(entry => entry.id)).toEqual([...STANDARD, ...set.decorations]);
          const paths = [
            resolved.background,
            ...resolved.props.map(entry => entry.path),
            ...resolved.decorations.map(entry => entry.path),
            resolved.protagonist,
          ];
          for (const path of paths) expect(existsSync(join(PWA, path)), path).toBe(true);
          expect(resolved.background).toContain(`/styles/${set.room}/`);
        }
      }
      for (const state of WORKSPACE_VISUAL_STATES.protagonist) {
        for (const facing of WORKSPACE_VISUAL_STATES.facings) {
          for (const style of ['toon', 'pixel']) {
            const path = getWorkspaceSceneAssets(0, {}, {
              appearance: { style, protagonistId: set.id }, protagonist: { state, facing },
            }).protagonist;
            expect(path).toContain(`/${set.id}-${state}-${facing}.`);
            expect(existsSync(join(PWA, path)), path).toBe(true);
          }
        }
      }
    }
  });

  it('shows a set\'s decorations only in its own room', () => {
    const own = new Set(THEME_SETS.flatMap(set => set.decorations));
    for (const roomStyle of ['default', 'nordic', 'study']) {
      const ids = getWorkspaceSceneAssets(100, {}, {}, { roomStyle }).decorations.map(entry => entry.id);
      expect(ids).toEqual(STANDARD);
    }
    const [first, second] = THEME_SETS;
    const elsewhere = scene(first, { roomStyle: second.room }).decorations.map(entry => entry.id);
    expect(elsewhere).toEqual([...STANDARD, ...second.decorations]);
    expect(elsewhere.some(id => first.decorations.includes(id))).toBe(false);
    expect(own.size).toBe(20);
  });

  it('lays no PS-251B city view over a set\'s room, which has its own view', () => {
    for (const set of THEME_SETS) {
      for (const timeBand of ['morning', 'evening']) {
        expect(scene(set, { timeBand }).exterior, `${set.room} ${timeBand}`).toBe(null);
      }
    }
    // The PS-250 rooms keep it.
    expect(getWorkspaceSceneAssets(0, {}, {}, { roomStyle: 'nordic', timeBand: 'morning' }).exterior)
      .toContain('/window/exterior-morning');
  });

  it('switches a set decoration off like any other', () => {
    const [set] = THEME_SETS;
    const ids = scene(set, { hidden: [set.decorations[0], 'deco-globe'] }).decorations.map(entry => entry.id);
    expect(ids).not.toContain(set.decorations[0]);
    expect(ids).not.toContain('deco-globe');
    expect(ids).toContain(set.decorations[1]);
  });

  it('precaches nothing of the sets', () => {
    const manifest = new Set(getWorkspaceAssetManifestPaths());
    for (const set of THEME_SETS) {
      for (const style of ['toon', 'pixel']) {
        const resolved = scene(set, { style });
        for (const path of [resolved.background, resolved.protagonist, ...resolved.decorations.map(entry => entry.path)]) {
          expect(SHELL).not.toContain(path);
          expect(manifest.has(path), path).toBe(false);
        }
      }
    }
  });
});

describe('PS-260E theme sets: the picker', () => {
  it('offers each set, with its protagonist as the picture and the protagonist and room as its name', () => {
    const host = picker(null, 'default', []);
    const buttons = [...host.querySelectorAll('[data-v2-appearance="set"]')];
    expect(host.querySelector('[data-v2-appearance="set"]').closest('fieldset').querySelector('legend').textContent)
      .toBe('主題套組');
    expect(buttons.map(button => button.dataset.value)).toEqual(THEME_SETS.map(set => set.id));
    expect(buttons[0].textContent.trim()).toBe('太空人・太空站');
    expect(buttons[5].textContent.trim()).toBe('魔法師・魔法塔');
    expect(buttons[0].querySelector('img').getAttribute('src')).toBe(scene(THEME_SETS[0], { timeBand: 'day' }).protagonist
      .replace(/-[a-z]+-(left|right)\.webp$/, '-idle-left.webp'));
    expect(buttons.every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    // The rooms and the room's decorations are offered one by one too.
    expect([...host.querySelectorAll('[data-v2-appearance="room"]')].map(button => button.dataset.value))
      .toEqual(ROOM_STYLES.map(entry => entry.id));
  });

  it('marks the set whose protagonist, room and decorations are all shown', () => {
    const [set, other] = THEME_SETS;
    const pressed = host => [...host.querySelectorAll('[data-v2-appearance="set"][aria-pressed="true"]')]
      .map(button => button.dataset.value);
    expect(pressed(picker({ protagonistId: set.id }, set.room, []))).toEqual([set.id]);
    expect(pressed(picker({ protagonistId: set.id, style: 'pixel' }, set.room, ['deco-globe']))).toEqual([set.id]);
    expect(pressed(picker({ protagonistId: set.id }, other.room, []))).toEqual([]);
    expect(pressed(picker({ protagonistId: other.id }, set.room, []))).toEqual([]);
    // One of its decorations switched off: pressing the set shows it again.
    const host = picker({ protagonistId: set.id }, set.room, [set.decorations[1]]);
    expect(pressed(host)).toEqual([]);
    expect(readAppearanceChange(host.querySelector(`[data-v2-appearance="set"][data-value="${set.id}"]`)))
      .toEqual({ protagonistId: set.id, selectedThemeId: set.room, showDecorations: set.decorations });
    // An older page that passes no hidden decorations.
    expect(pressed(picker({ protagonistId: set.id }, set.room))).toEqual([set.id]);
  });

  it('shows the chosen set room\'s decorations as switches: the six and its own two', () => {
    const set = THEME_SETS[9];
    const host = picker({ protagonistId: set.id }, set.room, [set.decorations[1]]);
    const switches = [...host.querySelectorAll('[data-v2-appearance="decoration"]')];
    expect(switches.map(button => button.dataset.value)).toEqual([...STANDARD, ...set.decorations]);
    expect(switches.find(button => button.dataset.value === set.decorations[1]).getAttribute('aria-pressed')).toBe('false');
    expect(switches.find(button => button.dataset.value === set.decorations[0]).querySelector('img').getAttribute('src'))
      .toContain(`/decor/styles/${set.room}/${set.decorations[0]}.png`);
  });

  it('applies a set in one tap: its protagonist, its room, and its decorations shown', () => {
    const owner = 'user-1';
    const state = createDefaultPersonalSpaceV2State(owner);
    const set = THEME_SETS[3];
    savePersonalSpaceV2State(owner, {
      ...state,
      world: {
        ...state.world,
        appearance: { style: 'pixel', protagonistId: 'office', companionId: 'owl' },
        hiddenDecorations: [set.decorations[0], 'deco-globe'],
      },
    });
    const host = picker({ style: 'pixel', protagonistId: 'office', companionId: 'owl' }, 'default', []);
    const button = host.querySelector(`[data-v2-appearance="set"][data-value="${set.id}"]`);
    const change = readAppearanceChange(button);
    expect(change).toEqual({ protagonistId: set.id, selectedThemeId: set.room, showDecorations: set.decorations });
    const saved = saveAppearanceChange(owner, change);
    expect(saved.world.selectedThemeId).toBe(set.room);
    // The style and the Companion stay as chosen.
    expect(saved.world.appearance).toEqual({ style: 'pixel', protagonistId: set.id, companionId: 'owl' });
    // Its decorations are shown again; another hidden one stays hidden.
    expect(saved.world.hiddenDecorations).toEqual(['deco-globe']);
    expect(loadPersonalSpaceV2State(owner).world.selectedThemeId).toBe(set.room);
    expect(resolveAppearanceChoice(saved.world.appearance).protagonistId).toBe(set.id);
  });

  it('asks for no change when the set is already applied, or for an unknown set', () => {
    const [set] = THEME_SETS;
    const host = picker({ protagonistId: set.id }, set.room, []);
    expect(readAppearanceChange(host.querySelector(`[data-v2-appearance="set"][data-value="${set.id}"]`))).toBe(null);
    const unknown = document.createElement('button');
    unknown.dataset.v2Appearance = 'set';
    unknown.dataset.value = 'pirate';
    expect(readAppearanceChange(unknown)).toBe(null);
  });
});

const VIEW = (band, pixel) => (pixel
  ? `assets/personal-space/v2/workspace/pixel/window/exterior-${band}.png`
  : `assets/personal-space/v2/workspace/window/exterior-${band}.webp`);

function poster(set, { timeBand = 'morning', style = 'toon', roomStyle = set.room } = {}) {
  const host = document.createElement('div');
  host.innerHTML = renderOrbitWindow({
    activeProject: { progress: 100 },
    timeBand,
    selectedThemeId: roomStyle,
    appearance: { style, protagonistId: set.id },
  });
  document.body.append(host);
  const root = host.querySelector('[data-orbit-window]');
  cleanups.push(mountOrbitWindow(root, { runtime: { mount: vi.fn(() => Promise.resolve()), release: vi.fn() } }));
  return root;
}

describe('PS-260E theme sets: the Orbit Window poster', () => {
  it('draws a set: its room, protagonist and decorations, and no city view in the morning', () => {
    const set = THEME_SETS[5];
    const root = poster(set);
    expect(root.querySelector('.orbit-window-background').getAttribute('src')).toContain(`/styles/${set.room}/background.webp`);
    // The default room's view waits, hidden and not requested (see below).
    const exterior = root.querySelector('.orbit-window-exterior');
    expect(exterior.hidden).toBe(true);
    expect(exterior.hasAttribute('src')).toBe(false);
    expect(root.querySelector('.orbit-window-protagonist').getAttribute('src')).toContain(`/toon/protagonist/${set.id}-`);
    const decorations = [...root.querySelectorAll('.orbit-window-decoration')].map(image => image.dataset.decorationId);
    expect(decorations).toEqual([...STANDARD, ...set.decorations]);
    // A set decoration has no default-room twin: it is marked as the room's
    // own, and if it cannot load, it is left out.
    const roomOnly = [...root.querySelectorAll('[data-room-only]')].map(image => image.dataset.decorationId);
    expect(roomOnly).toEqual(set.decorations);
    const own = root.querySelector(`[data-decoration-id="${set.decorations[0]}"]`);
    expect(own.dataset.fallbackSrc).toBe(own.getAttribute('src'));
    // Only a set room has room-only decorations, and only a set room's view waits.
    const other = poster(set, { roomStyle: 'nordic' });
    expect(other.querySelectorAll('[data-room-only]')).toHaveLength(0);
    expect(other.querySelector('.orbit-window-exterior').getAttribute('src')).toBe(VIEW('morning'));
    expect(poster(set, { timeBand: 'day' }).querySelector('.orbit-window-exterior')).toBe(null);
  });

  it('draws the default room as the Pixi scene does when a set room cannot load: its view, none of the set\'s decorations', () => {
    const set = THEME_SETS[2];
    for (const [timeBand, style] of [['morning', 'toon'], ['evening', 'pixel']]) {
      const root = poster(set, { timeBand, style });
      const background = root.querySelector('.orbit-window-background');
      const exterior = root.querySelector('.orbit-window-exterior');
      expect(exterior.dataset.exteriorFallback).toBe(VIEW(timeBand));
      // The default room's view is the Q-style one, even with pixel characters.
      expect(exterior.hasAttribute('data-pixel-art')).toBe(false);
      background.dispatchEvent(new Event('error'));
      expect(background.getAttribute('src')).toMatch(/workspace\/backgrounds\/building-formal-workstation-room-v2(-night)?\.webp$/);
      expect(exterior.hidden).toBe(false);
      expect(exterior.getAttribute('src')).toBe(VIEW(timeBand));
      expect(exterior.previousElementSibling).toBe(background);
      const decorations = [...root.querySelectorAll('.orbit-window-decoration')].map(image => image.dataset.decorationId);
      expect(decorations, `${timeBand} ${style}`).toEqual(STANDARD);
    }
  });

  it('keeps a set room as it is when only its decorations cannot load', () => {
    const set = THEME_SETS[0];
    const root = poster(set);
    const own = root.querySelector(`[data-decoration-id="${set.decorations[0]}"]`);
    own.dispatchEvent(new Event('error'));
    expect(own.getAttribute('src')).toContain(`/decor/styles/${set.room}/`);
    expect(root.querySelector('.orbit-window-exterior').hidden).toBe(true);
    expect(root.querySelectorAll('[data-room-only]')).toHaveLength(2);
  });
});
