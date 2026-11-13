/**
 * pro014e2-leaderboard-name.test.js — PRO-014E2
 *
 * Joining the leaderboard asks for a public name and writes it together with
 * the opt-in in one PATCH of the caller's own profile row; the board then reads
 * get_leaderboard() and marks the caller's row from is_me. The account name
 * never leaves the device for either.
 *
 * Runs the real vendored client against a stubbed Supabase host, as BUG-116
 * does: reads of tables fail (500, not retried), so the app keeps the cached
 * user, while the two requests under test are answered.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000e2e02';
const ACCOUNT_NAME = 'Real Account Name';

test.describe('PRO-014E2 leaderboard public name', () => {
  test('asks for a public name, saves it with the opt-in, and the board shows it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const profileWrites = [];
    const otherReads = [];

    await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
    await page.route(`${SUPABASE_URL}/rest/**`, route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/rest/v1/profiles' && request.method() === 'PATCH') {
        profileWrites.push({ method: 'PATCH', search: url.search, body: request.postDataJSON() });
        const body = request.postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/vnd.pgrst.object+json',
          body: JSON.stringify({ display_name: body.display_name ?? null, is_public: body.is_public ?? false }),
        });
      }
      if (url.pathname === '/rest/v1/profiles') {
        if (request.method() !== 'GET') profileWrites.push({ method: request.method(), body: request.postDataJSON() });
      } else if (url.pathname === '/rest/v1/rpc/get_leaderboard') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              display_name: 'Night Owl', avatar_path: null, total_xp: 300, week_xp: 120,
              streak_days: 4, mode: 'normal', joined_on: '2026-09-01', is_me: true, is_pro: false,
            },
            {
              display_name: 'Early Bird', avatar_path: null, total_xp: 900, week_xp: 80,
              streak_days: 9, mode: 'normal', joined_on: '2026-08-01', is_me: false, is_pro: false,
            },
          ]),
        });
      } else {
        otherReads.push(url.pathname);
      }
      // PostgREST retries only 503 and 520.
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' });
    });

    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, id: USER_ID, name: ACCOUNT_NAME });
    await page.addInitScript(([key, userId]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'pro014e2@example.test' },
      }));
    }, [SESSION_KEY, USER_ID]);

    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    // The cached-user boot's remote load has given up; the cached user stays.
    await page.waitForSelector('#sync-banner.sync-error', { timeout: 8000 });

    await page.click('.nav-item[data-page="settings"]');
    const card = page.locator('#leaderboard-card');
    await expect(card).toContainText('目前不公開');

    // Turning on asks for a name first; nothing is written yet.
    await card.locator('.toggle-slider').click();
    const input = page.locator('#lb-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(page.locator('#public-toggle')).not.toBeChecked();
    expect(profileWrites).toEqual([]);

    // The name rule answers before the server does.
    await input.fill(' Night Owl');
    await page.click('#lb-name-save');
    await expect(page.locator('#lb-name-error')).toContainText('開頭和結尾');
    expect(profileWrites).toEqual([]);

    await input.fill('Night Owl');
    await page.click('#lb-name-save');
    await expect(page.locator('#lb-current-name')).toHaveText('Night Owl');
    await expect(page.locator('#public-toggle')).toBeChecked();
    expect(profileWrites).toHaveLength(1);
    expect(profileWrites[0].method).toBe('PATCH');
    expect(profileWrites[0].search).toContain(`user_id=eq.${USER_ID}`);
    expect(profileWrites[0].body).toEqual({ display_name: 'Night Owl', is_public: true });
    const savedUser = await page.evaluate(() => JSON.parse(localStorage.getItem('yoyo_user')));
    expect(savedUser).toMatchObject({ isPublic: true, displayName: 'Night Owl', name: ACCOUNT_NAME });

    await page.click('.nav-item[data-page="leaderboard"]');
    const mine = page.locator('.lb-row-me');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Night Owl');
    await expect(page.locator('.lb-row').first()).toContainText('Night Owl'); // week tab: 120 > 80
    await expect(page.locator('#content')).not.toContainText(ACCOUNT_NAME);
    expect(otherReads).not.toContain('/rest/v1/leaderboard_view');
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('yoyo_leaderboardCacheV2')));
    expect(cache.rows.map(row => row.display_name)).toEqual(['Night Owl', 'Early Bird']);

    // A profile push, if any ran, never carried the leaderboard fields.
    for (const write of profileWrites.slice(1)) {
      expect(write.body).not.toHaveProperty('is_public');
      expect(write.body).not.toHaveProperty('display_name');
    }
  });
});
