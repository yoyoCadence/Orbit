#!/usr/bin/env node
// PS-243 synthetic route & memory baseline runner.
//
//   npm run ps243:perf   # writes docs/ps243/perf-baseline.json
//
// This drives desktop Chromium through ten warm Home ↔ Full World loops under
// 4× CPU throttling and records route timings and a GC'd JS-heap delta. Unlike
// the asset baseline these numbers are volatile and environment-dependent, so
// the artifact is a labelled BASELINE snapshot, NOT a CI gate and NOT a device
// FPS/thermal/memory result — those remain human gates.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  FOCUS_TASK,
  GUEST_USER,
  mockSupabase,
  seedStorage,
} from '../tests/e2e/support/seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const BASE_URL = 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 844 };
const CPU_THROTTLE_RATE = 4;
const WARMUP_LOOPS = 2;
const MEASURED_LOOPS = 10;

async function waitForServer(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server not up yet */ }
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

// Nearest-rank percentile (deterministic, no interpolation).
function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return Math.round(sorted[rank - 1]);
}

async function run() {
  const server = spawn('node', ['pwa/server.cjs'], { cwd: REPO_ROOT, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    await waitForServer(BASE_URL);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });

    const client = await context.newCDPSession(page);
    await client.send('HeapProfiler.enable');
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });

    const canvasCounts = [];
    const recordCanvas = async () => {
      canvasCounts.push(await page.locator('canvas.orbit-window-canvas').count());
    };
    const heapUsedBytes = async () => {
      try {
        await client.send('HeapProfiler.collectGarbage');
        const { usedSize } = await client.send('Runtime.getHeapUsage');
        return usedSize;
      } catch {
        return page.evaluate(() => globalThis.performance?.memory?.usedJSHeapSize ?? 0);
      }
    };

    const waitReady = async scope => {
      await page.waitForSelector(
        `${scope} [data-orbit-runtime-host][data-runtime-status="ready"]`,
        { timeout: 10_000 },
      );
    };

    await page.goto(BASE_URL);
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 10_000 });
    await waitReady('[data-orbit-window]');
    await recordCanvas();

    const toFullWorld = async () => {
      const start = performance.now();
      await page.locator('[data-orbit-open-world]').click();
      await page.locator('[data-personal-space-v2]').waitFor({ state: 'visible', timeout: 10_000 });
      await waitReady('[data-personal-space-v2]');
      const elapsed = performance.now() - start;
      await recordCanvas();
      return elapsed;
    };
    const toHome = async () => {
      const start = performance.now();
      await page.evaluate(() => window.navigate('home'));
      await waitReady('[data-orbit-window]');
      const elapsed = performance.now() - start;
      await recordCanvas();
      return elapsed;
    };

    for (let loop = 0; loop < WARMUP_LOOPS; loop += 1) {
      await toFullWorld();
      await toHome();
    }

    const heapBefore = await heapUsedBytes();
    const fullWorldRoutes = [];
    const homeRoutes = [];
    for (let loop = 0; loop < MEASURED_LOOPS; loop += 1) {
      fullWorldRoutes.push(await toFullWorld());
      homeRoutes.push(await toHome());
    }
    const heapAfter = await heapUsedBytes();

    const baseline = {
      artifact: 'ps243-perf-baseline',
      label: 'BASELINE',
      warning: 'Volatile, environment-dependent synthetic timings. Not a CI gate '
        + 'and not a device FPS/thermal/memory result; those remain human gates.',
      environment: {
        engine: 'desktop Chromium (Playwright)',
        viewport: VIEWPORT,
        cpuThrottleRate: CPU_THROTTLE_RATE,
        reducedMotion: true,
        warmupLoops: WARMUP_LOOPS,
        measuredLoops: MEASURED_LOOPS,
      },
      method: {
        routeTiming: 'wall-clock ms around the awaited route transition (click/navigate → runtime ready)',
        percentile: 'nearest-rank, no interpolation',
        heap: 'CDP HeapProfiler.collectGarbage then Runtime.getHeapUsage.usedSize',
      },
      fullWorldRouteMs: {
        p75: percentile(fullWorldRoutes, 0.75),
        max: Math.round(Math.max(...fullWorldRoutes)),
        samples: fullWorldRoutes.map(value => Math.round(value)),
      },
      homeRouteMs: {
        p75: percentile(homeRoutes, 0.75),
        max: Math.round(Math.max(...homeRoutes)),
        samples: homeRoutes.map(value => Math.round(value)),
      },
      canvas: {
        countsPerState: canvasCounts,
        singleCanvasHeld: canvasCounts.every(count => count === 1),
      },
      jsHeap: {
        beforeBytes: heapBefore,
        afterBytes: heapAfter,
        deltaBytes: heapAfter - heapBefore,
      },
    };

    mkdirSync(join(REPO_ROOT, 'docs', 'ps243'), { recursive: true });
    const outputPath = join(REPO_ROOT, 'docs', 'ps243', 'perf-baseline.json');
    writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${outputPath}`);
    console.log(`Full World p75 ${baseline.fullWorldRouteMs.p75}ms · Home p75 ${baseline.homeRouteMs.p75}ms · `
      + `heap Δ ${baseline.jsHeap.deltaBytes} bytes · single canvas ${baseline.canvas.singleCanvasHeld}`);
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
