import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // TEST-004: every app module (pwa/vendor is third-party and not here).
      include: ['pwa/js/**/*.js'],
      reporter: ['text', 'html'],
    },
  },
});
