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

import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getWorkspaceSceneAssets,
  WORKSPACE_PROJECT_PHASES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';
import { PERSONAL_SPACE_V2_WEATHER } from '../../pwa/js/personalSpace/v2/viewModels.js';

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
          // No code sets a facing, so the poster always uses the default (left).
          const scene = getWorkspaceSceneAssets(progress, {}, {
            protagonist: { state: protagonist },
            companion: { state: companion },
            weather,
          });
          [scene.background, scene.protagonist, scene.companion.path, scene.weatherOverlay,
            ...scene.props.map(entry => entry.path)].forEach(path => paths.add(path));
        }
      }
    }
  }
  return { paths: [...paths].sort(), protagonistStates, companionStates };
}

describe('PS-211A service worker precache', () => {
  it('derives the reachable states from the code', () => {
    const { protagonistStates, companionStates } = posterAssetPaths();
    expect(protagonistStates).toEqual(['celebrate', 'idle', 'inspect', 'rest', 'work']);
    expect(companionStates).toEqual(['approach', 'congratulate', 'observe', 'remind', 'rest', 'work']);
    expect([...PERSONAL_SPACE_V2_WEATHER].sort()).toEqual(['clear', 'rain']);
  });

  it('precaches exactly the images the Orbit Window poster can show', () => {
    const { paths } = posterAssetPaths();
    expect(paths).toHaveLength(22);
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
