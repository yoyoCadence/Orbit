# PS-248 提案：以 Blender 擴充「空間」的主題與素材

> 狀態：提案（Mode A，只有文件）。核准前不渲染、不改程式碼。核准後每個階段各自成為一個任務（PS-248A／B／C），各有自己的驗收條件。

使用者 2026-10-20 的要求：「需要更新更多 blender 做的主題與素材等，讓本工具更豐富」。

## 1. 結論

建議分三個階段，每階段一個 PR，前一階段上線後再決定下一階段：

- **PS-248A 夜晚版本的工作站**（建議先做）：
  - 現況：房間與 8 件家具都在 Blender 中以「從右側落地窗射入的低角度暖色太陽」渲染。地板與地毯上烘有窗格形狀的陽光，家具帶著長影子。夜晚只在上面疊一層深藍色（Pixi alpha 0.2，poster 約 0.22–0.34），所以**夜晚仍看得到陽光**，這是既有的不一致。
  - 做法：同一個場景、同一個相機，關掉太陽，調暗天空、補光與 world 背景；壁燈的光在白天版本就已打開，夜晚再讓燈罩發光；檯燈與螢幕只在自己的輪廓內發光；窗外換成夜景（建築窗燈）。以此重新渲染房間與 8 件家具一套「夜晚版本」。
  - 夜晚改用夜晚版本；早晨、白天、傍晚沿用現有的白天版本（低角度暖光適合三者）。夜晚的程式色層改為較弱的強度，讓角色與天氣仍有夜晚感，但房間不會變暗兩次。成就相框在色層之外，另外處理（§4.1）。
  - **這也超出 vertical slice 的素材上限**：art bible §6.1 與 asset pipeline 的「Vertical Slice Asset Budget」是「一張房間背景＋日、夜光線疊層」（§7.3 也假設日夜是共用幾何的疊層），夜晚版本是第二張房間背景與 8 件家具（manifest 由 29 張變成 38 張）。要與 PS-248B 一樣取得使用者明確同意（§9 第 2 點）。理由是：它是同一個房間殼的另一種光線狀態，而 art bible §8 允許家具有「daytime / emissive」狀態。
  - 代價：一次完整渲染（約 30–50 分鐘）；SHELL 增加約 460 KB，是現在 SHELL 圖片 987,645 B 的約 +47%，每個使用者都要下載。
