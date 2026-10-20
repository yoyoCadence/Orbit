# PS-211 提案：Personal Space 素材的預載與快取

> 狀態：**提案（Mode A），等待使用者決定**（2026-10-20）。核准前不改程式碼。

## 1. 結論

- PS-211 寫於 Personal Space V2 之前，原本的問題是「切頁後再回到 personal space，window view 與家具要等一下才出現」。**這個問題在 V2 與 legacy 都已經不存在**：同一次使用中切頁，不發出任何網路請求，畫面第一個 frame 就有完整的 poster，canvas 在 5–51 ms 內就緒（§3）。
- 仍然會等的情況有三個（§4）：
  1. **改版後第一次載入新版本時**（「新版本已就緒」後重新整理，或下次開啟），如果瀏覽器的 HTTP cache 沒有素材的有效副本：service worker 的快取隨版本刪除，房間素材與 `pixi.js` 都要重新下載。限速（§2）、專案 100% 時，poster 背景晚 2.2 秒、完整 poster 晚 3.4 秒、canvas 晚 4.5 秒出現。如果 GitHub Pages 的 ETag 不隨部署改變，過期的副本只需以 304 重新驗證（每個檔案約一次往返；HTTP/2 下未量測）。正式環境屬於哪一種，取決於這一點：推測 ETag 每次部署都會改變，但尚未驗證（§4.1）。
  2. **狀態第一次改變時**（reveal、下一階段的家具、角色換動作）：新圖片不在 service worker 快取，當下才從網路下載，限速下 0.4–1.0 秒。這段時間 canvas 顯示的是**改變前的房間**，違反技術設計「第一個完整的 Pixi frame 畫好前不隱藏 DOM fallback」的規則。
  3. **SHELL 預先快取了 1.99 MB 的 legacy 圖片**，V2 完全不會用到。
- 建議（§6）：把 PS-211 改成「改版後的素材連續性與狀態切換」，拆成：
  - **PS-211A（建議 A3；改 service worker 的 precache，屬部署行為，需核准）**：SHELL 移除兩張 legacy 圖片，改放 poster 會用到的 22 個 V2 檔案（987,645 bytes，比現在少約 1.00 MB）。新的 service worker 在 precache 完成後才啟用，所以改版後任何狀態的 poster 都立刻完整，狀態改變時的新圖片也已在快取中，不必等網路。
  - **PS-211B（建議）**：新場景畫完之前隱藏 canvas，讓 DOM poster 顯示，符合上述設計規則，可用一條 CSS 規則實作。可選：首頁 → 空間時沿用同一個 Pixi app，省下 WebGL 初始化。
  - **PS-211C（只在 PS-211A 選 A2 時才需要）**：閒置時預熱角色的動作圖片。選 A3 時不需要。
  - **跨版本長期保存的素材快取（§5 D）暫緩**。

## 2. 量測方式

- 程式碼：`pwa/sw.js`、`pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js`、`ui/orbitWindow.js`、`content/assetManifest.js`、`pages/home.js`、`pages/personalSpaceV2.js`、`router.js`；素材大小來自 `docs/ps243/asset-baseline.json`。
- 瀏覽器：本機 Chromium（headless），390×844 與 1280×720，兩者差異在 ±5% 內。表格列 390 px，範圍值包含兩種寬度。
- 現有 e2e 環境量不到快取行為：dev server 回傳 `Cache-Control: no-store`，Playwright 的 route mock 也會停用 HTTP cache。所以在 `pwa/` 前面另外架一個模擬 GitHub Pages 的 proxy：
  - `max-age=600`；
  - 依內容 hash 產生的 ETag 與 304；
  - 文字 gzip、正確的 webp MIME；
  - 由 proxy 回應 Supabase stub。
- 「限速」是自訂設定：1.6 Mbps 共用頻寬、每個請求加 150 ms。延遲比 Chrome DevTools 的 Fast 3G 預設輕。
- 改版的模擬方式：
  - 改變 `sw.js` 的 `CACHE` 名稱後呼叫 `registration.update()`；
  - 「HTTP cache 沒有素材的副本」以 CDP 的 `Network.clearBrowserCache` 模擬，之後只重新載入 JS／CSS。
