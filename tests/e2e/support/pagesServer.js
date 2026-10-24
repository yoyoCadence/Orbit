/**
 * A static server like GitHub Pages, for the service worker e2e tests
 * (INFRA-105, INFRA-107). `pwa/server.cjs` answers `no-store`, which cannot
 * show the browser's HTTP cache at work, so this serves `pwa/` with
 * `max-age=600` and content-hash ETags, and a 304 on a match.
 *
 * - `base`: the path the app is served under (`/Orbit/` on GitHub Pages).
 * - `cacheControl(path)`: the `Cache-Control` of a path, `max-age=600` by
 *   default (`max-age=0` stands for a copy older than 10 minutes).
 * - `files`: replaces a path's content (the next version).
 * - `failing`: paths answered with a 500 (a download that fails).
 * - `log`: `{ path, status }` of each response (`/` is logged as `/index.html`).
 * - `urls`: the raw URL of each request, query included.
 * - `offline = true`: every request fails as if the network were down.
 *
 * Tests using it add no Playwright routing: routing turns the HTTP cache off.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { SUPABASE_STUB } from './seed.js';

const PWA_ROOT = new URL('../../../pwa/', import.meta.url);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// The content of a file in `pwa/`, by its path there (`/js/version.js`).
export function readPwaFile(path, encoding = 'utf8') {
  return readFile(new URL(`.${path}`, PWA_ROOT), encoding);
}

export async function startPagesServer({ base = '/', cacheControl = () => 'max-age=600' } = {}) {
  const files = new Map([[`${base}vendor/supabase.js`, SUPABASE_STUB]]);
  const log = [];
  const urls = [];
  const failing = new Set();
  let offline = false;
  const server = createServer(async (request, response) => {
    if (offline) {
      request.socket.destroy();
      return;
    }
    urls.push(request.url);
    let path = decodeURIComponent(request.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    if (failing.has(path)) {
      log.push({ path, status: 500 });
      response.writeHead(500);
      response.end();
      return;
    }
    let body = files.get(path);
    if (body === undefined && path.startsWith(base)) {
      body = await readPwaFile(`/${path.slice(base.length)}`, null).catch(() => undefined);
    }
    if (body === undefined) {
      log.push({ path, status: 404 });
      response.writeHead(404);
      response.end();
      return;
    }
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    const extension = path.slice(path.lastIndexOf('.'));
    const headers = {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Cache-Control': cacheControl(path),
      ETag: etag,
    };
    const status = request.headers['if-none-match'] === etag ? 304 : 200;
    log.push({ path, status });
    response.writeHead(status, headers);
    response.end(status === 304 ? undefined : body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    files,
    failing,
    log,
    urls,
    set offline(value) { offline = value; },
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}