- **PS-248A2 窗外景色依時段變化**（可選，不建議現在做）：把窗外天際線拆成獨立圖層，每個時段一張。要另做窗戶遮罩、新的圖層與 DOM，同樣超出上限（§4.2）。
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
| 光線 | `scene.py` `build_lighting()`、`configure_render()`；`render_pack.py`；`process_pack.py` | 暖色太陽（`SUN`，色 `(1, .86, .68)`）從右牆的落地窗以低角度射入；不投影的補光；4 盞壁燈的 spot 光**在白天版本就已打開**（會投影，燈具本身不投影）；不可見的 world 背景（`#1a2348` × 1.4）照亮所有渲染；AgX 曝光 0.75；深藍描邊 alpha .72。家具渲染時隱藏 `outside`，並以房間表面與支撐面當 shadow catcher，所以**陽光與長影子烘在圖裡**；shadow catcher 只記錄陰影，不記錄家具自己的燈照在周圍的光 |
| 非 Blender 產出 | `art-pipeline/ps242/model-manifest.json` | 主角 12 張、Companion 6 張、天氣 2 張，由影像生成（`openai-built-in-imagegen`）製作再去背 |
| 相機 | `scene.py` `CAMERA`；`assetManifest.js` | 一個固定相機 `building-workspace-v2`，以 1.7 m 假人校準角色比例；art bible §4.1 只允許一個視角 |
| 窗外景色 | `scene.py` `build_room()` | 右牆整面落地窗，只有窗框、沒有玻璃。天際線（天空漸層＋18 棟建築）是獨立的 `outside` 群組，不投影、不描邊，但**烘進房間背景**，只有白天一種；天空材質是自發光（強度 1.6），也照亮房間 |
| 時段 | `viewModels.js`（`timeBand.js`，HW-111）；`ui/orbitWindow.js`、`style.css`；`runtime/pixiSceneRuntime.js` | 時段在每次 render 時計算（`getTimeBand(now)`），沒有計時器即時切換。poster 依 4 個時段套用 CSS soft-light 光線層（早晨、傍晚、夜晚各有漸層，白天不加色）；Pixi 只分夜晚（`0x172449`，alpha 0.2）與非夜晚（`0xf6d58b`，alpha 0.05）。光線層在角色與天氣之上（poster z 70 > 天氣 68；Pixi 80 > 天氣 72 > 角色 40／42），成就相框（z 94）不受光線層影響。`pwa/assets/personal-space/v2/README.md` 明訂「日夜維持程式產生的光線層」 |
| 主題 | `stateSchema.js`、`viewModels.js` | `world.selectedThemeId: 'default'` 只儲存、傳遞，沒有程式依它選素材；migration 可能留下 legacy 值（例如測試中的 `'night'`）。V2 Edit Mode 沒有任何選單 |
| 場景 id | `stateSchema.js`、`unlockRules.js` | V2 的 `selectedSceneId` 預設 `rough-room`，只用於 telemetry。`rough-room` 等 id 是 legacy 頁面依等級切換的場景 |
| 素材與程式的耦合 | `assetManifest.js`、`process_pack.py`、`build-manifest.mjs`、`computeAssetBaseline.mjs`、`sw.js`、測試 | 都假設只有一套：`process_pack.py` 寫死輸出路徑、每次都讀房間與 8 件家具的原始渲染，並以 regex 改寫 `PROP_DEFINITIONS`；`placements.json` 每件家具只有一個路徑；`WORKSPACE_INITIAL_PAINT_ASSETS` 是固定的清單；`build-manifest.mjs` 把 `/workspace/backgrounds/` 下的任何檔案都標成同一個房間 id，不認得的家具路徑與 lossless WebP 則直接拋錯；`ps211aPrecache.test.js` 要求 SHELL 與 poster 可能顯示的圖片完全一致 |
| 經濟 | `v2/rewardRules.js`；vertical slice §4.4 | Main Quest 每天 100 Gold，但 V2 **沒有任何花費途徑**。要加購買，必須先替 request-only 的商店訂出可撤銷的結算規則 |
| 預算 | `docs/ps243/asset-baseline.json`；vertical slice §10 | 完整素材 1,293,693 B／目標 4 MB；首次繪製 182,283 B／目標 1.5 MB；延遲載入的 JS gzip 278,410 B／上限 300 KB（只剩約 28 KB） |
| 快取 | `sw.js`；technical design §12.2 | SHELL 放 poster 可能顯示的全部 22 張圖片（987,645 B）與 `pixi.js`（PS-211A），以 `cache: 'no-cache'` 安裝。不在 SHELL 的圖片按需快取，每次改版都會清掉。JS／CSS／HTML 仍可能在改版後約 10 分鐘內是舊版（INFRA-105，未修） |
| 渲染成本 | `art-pipeline/ps244-blender/README.md` | 完整一套（房間＋8 件）在 4 核 CPU 上約 30–50 分鐘；重渲染不是逐位元相同（家具位置可能差 1 px）；原始渲染不進 git；CI 不渲染 |
| 擴充的前提 | asset pipeline 文件；art bible §6.1；product spec §3.2 原則 8 | Vertical slice 的第一套素材上限是「一張房間背景、一張 exterior／window background、日夜光線疊層、8–12 件家具……」；「首頁 → Session → 世界的迴圈通過產品與效能驗證前，不擴充 Survival／Mastery 房間、不大量產生家具」；「先證明一個房間，再做世界規模的內容」。PS-243 的實機檢查仍未完成 |

## 3. 「主題」可以是什麼

