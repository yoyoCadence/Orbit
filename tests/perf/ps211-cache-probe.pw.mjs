/**
 * ps211-cache-probe.pw.mjs — PS-211 cache measurement probe (manual, not run by CI).
 *
 * Measures how the Orbit Window's art and Pixi load on first load, on page
 * switches, after a release (service-worker CACHE bump) and on state changes,
 * through a local proxy that behaves like GitHub Pages: max-age=600, ETag/304
 * from a content hash, gzip for text, the right webp MIME, and the Supabase stub.
 * The dev server (pwa/server.cjs) sends no-store and the e2e route mock disables
 * the HTTP cache, so the regular e2e setup cannot measure caching.
 *
 * Results are the basis of docs/ps-211-asset-preload-cache-proposal.md (§2–§4).
 * They are single runs on software WebGL: compare orders of magnitude only.
 *
 * Run from the repo root:
 *   npx playwright test -c tests/perf/playwright.ps211.config.mjs [-g "<test title>"]
 * Environment:
 *   PS211_PROBE_OUT    where JSON results and screenshots go
 *                      (default test-results/ps211-cache-probe, git-ignored; `npm run test:e2e`
 *                      empties test-results/, so point this elsewhere to keep results)
 *   PW_CHROMIUM_PATH   optional Chromium executable for Playwright
 * Ports 3211 (dev server) and 3212 (proxy) must be free.
 */
/* global window, document, navigator, location, localStorage, caches, requestAnimationFrame,
   PerformanceObserver, MutationObserver */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from '../e2e/support/seed.js';

const OUT = path.resolve(process.env.PS211_PROBE_OUT || 'test-results/ps211-cache-probe');
mkdirSync(OUT, { recursive: true });
const PWA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../pwa');
const SW_SRC = readFileSync(path.join(PWA, 'sw.js'), 'utf8');
const SHELL = [...SW_SRC.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
const PROXY_PORT = 3212;
const BASE = `http://localhost:${PROXY_PORT}`;
const FAST3G = { latencyMs: 150, bytesPerSec: 200_000 }; // 1.6 Mbps down, 150 ms per request

const SUPABASE_STUB = `
export function createClient() {
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      upsert: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      delete: () => q,
      in:     () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then:   (r) => Promise.resolve({ data: null, error: null }).then(r),
    };
    return q;
  };
  return {
    auth: {
      getSession:         () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signUp:             () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signInWithOAuth:    () => Promise.resolve({ data: null, error: null }),
      signOut:            () => Promise.resolve({ error: null }),
    },
    from: () => chain(),
  };
}
`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── GitHub-Pages-like proxy (max-age=600, ETag, gzip text) with optional throttle ──
const P = { throttle: null, phase: 'init', swSuffix: null, log: [], base: 0, inflight: 0, lastActivity: Date.now() };
let bwCursor = 0;
async function reserve(n) {
  const now = Date.now();
  const start = Math.max(now, bwCursor);
  bwCursor = start + (n / P.throttle.bytesPerSec) * 1000;
  const wait = bwCursor - now;
  if (wait > 0) await sleep(wait);
}
let server;
test.beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    P.inflight += 1; P.lastActivity = Date.now();
    const entry = {
      t: Date.now(), phase: P.phase, method: req.method, dest: req.headers['sec-fetch-dest'] || '',
      mode: req.headers['sec-fetch-mode'] || '', cond: Boolean(req.headers['if-none-match']),
    };
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      entry.path = pathname;
      if (pathname === '/') pathname = '/index.html';
      let body; let status = 200;
      if (pathname === '/vendor/supabase.js') body = Buffer.from(SUPABASE_STUB);
      else {
        const file = path.join(PWA, pathname);
        if (!file.startsWith(PWA) || !existsSync(file) || statSync(file).isDirectory()) { status = 404; body = Buffer.from('nf'); }
        else body = readFileSync(file);
      }
      if (pathname === '/sw.js' && P.swSuffix) {
        body = Buffer.from(body.toString().replace(/const CACHE = '([^']+)';/, (m, v) => `const CACHE = '${v}-${P.swSuffix}';`));
      }
      const ext = path.extname(pathname);
      const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': status === 200 ? 'max-age=600' : 'no-store',
        ETag: etag, 'Last-Modified': 'Mon, 19 Oct 2026 00:00:00 GMT',
      };
      if (status === 200 && req.headers['if-none-match'] === etag) { status = 304; body = Buffer.alloc(0); }
      else if (status === 200 && TEXT.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body, { level: 6 }); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = body.length;
      if (P.throttle) await sleep(P.throttle.latencyMs);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || body.length === 0) res.end();
      else if (P.throttle) {
        for (let i = 0; i < body.length; i += 16384) {
          if (res.destroyed) break;
          const chunk = body.subarray(i, i + 16384);
          await reserve(chunk.length);
          if (!res.write(chunk)) await Promise.race([once(res, 'drain'), once(res, 'close')]);
        }
        res.end();
      } else res.end(body);
      entry.status = status; entry.bytes = body.length; entry.ms = Date.now() - entry.t;
    } catch (error) {
      entry.error = String(error);
      try { res.destroy(); } catch { /* ignore */ }
    } finally {
      P.inflight -= 1; P.lastActivity = Date.now(); P.log.push(entry);
    }
  });
  server.listen(PROXY_PORT, '127.0.0.1');
  await once(server, 'listening');
});
test.afterAll(async () => { server?.close(); });