- 限制：
  - 本機 WebGL 是軟體算圖，Pixi ticker 會造成約 100 ms 的長任務，主執行緒的時間偏悲觀；
  - proxy 用 HTTP/1.1，GitHub Pages 是 HTTP/2；
  - 數字是單次量測，只用來比較量級，不是 production 的網路紀錄。
- 量測腳本：`tests/perf/ps211-cache-probe.pw.mjs`（CI 不執行）。在 repo 根目錄執行 `npx playwright test -c tests/perf/playwright.ps211.config.mjs`，可用 `-g` 只跑其中一個情境；結果寫到 `test-results/ps211-cache-probe/`（可用 `PS211_PROBE_OUT` 改位置）。注意 `npm run test:e2e` 會清空整個 `test-results/`，要保留結果就把 `PS211_PROBE_OUT` 指到別處。2026-10-20 從這個位置重跑「改版後，100%」情境，得到 +2,184／+3,368／+4,351 ms，與 §4.1 的表一致。

## 3. 現況：已經沒有等待的地方

| 切換 | 網路請求 | poster 插入時已完整 | 到 canvas 就緒 |
|---|---|---|---|
| 首頁 → 空間（冷啟動後第一次） | 0（51–84 ms，經 service worker 從快取讀） | 否 | +37–51 ms |
| 空間 → 首頁 | 0 | 是 | +5–10 ms |
| 世界 ↔ 編輯 | 0 | 是 | +6–10 ms |
| 首頁 → 目標 → 首頁 | 0 | 是 | +32–47 ms |
| 首頁 → 空間（之後） | 0 | 是 | +33–40 ms |

- 沒有空白期：DOM poster 在第一個 frame 就畫出。canvas 從 mount 起就疊在 poster 上（`z-index: 90`），第一次畫完前是透明的；就緒後 poster 才淡出（`style.css` 的 `.is-runtime-ready .orbit-window-poster`）。
- 原因：
  - poster 的 `<img>` 與 canvas 用同一組圖片網址，瀏覽器的記憶體快取直接提供；
  - Pixi 的 `Assets` 快取在 app 銷毀時保留（`pixiSceneRuntime.js` 的 `disposeApplication`：`texture: false, textureSource: false`）；
  - service worker 的圖片走 cache-first，同一個版本內只下載一次。
- legacy（`orbit_personal_space_runtime=legacy`）再次進入時也是 0 網路請求，圖片 8 ms 內解碼完成。

## 4. 現況：仍然會等的地方

### 4.1 改版之後

- `sw.js` 的 `CACHE` 名稱包含版本號，新版本 activate 時刪除其他所有快取。V2 的房間素材與 `vendor/pixi.js` 不在 SHELL，是執行時才放進快取的，所以新版本啟用後，這些檔案都要經 service worker 再向網路要一次。
- 使用者遇到的時間點：
  1. 改版後第一次開啟時，仍由舊的 service worker 與舊快取提供，畫面不受影響。
  2. 新的 service worker 在背景安裝（下載 SHELL），完成後立刻啟用（`skipWaiting`／`clients.claim`），app 顯示「新版本已就緒」。
  3. 等待發生在那次重新整理，或下次開啟時。
  4. 已經開著的頁面也會遇到：`clients.claim()` 讓新的 service worker 立刻接管這個頁面，舊快取已被刪除，所以接管後才需要的檔案不必重新整理就要向網路要。例如 runtime 還沒啟動（app 在 Pixi 載入前就切到背景，回來時才 import `pixi.js`）、之後進入「空間」，或狀態改變需要新圖片。
     - 已經載入記憶體的 JS 與已解碼的圖片不受影響。
     - 這個情況沒有另外量測；需要的檔案從網路下載，量級與下表「HTTP cache 沒有素材的副本」的情況相同（限速下 Pixi 約 1 秒以上）。A2／A3 讓接管後需要的 poster 素材已在新快取中，Pixi 則只有 ＋P 能涵蓋。
