# PS-211 提案：Personal Space 素材的預載與快取

> 狀態：**提案（Mode A），等待使用者決定**（2026-10-20）。核准前不改程式碼。

## 1. 結論

- PS-211 寫於 Personal Space V2 之前，原本的問題是「切頁後再回到 personal space，window view 與家具要等一下才出現」。**這個問題在 V2 與 legacy 都已經不存在**：同一次使用中切頁，不發出任何網路請求，畫面第一個 frame 就有完整的 poster，canvas 在 5–51 ms 內就緒（§3）。
- 仍然會等的情況有三個（§4）：
  1. **每次改版之後**：service worker 的快取名稱隨版本改變，舊快取整個刪除，房間素材與 `pixi.js` 都要重新下載。Fast 3G、專案 100% 時，poster 背景晚 2.2 秒出現，完整 poster 晚 3.4 秒，canvas 晚 4.5 秒。
  2. **狀態第一次改變時**（reveal、下一階段的家具、Companion 換動作）：新圖片當下才下載，Fast 3G 約 1 秒。這段時間 canvas 顯示的是**改變前的房間**，文字卻已經是新的狀態。
  3. **每次改版，service worker 安裝時都下載 1.94 MB 的 legacy 圖片**，V2 完全不會用到。
- 建議（§6）：把 PS-211 改成「改版後的素材連續性與狀態切換」，拆成三個小任務：
  - **PS-211A**（改 service worker 的 precache，**屬部署行為，需核准**）：SHELL 移除兩張 legacy 圖片，改放 V2 poster 的背景、預設角色與 8 件家具（12 個檔案，約 559 KB）。每次改版少下載約 1.43 MB，改版後 poster 的背景與家具立刻完整；角色不是預設狀態時，該角色圖仍要下載。
  - **PS-211B**（只改 runtime，不動 service worker）：新的場景畫完之前不顯示舊的 canvas；修正從首頁進入「空間」時 Pixi app 每次被銷毀重建的時序問題。
  - **PS-211C**（可選，需要調整技術設計 §12.1）：畫面就緒後，在閒置時預先載入「下一步可能用到」的少數圖片（下一階段家具與 reveal 用的角色動作，約 0.2–0.4 MB），讓狀態改變時不必等。
- 不建議現在做「跨版本長期保存的素材快取」（§5 方案 B）：素材仍在調整（椅子 10/18–19 改了 3 次），等素材穩定再評估。

## 2. 量測方式

- 程式碼：`pwa/sw.js`、`pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js`、`ui/orbitWindow.js`、`content/assetManifest.js`、`pages/home.js`、`pages/personalSpaceV2.js`、`router.js`；素材大小來自 `docs/ps243/asset-baseline.json`。
- 瀏覽器：本機 Chromium（headless），390×844 與 1280×720，兩者差異在 ±5% 內，下表列 390 px。
  - 現有 e2e 環境的 dev server 回傳 `Cache-Control: no-store`，Playwright 的 route mock 也會停用 HTTP cache，量不到快取行為。所以另外用一個模擬 GitHub Pages 的 proxy：`max-age=600`、ETag／304、文字 gzip、正確的 webp MIME。
  - Fast 3G：1.6 Mbps、每個請求加 150 ms。
  - 「改版」以 `registration.update()` 觸發新的 service worker 安裝來模擬。
  - 本機 WebGL 是軟體算圖，Pixi ticker 會造成約 100 ms 的長任務，主執行緒的時間偏悲觀。proxy 用 HTTP/1.1，GitHub Pages 是 HTTP/2。
- 數字是單次量測，只用來比較量級，不是 production 的網路紀錄。

## 3. 現況：已經沒有等待的地方

| 切換 | 網路請求 | poster 插入時已完整 | 到 canvas 就緒 |
|---|---|---|---|
| 首頁 → 空間（冷啟動後第一次） | 0（51–84 ms 從 SW 快取讀） | 否 | +37–51 ms |
| 空間 → 首頁 | 0 | 是 | +5–10 ms |
| 世界 ↔ 編輯 | 0 | 是 | +6–10 ms |
| 首頁 → 目標 → 首頁 | 0 | 是 | +32–47 ms |
| 首頁 → 空間（之後） | 0 | 是 | +33–40 ms |

- 沒有空白期：DOM poster 在第一個 frame 就畫出，canvas 就緒後才淡入覆蓋（`style.css` 的 `.is-runtime-ready .orbit-window-poster`）。
- 原因：
  - poster 的 `<img>` 與 canvas 用同一組圖片網址，瀏覽器的記憶體快取直接提供；
  - Pixi 的 `Assets` 快取在 app 銷毀時保留（`pixiSceneRuntime.js` 的 `disposeApplication`：`texture: false, textureSource: false`）；
  - 首頁與「空間」共用同一個 runtime（`orbitWindowRuntime`），以 retain／release 管理；
  - service worker 的圖片走 cache-first，同一個版本內只下載一次。