async function settle(quietMs = 1500, maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (P.inflight === 0 && Date.now() - P.lastActivity > quietMs) return Date.now() - start;
    await sleep(150);
  }
  return -1;
}

// ── In-page instrumentation ──
function instrument() {
  const S = window.__ps211 = { events: [], imgs: [] };
  const now = () => performance.now();
  const push = (type, data = {}) => S.events.push({ type, t: Math.round(now()), ...data });
  S.mark = name => push('mark', { name });
  const hosts = new WeakMap(); let hostSeq = 0;
  const canvases = new WeakMap(); let canvasSeq = 0;
  const imgs = new WeakMap();
  let mainApp = false;
  function scanImgs(root) {
    root.querySelectorAll('img').forEach(img => {
      if (imgs.has(img)) return;
      const rec = {
        src: img.getAttribute('src')?.slice(0, 140), cls: img.className, insertedAt: Math.round(now()),
        completeAtInsert: img.complete && img.naturalWidth > 0, loadedAt: null, decodedAt: null,
      };
      if (rec.completeAtInsert) rec.loadedAt = rec.insertedAt;
      imgs.set(img, rec); S.imgs.push(rec);
      img.decode?.().then(() => { rec.decodedAt = Math.round(now()); }, () => { rec.decodeError = true; });
    });
  }
  function check() {
    if (!mainApp) {
      const m = document.getElementById('main-app');
      if (m && !m.classList.contains('hidden')) { mainApp = true; push('mainApp'); }
    }
    const content = document.getElementById('content');
    if (content) scanImgs(content);
    document.querySelectorAll('[data-orbit-runtime-host]').forEach(host => {
      let rec = hosts.get(host);
      const win = host.closest('[data-orbit-window]');
      if (!rec) {
        rec = { id: ++hostSeq, status: null, posterDone: false, bgDone: false, canvas: null };
        hosts.set(host, rec);
        push('host', {
          host: rec.id, mode: win?.dataset.renderMode, player: win?.dataset.playerState,
          companion: win?.dataset.companionState, progress: win?.dataset.projectProgress,
          reveal: win?.dataset.revealKind || null,
        });
      }
      const st = host.dataset.runtimeStatus;
      if (st !== rec.status) { rec.status = st; push('status', { host: rec.id, status: st }); }
      if (win) {
        const pimgs = [...win.querySelectorAll('.orbit-window-poster img')];
        const bg = win.querySelector('.orbit-window-background');
        if (!rec.bgDone && bg && bg.complete && bg.naturalWidth > 0) { rec.bgDone = true; push('posterBg', { host: rec.id }); }
        if (!rec.posterDone && pimgs.length && pimgs.every(i => i.complete && i.naturalWidth > 0)) {
          rec.posterDone = true; push('posterAll', { host: rec.id, n: pimgs.length });
        }
      }
      const canvas = host.querySelector('canvas');
      if (canvas && canvas !== rec.canvas) {
        if (!canvases.has(canvas)) canvases.set(canvas, ++canvasSeq);
        rec.canvas = canvas; push('canvas', { host: rec.id, canvas: canvases.get(canvas) });
      }
    });
  }
  S.check = check;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) push('longtask', { start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
  document.addEventListener('click', event => push('click', { target: event.target?.closest?.('[data-orbit-open-world],[data-v2-mode]') ? 'orbit/v2-mode' : 'other' }), true);
  window.addEventListener('hashchange', () => push('hashchange', { hash: location.hash }));
  document.addEventListener('load', event => {
    const el = event.target;
    if (el && el.tagName === 'IMG') { const r = imgs.get(el); if (r && r.loadedAt == null) r.loadedAt = Math.round(now()); }
    check();
  }, true);
  document.addEventListener('error', event => {
    const el = event.target;
    if (el && el.tagName === 'IMG') { const r = imgs.get(el); if (r) r.error = Math.round(now()); }
  }, true);
  new MutationObserver(check).observe(document, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['data-runtime-status', 'class', 'src'],
  });
  const loop = () => { check(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ── CDP network recorder (page target only) ──
async function recordNetwork(context, page, phaseRef) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map(); const done = [];
  cdp.on('Network.requestWillBeSent', e => {
    reqs.set(e.requestId, { url: e.request.url.replace(BASE, ''), type: e.type, phase: phaseRef.phase, t: e.timestamp });
  });
  cdp.on('Network.requestServedFromCache', e => { const r = reqs.get(e.requestId); if (r) r.memory = true; });
  cdp.on('Network.responseReceived', e => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.status = e.response.status; r.disk = e.response.fromDiskCache; r.sw = e.response.fromServiceWorker;
    r.swSource = e.response.serviceWorkerResponseSource; r.fromPrefetch = e.response.fromPrefetchCache;
  });
  cdp.on('Network.loadingFinished', e => {
    const r = reqs.get(e.requestId); if (!r) return;
    r.enc = e.encodedDataLength; r.ms = Math.round((e.timestamp - r.t) * 1000); done.push(r); reqs.delete(e.requestId);
  });
  cdp.on('Network.loadingFailed', e => {
    const r = reqs.get(e.requestId); if (!r) return; r.failed = e.errorText; done.push(r); reqs.delete(e.requestId);
  });
  return { cdp, done };
}

function classify(p) {
  if (/\/assets\/personal-space\/v2\//.test(p)) return 'v2img';
  if (/\/assets\/personal-space\//.test(p)) return 'legacyImg';
  if (/vendor\/pixi\.js$/.test(p)) return 'pixi';
  if (/\.(js|css)$/.test(p)) return 'jscss';
  if (/\.html$|^\/$/.test(p)) return 'html';
  return 'other';
}

function proxySummary(phase) {
  const entries = P.log.slice(P.base).filter(e => e.phase === phase);
  const by = {};
  for (const e of entries) {
    const k = classify(e.path || '');
    by[k] ||= { n: 0, bytes: 0, n304: 0, files: [] };
    by[k].n += 1; by[k].bytes += e.bytes || 0; if (e.status === 304) by[k].n304 += 1;
    if (k === 'v2img' || k === 'legacyImg' || k === 'pixi') {
      by[k].files.push(`${path.basename(e.path)}|${e.status}|${e.bytes}|${e.dest || '-'}|${e.mode}|${e.ms}ms`);
    }
  }
  return { total: entries.length, bytes: entries.reduce((s, e) => s + (e.bytes || 0), 0), by };
}

function cdpSummary(net, phase) {
  const imgs = net.done.filter(r => r.phase === phase && /\/assets\/|vendor\/pixi/.test(r.url));
  return imgs.map(r => {
    const flags = [r.memory && 'memory', r.disk && 'disk', r.sw && `sw:${r.swSource || '?'}`, r.failed && `failed:${r.failed}`].filter(Boolean);
    const src = flags.length ? flags.join('+') : 'network';
    return `${path.basename(r.url)}|${r.type}|${src}|${r.enc ?? '-'}B|${r.ms ?? '-'}ms`;
  });
}

async function pageMetrics(page, sinceMark) {
  return page.evaluate(markName => {
    const S = window.__ps211; if (!S) return null;
    S.check();
    let t0 = 0;
    if (markName) { const m = [...S.events].reverse().find(e => e.type === 'mark' && e.name === markName); t0 = m ? m.t : 0; }
    const events = S.events.filter(e => e.t >= t0).map(e => ({ ...e, dt: e.t - t0 }));
    const imgs = S.imgs.filter(r => r.insertedAt >= t0).map(r => ({
      ...r, insertedDt: r.insertedAt - t0, loadedDt: r.loadedAt == null ? null : r.loadedAt - t0,
      decodedDt: r.decodedAt == null ? null : r.decodedAt - t0,
      waitMs: r.loadedAt == null ? null : r.loadedAt - r.insertedAt,
    }));
    return { t0, events, imgs };
  }, sinceMark);
}

function summarizeTransition(m) {
  if (!m) return null;
  const hostsSeen = m.events.filter(e => e.type === 'host');
  const out = { hosts: [] };
  for (const h of hostsSeen) {
    const ev = type => m.events.find(e => e.host === h.host && e.type === type);
    const st = s => m.events.find(e => e.host === h.host && e.type === 'status' && e.status === s);
    out.hosts.push({
      host: h.host, mode: h.mode, player: h.player, companion: h.companion, progress: h.progress, reveal: h.reveal,
      appearDt: h.dt, posterBgDt: ev('posterBg')?.dt ?? null, posterAllDt: ev('posterAll')?.dt ?? null,
      loadingDt: st('loading')?.dt ?? null, readyDt: st('ready')?.dt ?? null, fallbackDt: st('fallback')?.dt ?? null,
      canvasId: ev('canvas')?.canvas ?? null, canvasDt: ev('canvas')?.dt ?? null,
    });
  }
  const mainApp = m.events.find(e => e.type === 'mainApp');
  if (mainApp) out.mainAppDt = mainApp.dt;
  const click = m.events.find(e => e.type === 'click');
  if (click) out.clickDt = click.dt;
  const hc = m.events.find(e => e.type === 'hashchange');
  if (hc) out.hashchangeDt = hc.dt;
  out.longtasks = m.events.filter(e => e.type === 'longtask' && e.start >= m.t0).map(e => `${e.start - m.t0}+${e.dur}ms`);
  const posterImgs = m.imgs.filter(r => /orbit-window/.test(r.cls));
  out.posterImgs = posterImgs.map(r => `${path.basename(r.src || '')}|ins+${r.insertedDt}|cached@insert=${r.completeAtInsert}|loaded+${r.loadedDt}|wait=${r.waitMs}ms|decoded+${r.decodedDt}`);
  const otherImgs = m.imgs.filter(r => !/orbit-window/.test(r.cls));
  if (otherImgs.length) out.otherImgs = otherImgs.map(r => `${path.basename(r.src || '')}|${r.cls}|ins+${r.insertedDt}|cached@insert=${r.completeAtInsert}|loaded+${r.loadedDt}|wait=${r.waitMs}ms|decoded+${r.decodedDt}`);
  return out;
}

async function swState(page) {
  return page.evaluate(async () => {
    const out = { controller: Boolean(navigator.serviceWorker?.controller), caches: {} };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      out.reg = reg ? { active: reg.active?.state || null, waiting: reg.waiting?.state || null, installing: reg.installing?.state || null } : null;
      for (const k of await caches.keys()) {
        const c = await caches.open(k); const keys = await c.keys();
        out.caches[k] = {
          n: keys.length,
          v2img: keys.filter(r => /personal-space\/v2\//.test(r.url)).length,
          legacyImg: keys.filter(r => /personal-space\/(idle-window|props)\//.test(r.url)).length,
          pixi: keys.some(r => /vendor\/pixi\.js/.test(r.url)),
        };
      }
    } catch (e) { out.error = String(e); }
    out.banner = Boolean(document.getElementById('update-banner'));
    return out;
  });
}

async function waitRuntime(page, mode, timeout = 240_000) {
  await page.waitForFunction(m => {
    const h = document.querySelector(`[data-orbit-window][data-render-mode="${m}"] [data-orbit-runtime-host]`);
    return h && (h.dataset.runtimeStatus === 'ready' || h.dataset.runtimeStatus === 'fallback');
  }, mode, { timeout, polling: 50 });
}

async function waitSwInstalled(page, cacheSuffix, timeout = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await swState(page);
    const names = Object.keys(s.caches);
    const target = names.find(n => (cacheSuffix ? n.endsWith(`-${cacheSuffix}`) : true));
    if (s.controller && target && names.length === 1 && s.caches[target].n >= SHELL.length) return { ms: Date.now() - start, s };
    await sleep(250);
  }
  return { ms: -1, s: await swState(page) };
}

function save(name, data) {
  data.proxyLog = P.log.slice(P.base);
  writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
  appendFileSync(path.join(OUT, 'index.txt'), `${name}\n`);
}

function pastDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('sv');
}

async function newProbeContext(browser, viewport, { legacy = false, sessions = [], reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, baseURL: BASE, reducedMotion, timezoneId: 'Asia/Taipei' });
  const page = await context.newPage();
  await seedStorage(page, [FOCUS_TASK], sessions, { ...GUEST_USER, totalXP: 5000 });
  if (legacy) await page.addInitScript(() => localStorage.setItem('orbit_personal_space_runtime', 'legacy'));
  await page.addInitScript(instrument);
  const phaseRef = { phase: 'init' };
  const net = await recordNetwork(context, page, phaseRef);
  const setPhase = name => { phaseRef.phase = name; P.phase = name; };
  return { context, page, net, setPhase };
}

async function step(ctx, results, name, action, { mode, markName = name, after } = {}) {
  ctx.setPhase(name);
  if (markName) await ctx.page.evaluate(n => window.__ps211?.mark(n), markName).catch(() => {});
  const wall = Date.now();
  await action();
  if (mode) await waitRuntime(ctx.page, mode);
  const wallMs = Date.now() - wall;
  if (after) await after();
  const m = await pageMetrics(ctx.page, markName);
  const settled = await settle();
  results[name] = {
    wallMs, settleMs: settled, page: summarizeTransition(m),
    proxy: proxySummary(name), cdp: cdpSummary(ctx.net, name),
  };
}


test('0: does the SW activate under the default e2e setup (server.cjs + page.route mock)?', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Taipei' });
  const page = await context.newPage();
  await mockSupabase(page);
  await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
  const responses = [];
  page.on('response', r => { if (/\/assets\/|pixi/.test(r.url())) responses.push(`${path.basename(r.url())}|sw=${r.fromServiceWorker()}|${r.status()}`); });
  await page.goto('http://localhost:3211/');
  await waitRuntime(page, 'home-window', 60_000);
  const afterReady = await swState(page);
  const installed = await waitSwInstalled(page, null, 60_000);
  responses.push('--- reload ---');
  await page.reload();
  await waitRuntime(page, 'home-window', 60_000);
  await sleep(500);
  const afterReload = await swState(page);
  const contextSw = context.serviceWorkers().map(w => w.url());
  save('t0-default-e2e-sw', { afterReady, installed, afterReload, contextSw, responses });
  await context.close();
});

