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
  'dayCycle.js': 4,        // streak shield 月配額、消耗、server 解鎖請求、shield banner
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
    expect(Object.values(actual).reduce((a, b) => a + b, 0)).toBe(19);
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

  it('SUB-16 不再由 dayCycle 寫入 Pro；只保留開發者面板的刻意 override', () => {
    const dayCycle = files.find(f => f.path === 'dayCycle.js').source;
    const settings = files.find(f => f.path === 'pages/settings.js').source;

    expect(dayCycle).not.toMatch(/state\.user\.(isPro|proExpiresAt)\s*=/);
    expect(dayCycle).toContain('db.grantStreakUnlock(ownerId)');
    expect(settings).toContain('function _devApplyPro(status)');

    // 其餘檔案都不得寫入 Pro 欄位。
    const writers = files
      .filter(({ path }) => !['storage.js', 'pages/settings.js'].includes(path))
      .filter(({ source }) => /\.(isPro|proExpiresAt|trialStartedAt)\s*=/.test(source))
      .map(({ path }) => path);
    expect(writers).toEqual([]);
  });
});

// ─── 2. 行為：整批入口的共同判定來源 ─────────────────────────────────────────

const OWNER = 'owner-1';
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
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

  it('legacy source 維持原判定 —— production 行為不變', () => {
    seed({ isPro: true, proExpiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
    expect(storage.isProUser()).toBe(true);
  });
});