- 要不要真的重新下載，取決於瀏覽器的 HTTP cache：
  - GitHub Pages 回傳 `max-age=600`。過期後瀏覽器會帶 ETag／Last-Modified 重新驗證；檔案沒變就回 304，只花一次往返。
  - `deploy.yml` 每次從新的 checkout 上傳整個 `pwa/`，檔案的修改時間每次都不同。如果 GitHub Pages 的 ETag／Last-Modified 依修改時間產生（推測如此），每次部署後所有檔案都會整個重新下載。
  - **尚未驗證**（這個環境連不到 github.io）。驗證方式：在兩次部署之間，用 `curl -I` 比較同一個沒改過的素材的 ETag。
- 改版頻率：版本號（也就是 `CACHE` 名稱）10/17、10/18、10/19 分別改了 6、4、6 次，8/31 到 10/17 之間沒有改。改版集中在少數幾天。

| 情境（390 px，限速，時間為首頁出現後） | poster 背景 | 完整 poster | canvas 就緒 | 下載 |
|---|---:|---:|---:|---|
| 同一版本重新整理，100% | +68 ms | +68 ms | +434 ms | 只有 HTML（304） |
| 改版，HTTP cache 仍新鮮（素材 10 分鐘內剛從網路取過，實際很少發生），0% | +28 ms | +28 ms | +339 ms | 只有 `sw.js` 與 HTML |
| **改版，HTTP cache 沒有素材的副本，100%** | **+2,192 ms** | **+3,375 ms** | **+4,505 ms** | 797 KiB（素材 531 KB、Pixi 220 KB） |
| 改版，HTTP cache 沒有素材的副本，0%（另一次量測） | +3,655 ms | +3,655 ms | +4,716 ms | 674 KB |

### 4.2 狀態第一次改變時

- runtime 每次只載入目前狀態需要的圖片（`pixiSceneRuntime.js` 的 `render()`，`assetManifest.js` 的 `getWorkspaceSceneAssets`），沒有預載。這符合技術設計 §12.1「只載入目前的 scene bundle」。
- 量測：限速下完成 Main Quest，專案 75% → 100%。
  - 背景與既有家具立刻從快取出現。
  - 新圖片都不在 service worker 快取，從網路下載：雙螢幕 549 ms、主角 celebrate 952 ms、Companion congratulate 1,006 ms、盆栽 1,040 ms；canvas 在 +1,046 ms 才畫出新狀態。reveal 結束後，Companion 的 approach 圖又等了 389 ms。
  - 沒有限速時，同樣的改變只要 65–73 ms。
- **這段時間 canvas 顯示的是 75% 的舊房間，文字已經是 100%。**
  - 原因：
    - runtime 離開舊 host 時停止 app（`release()` → `suspend()` → `app.stop()`），canvas 保留最後一個 frame；
    - 接到新 host 時，先 `host.appendChild(app.canvas)`，再 `await render()` 載入新圖片；
    - canvas 疊在 poster 之上，所以蓋住了新狀態的 poster。
  - 這違反技術設計 §9.2「Do not hide the DOM fallback until the first complete Pixi frame is ready」。
- 新狀態的 poster 自己也要等新圖片，在 +1,041 ms 才完整。
- major reveal 的 6 秒計時與 runtime 是否就緒無關，載入期間已經在倒數（`orbitWindow.js` 的 `syncRevealClock`）。本提案的選項都不處理這點。

### 4.3 legacy 圖片的 precache

- SHELL 中只有兩張圖片，都是 legacy idle window 的：`office-angle-center-v2.png`（1,971,296 bytes）與 `building-protagonist-idle-1.png`（16,400 bytes），合計 1,987,696 bytes（1.99 MB）。
  - 它們在 V2 vertical slice（7/18）用作 placeholder 時加入。
  - V2 在 7/31 改用自己的背景 `building-formal-workstation-room-v1.webp`，10/18 起是 PS-244 的 `room-v2.webp`，但 SHELL 一直沒有跟著更新。
