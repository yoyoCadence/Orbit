// TEST-028: the unit suite with a list of the real timers app code left
// pending at the end of each test file (pendingTimers.setup.js says which are a
// problem). Not part of CI; run it after adding tests that end with a timer
// still to come:
//
//   npx vitest run --config tests/support/pendingTimers.config.js 2>&1 | grep '^PENDING TIMER'
//
// A test file can name its own path after the config to check only that file.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default mergeConfig(base, defineConfig({
  root,
  test: {
    setupFiles: [resolve(root, 'tests/support/pendingTimers.setup.js')],
  },
}));
