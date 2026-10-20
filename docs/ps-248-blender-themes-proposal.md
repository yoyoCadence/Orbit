# PS-248 提案：以 Blender 擴充「空間」的主題與素材

> 狀態：提案（Mode A，只有文件）。核准前不渲染、不改程式碼。核准後每個階段各自成為一個任務（PS-248A／B／C），各有自己的驗收條件。

使用者 2026-10-20 的要求：「需要更新更多 blender 做的主題與素材等，讓本工具更豐富」。

## 1. 結論

建議分三個階段，每階段一個 PR，前一階段上線後再決定下一階段：

- **PS-248A 窗外景色依時段變化**（建議先做）：
  - 把 Blender 場景中已經獨立的窗外天際線（`outside` 群組）拆成單獨的圖層；
  - 為早晨、白天、傍晚、夜晚各渲染一張窗外景色；房間與 8 件家具不變。
  - 不需要選單：首頁小卡與完整頁面依同一個時段自動切換。順帶修正一個現有落差：靜態 poster 有 4 個時段，Pixi 場景只分「夜晚／非夜晚」兩種。
  - 符合 art bible §7.2「窗外景色應可分離……隨時間與天氣變化而不必重畫整個房間」，成本最低。
- **PS-248B 一套新的室內風格主題**：
  - 同一個房間、同一個相機、同樣的家具造型，換材質與色票重新渲染房間與 8 件家具，例如深木書房；
  - 角色比例校準與家具位置都不必重做。
  - 要新增主題選擇（`world.selectedThemeId` 目前只存不讀）與取得方式（§5）。
- **PS-248C 少量裝飾小物**：
  - 2–4 件新的 Blender 裝飾，例如書架上的書、地毯、牆上的作品；
  - 由 AI-202 的關係階段或 Main Quest 天數解鎖，讓長期投入在房間裡看得見。
  - 依賴 AI-202B。
- **不在範圍內**：
  - 新的房間或新相機（art bible 要求另做美術成本決策）；
  - 3D runtime（vertical slice 非目標）；
  - 角色與天氣特效。角色與天氣是 PS-242 以影像生成製作，不是 Blender；角色 3D 化仍是待使用者決定的開放事項。
- **主題不寫入 reward ledger，也不新增 `world_unlock`**。解鎖由現有資料推導、只用於顯示，所以不碰 AI-202 發現的「舊版分頁撤銷新 entry」問題與 BUG-113（`world_unlock` 一律被當成專案完成）。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| Blender 產出 | `art-pipeline/ps244-blender/` | 房間背景 1 張（`building-formal-workstation-room-v2.webp`，82,546 B）與家具 8 件，合計 459,193 B。全部由程式產生，沒有外部模型或貼圖；`bpy 5.2.2`、Cycles CPU |
| 非 Blender 產出 | `art-pipeline/ps242/model-manifest.json` | 主角 12 張、Companion 6 張、天氣 2 張，由影像生成（`openai-built-in-imagegen`）製作再去背 |
| 相機 | `scene.py` `CAMERA`；`assetManifest.js` | 一個固定相機 `building-workspace-v2`，以 1.7 m 假人校準角色比例；art bible §4.1 只允許一個視角 |
| 窗外景色 | `scene.py` `build_room()` | 右牆整面落地窗。天際線（天空漸層＋18 棟建築）是獨立的 `outside` 群組，但目前**烘進房間背景**，只有白天一種 |
| 時段 | `viewModels.js`（`timeBand.js`，HW-111）；`ui/orbitWindow.js`、`style.css`；`runtime/pixiSceneRuntime.js` | poster 依 4 個時段套用 CSS 光線層（早晨、傍晚、夜晚各有漸層，白天不加色）；Pixi 只分夜晚（`0x172449`，alpha 0.2）與非夜晚（`0xf6d58b`，alpha 0.05）。兩者都是程式產生的色層；`pwa/assets/personal-space/v2/README.md` 明訂「日夜維持程式產生的光線層，讓幾何一致、首次繪製小」 |
| 主題 | `stateSchema.js`、`viewModels.js` | `world.selectedThemeId: 'default'` 只儲存、傳遞，沒有程式依它選素材；V2 Edit Mode 沒有任何選單 |
| 場景 id | `stateSchema.js`、`unlockRules.js` | V2 的 `selectedSceneId` 預設 `rough-room`，只用於 telemetry。`rough-room` 等 id 是 legacy 頁面依等級切換的場景 |
| 素材與程式的耦合 | `assetManifest.js`、`process_pack.py`、`build-manifest.mjs`、`sw.js`、測試 | 都假設只有一套：`process_pack.py` 寫死輸出路徑並以 regex 改寫 `PROP_DEFINITIONS`；`build-manifest.mjs` 對不認得的路徑直接拋錯；`ps211aPrecache.test.js` 要求 SHELL 與 poster 可能顯示的圖片完全一致 |
| 經濟 | `v2/rewardRules.js`；vertical slice §4.4 | Main Quest 每天 100 Gold，但 V2 **沒有任何花費途徑**。要加購買，必須先替 request-only 的商店訂出可撤銷的結算規則 |
| 預算 | `docs/ps243/asset-baseline.json`；vertical slice §10 | 完整素材 1,293,693 B／目標 4 MB；首次繪製 182,283 B／目標 1.5 MB；延遲載入的 JS gzip 277,845 B／上限 300 KB（只剩約 29 KB） |
| 快取 | `sw.js`；technical design §12.2 | SHELL 放 poster 可能顯示的全部 22 張圖片與 `pixi.js`（PS-211A）。不在 SHELL 的圖片按需快取，每次改版都會清掉 |
| 渲染成本 | `art-pipeline/ps244-blender/README.md` | 完整一套（房間＋8 件）在 4 核 CPU 上約 30–50 分鐘；重渲染不是逐位元相同；原始渲染不進 git；CI 不渲染 |
| 擴充的前提 | asset pipeline 文件；product spec §3.2 原則 8 | 「首頁 → Session → 世界的迴圈通過產品與效能驗證前，不擴充 Survival／Mastery 房間、不大量產生家具」；「先證明一個房間，再做世界規模的內容」。PS-243 的實機檢查仍未完成 |

