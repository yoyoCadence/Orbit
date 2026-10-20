import js from '@eslint/js';

export default [
  {
    // INFRA-104: `npm run lint` is `eslint .`; vendored builds and outputs are not ours.
    ignores: [
      'pwa/vendor/**',
      'coverage/**',
      'dist/**',
      'build/**',
      'output/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['pwa/js/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals (pwa/js/)
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Storage: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        Promise: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        location: 'readonly',
        FileReader: 'readonly',
        File: 'readonly',
        Image: 'readonly',
        Notification: 'readonly',
        crypto: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        Touch: 'readonly',
        TouchEvent: 'readonly',
        requestAnimationFrame: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],
      'no-undef': 'error',
      'no-console': 'off',
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    // Test files: relax browser globals requirement
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        // Vitest globals (not needed since we import explicitly, but just in case)
        // `process` is used by tests that read repo files relative to the
        // vitest root (jsdom does not guarantee a file: import.meta.url).
        process: 'readonly',
      },
    },
  },
  {
    // INFRA-104: the service worker is a classic script with worker globals.
    files: ['pwa/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    // INFRA-104: Node scripts, manual perf probes and config files.
    files: [
      'scripts/**/*.mjs',
      'art-pipeline/**/*.mjs',
      'skills/**/*.mjs',
      'tests/perf/*.mjs',
      'eslint.config.js',
      'vitest.config.js',
      'playwright.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // INFRA-104: the local dev server is CommonJS.
    files: ['pwa/server.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];
