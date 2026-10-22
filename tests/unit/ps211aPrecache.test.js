/**
 * ps211aPrecache.test.js — PS-211A: the service worker precaches every image
 * the Orbit Window poster can show, plus Pixi (user-approved A3 + P, 2026-10-20).
 *
 * The new worker activates only after cache.addAll() finishes, so after a
 * release the poster is complete in any state and state changes do not wait on
 * the network. This test derives the expected set from the code that produces
 * the states, so a new pose, Companion state, weather or prop cannot be added
 * without updating SHELL (the legacy idle-window images stayed in SHELL for
 * almost three months after V2 stopped using them).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { PERSONAL_SPACE_V2_WEATHER } from '../../pwa/js/personalSpace/v2/viewModels.js';
import { TIME_BANDS } from '../../pwa/js/timeBand.js';

const PWA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pwa');
const read = file => readFileSync(join(PWA, file), 'utf8');
const swSource = read('sw.js');
const SHELL = [...swSource.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)]
  .map(match => match[1]);

// The states a function in `file` can return, read from its `state: '…'` literals.
function statesReturnedBy(file, functionName) {
  const source = read(file);
  const start = source.indexOf(`export function ${functionName}(`);
  expect(start, `${functionName} in ${file}`).toBeGreaterThan(-1);
  const end = source.indexOf('\nexport function ', start + 1);
  const body = source.slice(start, end === -1 ? undefined : end);
  return [...new Set([...body.matchAll(/state: '([a-z-]+)'/g)].map(match => match[1]))].sort();
}

function posterAssetPaths() {
  const protagonistStates = statesReturnedBy('js/personalSpace/v2/viewModels.js', 'selectProtagonistState');
  const companionStates = statesReturnedBy('js/personalSpace/v2/companionEngine.js', 'getCompanionReaction');
  const paths = new Set();
  for (const { progress } of WORKSPACE_PROJECT_PHASES) {
    for (const protagonist of protagonistStates) {
      for (const companion of companionStates) {
        for (const weather of PERSONAL_SPACE_V2_WEATHER) {
          // PS-250E1: every time band, so the night room is precached too.
          for (const timeBand of Object.keys(TIME_BANDS)) {
            // No code sets a facing, so the poster always uses the default (left).
            // PS-250B: only the default appearance is precached (user-approved);
            // a chosen style or character falls back to it when offline.
            const scene = getWorkspaceSceneAssets(progress, {}, {
              protagonist: { state: protagonist },
              companion: { state: companion },
              weather,
            }, { timeBand });
            [scene.background, scene.protagonist, scene.companion.path, scene.weatherOverlay,
              ...scene.props.map(entry => entry.path)].forEach(path => paths.add(path));
          }
        }
      }
    }
  }
  return { paths: [...paths].sort(), protagonistStates, companionStates };
}

describe('PS-211A service worker precache', () => {
  it('relies only on what the code can produce: literal states and the default facing', () => {
    // The derivation reads `state: '…'` literals; a computed state would escape it.
    for (const [file, name] of [
      ['js/personalSpace/v2/viewModels.js', 'selectProtagonistState'],
      ['js/personalSpace/v2/companionEngine.js', 'getCompanionReaction'],
    ]) {
      const source = read(file);
      const start = source.indexOf(`export function ${name}(`);
      const body = source.slice(start, source.indexOf('\nexport function ', start + 1));
      expect(body.match(/state:\s*[^'\s]/g), `${name} only returns literal states`).toBeNull();
    }
    // Only the readers mention a facing; nothing that builds the V2 model sets
    // one, so the poster always uses the default (left) poses SHELL precaches.
    // (The legacy idle window under personalSpace/idleWindow has its own facings.)
    // characterCatalog.js only builds the file names of both facings (PS-250C),
    // and the developer gallery lists both facings of the pixel style (PS-250B).
    const readers = new Set([
      'js/personalSpace/v2/content/assetManifest.js',
      'js/personalSpace/v2/content/characterCatalog.js',
      'js/personalSpace/v2/ui/assetGallery.js',
      'js/personalSpace/v2/runtime/pixiSceneRuntime.js',
      'js/personalSpace/v2/ui/orbitWindow.js',
    ]);
    const files = [];
    const walk = dir => readdirSync(join(PWA, dir)).forEach(name => {
      const path = `${dir}/${name}`;
      if (statSync(join(PWA, path)).isDirectory()) walk(path);
      else if (path.endsWith('.js')) files.push(path);
    });
    walk('js/personalSpace/v2');
    walk('js/pages');
    readdirSync(join(PWA, 'js')).filter(name => name.endsWith('.js')).forEach(name => files.push(`js/${name}`));
    expect(files.filter(file => !readers.has(file) && /facing/i.test(read(file)))).toEqual([]);
  });

  it('derives the reachable states from the code', () => {
    const { protagonistStates, companionStates } = posterAssetPaths();
    expect(protagonistStates).toEqual(['celebrate', 'idle', 'inspect', 'rest', 'work']);
    expect(companionStates).toEqual(['approach', 'congratulate', 'observe', 'remind', 'rest', 'work']);
    expect([...PERSONAL_SPACE_V2_WEATHER].sort()).toEqual(['clear', 'rain']);
  });

  it('precaches exactly the images the Orbit Window poster can show', () => {
    const { paths } = posterAssetPaths();
    // PS-250E1: 22 by day, plus the night room and its 8 props.
    expect(paths).toHaveLength(31);
    expect(SHELL.filter(path => path.startsWith('assets/personal-space/v2/')).sort()).toEqual(paths);
  });

  it('drops the legacy idle-window images and adds Pixi', () => {
    expect(SHELL.filter(path => path.startsWith('assets/personal-space/') && !path.startsWith('assets/personal-space/v2/')))
      .toEqual([]);
    expect(SHELL).toContain('vendor/pixi.js');
  });

  it('revalidates the images and Pixi on install instead of trusting the HTTP cache', () => {
    const pattern = new RegExp(swSource.match(/const REVALIDATE_ON_INSTALL = \/(.*)\/;/)[1]);
    const revalidated = SHELL.filter(path => pattern.test(`./${path}`));
    expect(revalidated.sort()).toEqual([
      ...posterAssetPaths().paths,
      ...SHELL.filter(path => /\.(png|webp)$/.test(path) && !path.startsWith('assets/personal-space/v2/')),
      'vendor/pixi.js',
    ].sort());
    expect(swSource).toMatch(/new Request\(path, \{ cache: 'no-cache' \}\)/);
  });

  it('keeps Pixi out of the page\'s initial load (technical design §12.1)', () => {
    // Static imports only: the runtime imports Pixi dynamically when it mounts.
    const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:[^;'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
    const seen = new Set();
    const queue = ['js/app.js'];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      for (const match of read(file).matchAll(STATIC_IMPORT)) {
        queue.push(normalize(join(dirname(file), match[1])));
      }
    }
    expect(seen.size).toBeGreaterThan(40);
    expect([...seen].filter(file => file.includes('pixi.js'))).toEqual([]);
    expect(read('index.html')).not.toMatch(/pixi/i);
  });
});