- 現在只有 legacy（回退用的 flag）會顯示它們。每次改版，新的 service worker 安裝時都要取得這兩張圖片：HTTP cache 沒有有效副本時要下載 1.99 MB，限速下約 10 秒，和首頁的請求搶頻寬。

### 4.4 首頁 → 空間會重建 Pixi app（不是錯誤）

- 首頁的 cleanup 以 `setTimeout(0)` 排程銷毀 runtime（`home.js` → `orbitWindowRuntimeDestroyer.schedule()`）。router 接著 `await` lazy route 的 import，計時器在「空間」頁呼叫 `retain()` 之前就觸發，所以每次首頁 → 空間都建立新的 canvas 與 WebGL context。
- 設計文件允許這樣做：vertical slice §10「Leaving Home suspends or destroys its runtime before full World mounts」，技術設計 §9.2「Home-to-full route changes destroy or transfer the canvas host」。延遲銷毀原本是為了同一路由的重繪。
- 圖片快取保留，所以沒有網路成本，畫面上也被 poster 蓋住；成本是 WebGL 初始化的主執行緒時間。沿用同一個 app 屬於可選的最佳化。

## 5. 方案

字母與 §6 的子任務對應：A → PS-211A、B → PS-211B、C → PS-211C；D 暫緩。

| 方案 | 解決 | 成本與風險 |
|---|---|---|
| **A. 修正 SHELL** | §4.3；§4.1 的素材部分；選 A2／A3 時也減少或消除 §4.2 的網路等待 | 改 service worker precache，**屬部署行為，需核准**。legacy 失去離線背景（legacy 只用於回退）。 |
| **B. 新場景畫完前隱藏 canvas** | §4.2 的「顯示舊房間」；可選：§4.4 | 低風險，不動 service worker。取捨見下方。 |
| C. 閒置時預熱角色圖片（`pixi.Assets.load`） | 選 A2 時剩下的 §4.2 角色圖片 | 盡力而為；要修改技術設計 §12.1。 |
| D. 跨版本的長期素材快取（以 `manifest.json` 的 `sha256` 為 key，activate 時保留、依目前 manifest 清理） | §4.1 全部，含 Pixi | 最複雜；改 service worker 與部署語意，需核准。 |

### A 的範圍選項

| 選項 | SHELL 中的 V2 檔案 | 大小 | 改版後 | 狀態改變時（§4.2） |
|---|---|---:|---|---|
| A1 | 首屏 4 個：背景、主角 idle（朝左）、Companion observe、晴天特效 | 182,283 bytes | 預設角色狀態、專案 0% 時 poster 立刻完整；家具仍要下載 | 不變 |
| A2 | A1 ＋ 8 件家具 | 558,930 bytes | 任何進度的背景與家具立刻完整；角色不是預設狀態時，該角色圖仍要下載（每張 42–48 KB） | 新家具從快取取得；角色圖仍要下載 |
| **A3（建議）** | A2 ＋ 主角其他 4 個動作（celebrate、inspect、rest、work，朝左）＋ Companion 其他 5 個狀態 ＋ 雨天特效 | 987,645 bytes | 程式碼會產生、或已儲存的 state 可能帶有的所有 poster 狀態都立刻完整 | 所有新圖片都從快取取得，沒有網路等待 |
| ＋P（附加，可與 A1–A3 任一個並用） | 另外加入 `vendor/pixi.js` | ＋796,970 bytes（gzip 約 225 KB） | 只省掉 Pixi 的下載時間；canvas 仍要解析 Pixi、建立 WebGL、解碼圖片、建立場景（快取有效時 +434 ms），期間由 poster 頂著 | 不變 |