## 3. 「主題」可以是什麼

| 類型 | 內容 | 成本 | 與規則的關係 |
|---|---|---|---|
| **窗外景色**（A） | 同一房間，窗外換成早晨、白天、傍晚、夜晚；之後可加季節 | 低：房間重渲染一次（拆出窗外），每張窗外景色只渲染天空與建築 | 符合 art bible §7.2、§7.3（日夜共用幾何、不改透視） |
| **室內風格**（B） | 同一房間與家具造型，換材質、色票與燈光 | 中：每套約 30–50 分鐘渲染＋約 460 KB 素材 | 同一相機，不需新的美術成本決策；但是「一個房間的第二種外觀」，需確認不違反擴充前提（§9 第 2 點） |
| **裝飾小物**（C） | 新增少量固定位置的裝飾 | 每件幾分鐘渲染；要決定位置與遮擋 | art bible 偏好「每個 milestone 加入或升級具名的物件」；不可大量產生 |
| 新房間或新相機 | Survival／Mastery 房間、不同視角 | 高：新相機要重新校準角色比例、所有位置與相框 | art bible §4.1 要求另做美術成本決策；擴充前提明確禁止 |
| 角色或天氣 | 主角、Companion、雨與光點 | 不是 Blender 產出 | 角色 3D 化是另一個開放決策（handoff） |

## 4. 各階段內容

### 4.1 PS-248A：窗外景色依時段變化

- Blender：
  - 房間以「隱藏 `outside`、窗戶透明」重新渲染，窗戶區域在背景圖中成為透明（WebP 支援 alpha）；
  - 窗外景色以「只顯示 `outside`」渲染 4 張：早晨（淡藍、低角度暖光）、白天（現有天際線）、傍晚（橙紫、窗格亮燈）、夜晚（深藍、建築窗燈）。天空材質與建築燈光由參數決定，同一份 `scene.py`。
- 執行時：窗外景色是背景下面的一層，z 低於房間。
  - Pixi 與 poster 用**同一個**時段值選圖，Pixi 的光線層也改為與 poster 相同的 4 個時段。
  - 時段的來源沿用 HW-111 的 time band，不新增設定。
- 素材與預算：
  - 預估 4 張窗外景色合計 100–250 KB（大部分是漸層與色塊）；
  - 房間背景加上 alpha 後會變大一些；
  - 完整素材仍遠低於 4 MB。
