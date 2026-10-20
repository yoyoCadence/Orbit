# PS-248 提案：以 Blender 擴充「空間」的主題與素材

> 狀態：提案（Mode A，只有文件）。核准前不渲染、不改程式碼。核准後每個階段各自成為一個任務（PS-248A／B／C），各有自己的驗收條件。

使用者 2026-10-20 的要求：「需要更新更多 blender 做的主題與素材等，讓本工具更豐富」。

## 1. 結論

建議分三個階段，每階段一個 PR，前一階段上線後再決定下一階段：

- **PS-248A 夜晚版本的工作站**（建議先做）：
  - 現況：房間與 8 件家具都在 Blender 中以「從右側落地窗射入的低角度暖色太陽」渲染。地板與地毯上烘有窗格形狀的陽光，家具帶著長影子。夜晚只在上面疊一層深藍色（Pixi alpha 0.2，poster 約 0.22–0.34），所以**夜晚仍看得到陽光**，這是既有的不一致。
  - 做法：同一個場景、同一個相機，關掉太陽，打開既有的 4 盞壁燈、檯燈與螢幕，窗外換成夜景（建築窗燈），重新渲染房間與 8 件家具一套「夜晚版本」。
  - 早晨、白天、傍晚沿用現有的白天版本（低角度暖光適合三者）與既有的色層；夜晚改用夜晚版本，並拿掉或減弱夜晚的程式色層，避免變暗兩次。
  - 在 art bible §6.1 與 asset pipeline「Vertical Slice Asset Budget」的「日、夜兩種光線」之內，不需要拆窗。
  - 代價：一次完整渲染（約 30–50 分鐘）、約 +460 KB 的 SHELL 下載。家具沿用白天的裁切框，位置不變。
- **PS-248A2 窗外景色依時段變化**（可選，不建議現在做）：把窗外天際線拆成獨立圖層，早晨、傍晚各換一張。要另做窗戶遮罩，而且超出 asset pipeline「一張 exterior／window background」的上限（§4.2）。
- **PS-248B 一套新的「房間風格」**：
  - 同一個房間、同一個相機、同樣的家具造型與燈光，只換材質與色票，重新渲染房間與 8 件家具。
  - 改叫「房間風格」，避免與 app 既有的 UI 主題功能（設定頁的主題卡片）混淆。
  - 要新增選擇介面，寫入既有的 `world.selectedThemeId`（目前只存不讀），以及決定取得方式（§5）。
  - 若 PS-248A 已做，每套風格也要有夜晚版本，所以成本是兩套渲染。
- **PS-248C 少量裝飾小物**：
  - 2–4 件新的 Blender 裝飾，例如窗台小盆栽、書架上的獎盃。地毯與書架上的書已經存在；後牆空白處保留給 HW-105 成就相框（PS-245 的決定）。
  - 由 AI-202B 推導的關係階段或 Main Quest 天數解鎖，讓長期投入在房間裡看得見。
  - 依賴 AI-202B：兩種條件都需要 AI-202B 的推導（§4.4）。
- **不在範圍內**：
  - 新的房間或新相機（art bible §8 要求新相機另做美術成本決策；asset pipeline 的擴充前提也禁止）；
  - 3D runtime（vertical slice 非目標）；
  - 角色與天氣特效。角色與天氣是 PS-242 以影像生成製作，不是 Blender；角色 3D 化仍是待使用者決定的開放事項。
