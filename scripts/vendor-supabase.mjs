// Vendors the pinned Supabase browser client into pwa/vendor/supabase.js.
//
// The PWA used to import the client straight from esm.sh with a floating `@2`
// range, so the version actually running on a device was decided by whenever
// the service worker last re-fetched it, and a first load with esm.sh
// unreachable meant the app could not boot at all (BUG-107). Vendoring makes
// the version a committed, auditable repo artifact and keeps boot on
// same-origin assets that `pwa/sw.js` precaches in `SHELL`.
//
// The npm package's ESM entry (`dist/index.mjs`) still carries bare specifiers
// (`@supabase/auth-js`, …) that a browser cannot resolve, so the source here is
// the self-contained UMD browser bundle. Loaded as an ES module its top-level
// `var supabase = (function(){…})({})` stays module-scoped — no global leak —
// and the appended footer re-exports it as a normal ES module.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_VERSION = '2.112.4';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', '@supabase', 'supabase-js');
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

if (packageJson.version !== EXPECTED_VERSION) {
  throw new Error(`Expected @supabase/supabase-js ${EXPECTED_VERSION}, found ${packageJson.version || 'unknown'}`);
}

const outputRoot = path.join(root, 'pwa', 'vendor');
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  vendorBundle(path.join(packageRoot, 'dist', 'umd', 'supabase.js'), path.join(outputRoot, 'supabase.js')),
  vendorText(path.join(packageRoot, 'LICENSE'), path.join(outputRoot, 'supabase.LICENSE.txt')),
]);

console.log(`Vendored @supabase/supabase-js ${EXPECTED_VERSION} to pwa/vendor/`);

// The banner is the auditable record of what is committed; the footer turns the
// UMD bundle into an ES module. Only `createClient` is re-exported because that
// is the entire surface pwa/js/supabase.js needs — widen it deliberately, not
// by accident.
async function vendorBundle(source, destination) {
  const bundle = await normalize(source);
  const banner = [
    '// @supabase/supabase-js UMD browser build, vendored by scripts/vendor-supabase.mjs.',
    `// version: ${EXPECTED_VERSION}`,
    '// Do not edit by hand — run `npm run vendor:supabase` after bumping the pinned version.',
    '// License: pwa/vendor/supabase.LICENSE.txt',
  ].join('\n');
  const footer = 'export const { createClient } = supabase;';
  await writeFile(destination, `${banner}\n${bundle}\n${footer}\n`, 'utf8');
}

async function vendorText(source, destination) {
  await writeFile(destination, `${await normalize(source)}\n`, 'utf8');
}

async function normalize(source) {
  const content = await readFile(source, 'utf8');
  return content.replace(/[ \t]+$/gm, '').trimEnd();
}
