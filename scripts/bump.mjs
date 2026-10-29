#!/usr/bin/env node
/**
 * Usage: node scripts/bump.mjs [patch|minor|major]
 * Default: patch
 *
 * Atomically syncs the version across package.json, pwa/js/version.js
 * APP_VERSION, pwa/sw.js CACHE, package-lock.json and ROADMAP.md, then prepends
 * a CHANGELOG stub. Fail-closed: every file's new content is worked out before
 * any is written, so if any versioned marker is missing the process exits
 * non-zero with nothing written (a write that fails partway, e.g. a full disk,
 * can still leave some files bumped).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { changelogWithStub, packageLockWithVersion, replaceMarker, roadmapWithVersion } from './bumpLib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg  = process.argv[2] ?? 'patch';

if (!['patch', 'minor', 'major'].includes(arg)) {
  console.error(`Unknown bump type: "${arg}". Use patch | minor | major`);
  process.exit(1);
}

const read = path => readFileSync(resolve(ROOT, path), 'utf8');

// ── 1. Work out every file's new content (throws before anything is written) ─
function plan() {
  const pkg = JSON.parse(read('package.json'));
  const [maj, min, pat] = (pkg.version ?? '1.0.0').split('.').map(Number);

  let nextVersion;
  if (arg === 'major') nextVersion = `${maj + 1}.0.0`;
  else if (arg === 'minor') nextVersion = `${maj}.${min + 1}.0`;
  else nextVersion = `${maj}.${min}.${pat + 1}`;

  const prevVStr = `v${pkg.version ?? '1.0.0'}`;
  const nextVStr = `v${nextVersion}`;
  const moved = `${prevVStr} → ${nextVStr}`;
  pkg.version = nextVersion;

  return [
    ['package.json', `${JSON.stringify(pkg, null, 2)}\n`, moved],
    ['pwa/js/version.js', replaceMarker(
      read('pwa/js/version.js'),
      /export const APP_VERSION = 'v[\d.]+';/,
      `export const APP_VERSION = '${nextVStr}';`,
      'pwa/js/version.js',
    ), moved],
    ['pwa/sw.js', replaceMarker(
      read('pwa/sw.js'),
      /const CACHE = 'orbit-v[\d.]+';/,
      `const CACHE = 'orbit-${nextVStr}';`,
      'pwa/sw.js',
    ), `orbit-${prevVStr} → orbit-${nextVStr}`],
    ['package-lock.json', packageLockWithVersion(read('package-lock.json'), nextVersion), moved],
    ['ROADMAP.md', roadmapWithVersion(read('ROADMAP.md'), nextVStr), moved],
    ['CHANGELOG.md', changelogWithStub(read('CHANGELOG.md'), nextVersion, new Date().toISOString().slice(0, 10)),
      `stub [${nextVersion}] added`],
  ];
}

let files;
try {
  files = plan();
} catch (error) {
  console.error(error.message);
  console.error('Nothing was written.');
  process.exit(1);
}

// ── 2. Write them all ─────────────────────────────────────────────────────────
for (const [path, content, change] of files) {
  writeFileSync(resolve(ROOT, path), content, 'utf8');
  console.log(`${path.padEnd(17)} ${change}`);
}

console.log(`\nDone! Next: fill in CHANGELOG.md, then commit & PR.`);
