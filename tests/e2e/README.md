# E2E 測試說明

## 為什麼 E2E 測試目前無法在此環境執行

E2E 測試需要一個真實的 HTTP server（瀏覽器才能載入 ES Module 和 Service Worker），
並需要 Playwright 安裝 Chromium/Firefox 等瀏覽器 binary。

目前專案是純 Vanilla JS PWA，無 build tool，本地開發靠 `node pwa/server.js`。
在 CI 或開發機上可以加上 E2E 測試，但需要先安裝依賴。

---

## 建議涵蓋的關鍵使用者流程

以下是最高風險、最值得 E2E 保護的流程：

### 1. 新用戶 onboarding
- 開啟 App → 看到 login screen
- 輸入 email + 密碼 → 點「註冊」
- 看到 setup screen → 填名字 → 送出
- 看到 morning modal → 選狀態
- 進入 home page，header 顯示 Lv.1

### 2. 即時任務打卡
- 點擊 instant 任務卡
- header XP 增加
- 今日紀錄出現該筆 session
- 撤銷該 session → XP 回復

### 3. Focus 計時流程
- 點擊 focus 任務卡 → overlay 出現
- 計時開始，倒數顯示
- 點「結束專注」→ result picker 出現
- 選「完成」→ XP 計算正確

### 4. 登出 / 登入
- 設定頁 → 點「登出」
- 顯示 login screen
- 重新登入 → 資料從 Supabase 還原

---

## 未來安裝方式

```bash
npm install -D @playwright/test
npx playwright install chromium
```

新增 `playwright.config.js`：

```js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'node pwa/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:3000' },
});
```

新增 `package.json` script：
```json
"test:e2e": "playwright test"
```

---

## 替代驗證方式（目前）

在沒有 E2E 的情況下，以下流程以手動測試清單驗證：

| 流程 | 手動驗證頻率 |
|------|------------|
| 新用戶 onboarding | 每次改動 auth.js / app.js init 後 |
| 打卡 XP 計算 | 每次改動 engine.js 後（有單元測試保護）|
| Focus timer | 每次改動 startFocus / endFocus 後 |
| 登出/登入 | 每次改動 handleSignOut / loadAndStart 後 |
