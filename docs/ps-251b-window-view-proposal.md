# PS-251B 提案：窗外依時段變化

> 狀態：**草稿，等待使用者決定 §8**。來源：PS-248 提案 §4.2（PS-248A2），使用者 2026-10-23 決定「做」，先寫實作提案（窗戶遮罩、圖層、素材預算與快取），核准後再渲染。

## 1. 結論

- 現在窗外烘在房間背景裡，只有白天與夜晚兩種（§2）。晨間（05–10 時）看到的是白天的窗外，傍晚（17–21 時）是夜晚的窗外。
- 五個房間風格的幾何、相機與窗戶完全相同（PS-250E2 的前提），兩種畫風各自也只有一個相機。所以**同一張窗外圖可以給五個房間共用**，不需要重新渲染任何房間。
- 建議（§3.1，E-A）：**窗外疊層**。
  - 每個時段、每種畫風渲染一張與房間背景同尺寸的 RGBA 圖：只有窗戶看得到的地方不透明，房間的牆、窗框、捲簾都是透明（物件的 holdout 旗標，§3.1）。
  - 這張圖疊在房間背景**之上**、家具之下，蓋住烘進去的窗外。順序與 art bible §7 的圖層契約相同（room shell → exterior → props）。
  - 白天與夜晚維持烘進去的窗外，不需要疊層（W2，§8.1）。只為**晨間**與**傍晚**各做一張，兩種畫風共 **4 張圖**。
  - 圖載入失敗（離線、未快取）時不畫疊層，看到的是烘進去的窗外，與現在相同。
- 不需要的：
  - 不重新渲染 20 張房間背景（5 個房間 × 2 種畫風 × 日夜）；
  - 不需要房間背景改成有 alpha；
  - 不需要執行時遮罩：遮罩就是疊層自己的 alpha。
- INFRA-105：只在 `getWorkspaceSceneAssets()` 回傳的物件上新增一個屬性（`exterior`），**不新增任何 export**。舊版的 `assetManifest.js` 沒有這個屬性，新版的畫面就不畫疊層。
- **先知道效果的範圍**（§2，獨立 review 實際渲染量測）：
  - 窗戶只佔畫面約 3.4%，而且窗裡幾乎都是建築：近處建築約 85%、遠處建築約 14%、亮著的窗約 1%，天空只有約 0.1%。
  - 所以換天空的顏色幾乎看不出來。看得出差別的是**建築的顏色與亮度**和**亮著的窗**；想看到晨曦或夕陽的天空，就要讓晨間、傍晚的天際線低一點或少一點（§8.2）。
  - 因此建議實作的第一步一定是**預覽**：先渲染合成圖給你看，確認配色後才產生正式素材。

## 2. 現況

