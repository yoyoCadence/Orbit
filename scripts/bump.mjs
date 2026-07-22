#!/usr/bin/env node
/**
 * Usage: node scripts/bump.mjs [patch|minor|major]
 * Default: patch
 *
 * Updates package.json version, pwa/js/app.js APP_VERSION,
 * pwa/sw.js CACHE, and prepends a CHANGELOG stub in one atomic pass.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
const appPath = resolve(ROOT, 'pwa/js/version.js');
const appSrc  = readFileSync(appPath, 'utf8');
const appNext = appSrc.replace(
  /export const APP_VERSION = 'v[\d.]+';/,
  `export const APP_VERSION = '${nextVStr}';`
);
if (appNext === appSrc) {
  console.error('WARN: APP_VERSION not updated — pattern not found in pwa/js/version.js');
} else {
  writeFileSync(appPath, appNext, 'utf8');
  console.log(`pwa/js/version.js ${prevVStr} → ${nextVStr}`);
}

// ── 3. pwa/sw.js ─────────────────────────────────────────────────────────────
const swPath = resolve(ROOT, 'pwa/sw.js');
const swSrc  = readFileSync(swPath, 'utf8');
const swNext = swSrc.replace(
  /const CACHE = 'orbit-v[\d.]+';/,
  `const CACHE = 'orbit-${nextVStr}';`
);
if (swNext === swSrc) {
  console.error('WARN: CACHE not updated — pattern not found in pwa/sw.js');
} else {
  writeFileSync(swPath, swNext, 'utf8');
  console.log(`pwa/sw.js     orbit-${prevVStr} → orbit-${nextVStr}`);
}

// ── 4. CHANGELOG.md stub ─────────────────────────────────────────────────────
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

// ── 5. package-lock.json ──────────────────────────────────────────────────────
const lockPath = resolve(ROOT, 'package-lock.json');
try {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) lock.packages[''].version = nextVersion;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log(`package-lock.json ${prevVStr} → ${nextVStr}`);
} catch {
  console.error('WARN: package-lock.json not updated — could not read/parse it');
}

// ── 6. ROADMAP.md 目前版本 ────────────────────────────────────────────────────
const roadmapPath = resolve(ROOT, 'ROADMAP.md');
const roadmapSrc = readFileSync(roadmapPath, 'utf8');
const roadmapNext = roadmapSrc.replace(
  /目前版本：\*\*v[\d.]+\*\*/,
  `目前版本：**${nextVStr}**`
);
if (roadmapNext === roadmapSrc) {
  console.error('WARN: 目前版本 not updated — pattern not found in ROADMAP.md');
} else {
  writeFileSync(roadmapPath, roadmapNext, 'utf8');
  console.log(`ROADMAP.md    ${prevVStr} → ${nextVStr}`);
}

console.log(`\nDone! Next: fill in CHANGELOG.md, then commit & PR.`);
