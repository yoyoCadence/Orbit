import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/unit/home.test.js',             'jsdom'],
      ['tests/unit/settings.test.js',         'jsdom'],
      ['tests/unit/profile.test.js',          'jsdom'],
      ['tests/unit/leaderboard.test.js',      'jsdom'],
      ['tests/unit/review.test.js',           'jsdom'],
      ['tests/unit/goals.test.js',            'jsdom'],
      ['tests/unit/feedback.test.js',         'jsdom'],
      ['tests/unit/dayCycle.test.js',         'jsdom'],
      ['tests/unit/appBootSequence.test.js',  'jsdom'],
      ['tests/unit/proEntitlement.test.js',    'jsdom'],
      ['tests/unit/proTrialRpc.test.js',       'jsdom'],
      ['tests/unit/proGateCallSites.test.js',  'jsdom'],
      ['tests/unit/proSettingsProjection.test.js','jsdom'],
      ['tests/unit/proEntitlementGate.test.js','jsdom'],
      ['tests/unit/storage-mapping.test.js',  'jsdom'],
      ['tests/unit/focusTimer.test.js',       'jsdom'],
      ['tests/unit/proofCapture.test.js',     'jsdom'],
      ['tests/integration/storage.test.js',   'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      include: ['pwa/js/engine.js', 'pwa/js/leveling.js', 'pwa/js/utils.js'],
      reporter: ['text', 'html'],
    },
  },
});
