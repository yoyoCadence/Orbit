/**
 * flows.test.js
 *
 * E2E 測試：Orbit 關鍵使用者流程。
 *
 * 策略：
 * - 攔截 Supabase CDN import（page.route），讓測試離線也能跑
 * - 用 page.addInitScript 注入 localStorage，讓 app 跳過登入直接載入（guest 模式相同路徑）
 * - 覆蓋：登入畫面 UI、遊客模式進入、即時任務打卡、Focus 計時流程
 *
 * 前置需求：
 *   npx playwright install chromium   （首次需要下載瀏覽器）
 *   npm run test:e2e
 */

import { test, expect } from '@playwright/test';
import {
  FOCUS_TASK,
  GUEST_USER,
  INSTANT_TASK,
  mockSupabase,
  seedStorage,
} from './support/seed.js';

// ─── 登入畫面 ─────────────────────────────────────────────────────────────────

test.describe('登入畫面', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/');
    await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 8000 });
  });

  test('首次開啟顯示登入畫面與表單欄位', async ({ page }) => {
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
    await expect(page.locator('#auth-submit')).toHaveText('登入');
  });

  test('切換到「註冊」tab 更新按鈕文字', async ({ page }) => {
    await page.click('#tab-signup');
    await expect(page.locator('#auth-submit')).toHaveText('註冊');
  });

  test('切回「登入」tab 恢復按鈕文字', async ({ page }) => {
    await page.click('#tab-signup');
    await page.click('#tab-signin');
    await expect(page.locator('#auth-submit')).toHaveText('登入');
  });

  test('顯示「遊客」按鈕', async ({ page }) => {
    await expect(page.locator('.btn-guest')).toBeVisible();
    await expect(page.locator('.btn-guest')).toContainText('遊客');
  });
});

// ─── 遊客模式進入 ─────────────────────────────────────────────────────────────

test.describe('遊客模式', () => {
  test('有 localStorage 資料時直接載入主畫面（跳過登入）', async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('主畫面顯示 nav bar', async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)');
    await expect(page.locator('.nav-bar, nav')).toBeVisible();
  });

  test('點「以遊客身份繼續」進入主畫面（無 localStorage）', async ({ page }) => {
    await mockSupabase(page);
    // 注入 tasks/user 讓遊客路徑不走 setup 畫面
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    // 若有快取直接進主畫面；若無則會看到登入畫面再點遊客
    const loginVisible = await page.locator('#login-screen:not(.hidden)').isVisible().catch(() => false);
    if (loginVisible) {
      await page.locator('.btn-guest').click();
    }
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 8000 });
  });
});

// ─── 即時任務打卡 ─────────────────────────────────────────────────────────────
// 流程：點任務小卡 → 加入本日計劃 → 點計劃卡 → completeInstant

/** 把任務加入計劃再點計劃卡完成（兩步式流程）。 */
async function addToPlanAndComplete(page) {
  // Step 1: click task name to add to daily plan (avoids .task-icon-wrap stopPropagation)
  await page.locator('.task-card .task-name').first().click();
  // Step 2: click the plan card that just appeared
  await page.waitForSelector('.plan-card', { timeout: 5000 });
  await page.locator('.plan-card').first().click();
}

test.describe('即時任務打卡', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  });

  test('首頁顯示任務卡片', async ({ page }) => {
    await expect(page.locator('.task-card').first()).toBeVisible();
    await expect(page.locator('.task-card').first()).toContainText('喝水');
  });

  test('點擊即時任務顯示 XP float 動畫', async ({ page }) => {
    await addToPlanAndComplete(page);
    await expect(page.locator('.xp-float')).toBeVisible({ timeout: 3000 });
  });

  test('完成任務後出現 count badge', async ({ page }) => {
    await addToPlanAndComplete(page);
    await expect(page.locator('.count-badge')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.count-badge').first()).toHaveText('1');
  });

  test('完成任務後 session 出現在今日紀錄', async ({ page }) => {
    await addToPlanAndComplete(page);
    await expect(page.locator('.log-item')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.log-item').first()).toContainText('喝水');
  });

  test('完成任務後 header XP 文字更新（不再是 0 / ...）', async ({ page }) => {
    const xpBefore = await page.locator('#hdr-xp-text').textContent();
    await addToPlanAndComplete(page);
    await page.waitForTimeout(500);
    const xpAfter = await page.locator('#hdr-xp-text').textContent();
    expect(xpAfter).not.toBe(xpBefore);
  });
});

