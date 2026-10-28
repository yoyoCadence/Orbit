# E2E 測試說明

以 Playwright（Chromium）在真的瀏覽器裡跑 app。CI 的 `e2e` job 每個 PR 都跑；失敗時上傳 `test-results/`（截圖與 `error-context.md`，保留 7 天，INFRA-102）。

## 執行

```bash
npm run test:e2e            # 全部（playwright.config.js 會啟動 node pwa/server.cjs）
npm run test:e2e:headed     # 開著瀏覽器看
npx playwright test tests/e2e/ps251b-window-view.test.js   # 單一檔案
npx playwright test --repeat-each=3 <file>                 # 檢查是否穩定
```

- 第一次要 `npx playwright install chromium`。已預先安裝瀏覽器的環境（例如 Claude Code 的雲端容器）不要再下載，改在自己的設定檔指定 `launchOptions.executablePath`。
- CI 上 `retries: 1`。重跑才通過的測試仍然要找出原因，不要當成正常。

## 檔案

| 檔案 | 涵蓋 |
|---|---|
| `flows.test.js` | 登入畫面、遊客模式、即時任務打卡、Focus 計時（提前結束、overlay 期間暫停場景）、Personal Space V2 垂直切片（Main Quest → 結算 → 揭露 → 完整世界 → 撤銷、legacy fallback、Pixi 失敗時的 poster、反覆切換路由） |
| `day-cycle-boot.test.js` | 跨日開啟：日報 → 晨間狀態 → app（BUG-105） |
| `liquid-glass-modal.test.js` | Liquid Glass 主題下 modal 的滾輪捲動 |
| `companion-dialogue.test.js` | 夥伴卡片的台詞在各寬度與 200% 縮放下最多兩行（AI-204B），階段名稱一行（AI-202B1） |
| `ai202b2-stage-reveal.test.js` | 第 12 個 Main Quest 日的 Major reveal、標題與台詞，重新載入不重播（AI-202B2） |
| `ps243-acceptance.test.js` | 可重現的瀏覽器驗收：版面、溢出、觸控目標、鍵盤順序、canvas、縮放（PS-243） |
| `ps249a-overlay.test.js` | Orbit Window 被 overlay 蓋住時 reveal 暫停、之後從頭重播（PS-249A） |
| `ps250b-appearance.test.js` | Edit Mode 的畫風、角色、房間風格、縮圖、裝飾，與下載失敗時退回預設（PS-250B–G） |
| `ps251b-window-view.test.js` | 晨間與傍晚的窗外疊層與圖層順序；開著 app 跨過時段邊界時準時重新 render，保留焦點與詳細資訊面板（PS-251B） |
| `sw-precache.test.js` | service worker 預先快取 poster 的所有圖與 Pixi，四個時段的離線 poster 都完整（PS-211A、PS-250E1、PS-251B） |
| `infra105-sw-update.test.js` | 改版時新的 service worker 重新驗證 SHELL，不存到 HTTP cache 的舊檔；快取中的模組不在背景更新（INFRA-105、INFRA-107） |
| `infra107-sw-html.test.js` | 每次開啟頁面都用快取中同一版的 HTML 與程式，包括帶查詢字串、離線、下一版裝不起來時（INFRA-107） |

`support/`：

- `seed.js`：`seedStorage()`（以 `addInitScript` 寫入 localStorage，略過登入）、`mockSupabase()`（以 routing 換掉 Supabase）、`SUPABASE_STUB`、`GUEST_USER`、`FOCUS_TASK`、`INSTANT_TASK`、`TODAY`。
- `pagesServer.js`：模擬 GitHub Pages 的靜態伺服器（`max-age=600`、ETag、304）。可設定放在哪個路徑底下（`base: '/Orbit/'`）、每個路徑的 `Cache-Control`、換掉檔案內容（下一版）、讓某些路徑回 500、模擬斷線，並記錄每個請求。

## 寫測試時要注意

### Service worker 與快取

- `page.route` 看不到 service worker 自己發出的請求。要模擬「下載失敗」時，加上 `test.use({ serviceWorkers: 'block' })`，或改用 `context.route`（看得到 service worker 的請求）。`context.setOffline(true)` 擋不到 service worker 的請求（PS-211A）。
- Playwright 的 routing 會關掉 HTTP cache，所以測快取行為（INFRA-105、INFRA-107）不能用 routing，要用 `support/pagesServer.js`。`pwa/server.cjs` 回應 `no-store`，也看不出 HTTP cache 的效果。
- 要看出 network-first 與快取的差別，讓 HTML 以 `max-age=0` 回應，代表瀏覽器的那一份已超過 10 分鐘；否則 network-first 會從 HTTP cache 拿到同一份舊檔。
- 開 app 時加上 `page.emulateMedia({ reducedMotion: 'reduce' })`：headless 的軟體 WebGL 持續繪製時，Chromium 會一直延後 service worker 的更新檢查。
- 檢查「現在跑的是哪一版的程式」時，**開新分頁**並直接讀快取的內容：同一個分頁重新開啟可能沿用已經執行過的模組，service worker 根本收不到請求。

### 時間

- 固定在某個時段：`page.clock.setFixedTime(...)`（計時器照常跑）。
- 跨過時段邊界：`page.clock.install({ time })`，再用 `page.clock.fastForward(...)` 前進。`setSystemTime()` 只改時間，不會讓已排好的計時器提前。
- `TODAY` 由 Node 以本機時區計算。要在其他時段跑整套測試（例如確認晨間、傍晚的疊層不影響既有的 locator），把 `TZ` 與 Playwright 的 `timezoneId` 設成同一個時區：

  ```js
  // pw.morning.config.mjs
  import config from './playwright.config.js';
  export default { ...config, use: { ...config.use, timezoneId: 'America/Los_Angeles' } };
  ```

  ```bash
  TZ=America/Los_Angeles npx playwright test -c pw.morning.config.mjs
  ```

### 其他

- 以 `.orbit-window-background` 找房間背景；窗外疊層是 `.orbit-window-exterior`，不要讓新的圖用同一個 class。
- poster 的圖片都是 `pointer-events: none`，`elementsFromPoint()` 看不到。檢查圖層順序請用 DOM 順序與計算後的 `z-index`。
- 減少動態效果時每個元素仍有極短的 transition。讀 `visibility` 之類的計算值前要先關掉 transition（PS-211B）。
- 要檢查「重播」這類一閃而過的狀態，在頁面內以 `MutationObserver` 記錄當下的狀態，不要從測試輪詢（PS-249A）。
