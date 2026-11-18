import { defineConfig } from '@playwright/test';

// Environments that ship their own Chromium build (for example the Claude Code
// cloud container, /opt/pw-browsers/chromium) can point the run at it instead of
// downloading the build this Playwright expects. Unset: Playwright's own browser.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    // Supabase is stubbed per test (tests/e2e/support/seed.js: mockSupabase()).
    // Headless by default; set PWDEBUG=1 or --headed for visual debugging
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },

  webServer: {
    command: 'node pwa/server.cjs',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
