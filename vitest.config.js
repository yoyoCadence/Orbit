import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/unit/home.test.js',     'jsdom'],
      ['tests/unit/settings.test.js', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      include: ['pwa/js/engine.js', 'pwa/js/leveling.js', 'pwa/js/utils.js'],
      reporter: ['text', 'html'],
    },
  },
});
