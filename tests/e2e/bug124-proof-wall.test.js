/**
 * bug124-proof-wall.test.js — BUG-124 (a), on the real home page.
 *
 * An earlier session today already has a proof photo shown in Personal Space
 * (✓). A task is completed, a photo added in the proof sheet, and that new
 * photo chosen for Personal Space: the earlier row's ✓ is cleared at once,
 * not only after the page redraws, because the home list takes the new
 * thumbnail in like its own rows.
 */

import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { GUEST_USER, INSTANT_TASK, mockSupabase, seedStorage, TODAY } from './support/seed.js';

const EARLIER = 'dddddddd-dddd-4ddd-8ddd-000000000001';
const PHOTO = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;

test.use({ serviceWorkers: 'block' });

test('a photo added from the proof sheet takes over the Personal Space ✓ from the earlier row (BUG-124)', async ({ page }) => {
  await mockSupabase(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStorage(page, [INSTANT_TASK], [{
    id: EARLIER, taskId: INSTANT_TASK.id, taskName: '早上的任務', date: TODAY,
    completedAt: new Date(Date.now() - 60 * 60_000).toISOString(), result: 'instant',
    impactType: 'task', taskNature: 'maintenance', category: 'instant', value: 'B', finalXP: 5,
  }], GUEST_USER);
  await page.addInitScript(([id, photo, owner]) => {
    if (localStorage.getItem(`orbit_proof_${id}`)) return;
    localStorage.setItem(`orbit_proof_${id}`, photo);
    localStorage.setItem(`orbit_achievement_photo_${encodeURIComponent(owner)}`, id);
  }, [EARLIER, PHOTO, GUEST_USER.id]);

  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  const earlier = page.locator(`.session-proof-wall-btn[data-proof-wall-session-id="${EARLIER}"]`);
  await expect(earlier).toHaveAttribute('aria-pressed', 'true');

  // A real JPEG made by the browser, so the app's own compression can decode it.
  const jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#cc6633'; ctx.fillRect(0, 0, 40, 30);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }), 'base64');

  await page.locator('.task-card .task-name').first().click();
  await page.waitForSelector('.plan-card', { timeout: 5000 });
  await page.locator('.plan-card').first().click();
  await expect(page.locator('#proof-file-input')).toBeAttached({ timeout: 3000 });
  await page.locator('#proof-file-input').setInputFiles({ name: 'proof.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('#proof-confirm')).toBeEnabled();
  await page.locator('#proof-confirm').click();
  await expect(page.locator('.pro-sheet')).toHaveCount(0);

  // The new row's switch, then the earlier row's.
  const added = page.locator(`.session-proof-wall-btn:not([data-proof-wall-session-id="${EARLIER}"])`);
  await expect(added).toHaveCount(1);
  await added.click();
  await expect(added).toHaveAttribute('aria-pressed', 'true');
  await expect(earlier).toHaveAttribute('aria-pressed', 'false');
  await expect(earlier).toHaveText('🖼');
  await expect(page.locator('#toast, .toast').last()).toContainText('已展示到個人空間');
});