| 項目 | 位置 | 現況 |
|---|---|---|
| 窗外的建模 | `art-pipeline/ps244-blender/scene.py` `build_room()` | 右牆整面落地窗，只有窗框與捲簾、沒有玻璃。天空是一片自發光的漸層平面，天際線是 18 棟建築，都在獨立的 `outside` 群組（不投影、不描邊）。建築頂端放在剛好越過右牆頂的視線之下，多數比窗頂高（後排補滿空隙）；天空平面只出現在窗戶視野最上面約 11%，再往下的視線先碰到 `ground` holdout。配色在 `SKY` 與 `SKYLINE`，只有 `day` 與 `night` |
| 窗內看得到什麼 | 獨立 review 渲染量測 | 近處建築約 85%、遠處建築約 14%、亮著的窗約 1%、天空約 0.1% |
| 窗戶的面積 | 疊層的 alpha（量測） | 約 3.4% 的畫面（x 1228–1535、y 117–595）。以日夜亮度差估計會高估（5.4%，混到地板陽光、窗台與壁燈） |
| 房間背景 | `pwa/assets/personal-space/v2/workspace/…` | 窗外烘在背景中，背景不含家具與裝飾。Q 版 1536 × 1024 WebP（白天 82,546 B、夜晚 64,318 B）；像素版 1536 × 1024 PNG（一個美術像素＝四個房間像素） |
| 房間風格 | `art-pipeline/ps250-rooms/README.md`、`ps244-blender/room_styles.py` | 五個風格只換材質、地板、描邊色、環境光與背景色；幾何、相機、家具形狀與光源相同。風格表沒有改到 `outside` |
| 時段 | `pwa/js/timeBand.js` | 晨間 05–10、白天 10–17、傍晚 17–21、深夜 21–05 |
| 日夜房間 | `content/assetManifest.js`（`NIGHT_TIME_BANDS`） | 晨間與白天用白天的房間，傍晚與深夜用夜晚的房間（PS-250E1） |
| 光線疊層 | `ui/orbitWindow.js`、`runtime/pixiSceneRuntime.js` | 白天的房間依時段加淡淡的色調（Pixi：`0xf6d58b`，alpha .05）；夜晚的房間只輕微調暗角色與天氣（Pixi：深藍，alpha .1；poster 是 soft-light 漸層） |
| 時段何時更新 | `viewModels.js` `getTimeBand(now)` | 只在建立 view model（重新 render）時計算；app 開著跨過時段時，要等下一次 render 才換（現在的日夜房間也是如此）。提醒時段（12、14 時）已有重新 render 的計時器：`remindWindow.js` 的 `watchRemindWindow()` |
| 預算 | `docs/ps243/asset-baseline.json` | 圖片：首次繪製 122,433 / 1,572,864 B，寬鬆。延後載入的 JS gzip **303,269 / 307,200 B，只剩 3,931 B**；`assetManifest.js`、`orbitWindow.js`、`pixiSceneRuntime.js`、`assetGallery.js` 都計入 |
| manifest | `art-pipeline/ps242/build-manifest.mjs` | 讀得懂 PNG 與有損 WebP（含 alpha 的 `VP8X`）；無損 WebP（`VP8L`）會拋錯。PS-242 manifest 只收 `getWorkspaceAssetManifestPaths()` 列出的 Q 版檔案，像素版另記在各自管線的 `outputs.json` |

## 3. 做法

### 3.1 窗外疊層（E-A，建議）

- 渲染：同一個場景與相機，`outside` 群組照常可見並換成該時段的配色，其他所有物件（房間、捲簾、窗框）設為 holdout，`film_transparent` 開啟。輸出就是「只有窗戶裡的建築與天空，其他透明」的 RGBA 圖。
- **holdout 用物件的 `is_holdout` 旗標**（或關掉 Freestyle），不用 `render_pack.set_occluder()` 的 Holdout 材質。Freestyle 會畫出 Holdout 材質物件的描邊（`set_occluder()` 正是為了這個才用材質），整個房間的線會進到疊層（實測 alpha 擴大到畫面的 8.4%）；用旗標時疊層只有窗外，與關掉 Freestyle 相同。
- 房間背景的渲染本來就不含家具與裝飾（它們是另外的 sprite），所以疊層也只被房間本身擋住。家具、裝飾與角色照常畫在疊層之上。
- 獨立 review 已用白天的配色試渲染：疊在白天背景上，五個風格都只在邊緣像素與亮窗的取樣雜訊不同；像素版以 384 寬渲染、放大 4 倍，也與像素背景對齊（差別只來自 64 色調色盤）。
- 窗框的反鋸齒邊緣在疊層中是半透明，底下是烘進去的白天或夜晚窗外。晨間、傍晚的建築顏色與烘進去的不同時，邊緣會有一點混色；窗框描邊靠窗外的那一半也會被疊層蓋住。在 app 的尺寸下很小，預覽時在淺色窗框（北歐、和風）上確認。像素版沒有反鋸齒，沒有這個問題。
- 五個房間共用：幾何相同，疊層的 alpha 在五個風格逐像素相同（實作時比對確認，只保留一套）。
- 圖層：

```text
房間背景（含烘進去的窗外）
→ 窗外疊層（晨間、傍晚才有）
→ 家具、裝飾
→ 角色
→ 光線疊層、天氣、reveal
```

