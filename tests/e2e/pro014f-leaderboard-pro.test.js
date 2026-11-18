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

async function openBoard(page, reducedMotion, rows = ROWS) {
  await page.emulateMedia({ reducedMotion });
  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.route(`${SUPABASE_URL}/rest/**`, route => {
    if (new URL(route.request().url()).pathname === '/rest/v1/rpc/get_leaderboard') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
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
  await expect(page.locator('.lb-row')).toHaveCount(rows.length);
}

const avatarOf = (page, name) => page.locator('.lb-row', { hasText: name }).locator('.lb-avatar');
// Runs in the page: the ring (the avatar's own shadow) and the halo (its ::after layer).
const glowOf = el => {
  const own = window.getComputedStyle(el);
  const halo = window.getComputedStyle(el, '::after');
  return {
    ring: own.boxShadow,
    ringAnimation: own.animationName,
    halo: halo.content === 'none' ? 'none' : halo.boxShadow,
    animation: halo.animationName,
  };
};

test.describe('PRO-014F leaderboard Pro mark', () => {
  test('marks only the Pro row, with a visible glow that breathes', async ({ page }) => {
    await openBoard(page, 'no-preference');

    const proRow = page.locator('.lb-row', { hasText: 'Pro Owl' });
    await expect(proRow.locator('.lb-pro')).toHaveText('✦ Pro');
    await expect(page.locator('.lb-row', { hasText: 'Free Bird' }).locator('.lb-pro')).toHaveCount(0);
    await expect(page.locator('.lb-row', { hasText: 'Free Bird' }).locator('.lb-you')).toHaveText('你');

    const pro = await avatarOf(page, 'Pro Owl').evaluate(glowOf);
    expect(pro.ring).not.toBe('none');
    expect(pro.halo).not.toBe('none');
    // The halo breathes by opacity on its own layer, not by repainting a shadow.
    expect(pro.animation).toBe('lb-pro-glow');
    expect(pro.ringAnimation).toBe('none');
    const free = await avatarOf(page, 'Free Bird').evaluate(glowOf);
    expect(free.ring).toBe('none');
    expect(free.halo).toBe('none');
  });

  test('keeps the badge text readable on themes with a light primary colour', async ({ page }) => {
    await openBoard(page, 'reduce');
    const colours = await page.evaluate(() => {
      const read = () => ({
        pro: window.getComputedStyle(document.querySelector('.lb-pro')).color,
        you: window.getComputedStyle(document.querySelector('.lb-you')).color,
      });
      const before = read();
      document.documentElement.setAttribute('data-theme', 'liquid-galss');
      return { before, after: read() };
    });
    // liquid-galss: #eaff35 behind the text, so its dark background colour, not white.
    expect(colours.after).toEqual({ pro: 'rgb(7, 21, 34)', you: 'rgb(7, 21, 34)' });
    expect(colours.before.pro).not.toBe(colours.after.pro);
  });

  test('still clips a Pro initial with stacked combining marks to the circle', async ({ page }) => {
    // Allowed by the public-name rule (PRO-014E2): one grapheme, 19 marks high.
    // The Pro row is second, so unclipped marks would paint into the row above.
    const stacked = 'Z' + String.fromCharCode(0x301).repeat(19);
    await openBoard(page, 'reduce', [{ ...ROWS[1], week_xp: 200 }, { ...ROWS[0], display_name: stacked }]);
    const avatar = page.locator('.lb-row').nth(1).locator('.lb-avatar');
    await expect(avatar).toHaveClass(/lb-avatar--pro/);
    // The row above looks the same with the stacked name as with a plain "Z".
    const rowAbove = () => page.locator('.lb-row').first().screenshot({ animations: 'disabled' });
    const withMarks = await rowAbove();
    const face = avatar.locator('.lb-avatar-face');
    await face.evaluate(el => { el.textContent = 'Z'; });
    const plain = await rowAbove();
    expect(plain.equals(withMarks)).toBe(true);
    // How high the marks reach depends on the fonts installed (on some systems
    // they never leave the circle), so the clip is also checked with content
    // that surely does: a bar reaching 60px up into the row above…
    await face.evaluate(el => {
      el.insertAdjacentHTML('beforeend',
        '<span data-e2e-bar style="position:absolute;left:16px;top:-60px;width:4px;height:70px;background:#ff00ff"></span>');
      el.style.position = 'relative';
    });
    expect((await rowAbove()).equals(plain)).toBe(true);
    // …which does show there once the face stops clipping (so this check can fail).
    await face.evaluate(el => { el.style.overflow = 'visible'; });
    expect((await rowAbove()).equals(plain)).toBe(false);
  });

  test('keeps the glow but stops it moving under reduced motion', async ({ page }) => {
    await openBoard(page, 'reduce');
    const pro = await avatarOf(page, 'Pro Owl').evaluate(glowOf);
    expect(pro.ring).not.toBe('none');
    expect(pro.halo).not.toBe('none');
    expect(pro.animation).toBe('none');
  });
});