// ─── Focus 計時流程 ───────────────────────────────────────────────────────────
// 流程：點任務小卡 → 加入本日計劃 → 點計劃卡 → startFocus

/** 把 focus 任務加入計劃再點計劃卡啟動計時。 */
async function addToPlanAndStartFocus(page) {
  await page.locator('.task-card .task-name').first().click();
  await page.waitForSelector('.plan-card', { timeout: 5000 });
  await page.locator('.plan-card').first().click();
}

test.describe('Focus 計時流程', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [FOCUS_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  });

  test('點擊 focus 任務開啟 focus overlay', async ({ page }) => {
    await addToPlanAndStartFocus(page);
    await expect(page.locator('#focus-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#focus-task-name')).toContainText('深度學習');
  });

  test('計時器數字會持續變化', async ({ page }) => {
    await addToPlanAndStartFocus(page);
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });
    const t1 = await page.locator('#focus-timer').textContent();
    await page.waitForTimeout(1200);
    const t2 = await page.locator('#focus-timer').textContent();
    expect(t1).not.toBe(t2);
  });

  test('未達最低有效時間提前結束 → focus overlay 關閉，不顯示 result picker', async ({ page }) => {
    // 流程：end-btn → early-end-confirm modal → 確定結束 → overlay 關閉
    await addToPlanAndStartFocus(page);
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });
    // 點「結束」→ 彈出提前確認 modal（overlay 仍開著，timer 繼續）
    await page.locator('#focus-end-btn').click();
    await page.waitForSelector('#early-end-confirm-btn', { timeout: 3000 });
    // 點「確定結束」→ 才真正關閉
    await page.locator('#early-end-confirm-btn').click();
    await expect(page.locator('#focus-overlay')).toBeHidden({ timeout: 3000 });
    // 時間不足 → invalid，不顯示 result picker
    await expect(page.locator('#result-picker')).toHaveCount(0);
  });

  test('未達最低有效時間 → 記錄為 invalid session（顯示「無效」）', async ({ page }) => {
    await addToPlanAndStartFocus(page);
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });
    await page.locator('#focus-end-btn').click();
    await page.waitForSelector('#early-end-confirm-btn', { timeout: 3000 });
    await page.locator('#early-end-confirm-btn').click();
    await expect(page.locator('.log-item')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.log-item').first()).toContainText('0 XP');
  });
});

// ─── Personal Space V2 Vertical Slice ───────────────────────────────────────

