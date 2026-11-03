# INFRA-113 變更說明：Content-Security-Policy 與部署內容

> 狀態：**已實作（v1.41.8）**。使用者 2026-11-02 核准 INFRA-113；2026-11-03 決定嚴格的 CSP、先重構（AskUserQuestion）。
>
> 屬部署設定與頁面行為。

## 1. 問題（AUDIT-001 發現）

- `index.html` 沒有 Content-Security-Policy。app 有過 XSS（AUDIT-001 修了兩處），只靠每個地方記得 escape；沒有第二層防護。
- 頁面上有 22 個 `onclick="…"`、一段 inline `<script>`（註冊 service worker 與「新版本已就緒」橫幅），JS 模板裡還有 10 個 inline handler。只要有 inline 程式碼，CSP 就得允許 `'unsafe-inline'`，注入的 `<img onerror=…>` 也會執行，CSP 幾乎沒有作用。
- `deploy.yml` 上傳整個 `pwa/`：GitHub Pages 也公開 migration（`pwa/db/*.sql`）與開發用的 `pwa/server.cjs`。

## 2. 做法

### 2.1 不再有 inline 程式碼

- 有固定動作的按鈕改為 `data-action="名稱"`（需要參數時加 `data-action-arg`），新模組 `pwa/js/domActions.js` 在 document 上以一個 click listener 執行：
  - 只執行清單中的動作（`ACTIONS`），注入的標記不能用 `data-action` 呼叫任意 window 函式；`toString` 等 `Object.prototype` 的名稱也不行。
  - 只執行最內層的 `[data-action]`：保護卡說明按鈕在保護卡列裡面，以前靠 inline 的 `event.stopPropagation()`。
  - 在點擊時才查 window 函式，與定義它的模組誰先載入無關。由自己的 module script 載入，`app.js` 也 import 它（快取中較舊的 `index.html` 沒有這個 script，但會跑這一版的模組）；同一個模組只執行一次。各動作呼叫的 window 函式仍由 `app.js` 的模組定義，`app.js` 失敗時與以前一樣無法使用。
- 沒有對應 window 函式的兩個改在建立後綁定：保護卡確認框的「取消」以 `.onclick =`（屬性賦值不是 inline 程式碼，CSP 允許），重設密碼的顯示密碼以 `addEventListener`。
- inline `<script>` 搬到新模組 `pwa/js/swUpdate.js`，放在第一個 module script，盡早記下目前的 controller 並開始監聽 `controllerchange`（module script 依序執行，放在 `app.js` 後面會等 `app.js` 整個載入）。
- `tests/unit/csp.test.js` 檢查 `index.html` 與 `pwa/js` 沒有任何 `on*=` 屬性、inline `<script>`、`javascript:`，且每個 `data-action` 都在清單中。

### 2.2 Policy（`index.html` 的 `<meta http-equiv>`，在任何 script 與 style 之前）

| Directive | 值 | 原因 |
|---|---|---|
| `default-src` | `'self'` | 其他一律只允許自己 |
| `script-src` | `'self'` `'unsafe-eval'` 兩個 cdnjs 檔案的完整網址 | 不允許 inline。cdnjs 只允許成長報告 PDF 用的 jsPDF 2.5.1 與 html2canvas 1.4.1 這兩個檔案（不是整個 cdnjs，否則可以載入 cdnjs 上的其他函式庫繞過 CSP），兩者另有 SRI。`'unsafe-eval'` 見 §3 |
| `style-src` | `'self'` `'unsafe-inline'` | 模板大量使用 `style=""`，html2canvas 也會插入 style。style 不能執行程式碼 |
| `img-src` | `'self'` `data:` `blob:` Supabase 主機 | 頭像（data URL、Supabase 的 signed URL）、佐證照片、Pixi 載入的貼圖、PDF 的截圖 |
| `connect-src` | `'self'` Supabase 主機 | Supabase 的 REST／Auth／Storage；Pixi 的 worker 取得同源的圖 |
| `worker-src`、`child-src` | `'self'` `blob:` | service worker；Pixi 以 blob URL 建立載入圖片的 worker。`child-src` 給 Safari 15.4（`worker-src` 從 15.5 才支援，否則 worker 退回 `default-src` 而被擋，Pixi 停在 loading） |
| `object-src` | `'none'` | |
| `base-uri` | `'none'` | 不使用 `<base>`，注入的 `<base>` 不能改變相對網址 |
| `form-action` | `'self'` | |

- Supabase 主機必須與 `pwa/js/config.js` 的 `SUPABASE_URL` 相同（`csp.test.js` 檢查）。換 Supabase 專案時兩者一起改。
- Google 登入是導覽到 Supabase 再到 Google，CSP 不限制導覽。
- `<meta>` 的 CSP 不支援 `frame-ancestors` 與回報（`report-to`），GitHub Pages 不能設 header，所以沒有。

