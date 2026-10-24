import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// An installed PWA must boot offline right after an update: activate deletes the
// previous cache, so any local module missing from SHELL is only fetched from the
// network and the whole module graph fails to evaluate without one. This walks
// the real import graph instead of trusting a hand-maintained list.
const PWA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pwa');
const swSource = readFileSync(join(PWA, 'sw.js'), 'utf8');
const shellBlock = swSource.match(/const SHELL = \[([\s\S]*?)\];/)[1];
const SHELL = [...shellBlock.matchAll(/'\.\/([^']*)'/g)].map(match => match[1]);

const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:[^;'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function localImports(file, pattern) {
  const source = readFileSync(join(PWA, file), 'utf8');
  return [...source.matchAll(pattern)].map(match => normalize(join(dirname(file), match[1])));
}

// Every module reachable from app.js, following static and literal dynamic
// imports, so lazily opened pages work offline too.
function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...localImports(file, STATIC_IMPORT), ...localImports(file, DYNAMIC_IMPORT));
  }
  return seen;
}

describe('service worker precache shell', () => {
  it('lists only files that exist, so cache.addAll() cannot reject the install', () => {
    const missing = SHELL.filter(path => path && !existsSync(join(PWA, path)));
    expect(missing).toEqual([]);
  });

  it('precaches every JS and CSS file, so new code arrives only with a new worker (INFRA-107)', () => {
    // The worker never refreshes a cached JS or CSS file, and fetches one not
    // in its cache from the server: a file left out of the SHELL could reach an
    // older version's cache as the next version's code.
    const shell = new Set(SHELL);
    const walk = dir => readdirSync(join(PWA, dir), { withFileTypes: true }).flatMap(entry => (
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
    ));
    const code = walk('.').filter(file => /\.(js|css)$/.test(file) && file !== 'sw.js');
    expect(code.length).toBeGreaterThan(100);
    expect(code.filter(file => !shell.has(file)).sort()).toEqual([]);
  });

  it('precaches every module the app can import', () => {
    const shell = new Set(SHELL);
    const graph = [...moduleGraph('js/app.js')].map(file => relative(PWA, join(PWA, file)));
    expect(graph.length).toBeGreaterThan(60);
    expect(graph.filter(file => !shell.has(file)).sort()).toEqual([]);
  });
});
