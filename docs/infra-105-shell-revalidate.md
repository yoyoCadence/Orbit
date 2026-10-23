# INFRA-105 變更說明：service worker 安裝時重新驗證 SHELL 的程式碼

> 狀態：**已實作（v1.40.1），PR 合併前等使用者看過**（2026-10-23 使用者核准方向：先寫變更說明，PR 合併前讓使用者看過）。屬 service worker 的快取行為（部署行為）。結果見 §7。

## 1. 問題

- `pwa/sw.js` 的 install 用 `cache.addAll()` 預先快取 SHELL（約 110 個 JS／CSS／HTML 與 44 個圖片）。
- 只有圖片與 `vendor/pixi.js` 以 `new Request(path, { cache: 'no-cache' })` 重新驗證（`REVALIDATE_ON_INSTALL`，PS-211A）。JS、CSS、HTML 以預設的 cache mode 取得，會用到**瀏覽器的 HTTP cache**。
- GitHub Pages 回應 `Cache-Control: max-age=600`。上一次載入後 10 分鐘內部署的新版本，新的 service worker 安裝時，會把 HTTP cache 中**舊版**的 `version.js`、`assetManifest.js` 等存進新的快取（`orbit-v<新版>`）。
- 影響：
  - 「🆕 新版本已就緒」後重新整理，最多約 10 分鐘內仍執行舊程式，或新舊模組混用。
  - 新模組 import 舊模組沒有的 export 時，整個 module graph 無法 link（所以目前有「SHELL 模組不 import 既有 SHELL 模組的新 export」的規則）。
  - 改版若改了素材檔名，舊的 `assetManifest.js` 會要求已不在 SHELL 中的舊檔名：線上 404、離線缺圖。
- 同樣的問題也在執行時：JS／CSS 的 stale-while-revalidate（`fetch` handler）在背景以 `fetch(e.request)` 更新快取，也會讀到仍然有效的 HTTP cache。

## 2. 做法

只改 `pwa/sw.js`：

1. **install**：SHELL 的**每一項**都以 `new Request(path, { cache: 'no-cache' })` 取得。
   - `no-cache` 不是不用快取，而是**一定先向伺服器確認**：伺服器認得 HTTP cache 裡那一份（`ETag` 相同）時回 `304`，瀏覽器用 HTTP cache 的內容（不重新下載）；不同時回 `200` 與新內容。
   - 取代 `REVALIDATE_ON_INSTALL`（圖片與 `pixi.js` 原本就這樣做），改成一律套用，註解改寫。
2. **JS／CSS 的背景更新**（stale-while-revalidate）：背景的 `fetch` 改為 `fetch(e.request, { cache: 'no-cache' })`。頁面仍立刻拿到快取中的版本（不變慢），只有背景更新一定拿到伺服器上的最新版本。
   - 錯誤回應（404、5xx）**不寫進快取**（與圖片的分支相同）：背景更新現在每次都問伺服器，一次失敗的回應不能取代能用的模組（獨立 review 指出，原本就有、這次更常發生）。
3. **不改**：
   - HTML 的 network-first（導覽請求）：導覽請求不能直接改 cache mode（要重建 `Request`，redirect 與 mode 會改變），風險比收益大。安全的原因是第 1 點：install 時重新驗證 `./`、`./index.html`，也同時更新了頁面與 service worker 共用的 HTTP cache。
   - 已知、原本就有的問題（不在本 PR 修，記為 Backlog INFRA-107）：`isHtml` 以 `url.pathname === '/'` 判斷根目錄，在 GitHub Pages 的 `/Orbit/` 不成立，所以 `https://yoyocadence.github.io/Orbit/` 其實走 cache-first。它仍是新版的內容，因為第 1 點在 install 時重新驗證了 `./`。
   - 圖片的 cache-first、`activate` 清除舊快取、`skipWaiting`／`clients.claim`、「新版本已就緒」橫幅。
   - `CACHE` 名稱與 `npm run bump` 的流程。
4. 第一次部署就生效：瀏覽器檢查 `sw.js` 本身更新時預設不經過 HTTP cache（`updateViaCache: 'imports'`），所以帶著這個修正的 `sw.js` 一安裝，它自己的 install 就用新的取法。

## 3. 風險與代價

| 項目 | 說明 | 處理 |
|---|---|---|
| 安裝時的請求 | 每次新版本安裝，約 110 個 JS／CSS／HTML 多一個條件式請求。伺服器保留 `ETag` 時，沒變的檔案只回 `304`（沒有內容）；GitHub Pages 每次部署若讓所有檔案的 `ETag` 都改變（未驗證，部署會重新上傳整個網站），就是全部重新下載，與現在「上次載入超過 10 分鐘後」的安裝相同。只在部署新版本時發生 | 可接受，最差也與現在相同 |
| 安裝失敗 | `addAll()` 任一項失敗整個 install 失敗，舊的 service worker 繼續運作。與現在相同（現在也是同一個 `addAll()`）；只是現在 HTTP cache 有時會替網路故障「補位」，之後一定要連得到伺服器 | 下次開啟時瀏覽器會再試；與圖片現在的行為相同 |
| 背景更新多一次往返 | 只有背景的請求，頁面不等它 | 不影響載入速度 |
| GitHub Pages 的 304 | Pages 回應 `ETag`／`Last-Modified`，支援條件式請求；部署後 `ETag` 是否不變未驗證（PS-211D 也需要確認） | e2e 用內容雜湊的 `ETag`（最佳情況），只驗證「有變的拿到新版、沒變的可以 304」；正確性不依賴 304 |
| 仍在執行舊程式的頁面 | 已開著的頁面在重新整理前仍是舊程式（與現在相同，靠橫幅提示） | 不在範圍 |
| 回復 | 只改 `sw.js`，沒有資料或格式變更 | revert 即可；下一次部署會換掉快取 |

