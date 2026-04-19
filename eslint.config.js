import js from '@eslint/js';

export default [
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
        Image: 'readonly',
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
      },
    },
  },
  {
    // Config files themselves
    files: ['eslint.config.js', 'vitest.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
