/**
 * liquid-glass-modal.test.js
 *
 * E2E 迴歸測試：Liquid Galss 主題下的 modal 捲動。
 *
 * 背景：主題的玻璃質感規則對 `.modal-box` 設了 `overflow: hidden`（讓光澤與
 * ::after 邊緣留在圓角內），但 `.modal-box` 本身是 `max-height` +
 * `overflow-y: auto` 的捲動容器。簡寫連帶關掉垂直捲動，使「新增任務」表單下半
 * 段的性質／價值／難度／抗拒感選單與儲存按鈕永遠停在畫面外。
 *
 * 注意：`overflow: hidden` 的元素用 script 設 `scrollTop` 仍然會動，只有使用者
 * 手勢會被擋下——這正是「拉不下去」的症狀。因此下面用滾輪事件而非 scrollTop。
 *
 * 這是純 CSS 迴歸，unit test 抓不到，因此在真實瀏覽器裡驗證捲動行為。
 *
 * 前置需求：
 *   npx playwright install chromium
 *   npm run test:e2e -- --workers=1
 */

import { test, expect } from '@playwright/test';
import { INSTANT_TASK, mockSupabase, seedStorage } from './support/seed.js';

/**
 * 把滑鼠移到 modal 中央並用滾輪捲到底。
 *
 * Chromium 的第一個 wheel 事件常只用來建立 scroll chain、不會真的捲動，因此
 * 重複滾到 scrollTop 不再變化為止。`overflow: hidden` 時使用者手勢完全捲不動，
 * scrollTop 會一直是 0——這正是要守住的迴歸點。
 */
async function wheelToBottom(page, box) {
  // modal 以 slideUp 進場；動畫途中它有一半在視窗外，滾輪會落在空白處。
  await box.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  const rect = await box.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(200);
  }
}

test.describe('Liquid Galss 主題：新增任務表單', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.addInitScript(() => {
      localStorage.setItem('yoyo_theme', JSON.stringify('liquid-galss'));
    });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-page="settings"]').click();
    await page.locator('#add-task-btn').click();
    await page.waitForSelector('.modal-box-tall', { timeout: 3000 });
  });

  test('主題確實套用為 liquid-galss', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-galss');
  });

  test('modal 仍是垂直捲動容器', async ({ page }) => {
    const metrics = await page.locator('.modal-box-tall').evaluate(el => ({
      overflowY:  window.getComputedStyle(el).overflowY,
      overflowX:  window.getComputedStyle(el).overflowX,
      scrollable: el.scrollHeight > el.clientHeight,
    }));

    expect(metrics.overflowY).not.toBe('hidden');
    expect(metrics.overflowX).toBe('hidden');   // 圓角內的光澤仍被裁切
    expect(metrics.scrollable).toBe(true);
  });

  test('滾輪可以捲到底部的抗拒感選單與儲存按鈕', async ({ page }) => {
    const box = page.locator('.modal-box-tall');
    await wheelToBottom(page, box);

    expect(await box.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#tm-resistance')).toBeInViewport();
    await expect(page.locator('#tm-save')).toBeInViewport();
  });

  test('捲到底後仍可操作下拉選單', async ({ page }) => {
    await wheelToBottom(page, page.locator('.modal-box-tall'));

    await page.locator('#tm-resistance').selectOption('1.4');
    await expect(page.locator('#tm-resistance')).toHaveValue('1.4');
  });
});