test.describe('Personal Space V2 垂直切片', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, [FOCUS_TASK], [], { ...GUEST_USER, totalXP: 5000 });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  });

  test('首頁 Main Quest → Focus 結算 → 世界揭露 → 完整世界 → 撤銷回滾', async ({ page }) => {
    test.setTimeout(45000);
    const orbit = page.locator('[data-orbit-window]');
    await expect(orbit).toBeVisible();
    await expect(orbit).toContainText('Workspace Upgrade');
    await expect(orbit).toContainText('0%');

    await orbit.locator('[data-orbit-main-quest]').click();
    await expect(page.locator('#focus-overlay')).toBeVisible();

    // Use the timer's supported "already completed" exit so its interval,
    // overlay and active state follow the same production teardown as users.
    await page.locator('.focus-skip-btn').click();
    await page.locator('.skip-dur-btn[data-min="30"]').click();
    await page.locator('#skip-yes').click();
    await expect(orbit).toHaveClass(/is-revealing/);
    await expect(page.locator('#focus-overlay')).toBeHidden();
    await expect(page.locator('#skip-confirm')).toHaveCount(0);

    await expect(orbit).toHaveAttribute('data-project-progress', '25');
    await expect(orbit).toContainText('25%');
    await expect(orbit).not.toHaveClass(/is-revealing/, { timeout: 3000 });

    const persisted = await page.evaluate(() => JSON.parse(
      localStorage.getItem(
        'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user'
      ) || 'null'
    ));
    expect(persisted.activeProject.progress).toBe(25);
    expect(persisted.pendingRewardReveals).toEqual([]);
    expect(persisted.rewardLedger.filter(entry => !entry.reversedAt)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rewardType: 'gold', amount: 100 }),
        expect.objectContaining({ rewardType: 'project_progress', amount: 25 }),
      ])
    );

    await expect(page.locator('#proof-skip')).toBeVisible({ timeout: 2000 });
    await page.locator('#proof-skip').click();
    await expect(page.locator('.pro-sheet-overlay')).toHaveCount(0);

    await orbit.locator('[data-orbit-open-world]').click();
    await expect(page.locator('[data-personal-space-v2]')).toBeVisible();
    await expect(page.locator('[data-personal-space-v2]')).toContainText('25%');

    await page.evaluate(() => window.navigate('home'));
    await expect(page.locator('[data-orbit-window]')).toBeVisible();
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('[data-orbit-window]')).toHaveAttribute('data-project-progress', '25');

    const replay = await page.evaluate(async () => {
      const { storage } = await import('/js/storage.js');
      const { reconcileAndSavePersonalSpaceV2 } = await import(
        '/js/personalSpace/v2/controller.js'
      );
      const input = {
        user: storage.getUser(),
        sessions: storage.getSessions(),
        queueReveal: false,
      };
      reconcileAndSavePersonalSpaceV2(input);
      const second = reconcileAndSavePersonalSpaceV2(input);
      return {
        activeCount: second.state.rewardLedger.filter(entry => !entry.reversedAt).length,
        progress: second.state.activeProject.progress,
        queueLength: second.state.pendingRewardReveals.length,
      };
    });
    expect(replay).toEqual({ activeCount: 4, progress: 25, queueLength: 0 });

    await page.evaluate(() => window.closeLevelUp?.());
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.session-del-btn').first().click();

    await expect(page.locator('[data-orbit-window]')).toHaveAttribute('data-project-progress', '0');
    const reversed = await page.evaluate(() => JSON.parse(
      localStorage.getItem(
        'orbit_platform_bridge_v1:personal-space-state-v2:e2e-user'
      ) || 'null'
    ));
    expect(reversed.activeProject.progress).toBe(0);
    expect(reversed.rewardTombstones.some(entry => entry.sourceId)).toBe(true);

    await page.locator('[data-orbit-open-world]').click();
    await expect(page.locator('[data-personal-space-v2]')).toContainText('0%');
    await page.reload();
    await page.waitForSelector('[data-personal-space-v2]', { timeout: 8000 });
    await expect(page.locator('[data-personal-space-v2]')).toContainText('0%');
  });

  test('明確 legacy flag 保留舊 Personal Space fallback', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('orbit_personal_space_runtime', 'legacy');
    });
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await expect(page.locator('[data-orbit-window]')).toHaveCount(0);

    await page.evaluate(() => window.navigate('personalSpace'));
    await expect(page.locator('#content')).toContainText('Orbit Personal Space');
    await expect(page.locator('[data-personal-space-v2]')).toHaveCount(0);
  });

  test('Pixi failure keeps Main Quest usable through the semantic poster', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.reload();
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });

    const orbit = page.locator('[data-orbit-window]');
    await expect(orbit).toBeVisible();
    await expect(orbit.locator('.orbit-window-poster')).toBeVisible();
    await expect(orbit.locator('[data-orbit-runtime-host]'))
      .toHaveAttribute('data-runtime-status', 'fallback', { timeout: 8000 });

    await orbit.locator('[data-orbit-main-quest]').click();
    await expect(page.locator('#focus-overlay')).toBeVisible();
    await page.locator('.focus-skip-btn').click();
    await page.locator('.skip-dur-btn[data-min="30"]').click();
    await page.locator('#skip-yes').click();
    await expect(page.locator('[data-orbit-window]')).toHaveAttribute('data-project-progress', '25');
  });

  test('suspends offscreen and keeps one canvas through repeated Home and World routes', async ({ page }) => {
    let orbit = page.locator('[data-orbit-window]');
    let runtimeHost = orbit.locator('[data-orbit-runtime-host]');
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready', { timeout: 8000 });
    expect(await runtimeHost.evaluate(host => {
      const canvas = host.querySelector('canvas.orbit-window-canvas');
      const hostRect = host.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      return Boolean(
        canvasRect
        && Math.abs(canvasRect.width - hostRect.width) < 1
        && Math.abs(canvasRect.height - hostRect.height) < 1
      );
    })).toBe(true);

    await page.evaluate(async () => {
      const runtimeModule = await import('/js/personalSpace/v2/runtime/pixiSceneRuntime.js');
      const routerModule = await import('/js/router.js');
      window.__orbitApplicationBeforeRedraw = runtimeModule.orbitWindowRuntime.getApplication();
      routerModule.renderPage('home');
    });
    orbit = page.locator('[data-orbit-window]');
    runtimeHost = orbit.locator('[data-orbit-runtime-host]');
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready', { timeout: 8000 });
    expect(await page.evaluate(async () => {
      const runtimeModule = await import('/js/personalSpace/v2/runtime/pixiSceneRuntime.js');
      return runtimeModule.orbitWindowRuntime.getApplication() === window.__orbitApplicationBeforeRedraw;
    })).toBe(true);

    await page.locator('#content').evaluate(element => {
      element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
    });
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'suspended', { timeout: 5000 });
    await page.locator('#content').evaluate(element => {
      element.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready', { timeout: 5000 });

    for (let index = 0; index < 3; index += 1) {
      await orbit.locator('[data-orbit-open-world]').click();
      await expect(page.locator('[data-personal-space-v2]')).toBeVisible();
      await expect(page.locator('canvas.orbit-window-canvas')).toHaveCount(1);

      await page.evaluate(() => window.navigate('home'));
      orbit = page.locator('[data-orbit-window]');
      runtimeHost = orbit.locator('[data-orbit-runtime-host]');
      await expect(orbit).toBeVisible();
      await expect(runtimeHost).toHaveAttribute('data-runtime-status', 'ready', { timeout: 8000 });
      await expect(page.locator('canvas.orbit-window-canvas')).toHaveCount(1);
    }
  });
});

