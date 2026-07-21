// Deterministic PS-243 asset & transfer baseline.
//
// This module is the single source of truth for the asset evidence recorded in
// docs/ps-243-production-acceptance.md. It is a pure function of repository
// content: given the same files it always produces the same numbers, so the
// committed docs/ps243/asset-baseline.json can be regenerated and diffed to
// prove the evidence is reproducible. Both the CLI runner
// (scripts/ps243-asset-baseline.mjs) and the CI budget test
// (tests/unit/ps243AssetBudget.test.js) consume it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

// Deterministic gzip estimate. Level 6 is Node's default and matches the
// originally recorded vendored-Pixi figure; it is an estimate, not a production
// network trace, so only the raw byte figures are treated as hard gates.
const GZIP_LEVEL = 6;

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

function listJsFiles(pwaRelativeDir) {
  const absoluteDir = join(PWA_ROOT, pwaRelativeDir);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
    const absolute = join(dir, dirent.name);
    if (dirent.isDirectory()) return walk(absolute);
    return dirent.name.endsWith('.js') ? [absolute] : [];
  });
  return walk(absoluteDir)
    .sort()
    .map(absolute => `${pwaRelativeDir}/${absolute.slice(absoluteDir.length + 1).split('\\').join('/')}`);
}

function gzipBundle(pwaRelativePaths) {
  const buffers = pwaRelativePaths.map(path => readFileSync(join(PWA_ROOT, path)));
  const rawBytes = buffers.reduce((total, buffer) => total + buffer.length, 0);
  const gzipBytes = gzipSync(Buffer.concat(buffers), { level: GZIP_LEVEL }).length;
  return { files: pwaRelativePaths.map(path => `pwa/${path}`), rawBytes, gzipBytes };
}

export function computeAssetBaseline() {
  const version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;

  const initialPaintFiles = WORKSPACE_INITIAL_PAINT_ASSETS.map(fileEntry);
  const completeProofFiles = getWorkspaceAssetManifestPaths().map(fileEntry);
  const initialPaintTotal = sumBytes(initialPaintFiles);
  const completeProofTotal = sumBytes(completeProofFiles);

  const v2AppJs = gzipBundle(listJsFiles('js/personalSpace/v2'));
  const vendoredPixi = gzipBundle(['vendor/pixi.js']);
  const combinedGzipBytes = v2AppJs.gzipBytes + vendoredPixi.gzipBytes;

  return {
    artifact: 'ps243-asset-baseline',
    appVersion: version,
    note: 'Reproducible: a pure function of committed files. No timestamps; '
      + 'regenerate with `npm run ps243:assets` and diff to verify.',
    method: {
      sizes: 'raw file bytes on disk (fs.statSync.size)',
      gzip: `zlib.gzipSync level ${GZIP_LEVEL}; deterministic estimate, not a production network trace`,
      fileSet: 'derived from pwa/js/personalSpace/v2/content/assetManifest.js',
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
        fileCount: v2AppJs.files.length,
        rawBytes: v2AppJs.rawBytes,
        gzipBytes: v2AppJs.gzipBytes,
      },
      vendoredPixi: {
        path: vendoredPixi.files[0],
        rawBytes: vendoredPixi.rawBytes,
        gzipBytes: vendoredPixi.gzipBytes,
      },
      combinedGzipBytes,
      budgetBytes: BUDGETS.deferredBundle.budgetBytes,
      result: combinedGzipBytes > BUDGETS.deferredBundle.budgetBytes ? 'FAIL' : 'PASS',
    },
  };
}
