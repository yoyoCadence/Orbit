/**
 * bug126-settings-image.test.js — BUG-126, in a real browser.
 *
 * Settings' background and task-icon pickers said nothing when the chosen
 * file could not be decoded (for example a HEIC photo in desktop Chrome): the
 * image never loaded, so the picker waited for ever. Now it says so, and a
 * photo that decodes is still used.
 */

import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, mockSupabase, seedStorage } from './support/seed.js';

test.use({ serviceWorkers: 'block' });

const BROKEN = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a jpeg') };

async function openSettings(page) {
  await mockSupabase(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, [INSTANT_TASK], [], GUEST_USER);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  await page.click('.nav-item[data-page="settings"]');
  await expect(page.locator('#bg-input')).toBeAttached();
}

test('a background or task icon that cannot be decoded is told, and a real photo is used (BUG-126)', async ({ page }) => {
  await openSettings(page);
  const toast = page.locator('.toast').last();

  await page.locator('#bg-input').setInputFiles(BROKEN);
  await expect(toast).toHaveText('圖片處理失敗，請換一張照片');
  expect(await page.evaluate(() => localStorage.getItem('yoyo_bgImage'))).toBeNull();
  // Cleared, so choosing the same file again is a change the page hears.
  expect(await page.locator('#bg-input').evaluate(input => input.files.length)).toBe(0);

  // A photo the browser can decode becomes the background.
  const jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, 40, 30);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }), 'base64');
  await page.locator('#bg-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('#bg-thumb img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  expect(await page.evaluate(() => localStorage.getItem('yoyo_bgImage'))).toMatch(/^data:image\/jpeg;base64,/);

  // The task icon picker, in the add-task window. The earlier toast is gone
  // first, so the one checked here is the icon picker's own.
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
  await page.click('#add-task-btn');
  await page.locator('#tm-icon-input').setInputFiles(BROKEN);
  await expect(toast).toHaveText('圖片處理失敗，請換一張照片');
  expect(await page.locator('#tm-icon-input').evaluate(input => input.files.length)).toBe(0);
  await expect(page.locator('#tm-icon-preview img')).toHaveCount(0);
  await expect(page.locator('#tm-emoji-section')).toBeVisible();
  // A photo that decodes becomes the icon.
  await page.locator('#tm-icon-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('#tm-icon-preview img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.locator('#tm-emoji-section')).toBeHidden();
});