- 為什麼有保證：新的 service worker 在 install 的 `addAll()` 全部完成後才啟用，所以啟用時 SHELL 的檔案一定都在快取中。不是盡力而為。
- 角色狀態的來源：
  - 主角由 `viewModels.selectProtagonistState()` 決定：idle、celebrate、inspect、rest、work。動量 strong 時是 work，今天有恢復 Session 時是 rest，所以非預設狀態並不少見。
  - Companion 由 `companionEngine.js` 決定：observe、approach、congratulate、rest、work、remind。
  - 天氣存在 V2 state 中：沒有程式碼寫入 `rain`，但 `stateSchema.js` 接受已儲存的 `rain`，所以 A3 也放入雨天特效（31,582 bytes）。
  - 朝右與 `walk` 既不儲存、也不會由程式碼推導出來，不列入。
- A1–A3 都比現在的 1,987,696 bytes 小：寫進 Cache Storage 的量，A2 少約 1.43 MB，A3 少約 1.00 MB。實際下載的量取決於 §4.1 的 HTTP cache：ETag 不隨部署改變時，沒變的檔案只需 304 重新驗證，兩者都幾乎不下載；ETag 每次都變時，SHELL 的檔案每次改版都整個下載，A2／A3 就比現在少下載這麼多。
- A3 涵蓋的比「A2 ＋ C」多，而且是確定的：C 只預熱 reveal 會用到的 4 張角色圖，A3 則包含所有可能的角色狀態與雨天。
- 與技術設計 §12.2 的關係：
  - §12.2 允許 precache「離線 shell 需要的 stateful fallback 素材」，但也說不要把所有全解析度的場景圖放進 SHELL，並要求 service worker 快取策略的變更先取得核准。
  - poster 是 V2 的 fallback，A1／A2 符合。A3 放入的也全是 poster 會用到的素材，但數量是 manifest 29 個檔案中的 22 個。是否算「全部」由使用者判斷；選 A3 時，順便把 §12.2 的文字改清楚。
- 與技術設計 §12.1 的關係：§12.1 說首頁不要載入所有專案階段。A2／A3 在 service worker 安裝時下載所有階段的家具（A3 還有所有角色狀態）；第一次造訪時，安裝發生在首頁開著的時候。「service worker precache 不等於首頁載入」說得通，但這也是判斷題：選 A2／A3 時，§12.1 與 §12.2 一起改清楚。
- Pixi 不是 fallback，§12.1 也要求首頁初始 HTML 不下載 Pixi。＋P 的效果只有省掉下載時間：改版後重新整理、或已開著的頁面被接管後才載入 Pixi 時，canvas 晚約 1 秒以上出現（poster 先頂著）。所以不建議，但這是 ＋P 唯一的好處，由使用者權衡。
- 實作注意：
  - `addAll()` 會經過瀏覽器的 HTTP cache。如果某張素材以同樣的檔名重新渲染，而舊檔在安裝前 10 分鐘內被取過，舊檔會被 precache 並用到下次改版；目前執行時的 cache-first 也有同樣的風險。SHELL 的圖片改用 `new Request(url, { cache: 'no-cache' })`（強制重新驗證）可以避免。圖片路徑仍要寫在 `const SHELL = [...]` 字面值裡，在 install 時才轉成 Request：`serviceWorkerShell.test.js` 與量測腳本都只解析這個字面值。
  - `tests/unit/serviceWorkerShell.test.js` 已經檢查 SHELL 的檔案存在，`addAll()` 不會因缺檔失敗。新測試只需要從 `assetManifest.js` 推導出選定的素材，檢查都在 SHELL 中。
  - PS-243 的首屏預算不受影響（不改首屏載入的檔案）。

### B 的內容與取捨

- 實作：`.orbit-window:not(.is-runtime-ready) .orbit-window-canvas { visibility: hidden; }`。
  - `mount()` 一開始就移除 `is-runtime-ready`，畫完並 `app.start()` 後才加回；首頁重繪時換成新的 DOM，也沒有這個 class。
  - 現有 e2e 檢查 canvas 的數量與尺寸，不受影響。
  - 目前 `render()` 只由 `mount()` 與 WebGL context 恢復時呼叫；context lost 時已經移除 `is-runtime-ready`、恢復並畫完後才加回，所以沒有「舊 frame 在 class 存在時顯示」的路徑。日後若新增直接呼叫 `render()` 的地方，要一併處理這個 class。
