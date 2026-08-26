// BUG-107 regression guard.
//
// The Supabase client sits on the boot path, so the version that actually runs
// on a device must be decided by this repo, not by whatever a CDN resolves at
// deploy time, and a first load must not depend on a third-party host being
// reachable. These assertions fail if the import drifts back to a remote URL,
// if the vendored artifact stops matching the pinned dependency, or if the
// service worker stops precaching it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readRepoFile = relativePath =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

const packageJson = JSON.parse(readRepoFile('package.json'));
const clientSource = readRepoFile('pwa/js/supabase.js');
const vendorScript = readRepoFile('scripts/vendor-supabase.mjs');
const serviceWorkerSource = readRepoFile('pwa/sw.js');

const PINNED_VERSION = packageJson.dependencies['@supabase/supabase-js'];

describe('vendored Supabase client', () => {
  it('pins an exact version instead of a floating range', () => {
    expect(PINNED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('imports the client from the repo, not from a remote host', () => {
    expect(clientSource).toContain("from '../vendor/supabase.js'");
    expect(clientSource).not.toMatch(/from\s+['"]https?:\/\//);
  });

  it('keeps the vendored artifact, the vendor script, and the pinned version in sync', () => {
    // Only the banner is read: the bundle body is minified vendor output and is
    // not something a test should assert on line by line.
    const banner = readRepoFile('pwa/vendor/supabase.js').split('\n').slice(0, 4).join('\n');
    expect(banner).toContain(`// version: ${PINNED_VERSION}`);
    expect(vendorScript).toContain(`const EXPECTED_VERSION = '${PINNED_VERSION}';`);
  });

  it('precaches the vendored client in the service worker shell', () => {
    const shellStart = serviceWorkerSource.indexOf('const SHELL = [');
    const shell = serviceWorkerSource.slice(shellStart, serviceWorkerSource.indexOf('];', shellStart));
    expect(shell).toContain("'./vendor/supabase.js'");
    expect(shell).toContain("'./js/supabase.js'");
  });

  it('exposes createClient as an ES module without leaking a global', async () => {
    const { createClient } = await import('../../pwa/vendor/supabase.js');
    expect(typeof createClient).toBe('function');
    expect(globalThis.supabase).toBeUndefined();

    // The realtime client resolves a WebSocket constructor while constructing.
    // A browser always has one; Node only exposes it globally from 22 and CI
    // runs 20, so stub it rather than let the runner's version decide whether
    // this assertion can run at all.
    const nativeWebSocket = globalThis.WebSocket;
    if (nativeWebSocket === undefined) globalThis.WebSocket = class WebSocketStub {};
    try {
      const client = createClient('https://example.supabase.co', 'anon-key-for-test');
      expect(typeof client.auth.getSession).toBe('function');
      expect(typeof client.from).toBe('function');
    } finally {
      if (nativeWebSocket === undefined) delete globalThis.WebSocket;
    }
  });
});
