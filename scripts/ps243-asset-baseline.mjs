#!/usr/bin/env node
// PS-243 asset & transfer baseline runner.
//
//   npm run ps243:assets            # regenerate docs/ps243/asset-baseline.json
//   npm run ps243:assets -- --check # fail if the committed artifact is stale
//
// Output is a pure function of committed files (no timestamps), so a clean
// `git diff` after regenerating proves the recorded evidence is reproducible.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeAssetBaseline, REPO_ROOT } from './ps243/computeAssetBaseline.mjs';

const OUTPUT_PATH = join(REPO_ROOT, 'docs', 'ps243', 'asset-baseline.json');
const serialized = `${JSON.stringify(computeAssetBaseline(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  let existing = '';
  try {
    existing = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    console.error('docs/ps243/asset-baseline.json is missing. Run `npm run ps243:assets`.');
    process.exit(1);
  }
  // Compare logical content, not line endings: a Windows autocrlf checkout may
  // smudge the committed JSON to CRLF while the canonical serialization is LF.
  if (existing.replace(/\r\n/g, '\n') !== serialized) {
    console.error('docs/ps243/asset-baseline.json is stale. Run `npm run ps243:assets`.');
    process.exit(1);
  }
  console.log('docs/ps243/asset-baseline.json is up to date.');
} else {
  mkdirSync(join(REPO_ROOT, 'docs', 'ps243'), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialized);
  console.log(`Wrote ${OUTPUT_PATH}`);
}