- 快取：依 PS-211A 已核准的規則，poster 可能顯示的圖片都要在 SHELL，所以 4 張窗外景色都加入 SHELL。`ps211aPrecache.test.js` 目前只沿著進度、角色狀態、Companion 狀態與天氣推導（`getWorkspaceSceneAssets()` 沒有時段參數），所以 PS-248A 要讓 `getWorkspaceSceneAssets()` 接受時段，並讓測試逐一走過 `TIME_BANDS`，否則漏掉的窗外景色不會被測出。
- 不改：家具、角色、天氣特效、家具位置、相框位置、ledger、`rulesetId`。
- 這會改變 `pwa/assets/personal-space/v2/README.md`「日夜維持程式產生的光線層」的契約：窗外景色改為圖片，房間與家具的日夜仍由程式光線層處理。README 要同步更新。

### 4.2 PS-248B：一套室內風格主題

- 候選（擇一，由使用者選）：
  - **深木書房**：art bible §5 的 Mastery 色票，深木、墨綠、金；暖燈。
  - 明亮北歐：淺橡木、白、鼠尾草綠；日光。
  - 夜貓工作室：深藍、霓虹強調色；螢幕光為主。
- 做法：
  - `scene.py` 的材質由「主題設定」決定，幾何、相機、家具造型不變；
  - `render_pack.py`／`process_pack.py` 加上 `--theme`，輸出到各主題自己的路徑；
  - `assetManifest.js` 改為主題登錄表，`getWorkspaceSceneAssets()` 多一個 `themeId` 參數；
  - `build-manifest.mjs` 與預算計算改為逐主題。
- 選擇：
  - 完整頁面的 Edit Mode 加上主題選擇，寫入既有的 `world.selectedThemeId`。不新增欄位；V2 state 只存在本機。
  - 舊版分頁不讀 `selectedThemeId`，所以不會改壞它。
- 快取：選項見 §6。

### 4.3 PS-248C：少量裝飾小物

- 2–4 件，固定位置，由 `scene.py` 建模，與現有家具同樣處理陰影與遮擋（PS-247 的作法）。
- 解鎖條件由現有資料推導，例如 AI-202 的 `partner`／`trusted-companion`，或 Main Quest 天數。只用於顯示，不寫入 ledger。
- 依賴 AI-202B（關係階段的推導）；若 AI-202 未核准，改用 Main Quest 天數。

## 5. 主題怎麼取得（PS-248B、C）

| 選項 | 說明 | 評估 |
|---|---|---|
| **O1（建議 B）免費選擇** | Edit Mode 中隨時切換 | 最簡單；不碰經濟與 ledger。主題是表達，不是獎勵 |
| **O2（建議 C）由現有資料推導解鎖** | 例如到 `partner` 解鎖。每次 render 由 Main Quest 天數或關係階段判斷，只決定「能不能選」與「是否顯示」 | 讓長期投入在房間裡看得見（AGENTS.md §9「讓成長在世界中可見」）。不寫入 ledger，所以舊版分頁與 BUG-113 都不受影響 |
| O3 用 Gold 購買 | V2 的 Gold 第一次有用途 | 必須先替商店訂出冪等、可撤銷的結算規則（vertical slice §4.4、§17）。範圍大，另立任務 |
| O4 Pro 專屬 | 付費價值 | Pro entitlement 尚未切換（PRO-014H 被 PRO-014L／P 擋住）；有價值的內容必須由 server 強制（PRO-014F）。不建議現在做 |

## 6. 快取與預算

- PS-248A：4 張窗外景色都進 SHELL（PS-211A 的既有規則），預估增加 100–250 KB 的安裝下載。
- PS-248B 的選項：
  - **S1（建議）所有主題都進 SHELL**：每套約 +460 KB。只有 1–2 套時，換來的是離線與改版後 poster 一定完整，規則與測試都不必改。
  - S2 只預先快取預設主題，其他主題按需快取；離線缺圖時退回預設主題的圖片。安裝較小，但要改 `sw.js` 的規則與 `ps211aPrecache.test.js`（部署行為，需另行核准）。
- 改版與舊版分頁：
  - 同一次改版**不刪除也不改名**上一版 `assetManifest.js` 會要求的檔案。仍在執行舊版的分頁會向新版的 service worker 要舊檔名；INFRA-105 已記錄這個風險。
  - 例如 PS-248A 的新房間背景用新檔名，舊的 `room-v2.webp` 保留到下一次改版。
