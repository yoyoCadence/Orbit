// Fail-closed helpers for scripts/bump.mjs.
//
// Each helper returns a file's new content and throws on any inconsistency.
// bump.mjs works out every file's new content before it writes any of them, so
// a missing marker fails the bump with nothing written instead of leaving some
// files bumped and the lockfile/ROADMAP stale — the exact drift bump.mjs exists
// to prevent.

/**
 * `src` with the first match of `pattern` replaced. Throws if the pattern is
 * absent (so a moved/renamed marker fails the bump instead of silently leaving
 * a stale version behind). `name` is the file, for the message.
 */
export function replaceMarker(src, pattern, replacement, name) {
  const next = src.replace(pattern, replacement);
  if (next === src) {
    throw new Error(`bump: pattern ${pattern} not found in ${name}`);
  }
  return next;
}

/**
 * package-lock.json with the root and packages[""] versions set to
 * `nextVersion`. Throws if it is invalid JSON or has no root package entry.
 */
export function packageLockWithVersion(src, nextVersion) {
  let lock;
  try {
    lock = JSON.parse(src);
  } catch (error) {
    throw new Error(`bump: package-lock.json unreadable or invalid JSON — ${error.message}`);
  }
  if (!lock.packages || !lock.packages['']) {
    throw new Error('bump: package-lock.json missing root package entry (packages[""])');
  }
  lock.version = nextVersion;
  lock.packages[''].version = nextVersion;
  return `${JSON.stringify(lock, null, 2)}\n`;
}

/** ROADMAP.md with the "目前版本" marker set. Throws if the marker is absent. */
export function roadmapWithVersion(src, nextVStr) {
  return replaceMarker(src, /目前版本：\*\*v[\d.]+\*\*/, `目前版本：**${nextVStr}**`, 'ROADMAP.md');
}

/** CHANGELOG.md with a dated stub for `nextVersion` before the first version block. */
export function changelogWithStub(src, nextVersion, today) {
  const stub = `## [${nextVersion}] - ${today}\n\n### Added\n- \n\n### Fixed\n- \n\n---\n\n`;
  // Insert after the first line (title) + blank line, before the first ## version block
  const next = src.replace(/(\n)(## \[)/, `\n${stub}$2`);
  if (next !== src) return next;
  // fallback: prepend after first line
  const lines = src.split('\n');
  lines.splice(2, 0, '', stub.trimEnd());
  return lines.join('\n');
}
