/**
 * hw112c-proof-upload.test.js — HW-112C1
 *
 * A signed-in account's proof photo goes to its own folder of the private
 * `proofs` bucket as a JPEG, without overwriting; undoing the session deletes
 * the cloud copy and the copy on this device.
 *
 * Runs the real vendored Supabase client against a stubbed host, as BUG-116
 * and PRO-014E2 do: reads of tables fail (500), so the app keeps the cached
 * user; the Storage requests under test are answered and recorded.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000c112c';

test.describe('HW-112C1 proof photo backup', () => {
  test('uploads the saved photo to the account\'s folder, and deletes it with the session', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const storageCalls = [];

    await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
    await page.route(`${SUPABASE_URL}/rest/**`, route => route.fulfill({
      status: 500, contentType: 'application/json', body: '{"message":"e2e"}',
    }));
    await page.route(`${SUPABASE_URL}/storage/**`, route => {
      const request = route.request();
      storageCalls.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        contentType: request.headers()['content-type'] ?? '',
        upsert: request.headers()['x-upsert'] ?? null,
        body: request.method() === 'DELETE' ? request.postDataJSON() : null,
        raw: request.method() === 'POST' ? request.postDataBuffer() : null,
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ok"}' });
    });

    await seedStorage(page, [INSTANT_TASK], [], { ...GUEST_USER, id: USER_ID });
    await page.addInitScript(([key, userId]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'hw112c@example.test' },
      }));
    }, [SESSION_KEY, USER_ID]);

    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    // A real JPEG made by the browser, so the app's own compression can decode it.
    const jpeg = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 40; canvas.height = 30;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, 40, 30);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }), 'base64');

    await page.locator('.task-card .task-name').first().click();
    await page.waitForSelector('.plan-card', { timeout: 5000 });
    await page.locator('.plan-card').first().click();

    await expect(page.locator('#proof-file-input')).toBeAttached({ timeout: 3000 });
    await page.locator('#proof-file-input').setInputFiles({ name: 'proof.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await expect(page.locator('#proof-confirm')).toBeEnabled();
    await page.locator('#proof-confirm').click();

    const sessionId = await page.evaluate(() => JSON.parse(localStorage.getItem('yoyo_sessions'))[0].id);
    const objectPath = `/storage/v1/object/proofs/${USER_ID}/${sessionId}.jpg`;
    await expect.poll(() => storageCalls.filter(call => call.method === 'POST').length).toBe(1);
    const upload = storageCalls.find(call => call.method === 'POST');
    expect(upload.path).toBe(objectPath);
    expect(upload.upsert).toBe('false');
    // supabase-js sends a Blob as multipart form data; Storage checks the file
    // part's type against the bucket's allowed_mime_types (image/jpeg only).
    expect(upload.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const raw = upload.raw.toString('latin1');
    expect(raw).toMatch(/Content-Type: image\/jpeg/);
    expect(raw).not.toMatch(/Content-Type: image\/(png|webp)/);
    const jpegStart = raw.indexOf(String.fromCharCode(0xff, 0xd8, 0xff));
    expect(jpegStart).toBeGreaterThan(0);
    expect(upload.raw.length).toBeLessThanOrEqual(204800 + 1024);
    await expect.poll(() => page.evaluate(owner => localStorage.getItem(
      `orbit_proofsync_upload:${encodeURIComponent(owner)}`,
    ), USER_ID)).toBeNull();

    // Undo the session: its photo goes here and in the cloud.
    page.once('dialog', dialog => dialog.accept());
    await page.locator(`.session-del-btn[data-session-id="${sessionId}"]`).first().click();
    await expect.poll(() => storageCalls.filter(call => call.method === 'DELETE').length).toBe(1);
    const removal = storageCalls.find(call => call.method === 'DELETE');
    expect(removal.path).toBe('/storage/v1/object/proofs');
    expect(removal.body).toEqual({ prefixes: [`${USER_ID}/${sessionId}.jpg`] });
    expect(await page.evaluate(id => localStorage.getItem(`orbit_proof_${id}`), sessionId)).toBeNull();
  });
});