- **風格與裝飾都不寫入 reward ledger，也不新增 `world_unlock`**。解鎖由現有資料推導、只用於顯示，所以不碰 AI-202 發現的「舊版分頁撤銷新 entry」問題。只要不搭配 reveal 顯示，也不碰 BUG-113（`world_unlock` 一律被當成專案完成）；若要在 reveal 中提到，見 §4.4。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| Blender 產出 | `art-pipeline/ps244-blender/` | 房間背景 1 張（`building-formal-workstation-room-v2.webp`，82,546 B）與家具 8 件，合計 459,193 B。全部由程式產生，沒有外部模型或貼圖；`bpy 5.2.2`、Cycles CPU |
| 光線 | `scene.py` `build_lighting()`；`render_pack.py`；`process_pack.py` | 暖色太陽（`SUN`，色 `(1, .86, .68)`）從右牆的落地窗以低角度射入；另有不投影的補光與 4 盞壁燈。房間與家具都在太陽下渲染，家具以房間表面接收陰影，所以**陽光與長影子烘在圖裡** |
| 非 Blender 產出 | `art-pipeline/ps242/model-manifest.json` | 主角 12 張、Companion 6 張、天氣 2 張，由影像生成（`openai-built-in-imagegen`）製作再去背 |
| 相機 | `scene.py` `CAMERA`；`assetManifest.js` | 一個固定相機 `building-workspace-v2`，以 1.7 m 假人校準角色比例；art bible §4.1 只允許一個視角 |
| 窗外景色 | `scene.py` `build_room()` | 右牆整面落地窗，只有窗框、沒有玻璃。天際線（天空漸層＋18 棟建築）是獨立的 `outside` 群組，不投影、不描邊，但**烘進房間背景**，只有白天一種；天空材質是自發光（強度 1.6），也照亮房間 |
| 時段 | `viewModels.js`（`timeBand.js`，HW-111）；`ui/orbitWindow.js`、`style.css`；`runtime/pixiSceneRuntime.js` | 時段在每次 render 時計算（`getTimeBand(now)`），沒有計時器即時切換。poster 依 4 個時段套用 CSS 光線層（早晨、傍晚、夜晚各有漸層，白天不加色）；Pixi 只分夜晚（`0x172449`，alpha 0.2）與非夜晚（`0xf6d58b`，alpha 0.05）。兩者的光線層都在天氣之上（poster z 70 > 68；Pixi 80 > 72）。`pwa/assets/personal-space/v2/README.md` 明訂「日夜維持程式產生的光線層」 |
| 主題 | `stateSchema.js`、`viewModels.js` | `world.selectedThemeId: 'default'` 只儲存、傳遞，沒有程式依它選素材；migration 可能留下 legacy 值（例如測試中的 `'night'`）。V2 Edit Mode 沒有任何選單 |
| 場景 id | `stateSchema.js`、`unlockRules.js` | V2 的 `selectedSceneId` 預設 `rough-room`，只用於 telemetry。`rough-room` 等 id 是 legacy 頁面依等級切換的場景 |
| 素材與程式的耦合 | `assetManifest.js`、`process_pack.py`、`build-manifest.mjs`、`sw.js`、測試 | 都假設只有一套：`process_pack.py` 寫死輸出路徑、每次都讀房間與 8 件家具的原始渲染，並以 regex 改寫 `PROP_DEFINITIONS`；`build-manifest.mjs` 把 `/workspace/backgrounds/` 下的任何檔案都標成同一個房間 id，不認得的家具路徑與 lossless WebP 則直接拋錯；`ps211aPrecache.test.js` 要求 SHELL 與 poster 可能顯示的圖片完全一致 |
| 經濟 | `v2/rewardRules.js`；vertical slice §4.4 | Main Quest 每天 100 Gold，但 V2 **沒有任何花費途徑**。要加購買，必須先替 request-only 的商店訂出可撤銷的結算規則 |
| 預算 | `docs/ps243/asset-baseline.json`；vertical slice §10 | 完整素材 1,293,693 B／目標 4 MB；首次繪製 182,283 B／目標 1.5 MB；延遲載入的 JS gzip 278,410 B／上限 300 KB（只剩約 28 KB） |
| 快取 | `sw.js`；technical design §12.2 | SHELL 放 poster 可能顯示的全部 22 張圖片與 `pixi.js`（PS-211A），以 `cache: 'no-cache'` 安裝。不在 SHELL 的圖片按需快取，每次改版都會清掉 |
| 渲染成本 | `art-pipeline/ps244-blender/README.md` | 完整一套（房間＋8 件）在 4 核 CPU 上約 30–50 分鐘；重渲染不是逐位元相同（家具位置可能差 1 px）；原始渲染不進 git；CI 不渲染 |
| 擴充的前提 | asset pipeline 文件；product spec §3.2 原則 8 | Vertical slice 的第一套素材上限是「一張房間背景、一張 exterior／window background、日夜光線、8–12 件家具……」；「首頁 → Session → 世界的迴圈通過產品與效能驗證前，不擴充 Survival／Mastery 房間、不大量產生家具」；「先證明一個房間，再做世界規模的內容」。PS-243 的實機檢查仍未完成 |

## 3. 「主題」可以是什麼