- legacy（`orbit_personal_space_runtime=legacy`）再次進入時也是 0 網路請求、圖片 8 ms 內解碼完成。

## 4. 現況：仍然會等的地方

### 4.1 每次改版之後

- `sw.js` 的 `CACHE` 名稱包含版本號，每個 PR 都 bump 一次（10/1–10/19 共 16 個版本，10/19 一天 6 個）。新版本 activate 時刪除其他所有快取。
- V2 的房間素材與 `vendor/pixi.js` 都不在 SHELL，是執行時才快取的，所以改版後全部要重新下載。HTTP cache 只有 10 分鐘（GitHub Pages 預設 `max-age=600`），通常已過期。

| 情境（390 px，時間為首頁出現後） | poster 背景 | 完整 poster | canvas 就緒 | 下載 |
|---|---:|---:|---:|---|
| 一般重新整理（快取有效），Fast 3G，100% | +68 ms | +68 ms | +434 ms | 只有 HTML（304） |
| **改版後，100%，Fast 3G** | **+2,192 ms** | **+3,375 ms** | **+4,505 ms** | 797 KB（素材 531 KB、Pixi 220 KB） |
| 改版後，HTTP cache 也已清空，0%，Fast 3G | +3,767 ms | +3,767 ms | +4,712 ms | 674 KB |

### 4.2 狀態第一次改變時

- runtime 每次只載入目前狀態需要的圖片（`pixiSceneRuntime.js` 的 `render()`，`assetManifest.js` 的 `getWorkspaceSceneAssets`），沒有任何預載。這符合技術設計 §12.1「只載入目前的 scene bundle」。
- 量測：Fast 3G 下完成 Main Quest，專案 75% → 100%。
  - 背景與既有家具立刻從快取出現；新圖片的載入時間：雙螢幕 549 ms、主角 celebrate 952 ms、Companion congratulate 1,006 ms、盆栽 1,040 ms；canvas 在 +1,046 ms 才畫出新狀態。沒有限速時是 65–73 ms。
  - reveal 結束後，Companion 的 approach 圖又等了 389 ms。
  - **這段時間 canvas 顯示的是 75% 的舊房間，文字已經是 100%**：runtime 把保留的 canvas 先接到新的 host，再等新圖片載入後重畫（`mount()` 中 `host.appendChild(app.canvas)` 在 `await render()` 之前）。canvas 的 host 疊在 poster 之上（`z-index: 90`），所以蓋住了新狀態的 poster。major reveal 的 6 秒計時也已經開始。
- 每張新圖片在每個版本下載一次（SW 快取），在每次開啟 app 後也要重新解碼一次（Pixi 快取只在記憶體）。

### 4.3 legacy 圖片的 precache

- SHELL 中只有兩張圖片，都是 legacy idle window 的：`office-angle-center-v2.png`（1,971,296 bytes）與 `building-protagonist-idle-1.png`（16,400 bytes）。它們是 V2 早期 placeholder 使用時加入的；V2 7/31 改用 `building-formal-workstation-room-v2.webp` 後，SHELL 沒有跟著更新。
- 現在只有 legacy（回退用的 flag）會顯示它們，但每次改版 service worker 安裝都要下載 1.94 MB。Fast 3G 下光這兩張就要約 10 秒，和首頁的請求搶頻寬。

### 4.4 每次進入「空間」都重建 Pixi app

- 首頁的 cleanup 以 `setTimeout(0)` 排程銷毀 runtime（`home.js` → `orbitWindowRuntimeDestroyer.schedule()`）。router 接著 `await` lazy route 的 import，計時器在「空間」頁呼叫 `retain()` 之前就觸發，所以每次首頁 → 空間都重新建立 WebGL context。
- 圖片快取保留，所以沒有網路成本，畫面上也被 poster 蓋住；成本是 WebGL 初始化（手機上可能數十到數百 ms 的主執行緒時間），而且違背 runtime 共用的設計。

## 5. 方案

