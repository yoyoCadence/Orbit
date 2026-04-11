import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['pwa/js/engine.js', 'pwa/js/leveling.js', 'pwa/js/utils.js'],
      reporter: ['text', 'html'],
    },
  },
});