| 類型 | 內容 | 成本 | 與規則的關係 |
|---|---|---|---|
| **夜晚版本**（A） | 同一房間與家具，太陽關掉、室內燈打開、窗外夜景 | 中：一次完整渲染（約 30–50 分鐘）＋約 460 KB | 在 vertical slice 的「日夜光線」之內；但它是完整重渲染而不是疊加的光線層，與 README 的現行契約不同（§9 第 4 點） |
| 窗外時段（A2） | 窗外換成早晨、傍晚 | 低到中：要窗戶遮罩與每張窗外的渲染 | 符合 art bible §7.2「窗外可分離」；但超出「一張 exterior」的上限 |
| **房間風格**（B） | 同一房間、家具造型與燈光，換材質與色票 | 中：每套約 30–50 分鐘渲染＋約 460 KB；有夜晚版本時加倍 | 同一相機，不需新的美術成本決策；但是「一張房間背景」之外的第二種外觀，需確認不違反擴充前提（§9 第 2 點） |
| **裝飾小物**（C） | 新增少量固定位置的裝飾 | 每件幾分鐘渲染；要決定位置與遮擋 | asset pipeline 偏好「每個 milestone 加入或升級具名的物件」；不可大量產生；家具總數仍在 8–12 件之內 |
| 新房間或新相機 | Survival／Mastery 房間、不同視角 | 高：新相機要重新校準角色比例、所有位置與相框 | art bible §8 要求新相機另做美術成本決策；擴充前提明確禁止 |
| 角色或天氣 | 主角、Companion、雨與光點 | 不是 Blender 產出 | 角色 3D 化是另一個開放決策（handoff） |

## 4. 各階段內容

### 4.1 PS-248A：夜晚版本的工作站

- Blender：
  - `scene.py` 的光線由參數決定（例如 `--lighting day|night`），幾何、相機與家具造型不變。
  - 夜晚：關掉太陽；4 盞壁燈、檯燈與螢幕亮起；天空材質改為深藍漸層，建築窗戶自發光；補光減弱。
  - 家具依專案階段出現（例如檯燈從 50% 起），所以房間背景只能烘入固定燈具（壁燈、窗外）的光。檯燈與螢幕的光只烘在它們自己的圖裡；照到地板或牆上的光暈若要呈現，要做成該家具圖的一部分，並在預覽圖中確認沒有家具時房間不會出現「沒有來源的光」。
  - `render_pack.py`／`process_pack.py` 加上同樣的參數，輸出到新的檔名（例如 `…-night.webp`、`props/…-night.png`）。
  - **夜晚家具沿用白天的裁切框**，所以位置與 `PROP_DEFINITIONS` 完全相同，日夜切換時家具不會跳動。要逐件確認夜晚的燈光與陰影沒有超出白天的框。
- 執行時：
  - `getWorkspaceSceneAssets()` 多一個時段參數；夜晚回傳夜晚版本的房間與家具，其他時段回傳現有的白天版本。Pixi 與 poster 用**同一個**時段值。
  - 夜晚版本已經是暗的，所以夜晚的程式色層要拿掉或大幅減弱，否則會變暗兩次。早晨與傍晚的色層不變。
  - 順帶讓 Pixi 的光線層使用與 poster 相同的 4 個時段（現在只分夜晚與非夜晚）。這只是程式色層，不需要新素材。
  - 時段仍在每次 render 時計算：跨過 21:00 或 05:00 時，下一次 render（開啟頁面或狀態改變）才換版本。不新增計時器（INFRA-106／PS-249 的教訓）。
  - 只換現有 `<img>` 與 sprite 的來源，不新增 DOM 結構或 CSS class，所以 INFRA-105 的「舊 CSS 配新 JS」不會讓畫面壞掉。
- 契約更新：`pwa/assets/personal-space/v2/README.md`「日夜維持程式產生的光線層」改為「白天與夜晚各有一套 Blender 渲染，早晨與傍晚以程式色層調整」。art bible §6.1 列的是「日、夜光線疊層」，夜晚版本是完整重渲染，要一併說明。
- 不改：角色、天氣特效、家具位置、相框位置、ledger、`rulesetId`、圖層順序。

### 4.2 PS-248A2：窗外景色依時段變化（可選）

只有在使用者想要「早晨、傍晚的窗外也不同」時才做。技術上要處理：