| 方案 | 解決 | 成本與風險 |
|---|---|---|
| **A. 修正 SHELL** | §4.3；改版後的 poster（§4.1 的一半） | 改 service worker precache，**屬部署行為，需核准**。legacy 失去離線背景（legacy 只用於回退）。 |
| B. 跨版本的長期素材快取（以 `manifest.json` 的 `sha256` 為 key，activate 時保留、依目前 manifest 清理） | §4.1 全部 | 最複雜；改 service worker 與部署語意，需核准。素材會在同一個檔名下重新渲染，必須以內容為 key。 |
| C. 就緒後在閒置時預熱下一步的圖片（`pixi.Assets.load`） | §4.2 | 每個版本多下載 0.2–0.4 MB；與技術設計 §12.1 衝突，需要改文件（產品決定，不是部署）。 |
| D. runtime 小修正 | §4.2 的「顯示舊房間」、§4.4 | 低風險，不動 service worker。 |

### A 的範圍選項

| 選項 | SHELL 中的 V2 檔案 | 大小 | 改版後 |
|---|---|---:|---|
| A1 | 首屏 4 個：背景、主角 idle（朝左）、Companion observe、晴天特效 | 182,283 bytes | 預設角色狀態、專案 0% 時 poster 立刻完整；家具仍要下載 |
| **A2（建議）** | A1 ＋ 8 件家具 | 558,930 bytes | 任何進度的背景與家具立刻完整。主角或 Companion 不是預設狀態時，該角色圖仍要下載（每張 42–48 KB） |
| A3 | A2 ＋ 主角其他 4 個動作（celebrate、inspect、rest、work，朝左）＋ Companion 其他 5 個狀態 ＋ 雨天特效 | 987,645 bytes | 程式碼會產生、或已儲存的 state 可能帶有的所有 poster 狀態都立刻完整 |
| ＋P（附加，可與 A1–A3 任一個並用） | 另外加入 `vendor/pixi.js` | ＋796,970 bytes（gzip 約 225 KB） | 只省掉 Pixi 的下載時間。canvas 仍要解析 Pixi、建立 WebGL、解碼圖片、建立場景：快取有效時量到 +434 ms，期間由 poster 頂著 |

- 角色狀態的來源：主角由 `viewModels.selectProtagonistState()` 決定（idle、celebrate、inspect、rest、work），Companion 由 `companionEngine.js` 決定（observe、approach、congratulate、rest、work、remind）。動量 strong 時主角是 work、今天有恢復 Session 時是 rest，所以非預設狀態並不少見。天氣存在 V2 state 中：沒有程式碼寫入 `rain`，但 `stateSchema.js` 接受已儲存的 `rain`，所以 A3 也放入雨天特效（31,582 bytes）。朝右與 `walk` 既不儲存、也不會由程式碼推導出來，不列入。
- A1–A3 都比現在的 1,987,696 bytes 小：A2 每次改版少下載約 1.43 MB，A3 約 1.00 MB。
- 技術設計 §12.2 允許 precache「離線 shell 需要的 stateful fallback 素材」，但也說不要把所有全解析度的場景圖放進 SHELL，並要求 service worker 快取策略的變更先取得核准。poster 是 V2 的 fallback，所以 A1／A2 符合。A3 放入 manifest 29 個檔案中的 22 個，接近「全部」，選 A3 時要一併修改 §12.2 的文字。
- Pixi 不是 fallback，§12.1 也要求首頁初始 HTML 不下載 Pixi。＋P 雖然是在 service worker 安裝時下載，效果又只有省掉下載時間，所以不建議。
- PS-243 的首屏預算不受影響（不改首屏載入的檔案）。

### C 的範圍

- 只在第一次 canvas 就緒、瀏覽器閒置、`navigator.connection.saveData` 不是 true、連線不是 2g 時執行。
- 這是盡力而為的改善，不是保證：預熱還沒完成時就發生的狀態改變（例如一開 app 就完成 Main Quest），仍和現在一樣要等新圖片下載；預熱完成之後的狀態改變才不必等。
- 只載入目前狀態「下一步」可能用到的：下一個專案階段新增的家具、主角 celebrate、Companion congratulate／approach。全部可達的狀態約 0.77 MB，不全部載入。
- 實作用 `pixi.Assets.load()`，由閒置時的工作呼叫，runtime 保留它的 promise 作為「預熱完成」的訊號。不用 `Assets.backgroundLoad()`：vendored 版本只把圖片排入背景佇列就 resolve，無法知道何時下載與解碼完成。
- 預熱的圖片會解碼並留在 Pixi 的記憶體快取（每張 6–130 KB 的 PNG，解碼後依尺寸佔用更多記憶體），與目前狀態已載入的圖片相同處理，不另外釋放。
- 不影響首屏預算；deferred JS 預算還有 29.7 KB 空間，預熱的程式碼不到 1 KB。

## 6. 建議與拆分