| 類型 | 內容 | 成本 | 與規則的關係 |
|---|---|---|---|
| **夜晚版本**（A） | 同一房間與家具，太陽關掉、燈罩與螢幕發光、窗外夜景 | 中：一次完整渲染（約 30–50 分鐘）＋約 460 KB | 第二張房間背景，超出「一張房間背景＋日夜疊層」的上限；但它是同一個房間殼的光線狀態（art bible §8 的 daytime／emissive）。也改變 README「日夜維持程式光線層」的契約 |
| 窗外時段（A2） | 窗外依時段換圖 | 中：窗戶遮罩、新圖層、每張窗外的渲染 | 符合 art bible §7.2「窗外可分離」；但超出「一張 exterior」的上限 |
| **房間風格**（B） | 同一房間、家具造型與燈光，換材質與色票 | 中：每套約 30–50 分鐘渲染＋約 460 KB；有夜晚版本時加倍 | 同一相機，不需新的美術成本決策；但同樣是第二張房間背景，超出上限 |
| **裝飾小物**（C） | 新增少量固定位置的裝飾 | 每件幾分鐘渲染；要決定位置與遮擋 | asset pipeline 偏好「每個 milestone 加入或升級具名的物件」；不可大量產生；家具總數仍在 8–12 件之內 |
| 新房間或新相機 | Survival／Mastery 房間、不同視角 | 高：新相機要重新校準角色比例、所有位置與相框 | art bible §8 要求新相機另做美術成本決策；擴充前提明確禁止 |
| 角色或天氣 | 主角、Companion、雨與光點 | 不是 Blender 產出 | 角色 3D 化是另一個開放決策（handoff） |

## 4. 各階段內容

### 4.1 PS-248A：夜晚版本的工作站

- Blender：
  - `scene.py` 的光線由參數決定（例如 `--lighting day|night`），幾何、相機與家具造型不變。
  - 夜晚：關掉太陽；天空改為深藍漸層、建築窗戶自發光；補光與 world 背景調暗（後者照亮每一張渲染）；壁燈的 spot 光保留，燈罩改為自發光；檯燈燈泡與螢幕本來就自發光。
  - 曝光（AgX 0.75）與深藍描邊在暗房間中可能失去對比，要一併調整並以預覽圖確認。
  - 天空只照亮房間渲染：家具渲染時 `outside` 是隱藏的。
  - **檯燈與螢幕照在桌面、牆或地板上的光暈，現有管線做不到**。家具以 shadow catcher 渲染，只記錄陰影，不記錄家具自己的燈照亮周圍的光；書桌也是另外渲染、隱藏檯燈的。房間背景也不能烘入這些光，因為家具依專案階段出現（例如檯燈從 50% 起）。所以 PS-248A 的檯燈與螢幕只在自己的輪廓內發光。若之後想要光暈，要另做「有燈減無燈」的差異圖層，以 screen／add 混合疊上，這是新的 sprite 與 DOM／CSS（受 INFRA-105 影響），另立任務。
  - `render_pack.py`／`process_pack.py` 加上同樣的參數，輸出到新的檔名（例如 `…-night.webp`、`props/…-night.png`、`previews/night-phase-XXX.jpg`），不覆蓋白天的檔案與預覽圖。
- 家具位置：
  - 夜晚的影子方向與白天不同：4 盞壁燈在後牆上方、略朝後牆向下照，家具都在燈的前方，所以影子朝畫面下方，而且 4 盞燈的影子會重疊、呈扇形；太陽的影子主要朝左。所以夜晚家具的裁切框可能超出白天的框（例如書桌的影子），**不能硬套白天的框**，否則影子會被切出硬邊。
  - 每個夜晚 entry 有自己的 placement。位置由裁切框換算，runtime 依每個 entry 的 placement 縮放（`pixiSceneRuntime.js`、poster 相同），所以日夜切換時家具不會跳動。
  - `PROP_DEFINITIONS`／`placements.json` 改為每件家具有白天與夜晚兩個 entry；白天的值與檔案不變。