修正後，「SHELL 模組不 import 既有 SHELL 模組的新 export」的規則**仍保留**：已開著的頁面在重新整理前、以及使用者沒重新整理就延遲載入的模組，仍可能新舊混用（例如舊的頁面延遲載入新的模組）。這個規則的說明（`tasks.md`、各模組註解）不需要改。

## 4. 驗證：以 e2e 模擬改版

新增 `tests/e2e/infra105-sw-update.test.js`。現有的 `pwa/server.cjs` 回應 `no-store`，重現不了問題，所以測試自己開一個靜態伺服器：

- 伺服器：
  - 提供 `pwa/` 的檔案，回應 `Cache-Control: max-age=600` 與 `ETag`；
  - 收到相符的 `If-None-Match` 時回 `304`；
  - 可以在測試中把某些檔案換成「新版」內容；
  - 記錄每個請求與回應狀態。
- 步驟：
  1. 開啟 app，等 service worker 啟用、`orbit-v<目前版本>` 快取完成。此時 HTTP cache 中有「舊版」的 `js/version.js` 等，10 分鐘內仍有效。
  2. 把伺服器換成「新版」：
     - `sw.js` 的 `CACHE` 換成新名稱；
     - `js/version.js` 換成新的 `APP_VERSION`；
     - 一個 CSS 也換內容。
  3. `registration.update()`，等到快取只剩新名稱（新的 service worker 已啟用，舊快取已刪）。
  4. 驗證：
     - 新快取中的 `js/version.js` 與 CSS 是**新版**內容；
     - 重新整理後 app 讀到新的 `APP_VERSION`；
     - 沒變的 JS 以 `304` 回應（不是重新下載；測試伺服器的 `ETag` 是內容雜湊）。
  5. 背景更新：頁面在新版本下載入一個已改內容、但仍在 HTTP cache 有效期內的 JS 後，快取中的內容是伺服器上的最新版。
- 對照：同一個測試在修改前的 `sw.js` 上**會失敗**（新快取裡是舊的 `version.js`）。實作時先確認失敗，再套用修正，並把兩次結果寫在 PR。
- 既有的 `tests/e2e/sw-precache.test.js`（PS-211A 的離線 poster）照常通過。

## 5. 範圍外

- 長期快取與檔名加上 hash（PS-211D，暫緩）。
- 導覽請求（HTML）的 cache mode（§2 第 3 點）。
- `index.html` 的「新版本已就緒」橫幅與自動重新整理。

## 6. 實作順序（已完成）

1. 先寫 e2e（§4），在目前的 `sw.js` 上確認它失敗。
2. 修改 `sw.js`（§2 第 1、2 點），e2e 通過。
3. 跑完整的 lint、unit、e2e；`npm run bump -- patch`（`sw.js` 是部署檔案）。
4. 更新 `tasks.md`（INFRA-105 → Done）、handoff、CHANGELOG。
5. 開 PR，**合併前請使用者看過**本文件與結果。

## 7. 結果

- 修改前（目前的 `sw.js`）新的 e2e 兩項都**失敗**，失敗的原因正是本文件描述的問題：
  - 新版快取中的 `js/version.js` 仍是舊版內容（`Received string: "// Single source of truth for the app version.…"`，沒有 `v-e2e-next`）；
  - 背景更新後快取中的 `js/timeBand.js` 仍是舊版內容（沒有 `// e2e-next`）。
- 修改後兩項都通過，連跑 3 次都通過；更新時：
  - 改過的 `js/version.js` 回 `200`；
  - 沒變的 `js/app.js`、`index.html` 回 `304`；
  - 重新整理後 app 讀到新的 `APP_VERSION`。
- 完整驗證：lint、unit 80 個檔案／1232 項、e2e 71 項（含 PS-211A 的離線 poster）都通過。
- 獨立 review（Codex 額度用完時的替代）：沒有 P1／P2。依它的 P3 補上：背景更新不快取錯誤回應（含 unit test）；e2e 確認 HTTP cache 有作用（背景更新拿到 `304`）；304 的說明改為「伺服器保留 `ETag` 時」；根目錄的 `isHtml` 舊問題記為 INFRA-107。它也確認：各瀏覽器以 init 重建 `Request` 沒問題；直接開啟 `/js/*.js` 也正常；兩個 e2e 各自涵蓋修正的一半（只修 install 時第 2 項失敗，只修背景更新時第 1 項失敗）。
- 修改：
  - `pwa/sw.js`：install 時 SHELL 的每一項都以 `cache: 'no-cache'` 取得，取代只對圖片與 `pixi.js` 的 `REVALIDATE_ON_INSTALL`；JS／CSS 背景更新的 `fetch` 加上 `cache: 'no-cache'`。
  - `tests/unit/ps211aPrecache.test.js`：「圖片與 Pixi 重新驗證」改為「每一項都重新驗證」，並檢查背景更新。
  - `tests/e2e/support/seed.js`：export Supabase 的替身（新的 e2e 由自己的伺服器提供它，不用 Playwright 的 routing；routing 會關掉 HTTP cache，重現不了問題）。
  - technical design §12.2 的說明。
- 測試注意：新的 e2e 以減少動態效果（reduced motion）開啟 app。headless 的軟體 WebGL 持續繪製時，Chromium 會一直延後 service worker 的更新檢查，`registration.update()` 不會發出請求；PS-211A 的 e2e 也用同樣的設定。