- 延遲載入的 JS 只剩約 29 KB 的空間：主題登錄表與窗外圖層只增加少量程式碼，驗收時要確認 `ps243` 的 JS 預算仍通過。

## 7. 管線與工作量

- 渲染環境：`/tmp/bpyenv`（`bpy 5.2.2`，約 1.1 GB）只存在於目前的容器；新容器要依 README 重新安裝。CI 不渲染，只檢查提交的結果。
- 預估：
  - PS-248A：房間重渲染一次（約 5–10 分鐘）＋4 張窗外景色（每張數分鐘，不需描邊）；
  - PS-248B：每套主題約 30–50 分鐘；
  - PS-248C：每件數分鐘。
- 每次重新渲染都會改變位元組，所以每個 PR 都要更新 `ps242:manifest`、`ps243:assets` 的基準與 `ps243AssetBudget.test.js` 的精確值，並 bump 版本（SHELL 的 `CACHE` 名稱）。
- 視覺驗收：
  - 每個階段提交預覽圖：PS-248A 為 4 個時段 × 進度 0／100；PS-248B 為 5 個進度階段。
  - **由使用者看過預覽圖再合併**：美術方向是使用者的決定，PS-244 也是先核准方向。

## 8. 驗收條件草稿（PS-248A，核准後寫入 tasks.md）

- Blender：
  - `scene.py` 以參數產生 4 種窗外景色；
  - 房間背景的窗戶區域為透明；
  - README 記錄指令與渲染時間；
  - 預覽圖涵蓋 4 個時段 × 進度 0／100。
- 執行時：
  - 首頁小卡（Pixi 與 poster）與完整頁面，在同一個時段顯示同一張窗外景色；用注入的時間測試 4 個時段，與機器時間無關。
  - Pixi 的光線層與 poster 使用相同的 4 個時段。
  - 窗外景色在房間之下，不蓋住家具、角色或相框；雨天特效仍在最上層。
  - `prefers-reduced-motion` 下時段切換沒有動畫。
- 快取：
  - 4 張窗外景色都在 SHELL，`ps211aPrecache.test.js` 從程式碼推導並通過；
  - 離線 e2e 中，4 個時段的 poster 都完整（`naturalWidth > 0`）。
- 相容：
  - 上一版 `assetManifest.js` 會要求的檔案仍存在；
  - 舊版分頁不受影響（它不讀窗外圖層）。
- 檢查：
  - `ps242:manifest -- --check`、`ps243:assets -- --check`、lint、test、e2e 通過；
  - 首次繪製與完整素材在預算內；延遲載入的 JS 在 300 KB 內。
- 版本：`npm run bump -- patch`。

## 9. 需要使用者決定

1. **範圍**：「本工具」是否就是「空間」分頁？角色與天氣特效（非 Blender）不在本提案範圍，可以嗎？
2. **擴充前提**：asset pipeline 文件與 product spec 原則 8 要求先通過驗證再擴充內容，PS-243 的實機檢查仍未完成。
   - PS-248A 只改窗外景色，不擴充房間，建議直接進行。
   - PS-248B／C 是否也不必等 PS-243？
3. **階段與順序**：A → B → C（建議）。或只做 A、只做 B。
4. **PS-248A 的時段**：早晨、白天、傍晚、夜晚 4 張（建議，與 poster 現有時段一致）。或只做白天與夜晚。
5. **PS-248B 的風格**：深木書房（建議，art bible 已有 Mastery 色票）、明亮北歐、夜貓工作室，或其他。
6. **取得方式**：B 免費選擇（建議）；C 由關係階段或 Main Quest 天數解鎖（建議）。Gold 購買與 Pro 專屬都需要另立大型任務。
7. **PS-248B 的快取**：S1 所有主題進 SHELL（建議）／S2 只預先快取預設主題（需改 `sw.js` 規則）。
8. **順帶整理**（可放在 PS-248A）：
   - 刪除未被引用的 `building-formal-workstation-room-v1.webp`（159 KB）；
   - 更新 `pwa/assets/personal-space/v2/README.md`（仍寫 259,133 B／1,766,935 B，現為 182,283 B／1,293,693 B）與 `docs/ps-243-production-acceptance.md` 中過時的預算數字；
   - 修正根目錄 `README.md`「25% 空間擴充 → 50% 家具 → 75% 風格 → 100% 全新主題」與實際的專案階段（`WORKSPACE_PROJECT_PHASES`，每階段加入具名家具）不符。
