/**
 * bug116-signout.test.js — BUG-116
 *
 * Signing out offline with an expired access token must remove the Supabase
 * session from the device, and must not wait for the network. Before the fix
 * the SDK spent about 25 s retrying the refresh, then returned without
 * removing `sb-<project>-auth-token`: the next launch, or the leaderboard's
 * signed-in check, brought the account back.
 *
 * Runs the real vendored client (no mockSupabase); every request to the
 * Supabase host is refused, so the remote load fails and the app keeps the
 * cached user.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-000000000116';

test.describe('BUG-116 sign out offline', () => {
  test('removes the expired session at once, without a request', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, id: USER_ID });
    await page.addInitScript(([key, userId]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'bug116@example.test' },
      }));
    }, [SESSION_KEY, USER_ID]);

    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.click('.nav-item[data-page="settings"]');
    await page.waitForSelector('#signout-btn');

    // The access token runs out while the device is offline.
    await page.evaluate(key => {
      const session = JSON.parse(localStorage.getItem(key));
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      localStorage.setItem(key, JSON.stringify(session));
    }, SESSION_KEY);
    await context.setOffline(true);
    const requests = [];
    page.on('request', request => {
      if (request.url().startsWith(SUPABASE_URL)) requests.push(request.url());
    });

    await page.click('#signout-btn');

    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#main-app')).toBeHidden();
    expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('yoyo_user'))).toBeNull();
    expect(requests).toEqual([]);
  });
});
