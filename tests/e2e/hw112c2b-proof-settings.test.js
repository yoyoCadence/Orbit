/**
 * hw112c2b-proof-settings.test.js — HW-112C2b
 *
 * A signed-in account with two photos on this device: one already uploaded,
 * one still waiting. Settings clears this device's copy of the uploaded one
 * only; "delete all" removes both here and empties the account's cloud
 * folder; signing out drops only the uploaded one.
 *
 * Real vendored Supabase client against a stubbed host (as HW-112C1/C2a):
 * table reads fail, so no sync runs on its own; Storage is answered and recorded.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, TODAY, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000c2c2b';
const UPLOADED = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const WAITING = 'cccccccc-cccc-4ccc-8ccc-000000000002';
const ELSEWHERE = 'cccccccc-cccc-4ccc-8ccc-000000000003'; // only in the cloud
const PHOTO = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;

const session = (id, minutesAgo) => ({
  id, taskId: FOCUS_TASK.id, taskName: FOCUS_TASK.name, date: TODAY,
  completedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), result: 'complete',
  impactType: 'task', taskNature: 'growth', category: 'focus', value: 'A',
  durationMinutes: 30, finalXP: 50,
});

async function openApp(page, storageCalls, { backfilled = true } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.route(`${SUPABASE_URL}/rest/**`, route => route.fulfill({
    status: 500, contentType: 'application/json', body: '{"message":"e2e"}',
  }));
  await page.route(`${SUPABASE_URL}/storage/**`, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    storageCalls.push({ method: request.method(), path, body: request.postDataJSON?.() ?? null });
    if (path === '/storage/v1/object/list/proofs') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([`${UPLOADED}.jpg`, `${ELSEWHERE}.jpg`].map((name, i) => ({ name, id: `obj-${i}` }))),
      });
    }
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 400, contentType: 'application/json',
        body: '{"statusCode":"404","error":"not_found","message":"Object not found"}',
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await seedStorage(page, [FOCUS_TASK], [session(UPLOADED, 30), session(WAITING, 20)], { ...GUEST_USER, id: USER_ID });
  await page.addInitScript(([key, userId, photo, ids, backfilled]) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'hw112c2b@example.test' },
    }));
    for (const id of ids) localStorage.setItem(`orbit_proof_${id}`, photo);
    // HW-112C1 state: the account's photos were queued once; one still waits.
    // (Not yet, when the backfill has not run: opened offline on this version.)
    if (!backfilled) return;
    localStorage.setItem(`orbit_proofsync_backfilled:${encodeURIComponent(userId)}`, '1');
    localStorage.setItem(`orbit_proofsync_upload:${encodeURIComponent(userId)}`, JSON.stringify([ids[1]]));
  }, [SESSION_KEY, USER_ID, PHOTO, [UPLOADED, WAITING], backfilled]);

  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

const localPhotos = page => page.evaluate(ids => ids.filter(id => localStorage.getItem(`orbit_proof_${id}`)), [UPLOADED, WAITING]);

test.describe('HW-112C2b proof photos: settings and sign-out', () => {
  test('clearing this device keeps the photo still waiting to upload', async ({ page }) => {
    await openApp(page, []);
    await page.click('.nav-item[data-page="settings"]');
    const clear = page.locator('#proof-clear-btn');
    await expect(clear).toContainText('清除這台裝置的佐證照片（2 張');
    await expect(page.locator('#proof-delete-all-btn')).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await clear.click();
    await expect(page.locator('#toast, .toast').first()).toContainText('1 張還沒確定上傳的先保留');
    expect(await localPhotos(page)).toEqual([WAITING]);
  });

  test('clearing this device before the first sync queued anything keeps every photo', async ({ page }) => {
    await openApp(page, [], { backfilled: false });
    await page.click('.nav-item[data-page="settings"]');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#proof-clear-btn').click();
    await expect(page.locator('#toast, .toast').first()).toContainText('2 張還沒確定上傳的先保留');
    expect(await localPhotos(page)).toEqual([UPLOADED, WAITING]);
  });

  test('delete all removes them here and empties the account\'s cloud folder', async ({ page }) => {
    const storageCalls = [];
    await openApp(page, storageCalls);
    await page.click('.nav-item[data-page="settings"]');
    page.on('dialog', dialog => dialog.accept()); // asked twice
    await page.locator('#proof-delete-all-btn').click();
    await expect(page.locator('#toast, .toast').first()).toContainText('已刪除所有佐證照片（雲端 2 張）');

    expect(await localPhotos(page)).toEqual([]);
    const list = storageCalls.find(call => call.path === '/storage/v1/object/list/proofs');
    expect(list.body).toMatchObject({ prefix: USER_ID, limit: 100, offset: 0 });
    const removal = storageCalls.find(call => call.method === 'DELETE');
    expect(removal.body).toEqual({ prefixes: [`${USER_ID}/${UPLOADED}.jpg`, `${USER_ID}/${ELSEWHERE}.jpg`] });
    // The photo that was waiting was not uploaded after all.
    expect(storageCalls.filter(call => call.method === 'POST' && call.path.startsWith('/storage/v1/object/proofs/'))).toEqual([]);
  });

  test('signing out drops only the photo already in the cloud', async ({ page }) => {
    await openApp(page, []);
    await page.evaluate(() => window.signOut());
    await expect(page.locator('#auth-screen, #login-screen').first()).toBeVisible({ timeout: 5000 });
    expect(await localPhotos(page)).toEqual([WAITING]);
  });
});
