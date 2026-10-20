// Manual PS-211 cache probe config (not used by CI). See ps211-cache-probe.pw.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const executablePath = process.env.PW_CHROMIUM_PATH;

export default {
  ...base,
  testDir: '.',
  testMatch: /ps211-cache-probe\.pw\.mjs$/,
  timeout: 900_000,
  workers: 1,
  retries: 0,
  reporter: 'line',
  // Playwright empties its outputDir on every run; keep it apart from the probe's results.
  outputDir: path.join(ROOT, 'test-results/ps211-playwright'),
  use: { ...base.use, baseURL: 'http://localhost:3212', screenshot: 'off' },
  webServer: {
    command: 'node pwa/server.cjs',
    cwd: ROOT,
    env: { PORT: '3211' },
    url: 'http://localhost:3211/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [{
    name: 'chromium',
    use: {
      browserName: 'chromium',
      ...(executablePath ? { launchOptions: { executablePath } } : {}),
    },
  }],
};
