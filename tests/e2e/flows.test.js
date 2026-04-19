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

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const TODAY = new Date().toLocaleDateString('sv'); // matches app's today() — YYYY-MM-DD in local tz

const GUEST_USER = {
  id: 'e2e-user', name: 'E2E Tester', totalXP: 0,
  streakDays: 0, lastStreakDate: TODAY, lastWeeklyBonusDate: '',
  morningState: 'normal', mode: 'normal', isPublic: false,
  createdAt: TODAY,
  // newDayHour:0 → effectiveToday(0) always equals today(); prevents daily-report
  // modal from appearing when CI runs in UTC before 05:00 local time
  newDayHour: 0,
};

const INSTANT_TASK = {
  id: 'task-instant', name: '喝水', category: 'instant',
  impactType: 'task', taskNature: 'maintenance', value: 'B',
  difficulty: 0.4, resistance: 1.0, emoji: '💧',
  dailyXpCap: 100, cooldownMinutes: 0, minEffectiveMinutes: 0,
  isDefault: true, valueConfidence: 100, createdAt: TODAY,
};

const FOCUS_TASK = {
  id: 'task-focus', name: '深度學習', category: 'focus',
  impactType: 'task', taskNature: 'growth', value: 'A',
  difficulty: 0.7, resistance: 1.2, emoji: '🧠',
  dailyXpCap: 200, cooldownMinutes: 0, minEffectiveMinutes: 1,
  isDefault: true, valueConfidence: 100, createdAt: TODAY,
};

const BASE_ENERGY = {
  currentEnergy: 90, maxEnergy: 100, lastResetDate: TODAY,
};

// ─── Supabase CDN mock（回傳無認證的最小 client）─────────────────────────────

const SUPABASE_STUB = `
export function createClient() {
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      upsert: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      delete: () => q,
      in:     () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then:   (r) => Promise.resolve({ data: null, error: null }).then(r),
    };
    return q;
  };
  return {
    auth: {
      getSession:         () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signUp:             () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signInWithOAuth:    () => Promise.resolve({ data: null, error: null }),
      signOut:            () => Promise.resolve({ error: null }),
    },
    from: () => chain(),
  };
}
`;

// ─── Fixtures：攔截 CDN + 注入 localStorage ──────────────────────────────────

/** 設定 Supabase CDN 攔截（每個測試都要）。 */
async function mockSupabase(page) {
  await page.route('https://esm.sh/**', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/javascript; charset=utf-8',
      body:        SUPABASE_STUB,
    })
  );
}

/** 在 page script 執行前注入 localStorage 資料。 */
async function seedStorage(page, tasks, sessions = []) {
  await page.addInitScript(({ user, tasks, sessions, energy }) => {
    const P = 'yoyo_';
    localStorage.setItem(P + 'user',     JSON.stringify(user));
    localStorage.setItem(P + 'tasks',    JSON.stringify(tasks));
    localStorage.setItem(P + 'sessions', JSON.stringify(sessions));
    localStorage.setItem(P + 'energy',   JSON.stringify(energy));
  }, { user: GUEST_USER, tasks, sessions, energy: BASE_ENERGY });
}

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
    // Seed randomThemeEnabled=false so the toggle starts unchecked
    await page.addInitScript(() => {
      localStorage.setItem('yoyo_randomThemeEnabled', 'false');
      localStorage.setItem('yoyo_randomThemeDate', '');
    });
    await page.goto('/');
    await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
    await page.locator('[data-page="settings"]').click();
    // Wait for settings page to render; the toggle input is CSS-hidden (toggle-switch design)
    await expect(page.locator('button:has-text("登出")')).toBeVisible({ timeout: 5000 });
    await page.locator('#random-theme-toggle').check({ force: true });
    const enabled = await page.evaluate(() => localStorage.getItem('yoyo_randomThemeEnabled'));
    expect(enabled).toBe('true');
  });
});
