# INFRA-107 變更說明：每次開啟頁面都用 service worker 快取中同一版的 HTML 與程式

> 狀態：**已實作（v1.41.1）**。使用者的決定（AskUserQuestion）：
> - 2026-10-23：根目錄與 `index.html` 都回傳 service worker 快取中的 HTML（離線也一樣），新版本照現在的流程出現；比對時忽略查詢字串；不快取錯誤回應。
> - 2026-10-24（獨立 review 的 P2 之後）：JS／CSS 也固定同一版，背景不再更新快取中已有的檔案（§2 第 5 點）。
>
> 屬 service worker 的快取行為（部署行為）。

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

只改 `pwa/sw.js` 的 HTML 與 JS／CSS 分支：

1. **判斷**：`e.request.mode === 'navigate'`（任何開啟頁面的請求，包括根目錄與帶查詢字串的網址）或 pathname 以 `.html` 結尾。不再依賴根目錄的路徑，所以 `/Orbit/` 與本機的 `/` 都成立。
2. **回傳這個版本快取中的 HTML**：`cache.match(e.request, { ignoreSearch: true })`，有就直接回傳，不問網路（離線也一樣）。SHELL 已包含 `./` 與 `./index.html`，install 時以 `cache: 'no-cache'` 重新驗證（INFRA-105），所以快取中的 HTML 與同一個快取中的程式同一版（加上第 5 點，之後也不會被背景更新拆開）。
3. **快取中沒有的頁面**（例如開發用的 `make-icons.html`）：向網路取得；只有成功（`res.ok`）且沒有經過 redirect 的回應才存入，存在去掉查詢字串的網址下。離線且沒有快取時與現在相同（瀏覽器的離線錯誤頁）。
4. **新版本照現在的流程**：開啟頁面時瀏覽器檢查 `sw.js` → 新的 service worker 安裝（重新驗證 SHELL）→ `skipWaiting`／`clients.claim` → 「🆕 新版本已就緒」→ 重新整理後拿到新版本的 HTML 與程式。
5. **JS／CSS 也固定同一版**（2026-10-24 決定）：原本的 stale-while-revalidate 在背景以伺服器上的檔案更新**目前版本**的快取。HTML 固定之後，下一版的 service worker 沒裝成功（手機網路斷一下、iOS 中途關掉 app，或任何一個 SHELL 檔案失敗）時，下一次開啟會是「舊 HTML＋新程式」（獨立 review 以 Playwright 重現）。改為：
   - 快取中有的 JS／CSS 直接回傳，**不在背景更新**；
   - 快取中沒有的才向伺服器取得（`cache: 'no-cache'`，不用瀏覽器 HTTP cache 中的舊檔，INFRA-105），只存成功的回應。
   - 所有 JS／CSS（109 個）都在 SHELL（`serviceWorkerShell.test.js` 檢查 `pwa/` 裡每個 `.js`／`.css` 與 app 能 import 的每個模組），install 時已重新驗證，所以新程式只隨新的 service worker 出現。
6. **不改**：圖片的 cache-first、install／activate、橫幅、`CACHE` 名稱與 `npm run bump`。

## 3. 風險與代價

| 項目 | 說明 | 處理 |
|---|---|---|
| 新 HTML 出現得比較晚 | 安裝的 PWA 以前在部署後第一次開啟就可能拿到新 HTML（但程式是舊的）；現在要等新的 service worker 接手、按「重新整理」 | 這正是決定的目的：HTML 與程式同一版；根目錄原本就是這樣 |
| 新的 service worker 沒裝成功 | 例如 `addAll()` 某個檔案失敗：舊版本繼續完整運作（HTML 與程式都是舊的，第 5 點），下次開啟時瀏覽器再試 | 以前 `index.html` 會是新 HTML 配舊程式，背景更新後也可能是舊 HTML 配新程式 |
| 部署時忘了 bump | 改了 `pwa/` 卻沒有改 `sw.js` 的 `CACHE`：已安裝的使用者**拿不到**新的 HTML 與程式，直到下一次 bump（以前 JS／CSS 會在背景更新） | AGENTS.md §14：每個改到部署檔案的 PR 都 `npm run bump`；`sw.js` 開頭的註解改寫 |
| 安裝時存到錯的檔案 | 例如部署後 CDN 的某個節點仍回舊檔：那一版的快取會一直是那個檔案，直到下一次 bump（以前 JS／CSS 的背景更新會在下一次開啟時修正；圖片原本就是這樣） | install 以 `cache: 'no-cache'` 重新驗證（INFRA-105）；發現時再 bump 一次 |
| 本機開發 | `node pwa/server.cjs` 下 service worker 同樣回傳快取，改了 `index.html` 或 JS 重新整理看不到，要等 `sw.js` 改變 | 用 Shift＋重新整理（略過 service worker），或 DevTools → Application → Service workers 的「Update on reload」／「Bypass for network」；寫進 README 的本機開發 |
| 快取被瀏覽器清掉 | `cache.match` 找不到就向網路取得（與第一次開啟相同） | 不影響正確性 |
| 導覽的 redirect | 導覽請求的 redirect mode 是 `manual`，經過 redirect 的回應不能拿來回應導覽 | 只存沒有經過 redirect 的成功回應；SHELL 的 `./`、`./index.html` 在 GitHub Pages 沒有 redirect |
| 第一次部署 | 帶著修正的 `sw.js` 接手前，最後一次仍是舊的行為 | 一次性，與 INFRA-105 相同 |
| 回復 | 只改 `sw.js`，沒有資料或格式變更 | revert 即可；下一次部署會換掉快取 |

