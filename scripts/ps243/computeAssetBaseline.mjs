// Deterministic PS-243 asset & transfer baseline.
//
// This module is the single source of truth for the asset evidence recorded in
// docs/ps-243-production-acceptance.md. It is a pure function of the committed
// Git blob content: text bytes are normalized to LF so the result is identical
// on a Windows autocrlf working tree and on Linux CI, and the committed
// docs/ps243/asset-baseline.json can be regenerated and diffed to prove the
// evidence is reproducible. Both the CLI runner (scripts/ps243-asset-baseline.mjs)
// and the CI budget test (tests/unit/ps243AssetBudget.test.js) consume it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  WORKSPACE_INITIAL_PAINT_ASSETS,
  getWorkspaceAssetManifestPaths,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
const PWA_ROOT = join(REPO_ROOT, 'pwa');

const MB = 1024 * 1024;
const KB = 1024;

// Budgets and hard fallback thresholds. Targets track PS-242's authored-art
// goals; hard thresholds are the fallback ceiling this proof must stay under.
export const BUDGETS = Object.freeze({
  initialPaint: { targetBytes: 1.5 * MB, hardThresholdBytes: 2.5 * MB },
  completeProofScene: { targetBytes: 4 * MB, hardThresholdBytes: 6 * MB },
  deferredBundle: { budgetBytes: 300 * KB },
});

// Deterministic gzip estimate. Level 6 is Node's default; it is an estimate, not
// a production network trace, so only the raw byte figures are treated as gates.
const GZIP_LEVEL = 6;

// The deferred V2 JS bundle: the v2/ module directory plus every Personal Space
// module transitively reachable from the V2 route entry (route page, unlockRules,
// economy, gameState, …). App-core modules (engine/state/leveling/…) are always
// loaded and counted elsewhere, so the closure is scoped to the Personal Space
// namespace and the route entry only.
const V2_ROUTE_ENTRY = 'js/pages/personalSpaceV2.js';
const V2_NAMESPACE_PREFIXES = ['js/personalSpace/'];

function toPosix(value) {
  return value.split('\\').join('/');
}

// Normalize CRLF → LF to match the committed Git blob on any platform. Binary
// assets are sized with statSync and never routed through here.
function normalizeToLf(buffer) {
  const out = Buffer.allocUnsafe(buffer.length);
  let length = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0d && buffer[index + 1] === 0x0a) continue;
    out[length] = buffer[index];
    length += 1;
  }
  return out.subarray(0, length);
}

function readCanonicalText(pwaRelativePath) {
  return normalizeToLf(readFileSync(join(PWA_ROOT, pwaRelativePath)));
}

function inV2Namespace(pwaRelativePath) {
  return pwaRelativePath === V2_ROUTE_ENTRY
    || V2_NAMESPACE_PREFIXES.some(prefix => pwaRelativePath.startsWith(prefix));
}

function listJsFiles(pwaRelativeDir) {
  const absoluteDir = join(PWA_ROOT, pwaRelativeDir);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
    const absolute = join(dir, dirent.name);
    if (dirent.isDirectory()) return walk(absolute);
    return dirent.name.endsWith('.js') ? [absolute] : [];
  });
  return walk(absoluteDir)
    .map(absolute => `${pwaRelativeDir}/${toPosix(absolute.slice(absoluteDir.length + 1))}`);
}

// Relative import/export/dynamic-import specifiers in a module's source.
function relativeSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (match[1].startsWith('.')) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function resolveImport(fromPwaRelative, specifier) {
  return posix.normalize(posix.join(posix.dirname(fromPwaRelative), specifier));
}

// Transitive Personal Space closure reachable from the V2 route entry.
function crawlV2Namespace() {
  const found = new Set();
  const queue = [V2_ROUTE_ENTRY];
  while (queue.length > 0) {
    const file = queue.shift();
    if (found.has(file) || !inV2Namespace(file)) continue;
    let source;
    try {
      source = readFileSync(join(PWA_ROOT, file), 'utf8');
    } catch {
      continue; // specifier without a matching file — skip, never guess
    }
    found.add(file);
    for (const specifier of relativeSpecifiers(source)) {
      const dependency = resolveImport(file, specifier);
      if (inV2Namespace(dependency) && !found.has(dependency)) queue.push(dependency);
    }
  }
  return found;
}