for (const net of ['fast', 'fast3g']) {
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    test(`1: V2 flow ${vp.width}x${vp.height} ${net}`, async ({ browser }) => {
      P.throttle = net === 'fast3g' ? FAST3G : null; P.swSuffix = null; bwCursor = 0;
      await settle(500, 10_000);
      P.base = P.log.length;
      const ctx = await newProbeContext(browser, vp);
      const { page } = ctx;
      const R = { viewport: vp, net, shellEntries: SHELL.length, sw: {} };

      await step(ctx, R, 'cold', () => page.goto('/'), { mode: 'home-window', markName: null });
      R.sw.afterCold = await waitSwInstalled(page, null);
      R.proxyColdIncludingSwInstall = proxySummary('cold');

      await step(ctx, R, 'homeToSpace1', async () => {
        await page.locator('[data-orbit-open-world]').click({ timeout: 5000 }).catch(() => page.evaluate(() => window.navigate('personalSpace')));
      }, { mode: 'full-world' });
      await step(ctx, R, 'spaceToHome1', () => page.evaluate(() => window.navigate('home')), { mode: 'home-window' });
      await step(ctx, R, 'homeToGoals', async () => { await page.evaluate(() => window.navigate('goals')); await sleep(400); });
      await step(ctx, R, 'goalsToHome', () => page.evaluate(() => window.navigate('home')), { mode: 'home-window' });
      await step(ctx, R, 'homeToSpace2', async () => {
        await page.locator('[data-orbit-open-world]').click({ timeout: 5000 }).catch(() => page.evaluate(() => window.navigate('personalSpace')));
      }, { mode: 'full-world' });
      await step(ctx, R, 'spaceWorldToEdit', () => page.locator('.personal-space-v2-mode-switch [data-v2-mode="edit"]').click(), { mode: 'edit' });
      await step(ctx, R, 'spaceEditToWorld', () => page.locator('.personal-space-v2-mode-switch [data-v2-mode="full-world"]').click(), { mode: 'full-world' });
      await step(ctx, R, 'spaceToHome2', () => page.evaluate(() => window.navigate('home')), { mode: 'home-window' });
      R.sw.beforeWarmReload = await swState(page);

      await step(ctx, R, 'reloadWarm', () => page.reload(), { mode: 'home-window', markName: null });

      // Real release emulation: proxy serves sw.js with a bumped CACHE name.
      P.swSuffix = 'b1';
      await step(ctx, R, 'bump1Reload1', () => page.reload(), {
        mode: 'home-window', markName: null,
        after: async () => {
          R.sw.bump1Update = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const t = performance.now(); await r.update(); return Math.round(performance.now() - t); });
          R.sw.bump1 = await waitSwInstalled(page, 'b1');
        },
      });
      R.sw.afterBump1 = await swState(page);
      await step(ctx, R, 'bump1Reload2WarmHttp', () => page.reload(), { mode: 'home-window', markName: null });
      R.sw.afterBump1Reload2 = await swState(page);

      P.swSuffix = 'b2';
      await ctx.net.cdp.send('Network.clearBrowserCache');
      await step(ctx, R, 'bump2Reload1', () => page.reload(), {
        mode: 'home-window', markName: null,
        after: async () => {
          R.sw.bump2Update = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const t = performance.now(); await r.update(); return Math.round(performance.now() - t); });
          R.sw.bump2 = await waitSwInstalled(page, 'b2');
        },
      });
      await ctx.net.cdp.send('Network.clearBrowserCache');
      await step(ctx, R, 'bump2Reload2ColdHttp', () => page.reload(), { mode: 'home-window', markName: null });
      R.sw.afterBump2Reload2 = await swState(page);
      await step(ctx, R, 'postBumpHomeToSpace', async () => {
        await page.locator('[data-orbit-open-world]').click({ timeout: 5000 }).catch(() => page.evaluate(() => window.navigate('personalSpace')));
      }, { mode: 'full-world' });

      save(`t1-v2-${vp.width}-${net}`, R);
      P.throttle = null; P.swSuffix = null;
      await ctx.context.close();
    });
  }
}