- 取捨：使用者不再看到「舊的完整房間」，改看到新狀態的 poster；poster 的新圖片還沒到時，會逐一出現。選 A3 時這些圖片都從快取取得，幾乎立刻完整；不選 A 時，限速下約 1 秒。
- 可選：首頁 → 空間時沿用同一個 Pixi app（例如在 lazy import 之前 `retain()`，或延長銷毀的延遲），省下 WebGL 初始化。設計文件允許重建，所以這只是最佳化。

### C 的範圍（只在選 A2 時需要）

- 只在第一次 canvas 就緒、瀏覽器閒置、`navigator.connection.saveData` 不是 true、`effectiveType` 不是 `2g` 或 `slow-2g` 時執行。
- 只預熱角色的動作圖片：主角 celebrate、inspect，Companion congratulate、approach，合計 179,671 bytes。家具已由 A2 precache。
- 實作用 `pixi.Assets.load()`，由閒置時的工作呼叫，runtime 保留它的 promise 作為「預熱完成」的訊號。不用 `Assets.backgroundLoad()`：vendored 版本只把圖片排入背景佇列就 resolve，無法知道何時下載與解碼完成。
- 預熱的圖片會解碼並留在 Pixi 的記憶體快取，與目前狀態已載入的圖片相同處理，不另外釋放。
- 這是盡力而為的改善，不是保證：預熱完成前就發生的狀態改變，仍要等新圖片下載。
- C 不涵蓋的角色狀態第一次出現時仍要下載（每張 42–45 KB）：完成恢復 Session 後的主角 rest 與 Companion rest、動量 strong／peak 時的主角 work 與 Companion work、提醒時段的 Companion remind。要涵蓋這些就選 A3；把它們也放進 C（9 張，397,133 bytes）效果接近 A3，但仍是盡力而為。
- 要修改技術設計 §12.1（「只載入目前的 scene bundle」）；也可能牴觸 §12.2「較大的 scene bundle 依需要快取」的寫法。

### D 為什麼暫緩

- 素材仍在調整：椅子在 PS-244 建立後，10/18–19 又改了兩次。D 必須以內容（`sha256`）為 key，不能以檔名為 key。
- 改版集中在少數幾天（§4.1），且 §4.1 的 ETag 問題尚未驗證；若 GitHub Pages 的 ETag 不隨部署改變，D 的效益會小很多。
- §12.2 已經寫了「以 app／asset manifest 命名版本」的快取方向，素材穩定後可依此設計。

## 6. 建議與拆分

1. **PS-211 改寫範圍**：「同一次使用中切頁的等待」已解決（§3）；剩下的工作改為改版後的素材連續性與狀態切換。
2. **PS-211A（建議 A3）**：
   - SHELL 移除兩張 legacy 圖片，加入 A3 的 22 個 V2 檔案，圖片以 `cache: 'no-cache'` 的 Request 取得。
   - 路徑由測試從 `assetManifest.js` 推導，避免素材改名時 SHELL 漏改（legacy 圖片在 V2 換掉之後留了近三個月）。
   - 同時把技術設計 §12.1 與 §12.2 改清楚（service worker precache 的 poster 素材不算首頁載入）。
   - patch。不想放入角色動作時選 A2，再視需要加 PS-211C。
3. **PS-211B（建議）**：一條 CSS 規則讓 canvas 在新場景畫完前隱藏，符合技術設計 §9.2。可選：首頁 → 空間沿用 Pixi app。patch。
4. **PS-211C**：選 A3 時不需要；選 A2 時可選，並修改技術設計 §12.1。patch。
5. **D 暫緩**：在 Backlog 記錄，連同 §4.1 的 ETag 驗證。

順序：PS-211B（風險最低、不需核准部署行為）→ PS-211A →（PS-211C）。