function collectV2JsFiles() {
  const set = new Set([
    ...listJsFiles('js/personalSpace/v2'),
    ...crawlV2Namespace(),
  ]);
  return [...set].filter(inV2Namespace).sort();
}

function fileEntry(pwaRelativePath) {
  const bytes = statSync(join(PWA_ROOT, pwaRelativePath)).size;
  return { path: `pwa/${pwaRelativePath}`, bytes };
}

function sumBytes(entries) {
  return entries.reduce((total, entry) => total + entry.bytes, 0);
}

function classify(totalBytes, { targetBytes, hardThresholdBytes }) {
  if (totalBytes > hardThresholdBytes) return 'FAIL';
  if (totalBytes > targetBytes) return 'FOLLOW-UP';
  return 'PASS';
}

export function computeAssetBaseline() {
  const version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;

  const initialPaintFiles = WORKSPACE_INITIAL_PAINT_ASSETS.map(fileEntry);
  const completeProofFiles = getWorkspaceAssetManifestPaths().map(fileEntry);
  const initialPaintTotal = sumBytes(initialPaintFiles);
  const completeProofTotal = sumBytes(completeProofFiles);

  const v2JsPaths = collectV2JsFiles();
  const v2JsBuffers = v2JsPaths.map(readCanonicalText);
  const v2JsFiles = v2JsPaths.map((path, index) => ({
    path: `pwa/${path}`,
    bytes: v2JsBuffers[index].length,
  }));
  const v2RawBytes = sumBytes(v2JsFiles);
  const v2GzipBytes = gzipSync(Buffer.concat(v2JsBuffers), { level: GZIP_LEVEL }).length;

  const pixiBuffer = readCanonicalText('vendor/pixi.js');
  const pixiGzipBytes = gzipSync(pixiBuffer, { level: GZIP_LEVEL }).length;
  const combinedGzipBytes = v2GzipBytes + pixiGzipBytes;

  return {
    artifact: 'ps243-asset-baseline',
    appVersion: version,
    note: 'Reproducible: a pure function of committed files with CRLF normalized '
      + 'to LF. No timestamps; regenerate with `npm run ps243:assets` and diff to verify.',
    method: {
      assetSizes: 'raw binary file bytes on disk (fs.statSync.size)',
      jsBytes: 'text bytes with CRLF normalized to LF (matches the committed Git blob on any platform)',
      gzip: `zlib.gzipSync level ${GZIP_LEVEL} over the LF-normalized bytes; deterministic estimate, not a production network trace`,
      assetFileSet: 'derived from pwa/js/personalSpace/v2/content/assetManifest.js',
      jsFileSet: 'union of pwa/js/personalSpace/v2/** and the Personal Space transitive closure from pwa/js/pages/personalSpaceV2.js',
    },
    runtimeSceneAssets: {
      initialPaint: {
        files: initialPaintFiles,
        totalBytes: initialPaintTotal,
        ...BUDGETS.initialPaint,
        result: classify(initialPaintTotal, BUDGETS.initialPaint),
      },
      completeProofScene: {
        files: completeProofFiles,
        totalBytes: completeProofTotal,
        ...BUDGETS.completeProofScene,
        result: classify(completeProofTotal, BUDGETS.completeProofScene),
      },
    },
    deferredJsBundles: {
      personalSpaceV2AppJs: {
        fileCount: v2JsFiles.length,
        files: v2JsFiles,
        rawBytes: v2RawBytes,
        gzipBytes: v2GzipBytes,
      },
      vendoredPixi: {
        path: 'pwa/vendor/pixi.js',
        rawBytes: pixiBuffer.length,
        gzipBytes: pixiGzipBytes,
      },
      combinedGzipBytes,
      budgetBytes: BUDGETS.deferredBundle.budgetBytes,
      result: combinedGzipBytes > BUDGETS.deferredBundle.budgetBytes ? 'FAIL' : 'PASS',
    },
  };
}
