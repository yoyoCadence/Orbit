/**
 * hw112c2-cloud-proof.test.js — HW-112C2a
 *
 * Another device of the same account: the sessions are here, their photos are
 * not. A row in view downloads its photo from the private `proofs` bucket and
 * shows it (blob: URL, never localStorage); a session with no cloud photo
 * shows nothing; a reload shows the photo from this device's cache without
 * downloading it again; the cloud photo can be the Personal Space photo; and
 * signing out clears the cache.
 *
 * Runs the real vendored Supabase client against a stubbed host, as HW-112C1
 * does: reads of tables fail (500), so the app keeps the cached user and
 * sessions; Storage downloads are answered and counted.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, TODAY, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000c2c2a';
const WITH_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const WITHOUT_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';

const session = (id, minutesAgo) => ({
  id, taskId: FOCUS_TASK.id, taskName: FOCUS_TASK.name, date: TODAY,
  completedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), result: 'complete',
  impactType: 'task', taskNature: 'growth', category: 'focus', value: 'A',
  durationMinutes: 30, finalXP: 50,
});

async function makeJpeg(context) {
  const helper = await context.newPage();
  await helper.setContent('<html><body></body></html>');
  const base64 = await helper.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#cc3366'; ctx.fillRect(0, 0, 40, 30);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  await helper.close();
  return Buffer.from(base64, 'base64');
}

const rowOf = (page, sessionId) => page.locator('.log-item', {
  has: page.locator(`.session-del-btn[data-session-id="${sessionId}"]`),
});

test.describe('HW-112C2a cloud proof photos on another device', () => {
  test('shows the account\'s cloud photo, keeps it on this device, and forgets it on sign-out', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const jpeg = await makeJpeg(page.context());
    const downloads = [];

    await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
    await page.route(`${SUPABASE_URL}/rest/**`, route => route.fulfill({
      status: 500, contentType: 'application/json', body: '{"message":"e2e"}',
    }));
    await page.route(`${SUPABASE_URL}/storage/**`, route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      downloads.push(path);
      if (path === `/storage/v1/object/proofs/${USER_ID}/${WITH_PHOTO}.jpg`) {
        return route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg });
      }
      return route.fulfill({
        status: 400, contentType: 'application/json',
        body: '{"statusCode":"404","error":"not_found","message":"Object not found"}',
      });
    });

    await seedStorage(page, [FOCUS_TASK], [session(WITH_PHOTO, 30), session(WITHOUT_PHOTO, 20)], { ...GUEST_USER, id: USER_ID });
    await page.addInitScript(([key, userId]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'hw112c2@example.test' },
      }));
    }, [SESSION_KEY, USER_ID]);

    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    const photoPath = `/storage/v1/object/proofs/${USER_ID}/${WITH_PHOTO}.jpg`;
    const missingPath = `/storage/v1/object/proofs/${USER_ID}/${WITHOUT_PHOTO}.jpg`;

    // Nothing is fetched while the rows are out of view (below the fold here).
    await expect(page.locator('.session-proof-cloud')).toHaveCount(2);
    expect(downloads).toEqual([]);

    // In view: the row with a cloud photo gets its thumbnail; the other stays as it is.
    await rowOf(page, WITH_PHOTO).scrollIntoViewIfNeeded();
    await rowOf(page, WITHOUT_PHOTO).scrollIntoViewIfNeeded();
    const thumb = rowOf(page, WITH_PHOTO).locator('.session-proof-thumb');
    await expect(thumb).toHaveAttribute('src', /^blob:/, { timeout: 8000 });
    await expect.poll(() => downloads.filter(path => path === missingPath).length).toBe(1);
    await expect(rowOf(page, WITHOUT_PHOTO).locator('.session-proof-thumb')).toHaveCount(0);
    expect(await thumb.evaluate(img => img.complete && img.naturalWidth)).toBe(40);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('orbit_proof_')))).toEqual([]);
    expect(downloads.filter(path => path === photoPath)).toHaveLength(1);

    // The cloud photo can be the Personal Space photo.
    await rowOf(page, WITH_PHOTO).locator('.session-proof-wall-btn').click();
    const frame = page.locator('[data-orbit-window] [data-achievement-photo]').first();
    await expect(frame).toHaveAttribute('data-photo-status', 'selected', { timeout: 5000 });
    await expect(frame.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);

    // After a reload it comes from this device's cache, not from Storage.
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await rowOf(page, WITH_PHOTO).scrollIntoViewIfNeeded();
    await expect(rowOf(page, WITH_PHOTO).locator('.session-proof-thumb')).toHaveAttribute('src', /^blob:/, { timeout: 8000 });
    await expect(page.locator('[data-orbit-window] [data-achievement-photo]').first())
      .toHaveAttribute('data-photo-status', 'selected', { timeout: 5000 });
    expect(downloads.filter(path => path === photoPath)).toHaveLength(1);

    // Personal Space shows it too (after a reload: from this device's cache).
    await page.click('.nav-item[data-page="personalSpace"]');
    await expect(page.locator('[data-achievement-photo]').first())
      .toHaveAttribute('data-photo-status', 'selected', { timeout: 5000 });
    expect(downloads.filter(path => path === photoPath)).toHaveLength(1);

    // Signing out removes this account's photos from the cache.
    const cached = () => page.evaluate(owner => new Promise(resolve => {
      const request = window.indexedDB.open('orbit-proofs');
      request.onsuccess = () => {
        const db = request.result;
        const keys = db.transaction('meta').objectStore('meta').index('owner').getAllKeys(owner);
        keys.onsuccess = () => { db.close(); resolve(keys.result.length); };
        keys.onerror = () => { db.close(); resolve(-1); };
      };
      request.onerror = () => resolve(-1);
    }), USER_ID);
    expect(await cached()).toBe(1);
    await page.evaluate(() => window.signOut());
    await expect.poll(cached).toBe(0);
  });
});
