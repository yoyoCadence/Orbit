// TEST-028 (see pendingTimers.config.js): lists the real timers that app code
// (pwa/js) started and that are still pending when a test file ends.
//
// Tests that never yield to the event loop leave real timers waiting until the
// file is done. A 0 ms one usually fires in the pause before jsdom is torn
// down; a longer one can fire after it, and if its callback reads a global
// jsdom provided (`document`, `window`), vitest reports an unhandled error and
// the whole run fails although every test passed (TEST-027, #312).
//
// Only timers started directly by app code count (not jsdom's or a mock's).
// A listed timer is a problem only if its callback reads such a global and it
// is short enough to fire while the worker is still up; most are harmless.
import { afterAll, beforeEach } from 'vitest';

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const pending = new Map();
let currentTest = '(outside a test)';

beforeEach(({ task }) => { currentTest = task.name; });

globalThis.setTimeout = function setTimeout(fn, ms, ...args) {
  const caller = new Error().stack.split('\n')[2] ?? '';
  let id = null;
  const run = (...callArgs) => {
    pending.delete(id);
    return typeof fn === 'function' ? fn(...callArgs) : undefined;
  };
  id = realSetTimeout(run, ms, ...args);
  if (caller.includes('/pwa/js/')) {
    pending.set(id, { ms: Number(ms) || 0, test: currentTest, at: caller.trim().replace(/^at /, '') });
  }
  return id;
};

globalThis.clearTimeout = function clearTimeout(id) {
  pending.delete(id);
  return realClearTimeout(id);
};

// vitest 5 wants the first hook argument destructured; the suite is the second.
// eslint-disable-next-line no-empty-pattern -- required by vitest (see above)
afterAll(({}, suite) => {
  const file = suite?.file?.name ?? suite?.name ?? '';
  for (const { ms, test, at } of pending.values()) {
    process.stderr.write(`PENDING TIMER ${file} :: ${test} :: ${ms} ms :: ${at}\n`);
  }
});
