# INFRA-111 變更說明：沒有預先快取的圖片，第一次取得時向伺服器確認

> 狀態：**已實作（v1.41.7）**。使用者 2026-11-02 核准（AUDIT-001 之後的 AskUserQuestion，INFRA-110～113 全部核准）。
>
> 屬 service worker 的快取行為（部署行為）。

## 1. 問題（AUDIT-001 發現）

- `pwa/sw.js` 的圖片分支是 cache-first：這一版的快取有就直接回傳；沒有時 `fetch(e.request)`，成功就存進這一版的快取，之後整個版本都用這一份。
- 預先快取的圖片（SHELL）在 install 時以 `cache: 'no-cache'` 重新驗證（INFRA-105），JS／CSS 沒有快取時也是（INFRA-107）。但沒有預先快取的圖片（其他畫風、角色、房間風格、裝飾、像素版的窗外，PS-250B 起按需下載）用的是一般的 `fetch`，會先看瀏覽器的 HTTP cache。
- GitHub Pages 回應 `max-age=600`：瀏覽器在 10 分鐘內直接用自己的那一份，不問伺服器。
- 結果：部署前 10 分鐘內看過某張圖，部署後這張圖改了（同一個檔名）時，新版本的 service worker 第一次取得它會拿到 HTTP cache 裡的舊圖，存進新版本的快取，直到下一次 bump 都是舊圖。

## 2. 做法

只改圖片分支的一行：快取中沒有時以 `fetch(e.request, { cache: 'no-cache' })` 取得，與 JS／CSS 相同。

- `no-cache` 不是「不用快取」：瀏覽器仍會送出帶 `If-None-Match` 的條件請求，伺服器認為沒變時回 304。但 GitHub Pages 的 ETag 依檔案的修改時間與大小，每次部署都重新 checkout，所以改版後第一次確認通常還是回 200（重新下載一次），只有 HTTP cache 裡的那一份來自同一次部署時才是 304。
- 快取中已有的圖片照舊直接回傳，不問網路（離線也一樣）。
- 不改：哪些圖預先快取、install／activate、HTML 與 JS／CSS 分支、跨來源請求（仍不經 service worker 快取）。

## 3. 代價與風險

| 項目 | 說明 |
|---|---|
| 每張按需下載的圖第一次多一次確認 | 只在這一版的快取沒有時；之後整個版本都從快取回傳。改版後通常是一次完整下載（見 §2，GitHub Pages 的 ETag 隨部署改變），每個版本每張圖一次。 |
| 離線或伺服器錯誤（有改變） | 以前：這一版的快取沒有、但瀏覽器 10 分鐘內看過這張圖時，斷線仍可從 HTTP cache 拿到（正是可能過時的那一份）。現在：向伺服器確認失敗就失敗，poster 與 Edit Mode 的選單退回 `data-fallback-src` 的預設圖（PS-211A、PS-250G），Pixi 退回預設風格。只影響改版後 10 分鐘內、這一版還沒存過的圖；這一版存過的照常離線可用。 |
| 同一張圖同時被要求兩次 | poster 與 Pixi 幾乎同時要同一張還沒存的圖時，兩個請求都會到伺服器（以前第二個由 HTTP cache 回答）。例：切到全像素時 39 張圖多 4 個請求（獨立 review 量測）。成本小，沒有另外合併請求。 |
| 回復 | 只改 `sw.js` 一行，revert 即可。 |

## 4. 驗證

- Unit（`tests/unit/serviceWorkerImageCache.test.js`）：快取中沒有的圖片以 `{ cache: 'no-cache' }` 取得。修改前失敗。
- e2e（`tests/e2e/infra111-sw-image.test.js`，`support/pagesServer.js`，`max-age=600`）：這一版顯示一張沒有預先快取的圖（進入 HTTP cache 與這一版的快取）→ 伺服器上換掉這張圖並部署下一版的 `sw.js` → 新的 service worker 接手後，新分頁取得的是伺服器上的新圖，新版本的快取也存新圖；之後從快取回傳、不再問伺服器。修改前的 `sw.js` 上失敗（拿到 HTTP cache 的舊圖）。連跑 3 次通過。