- 執行時：
  - `getWorkspaceSceneAssets()` 多一個**獨立的時段參數**，預設白天；Pixi（`pixiSceneRuntime.js` 目前自己組 `visualState`，不含時段）與 poster（`orbitWindow.js`）都明確傳入同一個時段值。夜晚回傳夜晚版本的房間與家具，其他時段回傳白天版本。
    - 不要改成從 `visualState.timeBand` 讀取：poster 本來就把整個 model（含 `timeBand`）當成 `visualState` 傳入，舊的 `orbitWindow.js` 配新的 `assetManifest.js` 就會在原本的全強度色層下顯示夜晚版本，變暗兩次。
  - 夜晚的程式色層改為較弱的強度，不拿掉：光線層是角色、天氣唯一的夜晚處理。
    - 強度**依 `getWorkspaceSceneAssets()` 實際回傳的版本決定**（例如回傳的 scene 帶有 `lighting: 'night'`），不是依時段。舊的 `assetManifest.js` 沒有這個欄位，呼叫端就維持現在的全強度色層，所以混用時畫面與現在相同，不會出現「陽光照亮的房間配上較弱的夜晚色層」。
    - 強度由 JS 決定（Pixi 的 alpha；poster 以 inline `opacity` 調整既有的光線層，`mix-blend-mode: soft-light` 不受影響），不改 CSS。
  - 成就相框（z 94）在 poster 光線層與 Pixi canvas 之外，兩種色層都碰不到它。夜晚房間變暗後，相框（金色漸層、`#e9dfc6` 襯紙）會成為畫面中最亮的東西。做法二選一（§9 第 4 點）：以 JS 在相框上加 inline `filter: brightness(…)`（符合只改 JS 的限制；要決定使用者的照片是否一起變暗），或接受相框維持原亮度。
  - app 另有一層全域的夜晚色調（`style.css` 的 `body::after`，`--time-tint` 夜晚 0.055，Liquid Glass 主題 0.13），也會蓋在 Orbit Window 上。
  - 最後以 runtime 截圖確認：在實際 app、兩種 UI 主題下，Pixi 與 poster 各一張，含角色、天氣、相框。不能只看 `process_pack.py` 的預覽圖（預覽圖沒有程式色層）。
  - 時段仍在每次 render 時計算：跨過 21:00 或 05:00 時，下一次 render（開啟頁面或狀態改變）才換版本。不新增計時器（INFRA-106／PS-249 的教訓）。
  - 記憶體：`Pixi.Assets.load` 不會釋放。若同一次使用跨過 21:00 或 05:00，日夜兩套都會留在記憶體（背景解碼後約 6.3 MB）。要釋放不再使用的那一套，或確認仍在 vertical slice §10 首頁 64 MB 預算之內。
  - Pixi 的光線層是否改成與 poster 相同的 4 個時段，列為可選（§9 第 4 點）：現在 Pixi 的早晨、白天、傍晚都是同一層 `0xf6d58b` alpha 0.05，大部分使用者看到的是 Pixi，改了會有感。poster 用的是 CSS soft-light；內建的 `pixi.js` 在 WebGL 下似乎沒有 soft-light 混合（要確認），只能以 alpha 填色近似。
- 改版時新舊程式混用（INFRA-105）：舊的 JS／CSS 可能在改版後約 10 分鐘內仍被使用。PS-248A 遵守下列限制，讓混用時退回與現在相同的畫面，而不是無法啟動：
  - 不在既有 SHELL 模組之間新增 import／export，也不移除或改名既有的 export（`app.js` 靜態 import `pixiSceneRuntime.js`，它與 `orbitWindow.js` 都 import `assetManifest.js`；缺少 export 時 ES module 無法 link，app 無法啟動）。只給腳本或測試用的新 export 不受限。
  - `getWorkspaceSceneAssets()` 維持現在的回傳形狀（`background` 是字串，`props[]` 每項有 `path` 與 `placement`），由它依時段挑好版本；不回傳日夜兩組讓呼叫端挑，否則舊的 renderer 會壞。
  - 時段是獨立參數、預設白天，兩個呼叫端都明確傳入。
  - 色層強度依回傳的版本決定，只在 JS 中改，不新增 CSS class 或 DOM 結構。
  - 仍有短暫的不一致：`orbitWindow.js` 與 `pixiSceneRuntime.js` 是兩個模組，可能一新一舊。例如新 poster 配舊 Pixi 時，poster 先顯示夜晚版本，Pixi 畫好後淡入白天版本（反之亦然）；WebGL 失敗時只有 poster。這只影響畫面，最多約 10 分鐘。
  - 或者先做 INFRA-105（改部署行為，需核准）。
