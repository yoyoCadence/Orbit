// Fail-closed helpers for scripts/bump.mjs.
//
// Every sync step throws on any inconsistency so a partial bump (some files
// updated, lockfile/ROADMAP left stale) can never be reported as success — the
// exact drift bump.mjs exists to prevent.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Replace the first match of `pattern` in a UTF-8 file. Throws if the file is
 * unreadable or the pattern is absent (so a moved/renamed marker fails the bump
 * instead of silently leaving a stale version behind).
 */
export function replaceInFile(filePath, pattern, replacement) {
  const src = readFileSync(filePath, 'utf8');
  const next = src.replace(pattern, replacement);
  if (next === src) {
    throw new Error(`bump: pattern ${pattern} not found in ${filePath}`);
  }
  writeFileSync(filePath, next, 'utf8');
}

/**
 * Sync package-lock.json root and packages[""] versions to `nextVersion`.
 * Throws if the lockfile is missing/invalid JSON, has no root package entry, or
 * the two version fields do not read back as `nextVersion` after writing.
 */
export function syncPackageLock(root, nextVersion) {
  const lockPath = join(root, 'package-lock.json');
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw new Error(`bump: package-lock.json unreadable or invalid JSON — ${error.message}`);
  }
  if (!lock.packages || !lock.packages['']) {
    throw new Error('bump: package-lock.json missing root package entry (packages[""])');
  }
  lock.version = nextVersion;
  lock.packages[''].version = nextVersion;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

  const after = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (after.version !== nextVersion || after.packages['']?.version !== nextVersion) {
    throw new Error(`bump: package-lock.json version did not update to ${nextVersion}`);
  }
}

/** Sync the ROADMAP "目前版本" marker. Throws if the marker is absent. */
export function syncRoadmapVersion(root, nextVStr) {
  replaceInFile(
    join(root, 'ROADMAP.md'),
    /目前版本：\*\*v[\d.]+\*\*/,
    `目前版本：**${nextVStr}**`,
  );
}