- 窗戶沒有玻璃，房間渲染的空白處與窗洞一樣是透明的，而 `process_pack.py` 會把背景色填滿所有透明處。要另外輸出窗戶遮罩（例如只渲染 `outside`、房間設為 holdout），才知道哪裡該露出窗外。
- `outside` 若以 `hide_render` 隱藏，天空的自發光就不再照亮房間，房間的樣子會改變；要改用「相機看不到、但仍發光」（`visible_camera = False`）。
- 窗外圖放在房間之下（房間的窗洞透明）。這與 art bible §7 的圖層順序（窗外在房間殼之上）不同，但效果相同，要在文件中說明。
- `build-manifest.mjs` 要新增窗外圖的分類；窗外圖要用有 alpha 的 lossy WebP（lossless WebP 目前會拋錯）。
- 超出 asset pipeline「一張 exterior／window background」的上限，需要使用者明確同意並更新該文件。
- 若 PS-248A 已做，A2 只需要早晨、傍晚兩張（白天與夜晚已烘在各自的房間裡），但兩張房間圖都要改成窗洞透明。

### 4.3 PS-248B：一套「房間風格」

- 候選（擇一，由使用者選）：
  - **明亮北歐**：淺橡木、白、鼠尾草綠。
  - 夜貓工作室：深藍、霓虹強調色。若 PS-248A 已做，與夜晚版本的感覺部分重疊。
  - 深木書房：深木、墨綠、金。**這是 art bible §5 保留給 Mastery 階段的色票**，在 Building 階段免費提供會稀釋未來的階段獎勵，不建議。
- 做法：
  - `scene.py` 的材質由「風格設定」決定，幾何、相機、家具造型與燈光不變。燈光不變，所以陰影與裁切框也不變；家具沿用預設風格的裁切框，位置相同。
  - `render_pack.py`／`process_pack.py` 加上 `--style`，輸出到各風格自己的路徑；
  - `assetManifest.js` 改為風格登錄表，`getWorkspaceSceneAssets()` 多一個風格參數；
  - `build-manifest.mjs` 與預算計算改為逐風格。
- 選擇：
  - 完整頁面的 Edit Mode 加上風格選擇，寫入既有的 `world.selectedThemeId`。不新增欄位；V2 state 只存在本機。
  - 不認得的 id（包括 migration 留下的 legacy 值）一律退回預設風格。
  - 舊版分頁不讀 `selectedThemeId`，所以不會改壞它。
- 若 PS-248A 已做，每套風格要有白天與夜晚兩套，成本加倍。
- 快取：選項見 §6。

### 4.4 PS-248C：少量裝飾小物

- 2–4 件，固定位置，由 `scene.py` 建模，與現有家具同樣處理陰影與遮擋（PS-247 的作法）。若 PS-248A 已做，每件也要有夜晚版本。
- 解鎖條件由現有資料推導，例如 AI-202 的 `partner`／`trusted-companion`，或 Main Quest 天數。只用於顯示，不寫入 ledger。
  - 必須使用 AI-202B 由 active ledger 推導的階段，不可讀儲存的 `companion.relationshipStage`：舊版分頁會留下過時的值（AI-202 提案 §3.3）。
  - 「Main Quest 天數」同樣需要 AI-202B 的推導，所以兩種條件都依賴 AI-202B。
- 撤銷：條件由 active ledger 推導，所以撤銷 Main Quest 讓天數或階段下降時，裝飾會跟著消失。這與 AI-202 對階段下降的處理一致。若希望「出現過就保留」，就要新增本機欄位，需另行核准。
- 通知（product spec §3.2 原則 2 要求來源與意義清楚）：
  - **N1（建議）**：不另做 reveal，裝飾安靜地出現；完整頁面的說明列出「到 `partner` 會出現什麼」。完全不依賴 BUG-113。
  - N2：在 AI-202 的關係階段 reveal 中一併提到。這依賴 AI-202B 的 reveal 與 BUG-113 的修正。

## 5. 風格與裝飾怎麼取得（PS-248B、C）

| 選項 | 說明 | 評估 |
|---|---|---|
| **O1（建議 B）免費選擇** | Edit Mode 中隨時切換 | 最簡單；不碰經濟與 ledger。風格是表達，不是獎勵 |
| **O2（建議 C）由現有資料推導解鎖** | 例如到 `partner` 解鎖。每次 render 由 AI-202B 推導的階段或 Main Quest 天數判斷，只決定「能不能選」與「是否顯示」 | 讓長期投入在房間裡看得見（AGENTS.md §9「讓成長在世界中可見」）。不寫入 ledger，所以舊版分頁不受影響；通知方式見 §4.4 |
| O3 用 Gold 購買 | V2 的 Gold 第一次有用途 | 必須先替商店訂出冪等、可撤銷的結算規則（vertical slice §4.4、§17）。範圍大，另立任務 |
| O4 Pro 專屬 | 付費價值 | 純顯示上的鎖可以只在 client 判斷（PRO-014F 允許；設定頁的 UI 主題已有 Pro 鎖）。但 Pro entitlement 尚未切換（PRO-014H 被 PRO-014L／P 擋住），素材本身也是公開的靜態檔案。不建議現在做 |