- 要一起改的檔案：`scene.py`、`render_pack.py`、`process_pack.py`（`sync_asset_manifest` 與 `placements.json` 的寫入現在會覆蓋整段，只處理夜晚時要與白天的資料合併）、`placements.json`、`assetManifest.js`（含 `WORKSPACE_INITIAL_PAINT_ASSETS` 與 `getWorkspaceAssetManifestPaths()`；前者只有 `computeAssetBaseline.mjs` 與測試使用）、`build-manifest.mjs`（夜晚背景要有自己的 id；新的家具路徑要能辨識）、`computeAssetBaseline.mjs`、`pixiSceneRuntime.js`、`orbitWindow.js`、`sw.js` 的 SHELL 與註解，以及 §7 的測試。
- 文件：
  - `pwa/assets/personal-space/v2/README.md`「日夜維持程式產生的光線層」改為「白天與夜晚各有一套 Blender 渲染，早晨與傍晚以程式色層調整」；
  - art bible §6.1（素材清單）、§7.3（日夜疊層）與 asset pipeline 的「Vertical Slice Asset Budget」改為允許夜晚版本；
  - technical design §12.2 的 SHELL 說明。
- 不改：角色、天氣特效、相框位置、ledger、`rulesetId`、圖層順序、白天版本的檔案。

### 4.2 PS-248A2：窗外景色依時段變化（可選）

只有在使用者想要「窗外依時段不同」時才做。技術上要處理：

- 窗戶沒有玻璃。現在的房間渲染中，窗洞被天際線填滿；一旦 `outside` 對相機不可見，窗洞就與房間外的空白處一樣透明，而 `process_pack.py` 會把背景色填滿所有透明處。要另外輸出窗戶遮罩（例如只渲染 `outside`、房間設為 holdout），才知道哪裡該露出窗外。
- `outside` 若以 `hide_render` 隱藏，天空的自發光就不再照亮房間，房間的樣子會改變；要改用「相機看不到、但仍發光」（`visible_camera = False`）。
- 窗外圖放在房間之下，所以是**房間背景**要有 alpha（有 alpha 的 lossy WebP；lossless WebP 目前會讓 `build-manifest.mjs` 拋錯），窗外圖本身可以不透明。這與 art bible §7 的圖層順序（窗外在房間殼之上）不同，但效果相同，要在文件中說明。
- 房間的窗洞一旦透明，每個時段都要有窗外圖：有 PS-248A 時是白天與夜晚兩張房間圖都改成透明窗洞，再加上 4 張窗外圖（或 2 張，若只分日夜）。
- 這是新的 poster `<img>`／class 與 Pixi sprite。舊 CSS 配新 JS 時（INFRA-105），沒有樣式的圖片會出現在頁面流中。
- `build-manifest.mjs` 要新增窗外圖的分類。
- 超出 asset pipeline「一張 exterior／window background」的上限，需要使用者明確同意並更新該文件。

### 4.3 PS-248B：一套「房間風格」

- 候選（擇一，由使用者選）：
  - **明亮北歐**：淺橡木、白、鼠尾草綠。
  - 夜貓工作室：深藍、霓虹強調色。若 PS-248A 已做，與夜晚版本的感覺部分重疊。
  - 深木書房：深木、墨綠、金。**這是 art bible §5 保留給 Mastery 階段的色票**，在 Building 階段免費提供會稀釋未來的階段獎勵，不建議。
- 做法：
  - `scene.py` 的材質由「風格設定」決定，幾何、相機、家具造型與燈光不變。燈光不變，所以陰影與裁切框大致相同；但重渲染可能差 1 px，每個風格仍有自己的 placement。
  - `render_pack.py`／`process_pack.py` 加上 `--style`，輸出到各風格自己的路徑；
  - `assetManifest.js` 改為風格登錄表，`getWorkspaceSceneAssets()` 多一個風格參數；
  - `build-manifest.mjs` 與預算計算改為逐風格。