「SHELL 模組不 import 既有 SHELL 模組的新 export」的規則**仍保留**：已開著的頁面在新的 service worker 接手（`clients.claim`）後延遲載入模組時，讀的是新的快取，仍可能拿到新版本的模組。

## 4. 驗證

- Unit（`tests/unit/serviceWorkerImageCache.test.js`）：
  - `/Orbit/?code=…` 的導覽以 `ignoreSearch` 從快取回傳，不問網路、不寫快取；
  - `/Orbit/index.html` 也從快取回傳；
  - 快取中沒有的頁面向網路取得，存在去掉查詢字串的網址下；
  - 錯誤回應、redirect（`opaqueredirect`）、經過 redirect 的回應都不存；
  - 離線且沒有快取時照樣失敗。
  - 修改前的 `sw.js` 上 5 項失敗。
  - JS／CSS：快取中有的直接回傳、不在背景向網路要；沒有的以 `cache: 'no-cache'` 取得並存入；錯誤回應不存。
- e2e（`tests/e2e/infra107-sw-html.test.js`）：
  - 測試伺服器（`tests/e2e/support/pagesServer.js`，由 INFRA-105 的 e2e 抽出）把 `pwa/` 放在 `/Orbit/` 底下，與 GitHub Pages 相同。HTML 以 `max-age=0` 回應，代表瀏覽器的那一份已超過 10 分鐘：否則修改前的 network-first 會從 HTTP cache 拿到舊的一份，看不出差別。
  - 伺服器上只改 `index.html`（沒有新的 service worker）時，`/Orbit/` 與 `/Orbit/index.html` 都還是這個版本的 HTML，而且完全不向伺服器要頁面。
  - 部署下一個版本（`sw.js` 的 `CACHE`、`index.html`、`version.js`）後只開啟一次頁面：瀏覽器自己找到新的 service worker，新的快取取代舊的、出現「新版本已就緒」；按橫幅的「重新整理」後是新版本的 HTML，兩個入口都是新的 HTML 與 `APP_VERSION`，同樣不向伺服器要頁面。
  - 下一個版本的 service worker 裝不起來（一個 SHELL 檔案回 500）：在新分頁連開三次，每次都是這個版本的 HTML 與 `APP_VERSION`，快取中的 `version.js` 也沒有被換成下一版，沒有出現橫幅。只固定 HTML 的版本（836e272）上這項失敗（快取中的 `version.js` 變成下一版）。
  - `/Orbit/?from=e2e` 不向伺服器要頁面，快取中沒有帶查詢字串的網址；網路斷線時 `/Orbit/index.html?from=offline` 仍能開啟 app。
  - 修改前的 `sw.js` 上前兩項都失敗（`index.html` 拿到伺服器上的新 HTML；帶查詢字串的根目錄向伺服器要頁面）。修改後連跑 3 次都通過。
- INFRA-105 的 e2e 改用共用的伺服器（`base`、每個路徑的 `Cache-Control`、`failing`、`urls`、`offline`）。第一項不變並通過；第二項（背景更新拿到伺服器上的版本）改為：快取中有的模組重新整理與 fetch 都是這個版本的、不向伺服器要；從快取刪掉後才向伺服器取得（不是 HTTP cache 中仍有效的舊檔）並存入。只固定 HTML 的版本上新的第二項失敗。

## 5. 範圍外

- 長期快取與檔名加上 hash（PS-211D，暫緩）。
- 新版本自動重新整理（仍由使用者按「重新整理」）。
- 開發用 `pwa/server.cjs` 的 `no-store`（只影響本機，service worker 照樣以快取回傳；本機開發的做法見 §3 與 README）。
- 檢查「改了 `pwa/` 就要 bump」的 CI（改 CI 設定，需另外核准）。
