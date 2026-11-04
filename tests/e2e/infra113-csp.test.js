/**
 * infra113-csp.test.js — INFRA-113
 *
 * index.html sets a Content-Security-Policy that runs no inline code: buttons
 * name an action (`data-action`, js/domActions.js) instead of `onclick="…"`.
 * Walks the screens that used inline handlers, plus the Pixi scene, and fails
 * on any policy violation; then checks that injected markup cannot run code.
 */

import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

// Every violation the page reports, kept in the page so a reload can't lose it.
async function recordViolations(page) {
  await page.addInitScript(() => {
    const list = JSON.parse(sessionStorage.getItem('csp-violations') || '[]');
    document.addEventListener('securitypolicyviolation', event => {
      list.push({ directive: event.effectiveDirective, blocked: event.blockedURI, sample: event.sample });
      sessionStorage.setItem('csp-violations', JSON.stringify(list));
    });
  });
  const console = [];
  page.on('console', message => {
    if (/Content Security Policy/i.test(message.text())) console.push(message.text());
  });
  return async () => ({
    events: await page.evaluate(() => JSON.parse(sessionStorage.getItem('csp-violations') || '[]')),
    console,
  });
}

test.describe('INFRA-113 Content-Security-Policy', () => {
  test('the screens and the scene run without a policy violation', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockSupabase(page);
    const violations = await recordViolations(page);

    // Auth screen: tab switch and password toggle.
    await page.goto('/');
    await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 8000 });
    await page.click('#tab-signup');
    await expect(page.locator('#auth-submit')).toHaveText('註冊');
    await page.click('#auth-password-toggle');
    await expect(page.locator('#auth-password')).toHaveAttribute('type', 'text');

    // Home with the Pixi scene (no eval since INFRA-114: Pixi's add-on). The
    // signed-out load stored empty defaults, which seeding does not replace.
    await page.evaluate(() => localStorage.clear());
    await seedStorage(page, [FOCUS_TASK], [], GUEST_USER);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('[data-orbit-runtime-host]')).toHaveAttribute('data-runtime-status', 'ready', { timeout: 10_000 });

    // Bottom navigation and the review page's toggles and month navigation.
    await page.click('.nav-item[data-page="review"]');
    await page.click('.review-toggle-btn[data-action-arg="month"]');
    const month = page.locator('.month-nav-label');
    const thisMonth = await month.textContent();
    await page.click('.month-nav-btn[data-action="reviewPrevMonth"]');
    await expect(month).not.toHaveText(thisMonth);
    await page.click('.review-toggle-btn[data-action-arg="week"]');
    await expect(page.locator('.review-toggle-btn[data-action-arg="week"]')).toHaveClass(/active/);

    // Profile (shield info) and the header avatar.
    await page.click('.nav-item[data-page="profile"]');
    await page.click('.stat-pill-shield-info');
    await page.click('.nav-item[data-page="settings"]');
    await page.click('.hdr-avatar-wrap');
    await expect(page.locator('.nav-item[data-page="profile"]')).toHaveClass(/active/);

    // Focus timer: pause, resume and minimise from the static overlay buttons.
    await page.click('.nav-item[data-page="home"]');
    await page.locator('.task-card .task-name').first().click();
    await page.locator('.plan-card').first().click();
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });
    await page.click('#focus-pause-btn');
    await expect(page.locator('#focus-pause-btn')).toContainText('繼續');
    await page.click('#focus-pause-btn');
    await page.click('.focus-minimize-btn');
    await expect(page.locator('#focus-pip')).toBeVisible();
    await page.click('.focus-pip-expand');
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });

    expect(await violations()).toEqual({ events: [], console: [] });
  });

  test('injected markup cannot run code or call an unlisted action', async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [], [], GUEST_USER);
    const violations = await recordViolations(page);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    await page.evaluate(() => {
      window.__ran = [];
      window.notAnAction = () => window.__ran.push('notAnAction');
      const host = document.createElement('div');
      host.innerHTML = `
        <img id="xss-img" src="data:," onerror="window.__ran.push('onerror')">
        <button id="xss-button" onclick="window.__ran.push('onclick')">x</button>
        <button id="unlisted" data-action="notAnAction">y</button>`;
      document.body.append(host);
    });
    await page.click('#xss-button', { force: true });
    await page.click('#unlisted', { force: true });
    await expect.poll(async () => (await violations()).events.length).toBeGreaterThan(0);

    expect(await page.evaluate(() => window.__ran)).toEqual([]);
    const { events } = await violations();
    expect(events.every(event => event.directive === 'script-src-attr')).toBe(true);
  });
});