- 選擇：
  - 完整頁面的 Edit Mode 加上風格選擇，寫入既有的 `world.selectedThemeId`。不新增欄位；V2 state 只存在本機。
  - 不認得的 id（包括 migration 留下的 legacy 值）一律退回預設風格；風格 id 不使用 `night` 等 legacy 值。
  - 舊版分頁不讀 `selectedThemeId`，所以不會改壞它。
- 改版混用：沿用 §4.1 的限制（風格也是預設值為 `default` 的獨立參數）。Edit Mode 的選單是新的 DOM 與 CSS，舊 CSS 時會沒有樣式，要讓它在沒有樣式時仍可用。
- 若 PS-248A 已做，每套風格要有白天與夜晚兩套，成本加倍。
- 快取：選項見 §6。

### 4.4 PS-248C：少量裝飾小物

- 2–4 件，固定位置，由 `scene.py` 建模，與現有家具同樣處理陰影與遮擋（PS-247 的作法）。若 PS-248A 已做，每件也要有夜晚版本。
- 放在支撐物上的裝飾（例如書架上的獎盃，書架從 50% 起出現）必須在解鎖時一定看得到：AI-202 的 legacy 推導可能在專案 0% 時就給 `partner`。要放在房間固定的表面，或像遮擋關係一樣以測試保證支撐物存在（`ps244WorkspacePlacements.test.js` 的作法）。
- 解鎖條件由現有資料推導，例如 AI-202 的 `partner`／`trusted-companion`，或 Main Quest 天數。只用於顯示，不寫入 ledger。
  - 必須使用 AI-202B 由 active ledger 推導的階段，不可讀儲存的 `companion.relationshipStage`：舊版分頁會留下過時的值（AI-202 提案 §3.3）。
  - 「Main Quest 天數」同樣需要 AI-202B 的推導，所以兩種條件都依賴 AI-202B。
- 改版混用：沿用 §4.1 的限制。
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
  - PS-248A：9 張夜晚圖片都進 SHELL，約 +460 KB（SHELL 圖片 987,645 B 的約 +47%），每個使用者安裝時都要下載。`cache.addAll()` 全有或全無，安裝越大，在不穩定的網路上越容易失敗，新版本就會延後啟用。這是修改 `sw.js` 的 SHELL 清單：規則沿用 PS-211A，但核准 PS-248A 就包括這個變更（§9 第 4 點）。完整素材約 1.75 MB，仍低於 4 MB。首次繪製只載入其中一套；改為以每個時段的首次繪製清單（或在 `computeAssetBaseline.mjs` 取較大者）計算。
  - PS-248A2：窗外圖都進 SHELL。
  - PS-248B 的選項：
    - **S1（建議）所有風格都進 SHELL**：每套約 +460 KB（有夜晚版本時約 +920 KB）。只有 1–2 套時，換來的是離線與改版後 poster 一定完整；`sw.js` 的規則不變，但測試要如上逐風格推導。
    - S2 只預先快取預設風格，其他風格按需快取；離線缺圖時退回預設風格的圖片。安裝較小，但要改 `sw.js` 的規則與測試（部署行為，需另行核准）。
  - PS-248C：解鎖後 poster 會顯示，所以都進 SHELL。
- 改版與舊版分頁：
  - 同一次改版**不刪除也不改名**上一版 `assetManifest.js` 會要求的檔案，也不以同名覆蓋成不同內容或不同尺寸（舊的 `assetManifest.js` 會以舊的 placement 擺放它）。仍在執行舊版的分頁會向新版的 service worker 要舊檔名；INFRA-105 已記錄這個風險。
  - 新素材一律用新檔名；白天版本的檔案不變。
- 延遲載入的 JS 只剩約 28 KB 的空間：登錄表與時段參數只增加少量程式碼，驗收時要確認 `ps243` 的 JS 預算仍通過。

## 7. 管線與工作量

- 渲染環境：`/tmp/bpyenv`（`bpy 5.2.2`，約 1.1 GB）只存在於目前的容器；新容器要依 README 重新安裝。CI 不渲染，只檢查提交的結果。
- 預估（4 核 CPU）：
  - PS-248A：一次完整的夜晚渲染（約 30–50 分鐘），加上調整燈光與曝光的試渲染。`process_pack.py` 要能只處理夜晚版本，不重新計算白天的 placement。
  - PS-248A2：房間的窗洞與遮罩各重新渲染（新容器沒有原始渲染，要完整重渲染或新增只渲染房間的模式）＋每張窗外數分鐘。
  - PS-248B：每套風格約 30–50 分鐘，有夜晚版本時加倍。
  - PS-248C：每件數分鐘，加上夜晚版本。
