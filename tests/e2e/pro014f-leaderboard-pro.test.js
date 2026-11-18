/**
 * pro014f-leaderboard-pro.test.js — PRO-014F (SUB-14)
 *
 * A row that get_leaderboard() marks is_pro shows the Pro glow around the
 * avatar and a "✦ Pro" badge after the name; other rows show neither. The glow
 * breathes, and stands still under reduced motion.
 *
 * Same stubbed Supabase host as pro014e2-leaderboard-name.test.js: reads of
 * tables fail (500), so the app keeps the cached user; the RPC is answered.
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-0000000e2f01';

const ROWS = [
  {
    display_name: 'Pro Owl', avatar_path: null, total_xp: 300, week_xp: 120,
    streak_days: 4, mode: 'normal', joined_on: '2026-09-01', is_me: false, is_pro: true,
  },
  {
    display_name: 'Free Bird', avatar_path: null, total_xp: 900, week_xp: 80,
    streak_days: 9, mode: 'normal', joined_on: '2026-08-01', is_me: true, is_pro: false,
  },
];

async function openBoard(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.route(`${SUPABASE_URL}/rest/**`, route => {
    if (new URL(route.request().url()).pathname === '/rest/v1/rpc/get_leaderboard') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' });
  });
  await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, id: USER_ID });
  await page.addInitScript(([key, userId]) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'pro014f@example.test' },
    }));
  }, [SESSION_KEY, USER_ID]);

  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  await page.waitForSelector('#sync-banner.sync-error', { timeout: 8000 });
  await page.click('.nav-item[data-page="leaderboard"]');
  await expect(page.locator('.lb-row')).toHaveCount(2);
}

const avatarOf = (page, name) => page.locator('.lb-row', { hasText: name }).locator('.lb-avatar');

test.describe('PRO-014F leaderboard Pro mark', () => {
  test('marks only the Pro row, with a visible glow that breathes', async ({ page }) => {
    await openBoard(page, 'no-preference');

    const proRow = page.locator('.lb-row', { hasText: 'Pro Owl' });
    await expect(proRow.locator('.lb-pro')).toHaveText('✦ Pro');
    await expect(page.locator('.lb-row', { hasText: 'Free Bird' }).locator('.lb-pro')).toHaveCount(0);
    await expect(page.locator('.lb-row', { hasText: 'Free Bird' }).locator('.lb-you')).toHaveText('你');

    const pro = await avatarOf(page, 'Pro Owl').evaluate(el => {
      const style = window.getComputedStyle(el);
      return { shadow: style.boxShadow, animation: style.animationName };
    });
    expect(pro.shadow).not.toBe('none');
    expect(pro.animation).toBe('lb-pro-glow');
    const free = await avatarOf(page, 'Free Bird').evaluate(el => window.getComputedStyle(el).boxShadow);
    expect(free).toBe('none');
  });

  test('keeps the glow but stops it moving under reduced motion', async ({ page }) => {
    await openBoard(page, 'reduce');
    const pro = await avatarOf(page, 'Pro Owl').evaluate(el => {
      const style = window.getComputedStyle(el);
      return { shadow: style.boxShadow, animation: style.animationName };
    });
    expect(pro.shadow).not.toBe('none');
    expect(pro.animation).toBe('none');
  });
});
