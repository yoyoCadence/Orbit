// INFRA-108: the rule CI applies to a pull request, as pure functions so the
// unit tests can cover every case without git.
//
// Since INFRA-107 the service worker serves one version's HTML and code from
// its cache and never refreshes them, so a new CACHE name (`npm run bump`) is
// the only way a change to the deployed `pwa/` reaches installed apps.

// Files under pwa/ that GitHub Pages serves but no browser ever runs.
const NOT_SERVED_TO_USERS = new Set(['pwa/server.cjs']);

/** The changed paths that ship to users: everything under pwa/ but the dev server. */
export function deployedChanges(changedFiles) {
  return changedFiles.filter(file => file.startsWith('pwa/') && !NOT_SERVED_TO_USERS.has(file));
}

/** Compare two `x.y.z` versions: negative, zero or positive like a sort comparator. */
export function compareVersions(left, right) {
  const parse = version => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
    if (!match) throw new Error(`not an x.y.z version: ${version}`);
    return match.slice(1).map(Number);
  };
  const [a, b] = [parse(left), parse(right)];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** The `CACHE` name declared in a sw.js source, or null when there is none. */
export function cacheName(swSource) {
  return /const CACHE = '([^']*)';/.exec(swSource ?? '')?.[1] ?? null;
}

/**
 * Decide whether a pull request may merge.
 * - `changedFiles`: paths the PR changes relative to its base.
 * - `base` / `head`: `{ version, swSource }` (package.json version, pwa/sw.js).
 * Returns `{ ok, message }`; `message` says what to do when `ok` is false.
 */
export function checkVersionBump({ changedFiles, base, head }) {
  const deployed = deployedChanges(changedFiles);
  if (deployed.length === 0) {
    return { ok: true, message: 'No deployed file under pwa/ changed: no bump needed.' };
  }
  const listed = deployed.slice(0, 10).join(', ') + (deployed.length > 10 ? `, … (${deployed.length} files)` : '');
  const fix = 'Run `npm run bump -- patch` (or minor) in this PR, fill in the CHANGELOG, and commit.';
  const baseCache = cacheName(base.swSource);
  const headCache = cacheName(head.swSource);
  if (!headCache) {
    return { ok: false, message: 'pwa/sw.js has no `const CACHE = \'…\';` line.' };
  }
  if (baseCache && headCache === baseCache) {
    return {
      ok: false,
      message: `pwa/ changed (${listed}) but the service worker CACHE is still ${baseCache}: installed apps would never get this change (INFRA-107). ${fix}`,
    };
  }
  if (compareVersions(head.version, base.version) <= 0) {
    return {
      ok: false,
      message: `pwa/ changed (${listed}) but the version ${head.version} is not newer than ${base.version} on the base branch. ${fix}`,
    };
  }
  if (headCache !== `orbit-v${head.version}`) {
    return {
      ok: false,
      message: `The service worker CACHE ${headCache} does not match package.json ${head.version}. ${fix}`,
    };
  }
  return { ok: true, message: `pwa/ changed and the version moved ${base.version} → ${head.version} (${headCache}).` };
}