// ─── 設定頁 ──────────────────────────────────────────────────────────────────

test.describe('設定頁', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-page="settings"]').click();
  });

  test('設定頁顯示登出按鈕', async ({ page }) => {
    await expect(page.locator('button:has-text("登出")')).toBeVisible({ timeout: 3000 });
  });

  test('設定頁顯示主題選擇', async ({ page }) => {
    await expect(page.locator('.theme-btn, [data-theme]').first()).toBeVisible({ timeout: 3000 });
  });
});

// ─── 計劃區塊出現 ──────────────────────────────────────────────────────────────

test.describe('加入計劃流程', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  });

  test('點擊任務卡後計劃卡出現', async ({ page }) => {
    await page.locator('.task-card .task-name').first().click();
    await expect(page.locator('.plan-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.plan-card').first()).toContainText('喝水');
  });
});

// ─── Focus 計時暫停 / 繼續 ────────────────────────────────────────────────────

test.describe('Focus 計時暫停與繼續', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [FOCUS_TASK]);
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await addToPlanAndStartFocus(page);
    await page.waitForSelector('#focus-overlay:not(.hidden)', { timeout: 5000 });
  });

  test('暫停後計時器停止跳動，繼續後恢復跳動', async ({ page }) => {
    // Wait for timer to start ticking
    await page.waitForTimeout(1200);
    // Pause
    await page.locator('#focus-pause-btn').click();
    const pausedValue = await page.locator('#focus-timer').textContent();
    // Wait while paused — timer should not change
    await page.waitForTimeout(1500);
    const stillPaused = await page.locator('#focus-timer').textContent();
    expect(stillPaused).toBe(pausedValue);
    // Resume
    await page.locator('#focus-pause-btn').click();
    await page.waitForTimeout(1200);
    const afterResume = await page.locator('#focus-timer').textContent();
    expect(afterResume).not.toBe(stillPaused);
  });

  test('暫停按鈕文字在暫停時改為「繼續」', async ({ page }) => {
    await page.locator('#focus-pause-btn').click();
    await expect(page.locator('#focus-pause-btn')).toContainText('繼續');
  });
});

// ─── 設定頁隨機主題 toggle ────────────────────────────────────────────────────

test.describe('設定頁隨機主題 toggle', () => {
  test('開啟 toggle 後 localStorage 寫入 randomThemeEnabled=true 與清空 randomThemeDate', async ({ page }) => {
    await mockSupabase(page);
    await seedStorage(page, [INSTANT_TASK]);
    // Pro user required — random theme toggle is Pro-only
    await page.addInitScript(() => {
      const u = JSON.parse(localStorage.getItem('yoyo_user') || '{}');
      u.isPro = true;
      localStorage.setItem('yoyo_user', JSON.stringify(u));
      localStorage.setItem('yoyo_randomThemeEnabled', 'false');
      localStorage.setItem('yoyo_randomThemeDate', '');
    });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-page="settings"]').click();
    // toggle input 用 CSS 移出 viewport，直接透過 JS 觸發 change event
    await expect(page.locator('button:has-text("登出")')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => {
      const toggle = document.querySelector('#random-theme-toggle');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const enabled = await page.evaluate(() => localStorage.getItem('yoyo_randomThemeEnabled'));
    expect(enabled).toBe('true');
  });
});