### 3.2 不建議的做法

| 做法 | 內容 | 不建議的原因 |
|---|---|---|
| E-B：房間的窗洞改透明（PS-248 §4.2 原案） | 房間背景的窗洞透明，窗外圖放在房間之下 | 窗洞可以用疊層的 alpha 在後製挖掉，不一定要重新渲染；但 20 張背景都要改成有 alpha 的格式，而且每個時段都必須有窗外圖，載入失敗時窗洞是空的。E-A 的結果相同，失敗時仍有烘進去的窗外 |
| E-C：只用 CSS／Pixi 色調 | 在窗戶位置疊一層半透明顏色 | 沒有遮罩就會染到窗框與房間；建築與亮窗不會有不同的光 |
| W1：四個時段都做疊層 | 白天與夜晚也有疊層 | 與烘進去的窗外相同，只多兩張圖（§8.1） |

## 4. 素材與渲染

- **看得出差別的是建築與亮窗**（§1）。新增兩組 `SKYLINE`（與 `SKY`）配色，初稿如下，以預覽決定（§8.2）：

| 時段 | 近處建築（顏色、強度） | 遠處建築（顏色、強度） | 亮著的窗（顏色、強度、比例） | 天空（下 → 上、強度；只佔窗內約 0.1%） |
|---|---|---|---|---|
| 現在的白天 | `#56729f`，0.9 | `#8aa6cf`，1.0 | `#e8f1ff`，1.4，25% | `#f5c58a` → `#5f94d6`，1.6 |
| 晨間（初稿） | `#8a7fa0`，0.9（偏桃紫的晨光） | `#c4a8b8`，1.0 | `#ffe2b0`，1.6，10% | `#f7c9a0` → `#9ec3ea`，1.3 |
| 傍晚（初稿） | `#4a3f6b`，0.8（偏紫的暮色） | `#a3708a`，0.9（被夕照染暖） | `#ffd27a`，3.0，40% | `#f39a62` → `#4b4f8f`，1.2 |
| 現在的夜晚 | `#111a36`，0.7 | `#1c2850`，0.7 | `#ffd27a`，3.2，50% | `#2b3d7a` → `#070b22`，1.0 |

- 若選「天際線低一點」（§8.2 的 S2）：晨間、傍晚的建築降低或減少，讓天空露出。天空平面（或後面加一片背板）要延伸到窗戶的整個開口，疊層的 alpha 才會蓋滿窗戶；否則烘進去的建築會從空隙露出來。
- 管線（新資料夾 `art-pipeline/ps251-window/`）：
  - `render_window.py`：沿用 `scene.py` 建場景，加上 `--band morning|evening` 與「只有窗外」的模式（上述 `is_holdout`）。Q 版 1536 寬；像素版以 `ps250-pixel/render_pixel.py` 的設定在 384 寬渲染，再放大 4 倍。每張約 1 分鐘（試渲染 8 samples 約 50 秒）。
  - `process_window.py`：
    - Q 版存成**有損、有 alpha 的 WebP**（`VP8X`，`build-manifest.mjs` 讀得懂）；
    - 像素版存成 PNG（以調色盤 PNG 存約 3 KB；沿用現有的 RGBA 寫法約 13 KB）；
    - 檢查 alpha 只在窗戶範圍內；
    - 寫入 `art-pipeline/ps251-window/outputs.json`（兩種畫風的尺寸、SHA-256）。不寫進 `ps250-pixel/outputs.json`：`ps250dPixelSet.test.js` 以固定的資料夾、數量與日夜場景檢查它。
  - `art-pipeline/ps242/build-manifest.mjs`：`buildOutputEntry()` 只認得背景、角色、天氣與已知的家具／裝飾路徑，其他路徑會拋出「PS-242 manifest metadata missing」。要新增 `workspace/window/exterior-*.webp` 的分支（`id`、`label`、`role: 'exterior'`、`band`、`projectPhase: 'all'`、來源、QC、授權；PS-242 的測試要求 `id`、`label`、`projectPhase`），Q 版疊層才能進入 manifest。