## 6. 快取與預算

- 原則：依 PS-211A 已核准的規則，poster 可能顯示的圖片都要在 SHELL。`ps211aPrecache.test.js` 沿著 `getWorkspaceSceneAssets()` 的每個輸入推導這組圖片，目前只走過進度、角色狀態、Companion 狀態與天氣，並以精確相等比對 SHELL。所以**每新增一個輸入維度，測試就要逐一走過它**，否則新圖片不會被要求進 SHELL，或多放的圖片會讓測試失敗：
  - PS-248A：走過 `TIME_BANDS`（或日、夜兩種版本）。
  - PS-248B：走過登錄表中的每個風格 id。
  - PS-248C：走過解鎖條件的每個值（每個關係階段或天數門檻）。
- 各階段：
  - PS-248A：9 張夜晚圖片都進 SHELL，約 +460 KB 的安裝下載。完整素材約 1.75 MB，仍低於 4 MB。首次繪製只載入其中一套，以日夜中較大的一組計算。
  - PS-248A2：窗外圖都進 SHELL。
  - PS-248B 的選項：
    - **S1（建議）所有風格都進 SHELL**：每套約 +460 KB（有夜晚版本時約 +920 KB）。只有 1–2 套時，換來的是離線與改版後 poster 一定完整；`sw.js` 的規則不變，但測試要如上逐風格推導。
    - S2 只預先快取預設風格，其他風格按需快取；離線缺圖時退回預設風格的圖片。安裝較小，但要改 `sw.js` 的規則與測試（部署行為，需另行核准）。
  - PS-248C：解鎖後 poster 會顯示，所以都進 SHELL。
- 改版與舊版分頁：
  - 同一次改版**不刪除也不改名**上一版 `assetManifest.js` 會要求的檔案，也不以同名覆蓋成不同內容。仍在執行舊版的分頁會向新版的 service worker 要舊檔名；INFRA-105 已記錄這個風險。
  - 新素材一律用新檔名；白天版本的檔案不變。
- 延遲載入的 JS 只剩約 28 KB 的空間：登錄表與時段參數只增加少量程式碼，驗收時要確認 `ps243` 的 JS 預算仍通過。

## 7. 管線與工作量

- 渲染環境：`/tmp/bpyenv`（`bpy 5.2.2`，約 1.1 GB）只存在於目前的容器；新容器要依 README 重新安裝。CI 不渲染，只檢查提交的結果。
- 預估（4 核 CPU）：
  - PS-248A：一次完整渲染（約 30–50 分鐘）。`process_pack.py` 要能只處理夜晚版本並沿用白天的裁切框，否則白天的家具位置也會被重新計算。
  - PS-248A2：房間的窗洞與遮罩各重新渲染一次（新容器沒有原始渲染，要完整重渲染或新增只渲染房間的模式）＋每張窗外數分鐘。
  - PS-248B：每套風格約 30–50 分鐘，有夜晚版本時加倍。
  - PS-248C：每件數分鐘，加上夜晚版本。
- 每次加入新素材，下列精確值都要一起更新：
  - `npm run ps242:manifest`、`npm run ps243:assets` 的基準與 `ps243AssetBudget.test.js`；
  - `ps211aPrecache.test.js`（22 張）、`tests/e2e/sw-precache.test.js`（23 個）；
  - `personalSpaceOrbitWindow.test.js`（首次繪製 4 張、manifest 29 張）、`ps242AssetManifest.test.js`（29 張）；
  - `ps244WorkspacePlacements.test.js`（背景必須等於 `placements.background`）；
  - technical design §12.2 的「22 of 29」。
- 版本：新增視覺功能依 AGENTS.md §14 用 `npm run bump -- minor`（PS-244 為 1.29.0、PS-245 為 1.30.0）。
- 視覺驗收：
  - 每個階段提交預覽圖：PS-248A 為日、夜 × 進度 0／100；PS-248B 為 5 個進度階段（有夜晚版本時加上夜晚）。
  - **由使用者看過預覽圖再合併**：美術方向是使用者的決定，PS-244 也是先核准方向。

