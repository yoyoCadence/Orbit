// @vitest-environment jsdom
/**
 * proGateCallSites.test.js — PRO-014C：逐一鎖住既有 Pro 入口。
 *
 * 完成條件要求「逐一列出既有 Pro 入口在 `server` source 下的驗證結果」，並明講
 * 不得只以「既有測試綠」代替。這個檔用兩層做到：
 *
 *   1. 靜態：把所有 Pro gate 的呼叫點集合鎖起來，並斷言除了明列的例外，沒有任何
 *      模組直接讀 profile 的 Pro 欄位來做判定。新增一個 gate 或繞過 isProUser()
 *      都會讓這裡紅，必須是刻意的動作。
 *   2. 行為：在 `server` source 下實際驅動 `storage.isProUser()`，確認整批入口
 *      的共同判定來源在有／無 projection 兩種情況下都正確。
 *
 * 為什麼不是 18 個各自的頁面測試：這些呼叫點全部把 `isProUser()` 的布林值往下
 * 傳給既有的渲染邏輯，各自再測一次等於重測渲染，而真正會出錯的是「有沒有走
 * isProUser()」與「isProUser() 在 server source 下對不對」這兩件事。
 *
 * 環境：jsdom（需要 localStorage）；supabase 全 mock。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => {
      const self = {
        select: () => self, eq: () => Promise.resolve({ error: null }),
        update: () => self, single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));
// PRO-014H: production reads Pro from the server. The legacy (profile-field)
// path stays for a rollback; tests of it force it with proSource.legacy.
const proSource = vi.hoisted(() => ({ legacy: false }));
vi.mock('../../pwa/js/platform/proEntitlement.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, isServerProEntitlementEnabled: () => !proSource.legacy && actual.isServerProEntitlementEnabled() };
});

import {
  enableServerProEntitlementLocally,
  resetProEntitlementStorageState,
  writeProEntitlementSnapshot,
} from '../../pwa/js/platform/proEntitlement.js';
import { storage } from '../../pwa/js/storage.js';

// jsdom 下 import.meta.url 不保證是 file: scheme，改用 vitest 的 root（repo 根目錄）。
const JS_ROOT = join(process.cwd(), 'pwa', 'js');

function listJsFiles(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listJsFiles(full, `${prefix}${name}/`);
    return name.endsWith('.js') ? [{ path: `${prefix}${name}`, source: readFileSync(full, 'utf8') }] : [];
  });
}

const files = listJsFiles(JS_ROOT);
// 只數真正的呼叫，不數註解裡的提及 —— proEntitlement.js 的檔頭就引用了這個
// 名字來說明它取代了什麼。
function countCalls(source, needle) {
  return source.split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .reduce((total, line) => total + (line.split(needle).length - 1), 0);
}

// ─── 1. 靜態：Pro gate 的呼叫點集合 ──────────────────────────────────────────

// 每一個既有 Pro 入口，依檔案分組。改動這張表必須是刻意的：新增 gate 要在這裡
// 登記，移除 gate 要在這裡刪掉。
const EXPECTED_GATES = {
  'dayCycle.js': 1,        // 使用保護卡（PRO-014P：換日的補卡、offer、SUB-16 改看 proRollover.js 的狀態）
  'proRollover.js': 1,     // 換日的 Pro 狀態（legacy 分支；server 分支讀 snapshot 的 pro／not-pro／unknown）
  'focusTimer.js': 3,      // 專注音效開關、播放、結算畫面的筆記欄位
  'pages/goals.js': 1,     // 歷史區間
  'pages/home.js': 1,      // 保護卡 pill
  'pages/profile.js': 2,   // 頁面主判定、保護卡 pill
  'pages/review.js': 2,    // 月份鎖定、月報呈現
  'pages/settings.js': 5,  // Pro 區塊、主題格、匯出區、匯出 CSV／PDF 兩個 handler
  'theme.js': 1,           // Pro 主題套用
};

describe('Pro gate 呼叫點', () => {
  it('所有 Pro 入口都經由 storage.isProUser()，集合與登記表一致', () => {
    const actual = {};
    for (const { path, source } of files) {
      const count = countCalls(source, 'storage.isProUser()');
      if (count > 0) actual[path] = count;
    }
    expect(actual).toEqual(EXPECTED_GATES);
    expect(Object.values(actual).reduce((a, b) => a + b, 0)).toBe(17);
  });

  // profile 的 Pro 欄位是 client 可寫的，所以「誰在讀它們」就是「誰能被偽造」。
  // 判定只能發生在 storage.js（legacy 分支）與 proEntitlement.js（projection）。
  it('除明列例外外，沒有模組直接讀 profile 的 Pro 欄位', () => {
    const ALLOWED = {
      'storage.js': 'legacy 分支的判定本體與欄位映射；PRO-014H 移除 legacy 後一併縮減',
      'platform/proEntitlement.js': '註解中引用欄位名以說明取代了什麼',
      'app.js': '讀 trialStartedAt 只為決定要不要啟動試用，不是 Pro 判定',
      'pages/settings.js': '_devApplyPro() 開發者面板；見下方單獨的測試',
    };

    const offenders = files
      .filter(({ path }) => !(path in ALLOWED))
      .filter(({ source }) => /\.(isPro|proExpiresAt|trialStartedAt)\b/.test(source)
        || /\b(is_pro|pro_expires_at|trial_started_at)\b/.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  // PRO-014L2：最後一處 client 端的 Pro 寫入（換日的 SUB-16）已移除，改由
  // server 的 grant_streak_unlock() 發放；寫回 legacy profile 只在 storage.js
  // 的 db.grantStreakUnlock()（值來自 server）。開發者面板的寫入點已隨 PRO-014Q
  // Q6 移除模擬而消失。
  it('除 storage.js 外沒有任何 client 端 Pro 寫入點', () => {
    const writers = files
      .filter(({ path }) => path !== 'storage.js')
      .filter(({ source }) => /\.(isPro|proExpiresAt|trialStartedAt)\s*=/.test(source))
      .map(({ path }) => path);
    expect(writers).toEqual([]);

    const dayCycle = files.find(f => f.path === 'dayCycle.js').source;
    expect(dayCycle).not.toMatch(/\.isPro\s*=|proExpiresAt\s*=|streakUnlockUsed\s*=/);
  });

  // PRO-014Q Q6：模擬已移除，舊版留下的 backup 只會被讀取與清除。重新加回任何寫入
  // （不論按鈕叫什麼）都會讓 upsertProfile／refreshProEntitlement 再次被擋住。
  it('沒有任何地方寫入 orbit_dev_backup', () => {
    const writers = files
      .filter(({ source }) => /setItem\(\s*(FLAG_DEV_BACKUP|['"]orbit_dev_backup['"])/.test(source))
      .map(({ path }) => path);
    expect(writers).toEqual([]);
  });
});

// ─── 2. 行為：整批入口的共同判定來源 ─────────────────────────────────────────

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  proSource.legacy = false;
  localStorage.clear();
  resetProEntitlementStorageState();
});

describe('server source 下的 gate 行為', () => {
  const seed = (extra = {}) =>
    localStorage.setItem('yoyo_user', JSON.stringify({ id: OWNER, ...extra }));

  it('沒有 projection → 所有 gate 關閉，即使 profile 欄位寫著 Pro', () => {
    seed({ isPro: true, proExpiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
    enableServerProEntitlementLocally();
    expect(storage.isProUser()).toBe(false);
  });

  it('有效的付費 projection → 所有 gate 開啟', () => {
    seed();
    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
      trialEndsAt: null,
      fetchedAtMs: Date.now(),
    });
    expect(storage.isProUser()).toBe(true);
  });

  it('有效的 trial projection → 所有 gate 開啟', () => {
    seed();
    enableServerProEntitlementLocally();
    writeProEntitlementSnapshot({
      ownerId: OWNER,
      isActive: true,
      expiresAt: null,
      trialEndsAt: new Date(Date.now() + 10 * DAY).toISOString(),
      fetchedAtMs: Date.now(),
    });
    expect(storage.isProUser()).toBe(true);
    expect(storage.isTrialUser()).toBe(true);
  });

  it('legacy source（回退路徑）維持原判定', () => {
    proSource.legacy = true;
    seed({ isPro: true, proExpiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
    expect(storage.isProUser()).toBe(true);
  });
});