- 檔案：`workspace/window/exterior-{morning,evening}.webp`、`workspace/pixel/window/exterior-{morning,evening}.png`。
- 大小（試渲染 q86）：Q 版每張約 11 KB，兩張約 22 KB。
- 預覽：`art-pipeline/ps251-window/previews/` 放五個房間 × 兩種畫風 × 晨間與傍晚的合成圖（房間背景＋疊層＋100% 家具＋執行時的光線疊層：晨間是白天房間的暖色，傍晚是夜晚房間的深藍）。

## 5. 執行時

- `assetManifest.js` `getWorkspaceSceneAssets()`：
  - 回傳的物件加上 `exterior`：晨間與傍晚是該畫風的疊層路徑，白天與深夜是 `null`；
  - 不分房間風格；
  - 只是新屬性，不是新的 export（INFRA-105）。
- **用哪一張疊層**：依**實際畫出的房間背景的畫風**與目前的時段決定，不從實際畫出的那一層（tier）讀：
  - 夜晚房間載入失敗時退回的白天房間，是不帶時段建立的（`exterior` 會是 `null`），但傍晚仍要畫傍晚的疊層；
  - 像素房間退回 Q 版房間時要畫 Q 版疊層，否則像素的階梯邊緣會疊在反鋸齒的窗框上。
- 首頁 poster（`orbitWindow.js`）：
  - 在背景圖之後加一個 `<img class="orbit-window-exterior" alt="">`，位置以 inline style 寫（`position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none`），與背景相同。**不沿用 `orbit-window-background` 的 class**：`ps250b-appearance.test.js` 等 e2e 以這個 class 找背景（Playwright 的 locator 是 strict），在晨間、傍晚跑測試時會同時找到兩個元素而失敗。inline style 讓新的 JS 搭配舊的 `style.css` 也不會錯位。poster 本身已是 `aria-hidden`；
  - `onerror` 時移除自己（不顯示破圖），露出烘進去的窗外；
  - poster 的圖片是各自退回：背景圖載入失敗、換成另一個畫風或白天房間時，背景的錯誤處理也要一併換掉或移除疊層，疊層才會跟著實際畫出的背景（只在疊層上設 `data-fallback-src` 做不到）；
  - 像素版沿用 `data-pixel-art`（`image-rendering: pixelated`）。
- Pixi（`pixiSceneRuntime.js`）：
  - 疊層另外載入，在房間的 `Promise.all` 之外，錯誤自行處理（`loadPart()` 在每一層都失敗時會拋錯）。失敗時不畫，**不影響**房間與家具的退回順序；
  - `zIndex` 在背景（0）之上、家具（10）之下；
  - 像素版疊層加入 nearest 取樣的清單（`useNearestSampling`）；
  - 個人空間頁沿用同一個 runtime。
- 開發者的素材總覽（`assetGallery.js`）：
  - Q 版疊層經由 `getWorkspaceAssetManifestPaths()` 出現；
  - 像素版不在 manifest 裡，`pixelStylePaths()` 現在只以白天與夜晚取場景（`scene.exterior` 是 `null`），要加上晨間、傍晚（或直接列出疊層）才會出現；
  - `ASSET_GROUPS` 加上 `workspace/window/` 與 `workspace/pixel/window/` 的分組（它只分類，不會找出檔案）。