## 8. 驗收條件草稿（PS-248A，核准後寫入 tasks.md）

- Blender：
  - `scene.py` 以參數產生日、夜兩種光線，幾何與相機不變；
  - 夜晚家具沿用白天的裁切框，`PROP_DEFINITIONS` 與 `placements` 不變；
  - README 記錄指令與渲染時間；
  - 預覽圖涵蓋日、夜 × 進度 0／100。
- 執行時：
  - 首頁小卡（Pixi 與 poster）與完整頁面，在同一個時段顯示同一套版本；用注入的時間測試 4 個時段，與機器時間無關。
  - 夜晚不再看得到陽光，也沒有變暗兩次；早晨、傍晚的色層與現在相同。
  - Pixi 的光線層與 poster 使用相同的 4 個時段。
  - 日夜切換時家具、角色、相框位置不變；圖層順序不變（光線層仍在天氣之上，與現在相同）。
- 快取：
  - 夜晚圖片都在 SHELL，`ps211aPrecache.test.js` 走過時段並通過；
  - 離線 e2e 中，日、夜的 poster 都完整（`naturalWidth > 0`）。
- 相容：
  - 上一版 `assetManifest.js` 會要求的檔案仍存在且內容不變；
  - 舊版分頁不受影響（它只要白天版本）；
  - 不新增 DOM 結構或 CSS class。
- 檢查：
  - `ps242:manifest -- --check`、`ps243:assets -- --check`、lint、test、e2e 通過；
  - 首次繪製與完整素材在預算內；延遲載入的 JS 在 300 KB 內。
- 版本：`npm run bump -- minor`。

## 9. 需要使用者決定

1. **範圍**：「本工具」是否就是「空間」分頁？角色與天氣特效（非 Blender）不在本提案範圍，可以嗎？B 改稱「房間風格」，避免與 UI 主題混淆，可以嗎？
2. **擴充前提**：asset pipeline 文件與 product spec 原則 8 要求先通過驗證再擴充內容，PS-243 的實機檢查仍未完成。
   - PS-248A 在 vertical slice 的「日夜光線」之內，建議直接進行。
   - PS-248B 是「一張房間背景」之外的第二種外觀，PS-248A2 超出「一張 exterior」的上限。這兩項是否同意放寬上限（並更新 asset pipeline 文件），或等 PS-243 完成？
   - PS-248C 的家具總數仍在 8–12 件之內。
3. **階段與順序**：A → B → C（建議）。或只做 A、只做 B。A2 是否要做？
4. **PS-248A 的做法**：
   - **夜晚版本**（建議）：同意以完整重渲染取代「日夜維持程式光線層」的現行契約；
   - 夜晚版本＋A2 窗外時段；
   - 只拆窗外、不重渲染房間（最便宜，但夜晚仍有陽光；做之前先給預覽圖）；
   - 維持現狀。
5. **PS-248B 的風格**：明亮北歐（建議）、夜貓工作室、深木書房（Mastery 色票，不建議），或其他。
6. **取得方式**：B 免費選擇（建議）；C 由 AI-202B 推導的關係階段或 Main Quest 天數解鎖（建議），撤銷時跟著消失，通知採 N1 安靜出現（建議）或 N2。Gold 購買與 Pro 專屬都需要另立大型任務。
7. **PS-248B 的快取**：S1 所有風格進 SHELL（建議）／S2 只預先快取預設風格（需改 `sw.js` 規則）。
8. **順帶整理**（可放在 PS-248A）：
   - 刪除未被引用的 `building-formal-workstation-room-v1.webp`（159 KB；v1.29.0 的 PS-244 起就不再使用，上一版 v1.31.7 的 `assetManifest.js` 也不要求它）；
   - 更新 `pwa/assets/personal-space/v2/README.md`（仍寫 259,133 B／1,766,935 B，現為 182,283 B／1,293,693 B）與 `docs/ps-243-production-acceptance.md` 中過時的預算數字；
   - 修正根目錄 `README.md`「25% 空間擴充 → 50% 家具 → 75% 風格 → 100% 全新主題」與實際的專案階段（`WORKSPACE_PROJECT_PHASES`，每階段加入具名家具）不符。