for (const net of ['fast', 'fast3g']) {
  test(`2: V2 state changes (reveal / phase / companion / protagonist) 390 ${net}`, async ({ browser }) => {
    P.throttle = net === 'fast3g' ? FAST3G : null; P.swSuffix = null; bwCursor = 0;
    await settle(500, 10_000);
    P.base = P.log.length;
    const sessions = [3, 2, 1].map(daysAgo => {
      const date = pastDate(daysAgo);
      return {
        id: `ps211-s${daysAgo}`, taskId: FOCUS_TASK.id, taskName: FOCUS_TASK.name, date,
        completedAt: `${date}T18:00:00.000Z`, startedAt: `${date}T17:30:00.000Z`, result: 'complete',
        durationMinutes: 30, impactType: 'task', category: 'focus', value: 'A', taskNature: 'growth',
        xpEarned: 50, finalXP: 50, baseXP: 50,
      };
    });
    const ctx = await newProbeContext(browser, { width: 390, height: 844 }, { sessions });
    const { page } = ctx;
    const R = { net, sessions: sessions.map(s => s.date), sw: {} };
    await step(ctx, R, 'cold75', () => page.goto('/'), { mode: 'home-window', markName: null });
    R.sw.afterCold = await waitSwInstalled(page, null);
    await settle();

    ctx.setPhase('completeQuest');
    await page.evaluate(() => window.__ps211.mark('completeQuest'));
    const t0 = Date.now();
    await page.locator('[data-orbit-main-quest]').click();
    await page.locator('.focus-skip-btn').click();
    await page.locator('.skip-dur-btn[data-min="30"]').click();
    await page.locator('#skip-yes').click();
    let lastHosts = -1; let stableSince = Date.now();
    const shots = [];
    while (Date.now() - t0 < 120_000) {
      const n = await page.evaluate(() => window.__ps211.events.filter(e => e.type === 'host').length);
      if (n !== lastHosts) { lastHosts = n; stableSince = Date.now(); }
      if (net === 'fast3g' && shots.length < 16) {
        const file = path.join(OUT, `t2-${net}-${String(shots.length).padStart(2, '0')}.png`);
        await page.locator('[data-orbit-window]').first().screenshot({ path: file, animations: 'disabled', timeout: 5000 }).catch(() => {});
        shots.push(`${path.basename(file)}@${Date.now() - t0}ms`);
      }
      const ready = await page.evaluate(() => {
        const h = document.querySelector('[data-orbit-window][data-render-mode="home-window"] [data-orbit-runtime-host]');
        const w = h?.closest('[data-orbit-window]');
        return h?.dataset.runtimeStatus === 'ready' && !w?.dataset.revealKind;
      });
      if (ready && Date.now() - stableSince > 4000) break;
      await sleep(250);
    }
    R.completeQuest = {
      wallMs: Date.now() - t0,
      page: summarizeTransition(await pageMetrics(page, 'completeQuest')),
    };
    R.completeQuest.settleMs = await settle();
    R.completeQuest.proxy = proxySummary('completeQuest');
    R.completeQuest.cdp = cdpSummary(ctx.net, 'completeQuest');
    R.shots = shots;
    R.sw.afterQuest = await swState(page);
    await step(ctx, R, 'homeToSpace', () => page.evaluate(() => window.navigate('personalSpace')), { mode: 'full-world' });
    await step(ctx, R, 'spaceToHome', () => page.evaluate(() => window.navigate('home')), { mode: 'home-window' });
    save(`t2-states-${net}`, R);
    P.throttle = null;
    await ctx.context.close();
  });
}

