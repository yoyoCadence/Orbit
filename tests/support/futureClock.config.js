// TEST-015: the unit suite with the clock moved to a later date, to find tests
// that pass only until a date written into them goes by (streakUnlock.test.js
// would have failed from 2026-12-10 08:00 UTC). Not part of CI; run it after
// adding tests with fixed dates:
//
//   TZ=UTC FUTURE_NOW=2027-06-01T03:00:00Z npx vitest run --config tests/support/futureClock.config.js
//
// A time before 05:00 local also exercises the effective-day paths (newDayHour):
// hence TZ=UTC with 03:00Z (in Taipei that would be 11:00).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default mergeConfig(base, defineConfig({
  root,
  test: {
    setupFiles: [resolve(root, 'tests/support/futureClock.setup.js')],
  },
}));