### 2.3 部署內容

`deploy.yml` 先建立 `_site/`、把 `pwa/` 的內容複製進去（`cp -R pwa/. _site/`，`_site` 已存在時也不會變成 `_site/pwa`），刪除 `db/` 與 `server.cjs` 後上傳（INFRA-108 的版本檢查也把這兩者視為不部署的檔案）。同時把四個 action 換成以 Node 24 執行的版本：`checkout@v5`、`configure-pages@v6`、`upload-pages-artifact@v5`（內部用 `upload-artifact@v7`；隱藏檔預設不上傳，`pwa/` 沒有隱藏檔）、`deploy-pages@v5`。部署只在合併到 `main` 後執行，PR 的 CI 測不到；合併後確認 Actions 的 deploy 成功。失敗時網站維持上一版。

## 3. 保留的風險

| 項目 | 說明 |
|---|---|
| `'unsafe-eval'` | Pixi 8 以 `new Function` 產生 shader／uniform 的程式碼。沒有它時 Pixi 拒絕啟動，Orbit Window 退回 poster（已實測）。Pixi 另有 `pixi.js/unsafe-eval` 外掛可避免，但 gzip 後 4,004 B，超過 PS-243 延後載入 JS 預算剩下的 2,223 B，需要另外決定（Backlog INFRA-114）。沒有 inline 程式碼時，攻擊者要先能執行程式碼才用得到 eval，風險低。 |
| `style-src 'unsafe-inline'` | 注入的 style 可以改變畫面，但不能執行程式碼。 |
| `img-src data:` | 頭像與截圖需要。 |
| 外部頭像網址 | `profiles.avatar_url` 若是 Supabase 以外的 https 網址，圖片會被擋（顯示破圖）。目前上傳的頭像都在 Supabase Storage。 |
| `make-icons.html` | 開發用的頁面，仍然部署，沒有 CSP（沒有輸入，不在 app 的流程中）。 |
| `'self'` 的範圍 | GitHub Pages 上 `'self'` 是 `https://yoyocadence.github.io`，包含同一帳號的其他 Pages 網站。 |
| 改版過渡期 | 仍在 v1.41.0 以前版本的 service worker（INFRA-107 之前）以 network-first 取得 `index.html`、JS 用舊快取：第一次開啟可能是新 HTML（有 CSP）配舊 JS，舊模板中的 `onclick`（回顧頁月視圖、保護卡說明、保護卡確認的「取消」）被擋。新的 service worker 同時安裝並出現「新版本已就緒」，重新整理後一致。沒有 service worker 的瀏覽器在 HTTP cache 的 10 分鐘內也可能新舊混用。v1.41.1 以後的 service worker 不受影響（設計上如此；獨立 review 以 e2e 確認了 v1.41.7）。 |

## 4. 驗證

- Unit：`csp.test.js`（10 項：CSP 的位置、沒有 inline 程式碼（含 `onclick = …`、`<b/onclick=…>`、`onclick=${…}`、`setAttribute('on…')`）、清單中每個動作的 window 函式都有定義、`data-action` 都在清單中、Supabase 主機與 `config.js` 一致、`script-src` 正好是 `export.js` 的兩個網址、dispatcher 的行為）；`routerLifecycle.test.js`：`navigate('__proto__')` 等不是頁面的名稱顯示首頁（以前 `__proto__`、`valueOf` 會丟出錯誤，`constructor`、`toString` 什麼都不顯示；`#__proto__` 從網址就能到達）。
- e2e：`infra113-csp.test.js`
  - 登入畫面、底部導覽、回顧頁的週／月切換與上個月、個人頁的保護卡說明、頁首頭像、Focus 的暫停／繼續／縮小／展開都可用，Pixi 場景 `ready`，過程中沒有任何 CSP 違規。
  - 注入的 `<img onerror>`、`<button onclick>` 不執行，`data-action` 指向清單外的函式也不執行。沒有 CSP 時這一項失敗。
- 完整 e2e 82 項、unit 全部通過。獨立 review 另以記錄所有違規的設定跑完整 e2e（只有注入測試中刻意的違規），並逐一試過登入畫面、試用橫幅、升級畫面、CSV／PDF 匯出、頭像與背景上傳、佐證壓縮、排行榜、空間、導覽、環境音（假的麥克風），都沒有違規；`infra113-csp` 連跑 32 次通過。
- 一次性確認（沒有留下測試，因為需要 jsPDF 與 html2canvas 的檔案）：以 npm 套件中與 cdnjs 相同的檔案取代 cdnjs，成長報告 PDF 在 CSP 下產生成功、SRI 通過、沒有違規。
- 去掉 `'unsafe-eval'` 時 Pixi 退回 poster（`data-runtime-status="fallback"`）。