for (const net of ['fast', 'fast3g']) {
  test(`3: legacy personal space 390 ${net}`, async ({ browser }) => {
    P.throttle = net === 'fast3g' ? FAST3G : null; P.swSuffix = null; bwCursor = 0;
    await settle(500, 10_000);
    P.base = P.log.length;
    const ctx = await newProbeContext(browser, { width: 390, height: 844 }, { legacy: true });
    const { page } = ctx;
    const R = { net };
    const waitLegacyImgs = () => page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('#content img')];
      return document.querySelector('#content .space-idle-background')
        && imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 240_000, polling: 50 });
    await step(ctx, R, 'legacyCold', async () => { await page.goto('/'); await page.waitForSelector('#main-app:not(.hidden)', { timeout: 120_000 }); }, { markName: null });
    R.swAfterCold = await waitSwInstalled(page, null);
    await step(ctx, R, 'legacyEnter1', async () => { await page.evaluate(() => window.navigate('personalSpace')); await waitLegacyImgs(); });
    await step(ctx, R, 'legacyToHome', async () => { await page.evaluate(() => window.navigate('home')); await sleep(300); });
    await step(ctx, R, 'legacyEnter2', async () => { await page.evaluate(() => window.navigate('personalSpace')); await waitLegacyImgs(); });
    await step(ctx, R, 'legacyToGoals', async () => { await page.evaluate(() => window.navigate('goals')); await sleep(300); });
    await step(ctx, R, 'legacyEnter3', async () => { await page.evaluate(() => window.navigate('personalSpace')); await waitLegacyImgs(); });
    await page.evaluate(() => window.navigate('home')); await sleep(300);
    await ctx.net.cdp.send('Network.clearBrowserCache');
    await step(ctx, R, 'legacyReloadSwOnly', async () => { await page.reload(); await page.waitForSelector('#main-app:not(.hidden)'); }, { markName: null });
    await step(ctx, R, 'legacyEnterAfterReload', async () => { await page.evaluate(() => window.navigate('personalSpace')); await waitLegacyImgs(); });
    R.sw = await swState(page);
    save(`t3-legacy-${net}`, R);
    P.throttle = null;
    await ctx.context.close();
  });
}