- 光線疊層不變：晨間仍是白天房間加 .05 的暖色，傍晚是夜晚房間。房間內的光（例如地板上的陽光）不隨窗外改變，這是「只換窗外」的代價（§8.3）。
- 開著 app 跨過時段（§8.4）：
  - T0：維持現狀，下一次 render 才換（日夜房間也是如此）；
  - T1：首頁與個人空間頁在下一個時段邊界（05、10、17、21 時）重新 render 一次。房間的日夜與窗外會一起準時換。
    - 沿用 AI-203B 提醒時段的重新 render 路徑：`remindWindow.js` 的 `watchRemindWindow()` 已在 12:00、14:00 觸發，回到前景時（`visibilitychange`，裝置睡眠會延後計時器）也重新檢查。首頁走 `replaceHomeOrbitWindow()`，個人空間頁走 `refreshForRemindWindow()`；兩者已保留打開的詳細資訊面板、它的 invoker 與鍵盤焦點（`describeControl()`／`findControl()`，不捲動頁面）。
    - 做法：`watchRemindWindow()` 的計時點加上四個時段邊界，而且它比較的狀態從「是否在提醒時段」改為「是否在提醒時段**與目前的時段**」：現在的 `check()` 只在提醒時段開關時才呼叫 callback，多數時段邊界（以及裝置睡眠後的 `visibilitychange`）都不會觸發。這是既有 export 的內部行為改變，**不新增 export**（INFRA-105 的規則），也不另寫一條會關掉面板或丟失焦點的 render 路徑。
    - 已知的共同行為：邊界剛好落在 reveal 播放中時，卡片重建會讓 reveal 從頭播放（不會被標記為已看過）；提醒時段現在也是如此。
- 不需要改的：Edit Mode 的房間縮圖（用白天背景，與時段無關）；telemetry（不帶時段或光線）；減少動態效果（疊層是靜態圖，T1 是直接替換）；窗外的天氣（現在也沒有，不在範圍）。
- JS：E-A 的執行時改動（`assetManifest.js`、`orbitWindow.js`、`pixiSceneRuntime.js`、`assetGallery.js`）加上 T1，估計約 0.4–0.8 KB gzip，在剩下的 3,931 B 之內，但之後的任務空間更小。

## 6. 快取與預算

- 建議（§8.5）：
  - Q 版的晨間、傍晚疊層加入 SW 的 SHELL 預先快取（與預設房間的日夜背景相同，離線時 poster 在每個時段都完整），約 22 KB；
  - 像素版在第一次顯示時下載（與像素房間相同，PS-250B）。
- 不預先快取也不會壞：沒有疊層時看到的是烘進去的窗外。
- PS-243：可另加晨間、傍晚的「首次繪製」組合；JS 預算見 §5。

## 7. 要更新的文件

- art bible §6.1：「1 modular window/exterior layer」改為「烘進房間的白天與夜晚窗外，加上晨間、傍晚的窗外疊層（兩種畫風共用於所有房間）」，註明使用者 2026-10-23 的決定。§7.2 加上疊層的做法。
- asset pipeline 文件：「one exterior/window background」的上限同上更新。
- `art-pipeline/ps244-blender/README.md`、`ps250-rooms/README.md`：窗外疊層與重新渲染的步驟。
- technical design §12（快取）：SHELL 加上 Q 版疊層。
- vertical slice、`personal-space-state-flow.md`：沒有 state 變化，不需要改。
- `tasks.md`：PS-251B 的驗收條件（§9）。

## 8. 需要使用者決定

1. **哪些時段有自己的窗外**：
   - W2（建議）：晨間、傍晚各一張疊層，白天、深夜維持烘進去的窗外。兩種畫風共 4 張。
   - W1：四個時段都用疊層，共 8 張；與烘進去的相同，只在之後想改白天或夜晚的窗外時有用。
2. **窗外的樣子**（窗內幾乎都是建築，§1）：
   - S1（建議）：天際線不變，晨間、傍晚換**建築的顏色、亮度與亮窗**（§4 的初稿：晨間偏桃紫、亮窗少；傍晚偏紫、遠處被夕照染暖、亮窗多）。
   - S2：晨間、傍晚的天際線低一點或少一點，讓晨曦、夕陽的天空露出來。差別更明顯，但窗外的城市在不同時段會「變形」，天空平面也要延伸（§4）。
   - 兩者都**先渲染預覽**（五個房間 × 兩種畫風 × 兩個時段的合成圖）給你看，確認後才產生正式素材。
