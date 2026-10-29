#!/usr/bin/env node
/**
 * Usage: node scripts/check-version-bump.mjs <base-ref>
 * Example (CI): node scripts/check-version-bump.mjs origin/main
 *
 * INFRA-108: fails when the changes since <base-ref> touch the deployed pwa/
 * but do not bump the version (the service worker CACHE name), because since
 * INFRA-107 installed apps would never receive them. The rule itself is in
 * scripts/versionCheckLib.mjs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkVersionBump } from './versionCheckLib.mjs';

const baseRef = process.argv[2];
if (!baseRef) {
  console.error('Usage: node scripts/check-version-bump.mjs <base-ref>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const showAtBase = path => {
  try {
    return git('show', `${baseRef}:${path}`);
  } catch {
    return null;
  }
};

// Changes this branch makes since it left the base (three dots: the merge
// base), so commits that landed on the base meanwhile do not count.
const changedFiles = git('diff', '--name-only', `${baseRef}...HEAD`).split('\n').filter(Boolean);
const basePackage = showAtBase('package.json');
const result = checkVersionBump({
  changedFiles,
  base: {
    version: basePackage ? JSON.parse(basePackage).version : '0.0.0',
    swSource: showAtBase('pwa/sw.js'),
  },
  head: {
    version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    swSource: readFileSync('pwa/sw.js', 'utf8'),
  },
});

if (result.ok) {
  console.log(result.message);
} else {
  console.error(`::error::${result.message}`);
  process.exit(1);
}