- 每次加入新素材，下列精確值都要一起更新：
  - `npm run ps242:manifest`、`npm run ps243:assets` 的基準，與 `ps243AssetBudget.test.js` 的位元組數與「29 個檔案」；
  - `ps211aPrecache.test.js`（22 張）、`tests/e2e/sw-precache.test.js`（23 個）；
  - `personalSpaceOrbitWindow.test.js`（首次繪製 4 張、manifest 29 張）、`ps242AssetManifest.test.js`（29 張）；
  - `ps244WorkspacePlacements.test.js`（背景必須等於 `placements.background`；每件家具一個路徑；PS-247 的遮擋測試只走過預設時段，要加上夜晚）；
  - `personalSpacePixiRuntime.test.js`（以 `timeBand: 'night'` render 後檢查 `workspace/props/planning-board.png`，夜晚改用新檔名後會失敗）；
  - technical design §12.2 的「22 of 29」、`pwa/assets/personal-space/v2/README.md` 與 `docs/ps-243-production-acceptance.md` 的「29-file」。
- 版本：新增視覺功能依 AGENTS.md §14 用 `npm run bump -- minor`（PS-244 為 1.29.0、PS-245 為 1.30.0）。
- 視覺驗收：
  - 每個階段提交預覽圖：PS-248A 為日、夜 × 5 個進度階段（只有 75–99% 才有單螢幕），再加上 Pixi 與 poster 在夜晚的 runtime 截圖；PS-248B 為 5 個進度階段（有夜晚版本時加上夜晚）。
  - **由使用者看過預覽圖再合併**：美術方向是使用者的決定，PS-244 也是先核准方向。

## 8. 驗收條件草稿（PS-248A，核准後寫入 tasks.md）

- Blender：
  - `scene.py` 以參數產生日、夜兩種光線，幾何與相機不變；
  - 夜晚家具有自己的 placement，白天的 `PROP_DEFINITIONS`、placement 與檔案不變；
  - README 記錄指令與渲染時間；
  - 預覽圖涵蓋日、夜 × 5 個進度階段。
- 執行時：
  - 首頁小卡（Pixi 與 poster）與完整頁面，在同一個時段顯示同一套版本；時段以明確參數傳入，用注入的時間測試 4 個時段，與機器時間無關。
  - 夜晚不再看得到陽光；房間沒有變暗兩次，角色、天氣仍有夜晚感；相框依 §9 第 4 點的決定處理（在實際 app、兩種 UI 主題下的 runtime 截圖確認）。
  - 色層強度依回傳的版本決定；以「新呼叫端＋舊 `assetManifest.js`」的組合測試，畫面與現在相同。
  - 日夜切換時家具、角色、相框的位置不變；圖層順序不變。
  - 同一次使用跨過時段時，不再使用的那一套被釋放，或記憶體在預算內。
- 快取：
  - 夜晚圖片都在 SHELL，`ps211aPrecache.test.js` 與 PS-247 的遮擋測試都走過時段並通過；
  - 離線 e2e 以固定的時間（Playwright 的 clock 或注入的時間）分別檢查日、夜的 poster 都完整（`naturalWidth > 0`）。現在的設定沒有固定時間，CI 跑到哪個時段就測哪個。
- 相容：
  - 上一版 `assetManifest.js` 會要求的檔案仍存在且內容與尺寸不變；
  - 舊版分頁不受影響（它只要白天版本）；
  - 遵守 §4.1 的混用限制（不新增、移除或改名既有 SHELL 模組之間的 import／export；回傳形狀不變；時段參數預設白天；色層依回傳的版本、只在 JS 改）。
- 文件：README、art bible、asset pipeline、technical design 依 §4.1 更新。
- 檢查：
  - `ps242:manifest -- --check`、`ps243:assets -- --check`、lint、test、e2e 通過；
  - 首次繪製與完整素材在預算內；延遲載入的 JS 在 300 KB 內。
