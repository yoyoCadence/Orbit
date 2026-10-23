# INFRA-107 變更說明：每次開啟頁面都用 service worker 快取中的 HTML

> 狀態：**已實作（v1.41.1），PR 合併前等使用者看過**。使用者 2026-10-23 決定（AskUserQuestion）：根目錄與 `index.html` 都回傳 service worker 快取中的 HTML（離線也一樣），新版本照現在的流程出現；比對時忽略查詢字串；不快取錯誤回應。屬 service worker 的快取行為（部署行為）。

## 1. 問題

- `pwa/sw.js` 以 `url.pathname.endsWith('.html') || url.pathname === '/'` 判斷 HTML，走 network-first。
- 網站在 GitHub Pages 的 `/Orbit/` 底下，根目錄 `https://yoyocadence.github.io/Orbit/` 的 pathname 是 `/Orbit/`，條件不成立，所以根目錄其實走圖片的 cache-first（INFRA-105 獨立 review 發現，原本就有）。
- 結果兩個入口的行為不同：

| 入口 | 誰會用 | 修改前 | 部署後第一次開啟 |
|---|---|---|---|
| `/Orbit/` | 從瀏覽器開啟、書籤 | cache-first（意外） | 舊 HTML＋舊程式（一致） |
| `/Orbit/index.html` | 安裝的 PWA（`manifest.json` 的 `start_url`） | network-first | HTML 可能是新的，程式（stale-while-revalidate）是舊的，新舊混用 |

- network-first 也有兩個小問題：
  - 錯誤回應（404 等）也寫進快取；
  - 以完整網址（含查詢字串）存入快取，例如登入的 redirect 加上 `?code=`，每次都多一筆，離線時帶查詢字串的網址也找不到快取。
- 原本的註解「Network-first: always fetch fresh HTML so the browser detects a new SW」不正確：瀏覽器在每次開啟頁面時都會檢查 `sw.js` 是否更新，與 service worker 回傳什麼 HTML 無關。

## 2. 做法（使用者決定的方向）

只改 `pwa/sw.js` 的 HTML 分支：

1. **判斷**：`e.request.mode === 'navigate'`（任何開啟頁面的請求，包括根目錄與帶查詢字串的網址）或 pathname 以 `.html` 結尾。不再依賴根目錄的路徑，所以 `/Orbit/` 與本機的 `/` 都成立。
2. **回傳這個版本快取中的 HTML**：`cache.match(e.request, { ignoreSearch: true })`，有就直接回傳，不問網路（離線也一樣）。SHELL 已包含 `./` 與 `./index.html`，install 時以 `cache: 'no-cache'` 重新驗證（INFRA-105），所以快取中的 HTML 一定與同一個快取中的程式同一版。
3. **快取中沒有的頁面**（例如開發用的 `make-icons.html`）：向網路取得；只有成功（`res.ok`）且沒有經過 redirect 的回應才存入，存在去掉查詢字串的網址下。離線且沒有快取時與現在相同（瀏覽器的離線錯誤頁）。
4. **新版本照現在的流程**：開啟頁面時瀏覽器檢查 `sw.js` → 新的 service worker 安裝（重新驗證 SHELL）→ `skipWaiting`／`clients.claim` → 「🆕 新版本已就緒」→ 重新整理後拿到新版本的 HTML 與程式。
5. **不改**：JS／CSS 的 stale-while-revalidate、圖片的 cache-first、install／activate、橫幅、`CACHE` 名稱與 `npm run bump`。

## 3. 風險與代價

| 項目 | 說明 | 處理 |
|---|---|---|
| 新 HTML 出現得比較晚 | 安裝的 PWA 以前在部署後第一次開啟就可能拿到新 HTML（但程式是舊的）；現在要等新的 service worker 接手、按「重新整理」 | 這正是決定的目的：HTML 與程式同一版；根目錄原本就是這樣 |
| 新的 service worker 沒裝成功 | 例如 `addAll()` 某個檔案失敗：舊版本繼續完整運作（HTML 與程式都是舊的），下次開啟時瀏覽器再試 | 與現在的根目錄相同；以前 `index.html` 會是新 HTML 配舊程式 |
| 快取被瀏覽器清掉 | `cache.match` 找不到就向網路取得（與第一次開啟相同） | 不影響正確性 |
| 導覽的 redirect | 導覽請求的 redirect mode 是 `manual`，經過 redirect 的回應不能拿來回應導覽 | 只存沒有經過 redirect 的成功回應；SHELL 的 `./`、`./index.html` 在 GitHub Pages 沒有 redirect |
| 第一次部署 | 帶著修正的 `sw.js` 接手前，最後一次仍是舊的行為 | 一次性，與 INFRA-105 相同 |
| 回復 | 只改 `sw.js`，沒有資料或格式變更 | revert 即可；下一次部署會換掉快取 |

「SHELL 模組不 import 既有 SHELL 模組的新 export」的規則**仍保留**：已開著的頁面在新的 service worker 接手後延遲載入模組時，仍可能拿到新版本的模組（stale-while-revalidate 讀的是新的快取）。

## 4. 驗證

- Unit（`tests/unit/serviceWorkerImageCache.test.js`）：
  - `/Orbit/?code=…` 的導覽以 `ignoreSearch` 從快取回傳，不問網路、不寫快取；
  - `/Orbit/index.html` 也從快取回傳；
  - 快取中沒有的頁面向網路取得，存在去掉查詢字串的網址下；
  - 錯誤回應、redirect（`opaqueredirect`）、經過 redirect 的回應都不存；
  - 離線且沒有快取時照樣失敗。
  - 修改前的 `sw.js` 上 5 項失敗。
- e2e（`tests/e2e/infra107-sw-html.test.js`）：
  - 測試伺服器（`tests/e2e/support/pagesServer.js`，由 INFRA-105 的 e2e 抽出）把 `pwa/` 放在 `/Orbit/` 底下，與 GitHub Pages 相同。HTML 以 `max-age=0` 回應，代表瀏覽器的那一份已超過 10 分鐘：否則修改前的 network-first 會從 HTTP cache 拿到舊的一份，看不出差別。
  - 伺服器上只改 `index.html`（沒有新的 service worker）時，`/Orbit/` 與 `/Orbit/index.html` 都還是這個版本的 HTML，而且完全不向伺服器要頁面。
  - 部署下一個版本（`sw.js` 的 `CACHE`、`version.js`）並 `registration.update()`：新的快取取代舊的、出現「新版本已就緒」，之後兩個入口都是新版本的 HTML 與 `APP_VERSION`，同樣不向伺服器要頁面。
  - `/Orbit/?from=e2e` 不向伺服器要頁面，快取中沒有帶查詢字串的網址；網路斷線時 `/Orbit/index.html?from=offline` 仍能開啟 app。
  - 修改前的 `sw.js` 上兩項都失敗（`index.html` 拿到伺服器上的新 HTML；帶查詢字串的根目錄向伺服器要頁面）。修改後連跑 3 次都通過。
- INFRA-105 的 e2e 改用共用的伺服器，行為不變並通過。

## 5. 範圍外

- 長期快取與檔名加上 hash（PS-211D，暫緩）。
- 新版本自動重新整理（仍由使用者按「重新整理」）。
- 開發用 `pwa/server.cjs` 的 `no-store`（只影響本機，service worker 照樣以快取回傳）。