for (const net of ['fast3g']) {
  test(`4: post-release at 100% progress, JS warm / art cold 390 ${net}`, async ({ browser }) => {
    P.throttle = FAST3G; P.swSuffix = null; bwCursor = 0;
    await settle(500, 10_000);
    P.base = P.log.length;
    const sessions = [4, 3, 2, 1].map(daysAgo => {
      const date = pastDate(daysAgo);
      return {
        id: `ps211-p${daysAgo}`, taskId: FOCUS_TASK.id, taskName: FOCUS_TASK.name, date,
        completedAt: `${date}T02:00:00.000Z`, startedAt: `${date}T01:30:00.000Z`, result: 'complete',
        durationMinutes: 30, impactType: 'task', category: 'focus', value: 'A', taskNature: 'growth',
        xpEarned: 50, finalXP: 50, baseXP: 50,
      };
    });
    const ctx = await newProbeContext(browser, { width: 390, height: 844 }, { sessions });
    const { page } = ctx;
    const R = { net, sw: {} };
    await step(ctx, R, 'cold100', () => page.goto('/'), { mode: 'home-window', markName: null });
    R.sw.afterCold = await waitSwInstalled(page, null);
    await settle();
    await step(ctx, R, 'reloadWarm100', () => page.reload(), { mode: 'home-window', markName: null });
    // Release: new CACHE name; activate deletes the runtime-cached art + pixi.
    P.swSuffix = 'r1';
    ctx.setPhase('release-install');
    R.sw.update = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); return true; });
    R.sw.installed = await waitSwInstalled(page, 'r1');
    await settle();
    R.sw.installProxy = proxySummary('release-install');
    // Emulate "HTTP cache expired for art": clear it, then re-warm only JS/CSS (as the
    // new SW install + SWR would have done), leaving images and pixi.js cold.
    await ctx.net.cdp.send('Network.clearBrowserCache');
    ctx.setPhase('warm-js');
    await page.evaluate(async shell => {
      const urls = shell.filter(u => /\.(js|css)$/.test(u) && !/vendor\/pixi\.js$/.test(u));
      await Promise.all(urls.map(u => fetch(u, { cache: 'reload' }).then(r => r.arrayBuffer()).catch(() => null)));
    }, SHELL);
    await settle();
    R.sw.warmJsProxy = proxySummary('warm-js');
    R.sw.beforePostRelease = await swState(page);
    await step(ctx, R, 'postRelease100', () => page.reload(), { mode: 'home-window', markName: null });
    await step(ctx, R, 'postReleaseHomeToSpace', () => page.evaluate(() => window.navigate('personalSpace')), { mode: 'full-world' });
    save(`t4-postrelease-p100-${net}`, R);
    P.throttle = null; P.swSuffix = null;
    await ctx.context.close();
  });
}

test('9: dump proxy log', async () => {
  save('proxy-log', P.log);
  expect(P.log.length).toBeGreaterThan(0);
});