- 版本：`npm run bump -- minor`。

## 9. 需要使用者決定

1. **範圍**：「本工具」是否就是「空間」分頁？角色與天氣特效（非 Blender）不在本提案範圍，可以嗎？B 改稱「房間風格」，避免與 UI 主題混淆，可以嗎？
2. **素材上限與擴充前提**：art bible §6.1 與 asset pipeline 的 vertical slice 上限是「一張房間背景、一張 exterior、日夜光線疊層」（§7.3 也假設日夜是疊層），且要先通過驗證再擴充內容；PS-243 的實機檢查仍未完成。
   - PS-248A（第二張房間背景＋8 件夜晚家具）、PS-248B（第二種房間外觀）、PS-248A2（多張 exterior）都超出這個上限。
   - 建議同意 PS-248A 放寬：它是同一個房間殼的光線狀態，並修正「夜晚仍有陽光」的既有不一致。B 與 A2 是否也放寬，或等 PS-243？
   - 同意的項目要一併更新 art bible 與 asset pipeline 文件。
   - PS-248C 的家具總數仍在 8–12 件之內。
3. **階段與順序**：A → B → C（建議）。或只做 A、只做 B。A2 是否要做？
4. **PS-248A 的做法**：
   - **夜晚版本**（建議）。核准即包括：以完整重渲染取代「日夜維持程式光線層」的契約、SHELL 增加約 460 KB（修改 `sw.js` 的 SHELL 清單）、夜晚色層改弱但保留、檯燈與螢幕只在自己的輪廓內發光（不做光暈）。
   - 夜晚版本用於哪些時段：只有夜晚 21:00–05:00（建議）；或傍晚也用（冬天 17:30 後天就黑了，但傍晚的暖色太陽也說得通）。
   - 成就相框在夜晚：以 JS 調暗（建議；照片是否一起變暗也要決定），或維持原亮度。
   - Pixi 的光線層是否改為與 poster 相同的 4 個時段（可選；大部分使用者看到的是 Pixi，只能以 alpha 填色近似 soft-light）。
   - 改版混用的處理：遵守 §4.1 的限制（建議；最多約 10 分鐘內 poster 與 Pixi 可能一日一夜），或先做 INFRA-105（需核准）。
   - 其他做法：只拆窗外、不重渲染房間（最便宜，但夜晚仍有陽光；做之前先給預覽圖），或維持現狀。
5. **PS-248B 的風格**：明亮北歐（建議）、夜貓工作室、深木書房（Mastery 色票，不建議），或其他。
6. **取得方式**：B 免費選擇（建議）；C 由 AI-202B 推導的關係階段或 Main Quest 天數解鎖（建議），撤銷時跟著消失，通知採 N1 安靜出現（建議）或 N2。Gold 購買與 Pro 專屬都需要另立大型任務。
7. **PS-248B 的快取**：S1 所有風格進 SHELL（建議）／S2 只預先快取預設風格（需改 `sw.js` 規則）。
8. **順帶整理**（可放在 PS-248A）：
   - 刪除未被引用的 `building-formal-workstation-room-v1.webp`（159 KB）。它只在 v1.22.0（6f29efd）到 PS-244（044414b）之間被引用，從未在 SHELL 中；上一版 v1.31.7 的 `assetManifest.js` 也不要求它。原始檔 `art-pipeline/ps242/source/building-formal-workstation-room-v1.png` 保留，所以不會失去來源；`companion-state-pack-metadata.json` 中指向不存在的 `pwa/…/room-v1.png` 可順便修正。
   - 更新 `pwa/assets/personal-space/v2/README.md`（仍寫 259,133 B／1,766,935 B，現為 182,283 B／1,293,693 B）與 `docs/ps-243-production-acceptance.md` 中過時的預算數字；
   - 修正根目錄 `README.md`「25% 空間擴充 → 50% 家具 → 75% 風格 → 100% 全新主題」與實際的專案階段（`WORKSPACE_PROJECT_PHASES`，每階段加入具名家具）不符。