## 7. 需要使用者決定

1. 是否同意改寫 PS-211 的範圍（§6 第 1 點）。
2. PS-211A：
   - 是否核准修改 service worker precache；
   - 範圍選 A1、A2（並澄清技術設計 §12.1）、**A3（建議，並澄清 §12.1 與 §12.2）**，或不做；
   - 是否加上 ＋P（`pixi.js`，不建議）。
3. PS-211B：是否排入（建議）；是否包含「首頁 → 空間沿用 Pixi app」的可選最佳化。
4. PS-211C：只在第 2 題選 A2 時需要決定：是否排入，並修改技術設計 §12.1。
5. D 是否同意暫緩。

## 8. 驗收條件草稿（核准後寫入 tasks.md）

- **PS-211A**
  - SHELL 不含 `assets/personal-space/idle-window/` 下的任何檔案。
  - SHELL 含所選範圍的 V2 檔案。單元測試從 `assetManifest.js` 推導這組路徑（A3：預設與所有可能的角色狀態、晴天與雨天、8 件家具），檢查都在 SHELL 中。
  - SHELL 的圖片以 `cache: 'no-cache'` 取得。
  - e2e：service worker 安裝後，快取中有這些檔案；離線重新整理時，所選範圍內的 poster 完整顯示（A2：預設角色狀態、任何進度；A3：程式碼會產生或 state 可能帶有的任何狀態，含雨天）。
  - legacy 在線上仍可正常顯示（執行時 cache-first）。
- **PS-211B**
  - 測試：新場景畫完、`is-runtime-ready` 加上之前，canvas 是 `visibility: hidden`；之後才顯示。
  - 既有的 runtime lifecycle、context lost／restored、e2e 的 canvas 檢查通過。
  - （若包含可選最佳化）首頁 → 空間 → 首頁的過程中，Pixi `Application` 只建立一次（以假的 Pixi 計數）。
- **PS-211C**（若排入）
  - 第一次就緒後的閒置時間才開始預熱；`saveData`、`2g`、`slow-2g` 時不預熱（各有測試）；只載入 §5 C 列出的圖片。
  - 預熱完成後（測試先等 runtime 的預熱完成 promise，也就是 `Assets.load()` 的 promise）才觸發 reveal：新圖片已在快取中，不發出新的圖片請求。
  - 預熱尚未完成時觸發 reveal：行為與現在相同（圖片照常下載、畫面照常更新），不多等、不出錯。
  - 技術設計 §12.1 更新。
- 全部：lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。

## 附錄：其他發現（不在本提案範圍）

- `docs/ps-243-production-acceptance.md` 的預算表與 `pwa/assets/personal-space/v2/README.md` 仍是 PS-244 之前量到的數字：首屏 259,133 bytes、完整 1,766,935 bytes。目前 `docs/ps243/asset-baseline.json` 是 182,283 與 1,293,693 bytes。前者是當時的驗收紀錄，是否更新由使用者決定。
- `pwa/server.cjs`（本機 dev server）沒有 `.webp` 的 MIME，背景以 `text/plain` 回傳；瀏覽器仍能顯示，只影響本機。
- `manifest.json` 中有 8 個檔案（337,630 bytes）目前沒有程式碼會產生對應的狀態：主角朝右的姿勢、`walk`、`rain`。
  - `rain` 是 `stateSchema.js` 接受的已儲存狀態，所以列入 A3。
  - 其餘 7 個既不儲存，也不會被推導出來。
  - `building-formal-workstation-room-v1.webp`（159,396 bytes）沒有任何地方引用。
- `tests/unit/serviceWorkerShell.test.js` 只檢查字面的動態 import，所以 `pixiSceneRuntime.js` 以變數 import 的 `vendor/pixi.js` 不會被要求列入 SHELL（目前是刻意不列）。
- major reveal 的 6 秒計時在 runtime 就緒前就開始倒數（§4.2）。如果要讓慢速網路下的 reveal 完整播放，需要另立任務。
