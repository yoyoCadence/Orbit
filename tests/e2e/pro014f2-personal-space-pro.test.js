/**
 * pro014f2-personal-space-pro.test.js — PRO-014F2 F2A
 *
 * A signed-in Pro account sees "✦ Pro" on the home Orbit Window and in the
 * Personal Space HUD (once on that page), in the badge's colours (the HUD's own
 * span rule must not win). On the day the account becomes Pro on this device,
 * Orbit 夥伴 says the one neutral line. With no known status, nothing shows.
 *
 * Real vendored Supabase client against a stubbed host (table reads fail, so
 * the cached user and the seeded Pro projection are what the app uses).
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, seedProSnapshot, seedStorage } from './support/seed.js';

const config = readFileSync(new URL('../../pwa/js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(config)[1];
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER_ID = '00000000-0000-4000-8000-00000014f2a0';

async function openHome(page, { pro = true, seenBefore = null } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`${SUPABASE_URL}/**`, route => route.abort('internetdisconnected'));
  await page.route(`${SUPABASE_URL}/rest/**`, route => route.fulfill({
    status: 500, contentType: 'application/json', body: '{"message":"e2e"}',
  }));
  await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, id: USER_ID });
  if (pro) await seedProSnapshot(page, USER_ID);
  await page.addInitScript(([key, userId, seen]) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'pro014f2@example.test' },
    }));
    if (seen) localStorage.setItem(`orbit_ps_pro_seen:${encodeURIComponent(userId)}`, JSON.stringify(seen));
  }, [SESSION_KEY, USER_ID, seenBefore]);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  await page.waitForSelector('[data-orbit-window]', { timeout: 8000 });
}

// The badge's computed colours against the theme's --primary / --on-primary.
const badgeColours = (page, selector) => page.locator(selector).first().evaluate(el => {
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  probe.style.color = 'var(--primary)';
  const primary = window.getComputedStyle(probe).color;
  probe.style.color = 'var(--on-primary, #fff)';
  const onPrimary = window.getComputedStyle(probe).color;
  probe.remove();
  const style = window.getComputedStyle(el);
  return { background: style.backgroundColor, color: style.color, primary, onPrimary };
});

test.describe('PRO-014F2 Pro in Personal Space', () => {
  test('a Pro account sees the mark on the home card and once in the Personal Space HUD', async ({ page }) => {
    await openHome(page);
    const homeMark = page.locator('[data-orbit-window] .orbit-window-pro');
    await expect(homeMark).toHaveText('✦ Pro');
    const home = await badgeColours(page, '[data-orbit-window] .orbit-window-pro');
    expect(home.background).toBe(home.primary);
    expect(home.color).toBe(home.onPrimary);

    await page.click('.nav-item[data-page="personalSpace"]');
    const hudMark = page.locator('.personal-space-v2-hud-stats .personal-space-v2-pro');
    await expect(hudMark).toHaveText('✦ Pro', { timeout: 8000 });
    await expect(page.locator('.personal-space-v2 .orbit-window-pro')).toHaveCount(0);
    const hud = await badgeColours(page, '.personal-space-v2-hud-stats .personal-space-v2-pro');
    expect(hud.background).toBe(hud.primary);
    expect(hud.color).toBe(hud.onPrimary);
  });

  test('Orbit 夥伴 says the line on the day the account becomes Pro here', async ({ page }) => {
    await openHome(page, { seenBefore: { status: 'not-pro', changedOn: null } });
    await expect(page.locator('[data-orbit-window]').first())
      .toContainText('Pro 已開啟。這裡的一切照舊，你累積的每一步都算數。');
  });

  test('no known status (no projection yet): no mark, no line', async ({ page }) => {
    await openHome(page, { pro: false, seenBefore: { status: 'not-pro', changedOn: null } });
    await expect(page.locator('[data-orbit-window] .orbit-window-pro')).toHaveCount(0);
    await expect(page.locator('[data-orbit-window]').first()).not.toContainText('Pro 已開啟');
  });
});