3. **房間內的光**：維持（建議，只換窗外）；或晨間、傍晚另調光線疊層的色調（例如傍晚加一點暖色）。
4. **開著 app 跨過時段**：T1（建議，時段一到就換，房間的日夜也一起準時，沿用提醒時段的保留面板與焦點的重新 render）或 T0（維持現狀）。
5. **快取**：Q 版疊層預先快取、像素版第一次顯示時下載（建議）；或都不預先快取。
6. **素材上限**：同意把 art bible §6.1 與 asset pipeline 的「一張 exterior」上限改為上述（「做」的決定已包含，這裡只是確認文件寫法）。

## 9. 驗收條件草稿（核准後寫入 tasks.md）

- 預覽：先提交預覽合成圖（§4），使用者確認配色後才產生正式素材。
- 素材：
  - 晨間、傍晚的窗外疊層，Q 版與像素版各一套；
  - holdout 用物件旗標，alpha 只在窗戶範圍內，五個房間風格逐像素相同；
  - Q 版加入 `getWorkspaceAssetManifestPaths()`，進入 PS-242 manifest（`ps242AssetManifest.test.js`、`personalSpaceOrbitWindow.test.js` 中固定的檔案數 50 隨之更新）；兩種畫風都記在 `art-pipeline/ps251-window/outputs.json`（PS-242 manifest 不收像素檔，`ps250dPixelSet.test.js`；`ps250-pixel/outputs.json` 不變）；
  - PS-211A 的預先快取推導（`ps211aPrecache.test.js`）加上 `scene.exterior`。
- 執行時：
  - 晨間、傍晚在首頁 poster、Pixi 場景與個人空間頁都畫出疊層，白天與深夜沒有；
  - 疊層在背景之上、家具之下；五個房間與兩種畫風都正確；
  - 疊層的畫風跟著實際畫出的房間背景；夜晚房間退回白天房間時，傍晚仍畫傍晚的疊層；
  - 疊層載入失敗時不出現破圖，房間照常（看到烘進去的窗外），房間與家具不因此退回預設；
  - 開發者的素材總覽列出兩種畫風的疊層（像素版經由 `pixelStylePaths()`）；
  - `build-manifest.mjs` 有疊層的分支，重新產生 manifest 不拋錯。
- 相容：
  - 舊的 `orbitWindow.js`／`pixiSceneRuntime.js` 搭配新的 `assetManifest.js`（以及反過來），新的 JS 搭配舊的 `style.css`，都不壞；
  - 不新增 export。
- T1（若採用）：
  - `watchRemindWindow()` 的 unit test：在 05、10、17、21 時與 12、14 時都呼叫 callback，跨過時段的 `visibilitychange` 也呼叫；不在邊界時不呼叫；
  - 以固定時間的 e2e 驗證：app 開著跨過 17 時，房間換成夜晚、窗外換成傍晚，只重新 render 一次；
  - 頁面在背景（或裝置睡眠）跨過 17 時，回到前景時更新；
  - 個人空間頁的詳細資訊面板打開、焦點在面板內時跨過時段邊界：面板仍打開，焦點仍在同一個控制項（與 AI-203B 提醒時段的既有測試相同）；首頁卡片上的焦點保留。
- 快取：依 §8.5 的決定加入 SHELL，PS-211A 的離線 e2e（`sw-precache.test.js`）固定的預先快取數 44 隨之更新，並加上一個晨間與一個傍晚的時刻（現在只跑 12 時與 22 時），在晨間與傍晚也顯示完整的 poster。
- 既有 e2e 以 `.orbit-window-background` 找背景，疊層不能用同一個 class（§5）；在晨間、傍晚的時刻跑一次這些測試確認。
- 預算：PS-243 baseline 更新；延後載入的 JS 不超過 307,200 B。
- 文件：§7。

## 10. 成本與拆分

- 一個 PR（PS-251B 的實作）：管線＋預覽（等確認）＋4 張素材＋執行時＋測試＋文件。
- 渲染：疊層只有建築與天空要算光，每張約 1 分鐘；預覽合成用既有的房間背景與家具，不重新渲染房間。
