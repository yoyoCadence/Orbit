/**
 * devServer.test.js — 本機開發用的 `node pwa/server.cjs`
 *
 * 只回傳 pwa/ 底下的檔案：不經瀏覽器正規化的請求（curl --path-as-is 或腳本）
 * 以 `/../` 開頭時不能讀到 repo 其他檔案或磁碟上的任何檔案。
 */
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 41000 + Math.floor(Math.random() * 1000);
let server;

// Sends the path exactly as given (Node's client does not normalize `..`).
const get = path => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: PORT, path }, res => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
  });
  req.on('error', reject);
  req.end();
});

beforeAll(() => new Promise((resolve, reject) => {
  server = spawn(process.execPath, [join(ROOT, 'pwa', 'server.cjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { if (String(chunk).includes('Server running')) resolve(); });
  server.on('error', reject);
  server.on('exit', code => reject(new Error(`server exited (${code})`)));
}));

afterAll(() => { server?.kill(); });

describe('pwa/server.cjs', () => {
  it('serves the app', async () => {
    const page = await get('/');
    expect(page.status).toBe(200);
    expect(page.body).toContain('<html');
    expect((await get('/index.html?code=x')).status).toBe(200);
  });

  it('does not serve files outside pwa/', async () => {
    for (const path of ['/../package.json', '/../../../../etc/hostname', '/js/../../package.json', '/..']) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.body, path).not.toContain('"version"');
    }
  });

  it('labels the image types the app uses', async () => {
    expect((await get('/assets/icon-192.png')).type).toBe('image/png');
    const webp = await get('/assets/personal-space/v2/characters/toon/protagonist/hoodie-walk-right.webp');
    expect([webp.status, webp.type]).toEqual([200, 'image/webp']);
  });
});
