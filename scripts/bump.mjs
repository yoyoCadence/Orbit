#!/usr/bin/env node
/**
 * Usage: node scripts/bump.mjs [patch|minor|major]
 * Default: patch
 *
 * Atomically syncs the version across package.json, pwa/js/version.js
 * APP_VERSION, pwa/sw.js CACHE, package-lock.json and ROADMAP.md, then prepends
 * a CHANGELOG stub. Fail-closed: if any versioned marker is missing the process
 * exits non-zero so a partial bump is never reported as success.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { replaceInFile, syncPackageLock, syncRoadmapVersion } from './bumpLib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg  = process.argv[2] ?? 'patch';

if (!['patch', 'minor', 'major'].includes(arg)) {
  console.error(`Unknown bump type: "${arg}". Use patch | minor | major`);
  process.exit(1);
}

// ── 1. Read & bump version ────────────────────────────────────────────────────
const pkgPath = resolve(ROOT, 'package.json');
const pkg     = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = (pkg.version ?? '1.0.0').split('.').map(Number);

let nextVersion;
if (arg === 'major') nextVersion = `${maj + 1}.0.0`;
else if (arg === 'minor') nextVersion = `${maj}.${min + 1}.0`;
else nextVersion = `${maj}.${min}.${pat + 1}`;

const prevVStr = `v${pkg.version ?? '1.0.0'}`;
const nextVStr = `v${nextVersion}`;

pkg.version = nextVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`package.json  ${prevVStr} → ${nextVStr}`);

// ── 2. pwa/js/version.js ─────────────────────────────────────────────────────
replaceInFile(
  resolve(ROOT, 'pwa/js/version.js'),
  /export const APP_VERSION = 'v[\d.]+';/,
  `export const APP_VERSION = '${nextVStr}';`,
);
console.log(`pwa/js/version.js ${prevVStr} → ${nextVStr}`);

// ── 3. pwa/sw.js ─────────────────────────────────────────────────────────────
replaceInFile(
  resolve(ROOT, 'pwa/sw.js'),
  /const CACHE = 'orbit-v[\d.]+';/,
  `const CACHE = 'orbit-${nextVStr}';`,
);
console.log(`pwa/sw.js     orbit-${prevVStr} → orbit-${nextVStr}`);

// ── 4. package-lock.json ──────────────────────────────────────────────────────
syncPackageLock(ROOT, nextVersion);
console.log(`package-lock.json ${prevVStr} → ${nextVStr}`);

// ── 5. ROADMAP.md 目前版本 ────────────────────────────────────────────────────
syncRoadmapVersion(ROOT, nextVStr);
console.log(`ROADMAP.md    ${prevVStr} → ${nextVStr}`);

// ── 6. CHANGELOG.md stub ─────────────────────────────────────────────────────
const clPath = resolve(ROOT, 'CHANGELOG.md');
const clSrc  = readFileSync(clPath, 'utf8');
const today  = new Date().toISOString().slice(0, 10);
const stub   = `## [${nextVersion}] - ${today}\n\n### Added\n- \n\n### Fixed\n- \n\n---\n\n`;

// Insert after the first line (title) + blank line, before the first ## version block
const clNext = clSrc.replace(/(\n)(## \[)/, `\n${stub}$2`);
if (clNext === clSrc) {
  // fallback: prepend after first line
  const lines = clSrc.split('\n');
  lines.splice(2, 0, '', stub.trimEnd());
  writeFileSync(clPath, lines.join('\n'), 'utf8');
} else {
  writeFileSync(clPath, clNext, 'utf8');
}
console.log(`CHANGELOG.md  stub [${nextVersion}] added`);

console.log(`\nDone! Next: fill in CHANGELOG.md, then commit & PR.`);