1. **PS-211 改寫範圍**：「同一次使用中切頁的等待」已解決（§3 的量測為證）；剩下的工作改為改版後的素材連續性與狀態切換。
2. **PS-211A（建議 A2）**：SHELL 移除兩張 legacy 圖片，加入 V2 首屏 4 個檔案與 8 件家具。改版後角色不是預設狀態時，角色圖仍要下載；要連角色都保證完整就選 A3。路徑由測試對照 `assetManifest.js`，避免素材改名時 SHELL 漏改（這次 legacy 圖片在 V2 換掉之後留了近三個月）。patch。
3. **PS-211B（建議）**：
   - runtime 把 canvas 接到新的 host 後，新場景畫完之前先隱藏 canvas，畫面維持新狀態的 poster；
   - 首頁 → 空間時不再銷毀重建 Pixi app（例如延長銷毀的延遲，或在 lazy import 前保留 runtime）。
   - 只改 runtime，不動 service worker。patch。
4. **PS-211C（可選）**：依 §5 C 的範圍預熱；同時把技術設計 §12.1 改成「首屏只載入目前的 scene bundle；就緒後可在閒置時預熱下一步的少數素材」。patch。
5. **方案 B 暫不做**：在 Backlog 記錄，等素材穩定、改版頻率下降後再評估。

順序：B（風險最低）→ A → C。

## 7. 需要使用者決定

1. 是否同意改寫 PS-211 的範圍（§6 第 1 點）。
2. PS-211A：是否核准修改 service worker precache；範圍選 A1、**A2（建議）**、A3（並修改技術設計 §12.2），或不做；另外是否加上 ＋P（`pixi.js`，不建議）。
3. PS-211B：是否排入（建議排入）。
4. PS-211C：是否排入，並同意修改技術設計 §12.1。
5. 方案 B 是否同意暫緩。

## 8. 驗收條件草稿（核准後寫入 tasks.md）

- **PS-211A**
  - SHELL 不含 `assets/personal-space/idle-window/` 下的任何檔案；含所選的 V2 檔案，路徑由單元測試對照 `assetManifest.js` 與 `docs/ps243/asset-baseline.json`。
  - e2e：service worker 安裝後，快取中有這些檔案；離線重新整理時，所選範圍內的 poster 完整顯示（A2：預設角色狀態、任何進度；A3：程式碼會產生或 state 可能帶有的任何狀態，含雨天）。
  - legacy 在線上仍可正常顯示（執行時 cache-first）。
- **PS-211B**
  - 單元測試：新場景的圖片載入完成前，canvas 不可見；完成後才加上 `is-runtime-ready`。
  - 首頁 → 空間 → 首頁的過程中，Pixi `Application` 只建立一次（以假的 Pixi 計數）。
  - 既有的 runtime lifecycle、context lost／restored 測試通過。
- **PS-211C**
  - 第一次就緒後的閒置時間才開始預熱；`saveData` 或 2g 時不預熱；只載入 §5 C 列出的圖片。
  - 預熱完成後（測試先等 runtime 的預熱完成 promise，也就是 `Assets.load()` 的 promise）才觸發 75% → 100% 的 reveal：Fast 3G 下新圖片在 reveal 開始時已在快取中，不發出新的圖片請求（量測方式同 §2）。
  - 預熱尚未完成時觸發 reveal：行為與現在相同（圖片照常下載、畫面照常更新），不多等、不出錯。
  - 技術設計 §12.1 更新。
- 全部：lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。

## 附錄：其他發現（不在本提案範圍）

- `docs/ps-243-production-acceptance.md` 的預算表與 `pwa/assets/personal-space/v2/README.md` 仍是 PS-244 之前量到的數字（首屏 259,133、完整 1,766,935 bytes）；目前 `docs/ps243/asset-baseline.json` 是 182,283 與 1,293,693 bytes。前者是當時的驗收紀錄，是否更新由使用者決定。
- `pwa/server.cjs`（本機 dev server）沒有 `.webp` 的 MIME，背景以 `text/plain` 回傳；瀏覽器仍能顯示，只影響本機。
- `manifest.json` 中有 8 個檔案（337,630 bytes）目前沒有程式碼會產生對應的狀態：主角朝右的姿勢、`walk`、`rain`。其中 `rain` 是 `stateSchema.js` 接受的已儲存狀態，所以列入 A3；其餘 7 個既不儲存也不會被推導出來。`building-formal-workstation-room-v1.webp`（159,396 bytes）沒有任何地方引用。
- `tests/unit/serviceWorkerShell.test.js` 只檢查字面的動態 import，所以 `pixiSceneRuntime.js` 以變數 import 的 `vendor/pixi.js` 不會被要求列入 SHELL（目前是刻意不列）。
