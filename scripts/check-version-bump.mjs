#!/usr/bin/env node
/**
 * Usage: node scripts/check-version-bump.mjs <base-ref>
 * Example (CI): node scripts/check-version-bump.mjs origin/main
 *
 * INFRA-108: fails when the commits since <base-ref> touch the deployed pwa/
 * but do not bump the version (the service worker CACHE name), because since
 * INFRA-107 installed apps would never receive them. The rule itself is in
 * scripts/versionCheckLib.mjs. Both sides are read from git (HEAD, not the
 * working tree), so it gives the same answer locally and in CI.
 */
import { execFileSync } from 'node:child_process';
import { checkVersionBump, escapeWorkflowCommand, parseChangedFiles } from './versionCheckLib.mjs';

const baseRef = process.argv[2];
if (!baseRef) {
  console.error('Usage: node scripts/check-version-bump.mjs <base-ref>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
// Both files always exist on both sides. A file git cannot read (with CI's
// partial clone, a base blob that failed to download) throws into the catch
// below, so the check fails instead of passing against an empty base.
const show = (ref, path) => git('show', `${ref}:${path}`);
const fail = message => {
  console.error(`::error::${escapeWorkflowCommand(message)}`);
  process.exit(1);
};

try {
  // Changes this branch makes since it left the base (three dots: the merge
  // base), so commits that landed on the base meanwhile do not count. No rename
  // detection, so a file moved out of pwa/ counts as removed from it; -z keeps
  // unusual file names unquoted; --no-relative keeps paths from the repository
  // root even with `diff.relative` set and run from a subdirectory.
  const changedFiles = parseChangedFiles(
    git('diff', '--name-only', '--no-renames', '--no-relative', '-z', `${baseRef}...HEAD`),
  );
  const side = ref => ({
    version: JSON.parse(show(ref, 'package.json')).version,
    swSource: show(ref, 'pwa/sw.js'),
  });
  const result = checkVersionBump({ changedFiles, base: side(baseRef), head: side('HEAD') });
  if (!result.ok) fail(result.message);
  console.log(result.message);
} catch (error) {
  fail(`The version check could not run: ${error.message}`);
}
