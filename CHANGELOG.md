# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [1.31.1] - 2026-10-19

### Fixed
- **開發者面板的「還原」不再讓模擬值外流到真實帳號（PRO-014Q S0）**：只影響開發者模式的裝置（localhost、ngrok 或 `orbit_dev_panel`）。模擬等級或 Pro 時，正常使用（完成 Session、換日）會把含模擬值的 user 排成 pending profile；備份存在時上雲被擋住。舊的「還原」只把備份寫回本機並刪除備份，pending 留著，下次啟動就被推上 `profiles`。`legacy` source 下這會授予真的 Pro。
  - 「還原」改為先顯示確認對話框，確認後清除：
    - 備份；
    - 這台裝置上**所有帳號**的 pending profile，包括無 owner 的舊 key；
    - 本機 user；
    - Pro projection；
    - 所有帳號的 V2 state。
  - 清除後重新載入，從雲端取回真實資料。
  - 保留 legacy 個人空間與 legacy claim，其他帳號仍無法認領 legacy state。
  - 對話框寫明代價：模擬期間獲得的 XP 與連勝變動會被捨棄，已記錄的 Session 會保留；個人空間依雲端資料重新建立，開場 Gold 可能偏低，尚未播放的世界變化會遺失；清除後若離線，要等連線後重新登入。
- **另一個視窗按「還原」後，這個視窗會重新載入**（review 找到的 P1，main 上原本就有）：同時開兩個視窗（兩個分頁，或分頁加已安裝的 App）時，一個視窗的「還原」刪掉擋住上雲的備份，另一個視窗記憶體中仍是模擬的 user，下一次完成 Session 就會把模擬值推上 `profiles`。現在備份被其他視窗移除、或 localStorage 被整個清空時，這個視窗會重新載入。
- **遊客按「還原」不再失去 profile**（review 找到的 P2）：遊客的 profile 只存在這台裝置。讀取登入 session 成功且沒有 session、備份就是目前本機 user 的備份時，「還原」把備份寫回本機 user，其餘照樣清除；對話框改寫為遊客版本，不再說「從雲端重新載入」。已登入的帳號、session 因離線等原因無法讀取、或備份屬於別的帳號時，照舊刪除本機 user，避免舊的備份蓋掉雲端較新的資料。重新載入完成前再按一次「還原」不會有作用。

### Validation
- 新增 `tests/unit/pro014qDevReset.test.js`，用真實的 storage、設定頁與 V2 controller 驗證：
  - 取消時不清除任何東西；
  - 確認後的完整清理；
  - 清理後兩個帳號的 `loadFromRemote()` 都不 upsert profile；
  - 對照組：只刪備份時模擬的 `total_xp` 會被推送；
  - 刪除 V2 state 後，開場 Gold 與乾淨裝置依真實 XP 算出的相同；
  - 遊客：備份寫回本機 user、其餘照樣清除、顯示遊客版對話框；別的帳號的備份、已登入、或讀取 session 出錯時，不寫回；重新載入前的第二次點擊、與等待 session 期間的重複點擊都不會再跳出對話框。
- `tests/unit/appBootSequence.test.js` 新增：其他視窗移除備份或清空 localStorage 時重新載入；建立備份、其他 key 或 sessionStorage 的事件不會。
- `npm run ps243:assets` 重新產生 `docs/ps243/asset-baseline.json`（V2 延遲載入 gzip 51,924 → 52,192 bytes）。

---

## [1.31.0] - 2026-10-19

### Added
- **Companion 會溫和提醒今天選好的目標（AI-203B）**：首頁小卡與「空間」完整頁面的 Companion 新增 `remind`，台詞為「你選擇的目標還在這裡，準備好時再開始。」。以下條件全部成立才出現（使用者核准的 AI-203 選項 A、G1、M1、F4）：
  - 首頁的今日計畫中有符合 Main Quest 資格的任務（不含 instant、恢復、娛樂、B 級以下、封存或停用、已刪除的任務與新手導覽任務）；
  - 今天還沒有屬於這些任務、結果為 `complete`／`partial`／`instant` 的 Session，開始做之後提醒就結束；
  - Momentum 為 `low`，且有 Session 的日期至少 3 天，新使用者不會被提醒；
  - 本地時間在 12:00–14:00 之間，且日曆日等於 effective date（00:00 到換日時刻之間不提醒）；
  - 沒有更高優先的反應（reveal、今天最新的恢復或一般任務 Session）。
- 頁面開著時，進入或離開 12:00–14:00 會自動重新判斷，過夜開著的頁面隔天中午也會；從背景回到前景時也會。離開頁面時取消計時器。
- 這個自動重新判斷不是使用者的操作，所以不打斷使用者：完整頁面已打開的詳細資訊面板維持打開，鍵盤焦點留在同一個控制項上且不捲動頁面（首頁小卡亦同）。

### Changed
- 靜態 fallback 的 `remind` 動畫只靠近一次、不再來回循環，與 Pixi 版的一次性靠近一致（D2）；`approach` 不變。
- `companionEngine.js` 的優先順序與 Momentum 的計算方式不變；`missedPatterns` 改由 view model 從今日計畫推導，不新增、不寫入任何 state。
- view model 只讀一次時鐘：effective date、提醒時段與 `timeBand` 使用同一個 `now`。

### Performance
- 新增 `pwa/js/personalSpace/v2/remindWindow.js`（3,867 bytes），加入 service worker 預快取。延遲載入的 Personal Space V2 程式碼 gzip 49,627 → 51,924 bytes，連同 Pixi 合計 275,055 → 277,352 bytes，仍在預算內。

### Validation
- 新增測試：
  - view model：提醒的時段邊界（11:59、12:30、14:00）、日曆日與 effective date 不同、G1、Momentum 非 `low`、計畫為空或只有不合格任務、已推進後又記了其他 Session、目標的 Session 無效或沒有任務時仍提醒、更高優先的反應（今天的一般任務與恢復 Session），小卡與完整頁面的台詞 key 一致；
  - 計時器：時段開始與結束時自動 refresh、過夜後隔天 12:00 再開啟、從背景回到前景重新判斷、unmount 後不再觸發；
  - 完整頁面與首頁小卡：頁面開著跨過 12:00 時切換成 `remind`；跨過時段邊界後，打開的詳細資訊面板、關閉後的焦點返回，以及鍵盤焦點都保留，且還原焦點時不捲動；`describeControl`／`findControl` 的邊界情況；
  - D2 的 CSS 規則。
- `npm run ps243:assets` 重新產生 `docs/ps243/asset-baseline.json`。

---

## [1.30.1] - 2026-10-19

### Fixed
- **「空間」的家具不再被移到舊相機的座標（PS-246）**：舊版 idle window 留下的位置覆寫（`world.idleWindowLayouts`、`world.placedItems`）屬於舊的 16:9 左／中／右相機，與 Blender 相機沒有確定的對應。舊版只要切換過相機角度、全部顯示／隱藏或旋轉，就會存下 `x`／`y`，使書桌、椅子與書櫃在新場景往下掉 15–24% 畫面高度、與主角重疊。V2 現在一律使用 Blender 校準的位置；舊資料原封保留，切回舊版場景時照舊使用。

### Changed
- Edit Mode 改為說明「工作站家具的位置由固定視角的場景決定，目前不能移動」，移除對舊擺放的列出、微調與「重設全部調整」（後者會清掉 V2 保存的舊資料副本）。
- `docs/personal-space-v2-technical-design.md` §7.2：不另存 `migration.unmappedPlacements` 摘要，保留的舊資料本身就是紀錄（使用者核准的 S1）。

### Performance
- 移除不再使用的編輯程式碼與樣式：延遲載入的 Personal Space V2 程式碼 gzip 51,579 → 49,627 bytes（`personalSpaceV2.js` 原始大小 25,929 → 16,659 bytes），連同 Pixi 的延遲載入合計 277,007 → 275,055 bytes。

### Validation
- 新增回歸測試：帶有舊相機覆寫的 V2 state，每件家具的位置都等於 Blender placement，舊資料不被改動（此測試在修正前的程式碼上會失敗）；store 儲存再載入後舊資料不變；進出 Edit Mode 不寫入任何東西。
- `npm run ps243:assets` 重新產生 `docs/ps243/asset-baseline.json`。

---

## [1.30.0] - 2026-10-18

### Changed
- **「空間」的 Blender 工作站精細化（PS-245）**：沿用 PS-244 的同一個場景與相機，把家具與房間做出真實構造。
  - **家具**：
    - 書桌：封邊桌板、內縮抽屜與橫桿把手、邊櫃門、鋼腳與橡膠腳墊、走線槽，以及桌墊、筆記本、馬克杯。
    - 椅子：彎曲網布椅背、腰靠、頭枕、扶手與腳輪。
    - 書櫃：書背色帶、書擋、收納盒、獎盃與相框。
    - 檯燈：雙桿關節臂、燈罩邊環與電線。
    - 計畫板：木框、紅線串起便條、月曆與照片。
    - 螢幕與鍵盤：程序化繪製的程式碼編輯器與亮色儀表板畫面（小卡尺寸也看得清楚）、背殼與支架；鍵盤做出逐顆鍵帽與滑鼠。
    - 盆栽：加上底盤與更多葉片。
  - **房間**：地板木紋、角色站立區的地毯、護牆框線板、每個光暈上方的壁燈（不投影，避免在光暈裡留下暗影）、書櫃上方的時鐘、插座、窗戶的捲簾與窗簾。
- 相機不變，角色比例（24%／13%）與成就相框位置都不需要調整；新物件避開相框在桌面與手機尺寸的範圍。

### Performance
- 細節增加後，首屏素材 170,661 → 182,283 bytes（+6.8%），完整場景 1,252,207 → 1,298,650 bytes（+3.7%）。仍低於 PS-244 之前的 259,133／1,766,935，也遠低於 1.5 MB／4 MB 的目標。

### Validation
- `npm run ps242:manifest -- --check`、`npm run ps243:assets -- --check` 通過；`ps243AssetBudget.test.js` 更新釘住的位元組數。
- 五個專案階段的合成預覽（`art-pipeline/ps244-blender/previews/`）在 100% 與小卡尺寸（360 px 寬）目視 QA：家具透視與陰影正確、椅子在螢幕前方、相框範圍內沒有新物件或陰影。
- 刻意不做的範圍（門、牆面掛畫、重新取景）與理由記在 `tasks.md` 的 PS-245。
- `npm run lint` 通過；`npm test`（64 files／1073 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。

---

## [1.29.0] - 2026-10-18

### Changed
- **「空間」的房間與 8 件工作站家具改由 Blender 重新渲染（PS-244）**：
  - 房間背景，以及 Workspace Upgrade 的書桌、椅子、書櫃、檯燈、計畫板、單／雙螢幕與盆栽，全部來自同一個程序化 Blender 場景與固定相機。
  - 採插畫感 toon 材質加細輪廓線。
  - 修正先前「繪製房間＋舊像素家具」混用造成的問題：風格不一致、正面書桌對 3/4 房間的透視衝突、缺少接觸陰影，以及紫色去背殘邊。
- 繪製順序依相機深度：椅子在書桌、螢幕、鍵盤與檯燈前方，z 由 26 改為 30，螢幕支架與鍵盤不再畫在椅背上。
- 接觸陰影跟著家具一起渲染（shadow catcher），所以家具位置改變時陰影跟著走。每件家具的位置由 3D 投影後的裁切框計算，執行時與房間逐像素對齊。
- 主角與 Companion 依 1.7 m 比例假人校準：sprite 寬度由 17%／9% 調整為 24%／13%，在新房間中比例一致。這是像素角色配 3D 立體場景的 HD-2D 慣例。
- HW-105 成就相框（固定位置的 DOM 疊層）原本在 `top:17% left:31%`，會蓋到新的計畫板。已移到計畫板與書櫃之間的空牆（`top:20% left:47%`）。
- 靜態 poster fallback 的家具不再套 CSS `drop-shadow`：陰影已烘進 PNG，原本會疊出第二層陰影。角色的陰影與 Companion 的光暈不變。
- **位置覆寫只移動家具、不改大小**：舊版 idle-window 編輯器的覆寫與 V2 家具同 id，且帶有舊美術的 `width`／`anchor`。若照單全收，含陰影邊界的新 PNG 會縮成約三分之一，計畫板也會下移。V2 家具現在只採用覆寫的 `x`／`y`（V2 Edit Mode 本來也只調整這兩個值），存著的使用者資料不變。

### Performance
- 素材變小：
  - 首屏素材：259,133 → 170,661 bytes（−34%）
  - 完整場景：1,766,935 → 1,252,207 bytes（−29%）
  - 背景 WebP 只有 71 KB。

### Notes
- runtime 仍是 Pixi 2D：沒有新增 3D runtime，JS 預算不變。主角、Companion 與天氣疊圖沿用 PS-242 素材。
- 可重現的素材管線在 `art-pipeline/ps244-blender/`：
  - `scene.py` 建場景，`render_pack.py` 渲染，`process_pack.py` 處理成素材。
  - 以 PyPI 的 Blender 5.2.2 bpy 模組在 CPU 上用 Cycles 渲染。
  - `process_pack.py --write-runtime` 同時寫出 `placements.json` 與 `assetManifest.js` 的 `PROP_DEFINITIONS`，測試強制兩者一致。
- 舊的 PS-242 房間 webp 與 legacy idle-window 家具檔案保留未刪，供回滾與 legacy 模式使用。
- 相機 ID 由 `building-workspace-v1` 改為 `building-workspace-v2`。角色與天氣素材已在新相機的五個階段合成預覽中重新目視確認。
- **已知限制（已立案 `PS-246`）**：舊版 idle-window 編輯器存下的家具位置覆寫，其 `x`／`y` 仍是舊 16:9 相機的座標，家具可能不在新房間中對應的位置。

### Validation
- 新增 `tests/unit/ps244WorkspacePlacements.test.js`：
  - 背景、相機 ID，以及每件家具的 path／placement 必須等於 `placements.json`。
  - placement 必須能由裁切框推得。
  - 角色寬度 24／13。
  - 家具不得再有 CSS `filter`。
  - 椅子的 z 高於書桌、螢幕與檯燈；位置覆寫只套用 `x`／`y`。
- 更新既有測試：
  - `ps242AssetManifest.test.js`：相機 ID。
  - `ps243AssetBudget.test.js`：位元組基準變小。
  - `personalSpacePixiRuntime.test.js`：新的家具路徑。
- `npm run ps242:manifest -- --check` 與 `npm run ps243:assets -- --check` 通過。
- 五個專案階段的合成預覽（`art-pipeline/ps244-blender/previews/`）目視 QA，含成就相框：家具透視與房間一致、接觸陰影正確、相框不重疊、天花板輪廓線已移除。
- `npm run lint` 通過；`npm test`（64 files／1073 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。

---

## [1.28.2] - 2026-10-18

### Fixed
- **位置情境：清除後不再被寫回**：按「設為目前位置」後、定位還沒回來前按「清除位置資料」或關閉位置情境，晚到的座標原本仍會被存回本機並顯示成功。現在清除與關閉會作廢進行中的定位請求。
- **環境音偵測：權限詢問期間可以取消**：按鈕在等待權限時已顯示「關閉環境音偵測」，但再按一次會發出第二個麥克風請求。現在再按即取消；之後才授權的麥克風會立即關閉。
- **連線恢復同步不再過早顯示「✓ 已更新」**：Session 補傳原本在背景進行，同步就先宣告完成；補傳或刪除失敗時也不會重試。現在等補傳結束，只有待同步佇列清空才顯示已更新，否則顯示待同步數量，並在下次連線時再推送。
- **連線恢復與啟動同步不再同時執行**：啟動時的遠端載入還沒結束就恢復連線，會同時跑第二次載入，同一批待同步資料可能被重複推送。現在所有遠端載入經同一入口排隊。

### Changed
- `db.loadFromRemote()` 改為回傳 `{ backfilled }`（Session 補傳全部完成時 resolve）；開機流程不等它，回報同步狀態的地方才等。

### Validation
- 新增 7 項測試：
  - `placeContextSettings.test.js`：清除或關閉時作廢定位，2 項。
  - `focusAmbient.test.js`：權限詢問期間再按即取消，1 項。
  - `appBootSequence.test.js`：補傳完成前不顯示已更新、佇列未清空顯示待同步並於下次上線重試、啟動同步期間恢復連線不重複載入，共 3 項；另更新既有的連線恢復測試，讓載入後佇列確實清空。
  - `storage-mapping.test.js`：`backfilled` 等補傳寫入後才完成，1 項。
- 修正前，新增的行為測試全部失敗（位置 2、麥克風 1、同步 3）。
- `npm run lint` 通過；`npm test`（63 files／1066 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。

---

## [1.28.1] - 2026-10-18

### Fixed
- **已安裝的 PWA 在更新後第一次離線開啟時無法啟動**：service worker 的預快取清單漏了 5 個啟動時就會載入的模組（`export.js`、v1.26.0 起的 `platform/network.js`、v1.27.0 的 `platform/ambientNoise.js`、v1.28.0 的 `platform/placeContext.js` 與 `ui/placeHint.js`）。更新時舊快取被刪除，這些模組只能從網路取得，離線時整個模組圖無法執行。現已全部預快取。
- 舊版 Personal Space（地圖與家具）延遲載入的 5 個模組（`furnitureState.js`、`world/floorMap.js`、`world/furnitureLayout.js`、`world/sceneGraph.js`、`ui/floorMapPanel.js`）同樣補進預快取，離線也能開啟。

### Validation
- 新增 `tests/unit/serviceWorkerShell.test.js`：從 `app.js` 走訪實際的 static 與 dynamic import 圖，要求每個模組都在 `SHELL` 內，且 `SHELL` 每一項都存在（避免 `cache.addAll()` 讓安裝失敗）。修正前此測試列出上述 10 個遺漏。之後新增模組忘記加入預快取會直接讓 CI 失敗。

---

## [1.28.0] - 2026-10-17

### Added
- **位置情境（實驗功能，HW-107）**：設定頁新增「📍 位置情境」：啟用後可把目前位置設為「家」或「公司」，也可一鍵清除。首頁會依你目前在家、在公司或在外面，顯示一行「📍 在家 · 適合：記帳、整理環境」的提示，從既有任務中挑最多 3 個（在家：維持／恢復；在公司：成長／責任；在外面：即時任務；永不建議娛樂）。
- 新增 `platform/placeContext.js`（低精度單次定位、距離比對、owner-scoped 本機設定）與 `ui/placeHint.js`（首頁提示與任務建議規則）。

### Privacy
- 預設關閉；未啟用或尚未保存任何位置時，App 完全不呼叫定位。
- 只保存使用者指定的「家／公司」粗略座標（四捨五入到 3 位小數，約 110 公尺），以 storageBridge 依帳號存在這台裝置，不上傳、不同步；目前位置只用來比對，不保存。
- 首頁 10 分鐘內只定位一次；定位被拒或逾時則不顯示提示。

### Validation
- 新增 `tests/unit/placeContext.test.js`（15 項：座標四捨五入、距離、標籤判定、低精度請求、owner 隔離與只存粗略座標、清除、任務建議、提示的 opt-in／快取／跳脫／過期 slot／被拒）與 `tests/unit/placeContextSettings.test.js`（6 項：預設關閉、啟用後設定位置、定位失敗、清除、不支援定位、定位期間離開設定頁不重繪）。
- `npm run lint`、`npm test`（62 files／1057 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。

---

## [1.27.0] - 2026-10-17

### Added
- **Focus 模式可選擇偵測環境音（HW-106）**：專注畫面新增「🎙 偵測環境音」按鈕，點擊並允許麥克風後即時顯示「🤫 環境安靜／🙂 環境一般／📢 環境吵雜」。每次專注都需要使用者主動開啟。
- 新增 `platform/ambientNoise.js`：以 `getUserMedia` 音訊與 `AnalyserNode` 計算平滑後的 RMS 音量（dBFS）並分類；門檻為相對值，不代表校正過的分貝數。

### Privacy
- 只讀即時音量：沒有 `MediaRecorder`、不保存、不上傳任何音訊或音量資料。
- 離開 focus 畫面（結束、略過、倒數完成、縮小到背景計時）或 App 進入背景時，立即停止所有麥克風 track，瀏覽器的錄音指示隨之消失；權限對話框期間離開畫面，事後才取得的麥克風也會立即關閉。
- 不支援麥克風的瀏覽器不顯示控制項；權限被拒時顯示「無法使用麥克風」，不重複詢問。

### Validation
- 新增 `tests/unit/ambientNoise.test.js`（7 項：分類、dBFS、只要求音訊、stop 關閉 track 與 AudioContext、權限被拒、AudioContext 失敗仍釋放麥克風）與 `tests/unit/focusAmbient.test.js`（9 項：未點擊不開麥克風、各離開路徑與背景都停止、權限期間離開、權限被拒）；拿掉縮小／背景的停止呼叫時 5 項失敗。
- `npm run lint`、`npm test`（60 files／1036 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。

---

## [1.26.0] - 2026-10-17

### Added
- **離線時看得到待同步的變更，連線恢復後立即同步（HW-110）**：離線時頂部同步列顯示「📴 離線中 · N 筆待同步，連線後自動同步」，每次在離線狀態完成或刪除任務後更新數量；啟動時若因離線無法同步，改顯示離線狀態而不是一般的「同步暫停」。網路恢復後立即推送佇列並重新整理畫面，不必等到下次開啟 App。
- 新增 `platform/network.js` 連線狀態 adapter 與唯讀的 `storage.getPendingSyncSummary()`；待同步資料沿用既有的 owner-scoped pending sidecar（Sessions、Session 刪除、tasks、profile、Energy），沒有新的儲存格式。

### Notes
- 連線恢復的同步只在先前同步失敗或曾離線時執行，避免每次網路切換都重新拉取；刻意不呼叫 `authOperationGuard.begin()`，以免取消仍在進行的登入啟動流程，改在每個 await 後確認 session 未變。
- 有輸入框聚焦時不重新 render 頁面，避免吃掉正在輸入的內容。
- 遊客模式沒有遠端帳號，不顯示同步提示。未修改 schema、Auth 或同步協定。

### Validation
- 新增 `tests/unit/offlineSyncHints.test.js`（9 項：pending 摘要、跨 owner 隔離、連線 adapter、同步列文案）與 `tests/unit/appBootSequence.test.js` 的 6 項 HW-110 啟動整合測試；移除 `app.js` 接線時 HW-110 測試失敗。
- `npm run lint`、`npm test`（58 files／1020 tests）通過；`tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。

---

## [1.25.5] - 2026-10-17

### Fixed
- **回訪使用者的啟動路徑也會 refresh Pro entitlement projection（PRO-014O）**：有本機快取時，App 走 `init()` 的背景同步分支（`getSession()` → `loadFromRemote()`），這條路徑原本不呼叫 `refreshProEntitlement()`；只有 `SIGNED_IN` 事件搶在 `getSession()` 之前時才會經過 `loadAndStart()` 而 refresh。現在背景同步成功後，以同一個 `authOperationGuard` owner 檢查補上 refresh，再更新畫面與宣告同步完成。

### Notes
- production 仍是 `legacy` source，`refreshProEntitlement()` 在 legacy 下直接 no-op，本版對目前使用者沒有行為差異；這是 `PRO-014H` cutover 的前置：切到 `server` 後，若沒有這個 refresh，回訪的付費／試用使用者會在 `SNAPSHOT_TTL_MS`（24 小時）後 fail closed 而失去 Pro。
- 遠端同步失敗（離線）時不 refresh，保留既有 snapshot 讓離線 grace window 生效；refresh 期間登出或切換帳號時，不再以舊 owner 更新畫面。
- 依 AGENTS.md §3，entitlement 啟動流程變更已取得使用者明確核准；未修改 RPC、schema 或 `REPO_PRO_ENTITLEMENT_SOURCE`。

### Validation
- `tests/unit/appBootSequence.test.js` 新增 4 項：快取分支在沒有 `SIGNED_IN` 時仍 refresh 且順序在 `loadFromRemote()` 之後、離線不 refresh、`SIGNED_IN` 先到時只 refresh 一次、refresh 期間登出不宣告同步完成；移除修正時第 1、4 項失敗。
- `npm run lint`、`npm test`（56 files／1001 tests）通過；版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。
- `tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。

---

## [1.25.4] - 2026-10-17

### Fixed
- **登出後回到登入畫面時，登入按鈕不再卡在 disabled（BUG-110）**：成功送出後按鈕會停在「登入中…」／「註冊中…」並 disabled，由 `onAuthStateChange` 接手啟動 App；登出呼叫 `showLoginScreen()` 時因 submit listener 已註冊而直接返回，表單無法再送出，只能重新載入頁面。現在每次顯示登入畫面都會先重設按鈕狀態與文字。

### Notes
- 實際範圍比原記錄大：不只「註冊後直接登出」，任何一次成功的密碼登入後在同一個頁面 session 登出都會觸發。
- 只修改登入表單的 UI 狀態；未修改 `auth.js`、Supabase Auth 設定或 schema。依 AGENTS.md §3，此 auth flow 變更已取得使用者明確核准。

### Validation
- 新增 `tests/unit/authFlow.test.js`（4 項）：登入後登出、註冊（自動登入）後登出再登入、listener 不重複註冊、登入失敗照舊恢復；移除修正時前兩項失敗。
- `npm run lint`、`npm test`（56 files／997 tests）通過；版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。
- `tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行）。

---

## [1.25.3] - 2026-10-17

### Fixed
- **開發者面板的 Pro 狀態切換在 `server` entitlement source 下恢復作用（PRO-014M）**：`server` source 只讀 owner-scoped projection，原本寫入 profile 的 `isPro`／`proExpiresAt`／`trialStartedAt` 不再有任何效果。面板改為依 source 分派：`server` 寫入與 legacy 覆蓋同形狀的 projection（付費＝終身、試用＝剩 14 天、免費＝非 active），`legacy` 維持原行為；面板同時顯示目前生效的 source。
- 開發者覆蓋期間（`orbit_dev_backup` 存在），`refreshProEntitlement()` 不再以 server 回應覆寫模擬的 projection，與既有「覆蓋期間暫停 profile 上雲」使用同一個開關；「還原原始資料」會一併清除模擬的 projection，下次啟動重新向 server 取得。

### Notes
- 只影響開發者面板（localhost／ngrok 或手動開啟 `orbit_dev_panel`）。production 預設仍為 `legacy` source，`REPO_PRO_ENTITLEMENT_SOURCE` 未變更，沒有執行 `PRO-014H` cutover。
- projection 本來就不是安全邊界（見 `proEntitlement.js` 檔頭）：refresh 暫停不會讓任何人取得手寫 snapshot 原本拿不到的東西，`SNAPSHOT_TTL_MS` 仍會讓模擬值在 24 小時內失效，且覆蓋期間 profile 不上雲，模擬值不會同步到其他裝置。
- 盤點時發現 legacy 覆蓋本身在登入且連線的情況下撐不過重新整理：`_devApplyPro()` 只寫本機 user，重新載入後 `loadFromRemote()` 會以遠端 profile 覆寫。此為既有行為，未在本版變更。
- 實作時另發現 cached-user 啟動路徑不保證呼叫 `refreshProEntitlement()`：切到 `server` source 後，回訪的付費使用者可能在 24 小時 TTL 後失去 Pro。已立 `PRO-014O` 並列為 `PRO-014H` cutover 前置，未在本版修正。

### Validation
- 新增 `tests/unit/proDevPanel.test.js`（12 項）：以真實 storage／proEntitlement 渲染設定頁並點擊面板，覆蓋兩種 source 的付費／試用／免費、owner 切換、無 owner、還原與 source 顯示；移除實作時 server source 的 6 項會失敗。
- `tests/unit/proEntitlementGate.test.js` 新增 dev backup 期間不呼叫 `my_pro_status()`、還原後恢復 refresh 的回歸測試；移除 guard 時失敗。
- `npm run lint`、`npm test`（55 files／993 tests）通過；版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。
- `tests/e2e` 41/41 通過（本機以容器內建 Chromium 執行；repo 的 Playwright 設定未變更）。

---

## [1.25.2] - 2026-08-31

### Fixed
- **Service Worker 不再快取 Supabase Data API 或任何跨來源 GET 回應**：fetch handler 只接管與 PWA 同來源的請求；owner-scoped `profiles`、`tasks`、`sessions`、`energy` 等資料一律由瀏覽器直接走網路，不會落入通用 cache-first 分支。
- **登出後再次登入不再讀回 setup 前的空 snapshot**：v1.25.2 的新 cache 名稱會在 Service Worker activate 時刪除 `orbit-v1.25.1`（包含其中既有的 Supabase REST 回應），之後也不再重新收錄跨來源資料。

### Notes
- `PRO-014J` 在 PR #151 部署後的第二輪 production smoke 找到 BUG-108：首次 trial、setup profile 保留、15 天試用 UI 與 13 個預設任務皆正確，但第二次登入從 Service Worker cache 取得舊 profile／空 tasks，再次進入 setup。本版是該 production blocker 的 client-only hotfix，不修改 Auth、Supabase schema／migration 或 entitlement source。
- 同輪 smoke 發現 email local-part 超過 30 字元會被既有 signup trigger 的 profile name constraint 擋下，已立 `BUG-109` 另案處理，未混入本版。
- 同來源邊界也代表 Supabase Storage 與 `export.js` 使用的跨來源 jsPDF／html2canvas 不再由 Orbit Service Worker 快取；功能仍可走網路，但離線能力不由本 cache 提供。若未來需要離線支援，應為核准的來源建立明確 allowlist 與失敗策略，不回復通用跨來源 cache-first。
- 合併後驗收另發現註冊成功後直接登出時，登入按鈕會維持 disabled 直到重新載入頁面，已立 `BUG-110` 另案處理；不影響重新開 App 的第二次登入與本版 cache 修正。

### Validation
- `tests/unit/serviceWorkerImageCache.test.js` 新增跨來源 Supabase GET 邊界測試；修正前會收到 `respondWith()` Promise 並進入 cache-first，修正後完全不開啟／讀寫 app cache，同來源圖片既有行為仍通過。
- `npm run lint`、`TZ=UTC npm test`（54 files／980 tests）、`npm run test:e2e -- --workers=1`（41/41）全數通過；版本 bump 後以 `npm run ps243:assets` 同步可重現資產基準。
- PR #152 合併部署後的 production smoke 通過：新帳號 trial／setup／13 個預設任務／15 天試用 UI 正確；重新開 App 第二次登入未進 setup，Supabase owner-scoped GET 全部回 200，`start_trial()` 未重複呼叫；`orbit-v1.25.2` 的 104 筆 cache request 中跨來源為 0。證據見 [`docs/pro-014j-production-validation.md`](docs/pro-014j-production-validation.md)。

---

## [1.25.1] - 2026-08-30

### Fixed
- **初始設定不再重建並截斷既有 profile**：setup 改為以既有 profile 為基底，只覆寫使用者在表單實際編輯的名稱／頭像；`trialStartedAt`、付費狀態、連勝獎勵、偏好設定與未來新增欄位都會保留。
- **遠端載入失敗不再把空任務誤判為新帳號**：只有成功取得 canonical remote snapshot 才能進 setup；失敗時僅允許同 owner 的本機快取離線開機，無快取或 owner 不符則顯示錯誤並停止，避免把不完整資料同步回 Supabase。
- 擴充開機序列回歸測試，完整驗證 19 個同步 profile 欄位、`trialStartedAt` 與非同步本機欄位都能保留，並覆蓋「無快取 fail closed」及「同 owner 快取離線開機」。

### Notes
- `v1.25.0` 首次 production smoke 找到上述 client writeback 問題；`v1.25.1` 是 `PRO-014J` 的窄幅部署 hotfix，不包含 entitlement source cutover。

### Validation
- `npm run lint`、`npm test`（54 files／979 tests，`TZ=UTC` 同樣全過）、`npm run test:e2e -- --workers=1`（41/41）。
- `tests/unit/appBootSequence.test.js` 共 11 項；新增完整 profile 保留、未知未來欄位、無快取／異 owner fail closed、同 owner 空任務快取離線開機等回歸情境。

---

## [1.25.0] - 2026-08-28

PRO-014C：試用的授權來源由 client 改為受控 server RPC。原合併前紀錄為「等待 `PRO-014I` 在 production 套用 migration 011 後才能部署」；前置完成後已由 PR #150 部署，首次 production smoke 發現的 setup client writeback 問題由 v1.25.1／PR #151 修正。

### Changed
- **`startTrial()` 改為呼叫 `start_trial()` RPC，client 不再自行決定授權值。** 舊實作直接把 `is_pro: true`、`pro_expires_at: now+15d`、`trial_started_at: now` 寫進 profile —— 三個欄位都是 client 可寫的，等於試用資格由前端自己發放。現在時間戳一律來自 RPC 回應。
- **`is_pro` 與 `pro_expires_at` 不再因試用被寫入。** 試用不是購買。連帶修好一個被遮住的 UI：設定頁的 `_proSectionHtml()` 先檢查 `isPaidProUser()`，而舊實作讓試用者這項為 true，因此試用者看到的是「你已是 Orbit Pro 用戶．有效期至 …」，**底下那段試用倒數 UI（`pro-trial-status`）從來沒有機會顯示**。現在試用者會正確看到倒數。
- **試用剩餘天數在兩種 source 下都正確。** `isTrialUser()` 與 `getTrialDaysRemaining()` 原本只讀 profile 的 `trialStartedAt` 並自行加 15 天；現在 `server` source 下改用 projection 的 `trialEndsAt`（由 `pro_trial_duration()` 算出），`legacy` 維持原推導。
- **`isPaidProUser()` 與 `getProExpiry()` 一併改為跟隨同一個 source。** 它們原本仍讀 legacy profile 欄位，於是「projection 有效付費、profile 沒有 `isPro`」時會出現 `isProUser() === true` 但 `isPaidProUser() === false` —— 設定頁因此對付費使用者隱藏 active banner，改成推銷他們已經擁有的訂閱。
- **試用進度條不再寫死 15 天。** 設定頁原本算 `(15 - daysLeft) / 15`。server 的 `pro_trial_duration()` 若改為 30 天，這個算式會得出 `-60%`。改為由真實起訖推導並 clamp 到 0–100；起始時間未知時省略進度條，而不是畫一個猜出來的值。

### Added
- **`getTrialEndsAtFromSnapshot()`**：projection 的試用到期日讀取器。它轉呼叫 `isProFromSnapshot()`，因此所有 fail-closed 條件自動適用 —— 不能授權的 projection 也不能拿來畫倒數。
- **legacy 相容層（暫時性，隨 `PRO-014H` 移除）**：RPC 成功後仍把 **server 回傳的** `trial_started_at` 寫回 profile。production 走 `legacy` source，其 `isTrialUser()` 只讀該欄位，而 `refreshProEntitlement()` 在 `legacy` 下直接 return、projection 不會被填 —— 沒有這層，試用者在 production 會拿不到任何 Pro 功能。

### Notes
- **`start_trial()` 是冪等的，不是「拒絕重複」。** 011 的 `ON CONFLICT … COALESCE` 保留既有時間戳並回傳，不重設、不延長、不 raise。所以重複呼叫是正常結果，client 不得當成錯誤路徑。
- **失敗語意分成兩種，因為 boot 會因此中斷。** `app.js` 的提前返回位在 `hideLoading()` 與隱藏 login screen **之前**，回傳值選錯會讓使用者卡在 loading 畫面。現在 `startTrial()` 回傳 `{ ok, ownerChanged, trialStartedAt }`：只有 `ownerChanged` 允許中止開機，RPC 失敗（離線、未登入）是非致命的，下次啟動再試。
- **兩處 client 端 Pro 寫入尚未處理，已立案**：`dayCycle.js` 的 SUB-16 連勝解鎖（45 天 → 30 天 Pro）與設定頁的開發者面板，兩者都直接寫 `state.user.isPro`。在 `server` source 下它們會失效，修好需要 server 端支援 —— 見 `PRO-014L`／`PRO-014M`。測試已把現況鎖住，避免被誤認為已處理。
- **`expires_at` 在 RPC contract 裡有歧義**：`CASE WHEN e.is_pro THEN e.pro_expires_at ELSE NULL END` 讓 `null` 同時代表「沒有付費」與「終身付費」。目前用「還有什麼能解釋這個 active」來推斷，並採保守讀法（試用期間購買終身方案會顯示成試用中）。徹底解法是讓 RPC 回傳 `is_pro` —— 見 `PRO-014N`。

### Validation
- `npm run lint`、`npm run test`（54 files／975 tests，`TZ=UTC` 同樣全過）、`npm run test:e2e -- --workers=1`（41/41）。
- 新增 `tests/unit/proTrialRpc.test.js`（19 項）：冪等、owner 不符、未登入、RPC error／throw、回應格式不符、相容層寫回失敗、兩種 source 的天數一致、legacy 迴歸。
- 新增 `tests/unit/proGateCallSites.test.js`（7 項）：把 19 個 Pro gate 呼叫點依檔案鎖成登記表，並斷言除明列例外外沒有模組直接讀寫 profile 的 Pro 欄位。
- `tests/unit/appBootSequence.test.js` 新增 3 項：RPC 失敗仍能完成開機、owner 改變仍會中斷、第二次登入不再呼叫 RPC。
- 新增 `tests/unit/proSettingsProjection.test.js`（9 項）：**用真實的 storage 模組**渲染設定頁，覆蓋 server-source 的實際組合 —— 付費 projection ＋ 非 Pro profile、終身方案、已到期、試用倒數與進度條、非 15 天的試用長度、起始時間未知、付費與試用並存時的優先序。`settings.test.js` 把三個判定各自 mock，測不到這些組合。
- 反向驗證三項：`app.js` 的中止條件改回 `!trial.ok` →「RPC 失敗仍能完成開機」紅；`isPaidProUser()` 改回只讀 profile → 付費呈現 3 項紅；進度條改回 `(15 - daysLeft) / 15` → 30 天試用那項得到 `width:-60%`。

---

## [1.24.0] - 2026-08-26

PRO-014B：把前端 Pro 判定的依據，從「profile 裡 client 自己就能寫、而且會同步到所有裝置的欄位」，換成「由 `my_pro_status()` 推導的裝置本機 **UI entitlement projection**」。**本版預設不啟用**，legacy 判定維持原樣。

### Added
- **`pwa/js/platform/proEntitlement.js`：owner-scoped Pro entitlement snapshot adapter。** 授權需五項同時成立：server 回報 `is_active`、snapshot 屬於當前 owner、entitlement 未到期、snapshot 仍在離線 grace window（24 小時）內、且沒有任何 localStorage 寫入／清除失敗。任一不成立、或回應格式不符預期，一律 fail closed。
- **`resolveProEntitlementSource(repoSource, storedOverride)`**：判定來源的解析規則抽成純函式，讓 cutover 後的分支（repo `server` + 裝置寫 `legacy`）可以被直接測到，而不是只覆蓋今天部署的那一支。
- **`db.refreshProEntitlement(userId)`**：登入載入遠端資料後刷新 snapshot。session owner 與請求的 owner 不符時直接清除、不打 RPC。
- **兩個 flag key**：`orbit_pro_entitlement`（snapshot）與 `orbit_pro_entitlement_source`（本機覆寫，只寫得出 `server`）。
- **[`docs/pro-014-entitlement-integrity.md`](docs/pro-014-entitlement-integrity.md)**：snapshot 來源完整性的設計提案（PRO-014G），待核准。

### Changed
- **`storage.isProUser()` 在 `server` 來源下只看 snapshot**，不再讀 `isPro` / `proExpiresAt` / `trialStartedAt`。
- **`storage.clearAll()` 一併清除 snapshot**，避免登出後殘留的 snapshot 被下一個帳號沿用。
- **判定來源改由 repo 常數 `REPO_PRO_ENTITLEMENT_SOURCE` 控制**，cutover 是一次程式碼變更與部署。裝置端只能往嚴格的方向覆寫（legacy → server）以便本機驗證，**沒有任何 API 寫得出 `legacy`** —— 否則使用者可以在 cutover 後把自己降級回舊的 client-writable 路徑。

### Notes
- **這是 UI entitlement projection，不是安全邊界（PR #146 覆驗定案）。** projection 是純 localStorage JSON，格式合法的手寫偽造會被照樣接受 —— 而且即使加上簽章也一樣，因為純前端 PWA 的裝置擁有者可以直接改 `isProUser()`。因此**安全控制在 server**：有實際價值的 Pro 資料／API／操作必須由 RLS 或 RPC 自行驗證 `is_pro_active`，已寫入 `PRO-014F` 的完成條件。
- **那這一版買到了什麼**：偽造的授權不再往返伺服器，因此不會同步到該使用者的其他裝置，也不會外溢到 PRO-014E／F 的排行榜 read model。舊的 profile 欄位偽造兩者都會。這是縮小血徑，不是「不可繞過」。
- **`PRO-014G`（signed receipt）改列為可選 hardening**，不是任何任務的前置。它能把本機偽造的門檻從「改一個 key」提高到「改應用程式碼」，但要引入 RPC contract 變更與簽章金鑰管理；是否值得由產品需求決定，不是安全需求。見 [`docs/pro-014-entitlement-integrity.md`](docs/pro-014-entitlement-integrity.md)。
- 目前 `isProUser()` 的呼叫點全部在 UI 層（保護卡、專注音效、主題、回顧月數、Personal Space 呈現），`PRO-014F` 交付付費呈現時需重新確認。
- **預設仍是 `legacy`，production 行為完全沒變。** migration 011 只 commit 進 repo、沒有套用到任何資料庫（套用是 PRO-014D 的工作）。若現在切到 `server`，RPC 不存在 → fail closed → 現有付費使用者立刻失去 Pro。因此 `legacy` 下 `refreshProEntitlement()` 直接 no-op，連 RPC 都不會發。
- **離線與 RPC 錯誤是兩件事。** 回應帶 `error`（function 不存在、權限不足）是權威訊號，直接清掉 snapshot；fetch 本身 throw（離線）則保留既有 snapshot 讓 grace window 生效。
- **storage 失敗必須撐得過重新載入。** 記憶體 latch 只保護當前這一次執行；重新載入後 latch 消失，躺在 localStorage 裡的舊 active snapshot 會重新生效。因此寫入失敗時會 best-effort 移除舊 snapshot —— quota 失敗正好是「移除很可能會成功」的情況。若 `setItem` 與 `removeItem` 同時失效，`SNAPSHOT_TTL_MS` 是最後一道防線：殘留最多到 grace window 結束，不會無限期。
- **PostgREST 的單列陣列是明確斷言而不是容錯。** 空陣列、單一物件、多列都當作「合約與這份 client 不符」而 fail closed。**欄位缺席也是** —— 缺 `expires_at` 一度被 normalize 成 null（＝無到期日），等於截斷的回應會拿到終身 Pro。
- 未動 auth 流程、token 處理或 schema；`startTrial()` 仍是舊行為，切換到受控 RPC 是 PRO-014C。

### Validation
- `npm run lint`、`npm run test`（51 files／937 tests）、`npm run test:e2e -- --workers=1`（41/41）。
- `tests/unit/proEntitlement.test.js`（59 項）：單列陣列 normalize，以及空陣列／非陣列／多列／**欄位缺席**／壞時間戳／RPC 錯誤／無 entitlement row／未登入／切換帳號／cache 過期／entitlement 到期／trial 結束／時鐘倒轉／snapshot 被竄改／**storage 寫入失敗**／**storage 清除失敗**／**寫入失敗後重新載入**／**來源降級（cutover 前後兩種 repo source 都直接跑過 resolver）**，全部 fail closed。
- `tests/unit/proEntitlementGate.test.js`（11 項）：legacy 下行為不變且不呼叫 RPC；server 下即使 profile 欄位寫著 Pro 也判定為 false。
- 反向驗證：把 `isProUser()` 的 server 分支改回讀 legacy 欄位後重跑，`proEntitlementGate.test.js` 紅 4 項。
- 沒有「合法 JSON 偽造被拒」的回歸測試 —— 依上述定案，那不是這一層要達成的性質；它是可選任務 `PRO-014G` 的驗收條件。

---

## [1.23.4] - 2026-08-26

修正 BUG-107：Supabase client 一直是從 esm.sh 以浮動 `@2` 載入的。實際跑在使用者裝置上的版本由部署時點決定，repo 無從得知；而首次載入時 esm.sh 只要不可用，整個 App 就無法啟動。

### Fixed
- **實際載入的 Supabase client 版本改由 repo 決定。** `pwa/js/supabase.js` 原本匯入 `https://esm.sh/@supabase/supabase-js@2`。該 URL 的 pathname 不以 `.js` 結尾，因此走的是 `sw.js` 的 cache-first 分支而非 stale-while-revalidate，且不在 `SHELL` 內；`activate` 又會刪掉所有非當前 `CACHE` 的內容 —— 等於每次版本 bump 都會重新向 esm.sh 解析一次 2.x，解析到哪個版本就用到下次 bump。auth 事件的時序與名稱在 2.x 之間有差異，這讓 boot 行為可能在完全沒有 repo 變更的情況下改變（正是 BUG-106 的驅動因素之一）。
- **離線與首次啟動不再依賴第三方 CDN 的即時可用性。** client 改為 vendored 進 repo 的同源 `pwa/vendor/supabase.js`，並加入 `pwa/sw.js` 的 `SHELL` 精快取清單，與既有的 `pwa/vendor/pixi.js` 做法一致。

### Added
- `scripts/vendor-supabase.mjs` 與 `npm run vendor:supabase`：由 `node_modules` 產生 `pwa/vendor/supabase.js`，並在版本不符時直接失敗。`@supabase/supabase-js` 以精確版本 `2.112.4` 進 `dependencies`。

### Notes
- 來源用的是套件自帶的 UMD browser bundle，不是 `dist/index.mjs` —— 後者仍帶 `@supabase/auth-js` 等 bare specifier，瀏覽器無法解析。UMD 以 ES module 載入時，頂層的 `var supabase` 只存在於模組作用域，不會外洩成全域；vendor 腳本附加的 footer 只 re-export `createClient`，也就是 `pwa/js/supabase.js` 目前用到的全部介面。
- 未改動任何 auth 流程、token 處理或 schema；改的只有 client 的載入路徑。

### Validation
- `npm run lint`、`npm run test`（49 files／867 tests）。新增 `tests/unit/vendoredSupabaseClient.test.js`（5 項）鎖住：匯入不得回到遠端 URL、vendored 產物與 `package.json` 鎖定版本一致、`SHELL` 有收錄、模組確實輸出可用的 `createClient` 且不汙染全域。把匯入改回 esm.sh 後重跑，該檔會紅 1 項。
- 該測試在建立 client 前會補上 WebSocket 佔位：realtime client 在建構時會解析 WebSocket constructor，瀏覽器一定有，但 Node 要到 22 才有全域版本、CI 跑的是 20 —— 不補的話這項斷言能不能跑會取決於 runner 的 Node 版本。
- `npm run test:e2e -- --workers=1`：41/41 通過。E2E 的 Supabase stub 由攔截 `https://esm.sh/**` 改為攔截 `**/vendor/supabase.js`；以「讓 stub 直接 throw」反向驗證過攔截確實生效。

---

## [1.23.3] - 2026-08-26

修正 BUG-106：同一次啟動可能跑兩次完整的 boot 序列。除了疊出兩層日報／晨間 modal，第二次還會用剛拉回來的遠端 profile 重跑連勝與週獎勵結算。

### Fixed
- **同一次啟動不再重複執行日輪替 boot 序列。** `bootWithLocalState()` 有兩條各自獨立的呼叫路徑：`init()` 的快取使用者分支，以及 `onAuthStateChange('SIGNED_IN')` → `loadAndStart()`。後者的守門條件比對 `_currentSession`，但那個變數要到 `getSession()` resolve 後才被賦值 —— 當 Supabase 先送出 `SIGNED_IN`（token 需要 refresh、網路慢、PWA 由背景恢復）時，整段 boot 會再跑一次。
- **連勝與週一致性獎勵不再有被重複結算的空間。** 第二次 boot 發生在 `db.loadFromRemote()` 之後，而遠端 profile 可能還沒帶到第一次 boot 剛寫進本機的 `lastStreakDate` / `lastWeeklyBonusDate`（該次 upsert 尚未落地或失敗），`processYesterdayStreak()` 與 `checkWeeklyBonus()` 的「今天已處理」防護會因此失效。這是疊層之外較不明顯、但後果更嚴重的一半。
- 新增 `pwa/js/platform/bootSequenceGuard.js`：以「本次啟動 + owner id」為範圍的一次性 claim。重複呼叫只會再次顯示主畫面後返回，不重跑日輪替；登出時釋放 claim，因此登出後重新登入、以及直接切換到另一個帳號都仍會正常重跑 boot。
- 收斂的範圍只有 boot 序列，不含遠端同步：早到的 `SIGNED_IN` 帶著可用的 session，仍會完成 `loadFromRemote()`，而後到的 `getSession()` 會因 `_currentSession` 已被賦值而自行短路，遠端只會拉一次。

### Validation
- `npm run lint`、`npm run test`（48 files／862 tests）。新增 `tests/unit/bootSequenceGuard.test.js`（4 項）與 `tests/unit/appBootSequence.test.js`（4 項，jsdom）—— 後者直接在「`SIGNED_IN` 早於 `getSession()` resolve」的時序下驅動 `app.js`。移除修正後重跑，該檔會紅 3 項（`showDailyReport` 被呼叫 2 次）。
- `npm run test:e2e -- --workers=1`：41/41 通過，含既有的跨日啟動流程 `tests/e2e/day-cycle-boot.test.js`。

### Notes
- `showStreakUnlockModal()` 的 CTA 已於 v1.23.1 隨 BUG-105 改為 scope 綁定，本次確認無須再改。
- BUG-106 範圍內的 `supabase.js` 未鎖版本風險（D-4）已評估但維持現狀，理由與可行做法記於 [`docs/bug-105-morning-modal-lockup.md`](docs/bug-105-morning-modal-lockup.md) 第八節，另立 BUG-107 追蹤。

---

## [1.23.2] - 2026-08-23

修正兩個各自獨立、但都會讓「新增任務」失效的問題：Liquid Galss 主題下任務表單無法捲動，以及任務同步的整份覆蓋缺口（本機新增的任務隔天消失、離線刪除的任務復活）。

### Fixed
- **Liquid Galss 主題下「新增／編輯任務」表單無法往下捲動。** 玻璃質感規則為了讓光澤與 `::after` 邊緣留在圓角內，對 `.modal-box` 設了 `overflow: hidden`；但 `.modal-box`（與 `.pro-sheet`）本身是 `max-height` + `overflow-y: auto` 的捲動容器，簡寫連帶把垂直捲動一起關掉，導致「性質／價值／難度／抗拒感」四個下拉選單與底部的儲存按鈕永遠停在畫面外。改為只裁切 x 軸，保留垂直捲動；Pro 訂閱 sheet 受同一條規則影響，一併修正。
- **離線或同步失敗時新增的任務，隔天開啟 App 會消失。** `db.upsertTasks()` 沒有檢查 Supabase 回傳的 `error`，被拒絕的寫入（RLS、CHECK 條件、PostgREST 錯誤）會被當成成功，`saveTasks` 的 `catch` 因此從不觸發；而 `loadFromRemote()` 對任務是 `set('tasks', canonicalTasks)` 的整份覆蓋，沒有 Session 那樣的 pending 補寫機制。只要任務沒真的寫進雲端，下一次登入啟動就會被遠端快照抹掉。
- **離線刪除的任務會在下次遠端載入時復活（同一個缺口的鏡像）。** `deleteTasks()` 同樣沒有檢查 `error`，而任務清單本身無法表達「遠端該刪哪些」——`saveTasks([])`（全部刪除）更是直接讓遠端舊任務整批被載回。
- `db.upsertTasks()` 與 `db.deleteTasks()` 都改為 `if (error) throw error`，與 `upsertProfile` / `insertSession` 一致。
- 新增 owner-scoped 的 `taskSyncPending` sidecar，同時保存「待 upsert 的任務」與「待刪除的 `deletedIds` tombstones」：`saveTasks()` 先標記為「尚未確認同步」，**upsert 與 delete 都獲得遠端確認後才清除**；`loadFromRemote()` 在拉取前依序補推兩者，任一失敗則中止整次拉取，讓本機快取維持權威來源。行為與既有的 profile／Energy pending 推送一致。
- tombstone 會跨多次儲存累積直到刪除成功；某個 id 若又出現在本機清單中，就不再是 tombstone。
- sidecar 只保存 `upsertTasks` 實際會寫出的欄位，避免任務自訂圖示的 inline data URL 讓 localStorage 用量翻倍。

### Validation
- `npm run lint`、`npm run test`（45 files／845 tests，`tests/integration/storage.test.js` 新增 11 項涵蓋 pending sidecar 生命週期、部分刪除／全部刪除的 tombstone 記錄、以及 upsert 或 delete 被拒絕時保留本機狀態）。
- `npm run test:e2e -- --workers=1`：41/41 通過，新增 `tests/e2e/liquid-glass-modal.test.js` 在真實瀏覽器用滾輪手勢驗證 modal 捲動（純 CSS 迴歸，unit test 抓不到）。移除修正後重跑，該檔會紅 2 項。

---

## [1.23.1] - 2026-08-04

修正 BUG-105：跨日後第一次開啟 App 卡在「☀️ 今天的狀態？」，怎麼點都沒反應且重開無效。

### Fixed
- 晨間 modal 的 click handler 改為**先關閉 modal 再寫入**，並包上 `try/catch`。這兩個 modal 沒有關閉鈕／背景關閉／逾時，而「今天已詢問」的 `energy.lastResetDate` 只在 handler 跑完後才寫入，因此過去 handler 中途拋錯就等於永久卡死，且重開 App 會重演。
- `storage.js` 的 `set()` 改為回報寫入結果而非 throw（配額用盡、Safari 隱私模式）；`saveUser` / `saveEnergy` 回傳本機寫入是否成功，晨間 modal 據此以 toast 告知「已套用但無法存到這台裝置」，不再靜默卡住。
- 日報與連勝解鎖 modal 改用 scope 過的 `modal.querySelector()` 綁定 CTA。原本使用全域 `document.getElementById()`，在 modal 疊層時會綁到 DOM 中第一個（被壓在下面看不見的）節點，使用者看到的最上層按鈕完全沒有 listener。
- 日報／晨間 modal 掛載前先移除同 id 的殘留節點，避免疊層。
- 登出時一併清除殘留在 `<body>` 的 day-cycle overlay。這些 overlay 掛在 `<body>` 上，過去隱藏 `#main-app` 並不會移除它們，會浮在登入畫面上且背後的 `state.user` 已為 `null`。
- 選擇今日狀態後補呼叫 `updateHeader()`。過去 header 的精力值會停在前一天的數字，直到其他操作剛好觸發重繪。

### Validation
- `npm run lint`、`npm run test`（45 files／834 tests，新增 `tests/unit/dayCycle.test.js` 10 項）。
- `npm run test:e2e`：37/37 通過（`--workers=1`），新增 `tests/e2e/day-cycle-boot.test.js` 覆蓋先前完全沒有測試的跨日啟動流程。
- 以 Playwright 實測「點擊當下 localStorage 寫入失敗」情境：修正前 modal 留在畫面且無任何提示，修正後 modal 關閉並顯示 toast。

---

## [1.23.0] - 2026-07-31

### Added
- 完成 HW-105 Personal Space achievement photo wall：首頁與完成紀錄的本機佐證可標記一張為展示照片，並立即出現在首頁 Orbit Window 與完整 Personal Space 的共用相框中。
- 新增 owner-scoped、device-local 的展示選取狀態與 `empty／unavailable／selected` fallback；Session 或圖片不存在時只呈現安全 placeholder，不讀取其他本機帳號的佐證，也不變更 auth／Supabase schema。

### Changed
- 佐證預覽與個人空間展示改為具備明確 accessible name／pressed state 的獨立 44×44 控制；清除本機佐證時也會清除展示選取 metadata。

### Validation
- `npm run lint`、`npm run test`（44 files／824 tests）、PS-242 manifest 與 PS-243 asset baseline freshness gates 通過。
- `npm run test:e2e -- tests/e2e/ps243-acceptance.test.js --project=chromium`：8/8 通過，涵蓋 320×568 至 1024×768、橫向、鍵盤順序、reduced motion 與 200% zoom。
- Playwright CLI 實際驗證 local proof 選取、Pixi `ready` 後相框顯示、完整 Personal Space 導航、圖片遺失 placeholder，以及 320px viewport 的 44×44 控制與零水平溢位。

---

## [1.22.0] - 2026-07-31

### Added
- 完成 PS-242 Personal Space V2 正式 action art：新增 3:2 Formal Workstation 背景、主角六種狀態的左右向共 12 張姿勢、Companion 六種狀態，以及 clear／rain 天氣疊圖。
- 新增可重現的 `art-pipeline/ps242/` 產製與審核軌跡，以及包含尺寸、位元組、SHA-256、來源、QC 與授權紀錄的 production asset manifest；`npm run ps242:manifest -- --check` 可驗證 committed artifact 未漂移。

### Changed
- 靜態 poster 與 Pixi runtime 改由同一份 manifest 解析主角、Companion 與天氣狀態；Pixi 僅按需載入當前狀態資產，並保留 reduced-motion／WebGL 失敗時的靜態 fallback。
- Personal Space V2 scene pack 從 `fallback-proof` 提升為 `production`；首屏正式資產為 259,133 bytes，完整 29 檔 state pack（含八個既有 props）為 1,766,935 bytes，皆通過既定預算。

### Fixed
- 以固定 3:2 camera identity 的正式背景取代 proof 階段裁切素材，並讓 poster 與 Pixi 不再各自使用不同的程序式 Companion／天氣呈現。

### Validation
- `npm run lint`、`npm run test`（43 files／817 tests）、PS-242／PS-243 manifest freshness gates 與 Personal Space Chromium acceptance flows 通過。

---

## [1.21.2] - 2026-07-21

回應 PR #130 Codex 驗收意見的修正。

### Added
- 新增可重現的 PS-243 驗收自動化：`tests/e2e/ps243-acceptance.test.js`（viewport matrix、水平溢位、44px 觸控目標、鍵盤順序、reduced motion、200% zoom，隨 `npm run test:e2e` 進 CI）、`scripts/ps243-asset-baseline.mjs`／`npm run ps243:assets`（由 committed manifest 衍生檔案集合，輸出 `docs/ps243/asset-baseline.json`）、`scripts/ps243-perf-baseline.mjs`／`npm run ps243:perf`（4× CPU throttle、10-loop route 與 GC 後 heap 的 BASELINE 快照）。
- 新增 `tests/unit/ps243AssetBudget.test.js`：把資產位元組與 gzip 預算變成 CI 內的 deterministic gate，並檢查 committed evidence artifact 未過期。
- `pwa/js/personalSpace/unlockRules.js` 匯出 canonical `SCENE_IDS`；`assetManifest.js` 匯出 `getWorkspaceAssetManifestPaths()` 作為資產證據的單一來源。

### Fixed
- `edit_mode_opened` telemetry 先前只認 7 個場景，會靜默丟棄 Lv.40+ 的 estate/manager/memory 場景（manager-room、large-office-suite、estate-hall/study/lounge/game-room）；schema 改由 canonical `SCENE_IDS` 建立，涵蓋完整場景清單。
- Personal Space telemetry 的日期驗證改為 UTC round-trip：`2026-02-31` 等被 JavaScript 正規化的無效日曆日期現在 fail closed，`occurredAt` 統一 canonicalize 為 `toISOString()`。
- Full World 詳情面板關閉後會把焦點還給開啟它的控制項（WCAG 2.4.3），並支援 `Escape` 關閉；補鍵盤 regression 測試。
- Asset baseline 改以 CRLF→LF canonical bytes 計算，Windows autocrlf working tree 與 Linux CI 得到相同結果（先前 committed artifact 為 CRLF bytes，導致 Ubuntu freshness test 失敗）；`--check` 與 gate 比對亦 normalize 行尾。
- 「Personal Space V2 application JS」檔案集合改為 `v2/**` 與 route entry `personalSpaceV2.js` 之 Personal Space transitive closure 的聯集（納入 `unlockRules.js`、`economy.js`、`gameState.js`），artifact 逐一列出每個 JS path。
- `scripts/ps243-perf-baseline.mjs` 改用 runner-owned free port、監聽 spawned server early-exit、以 `APP_VERSION` marker 確認所量測的是本 checkout，並在 cleanup await server 結束；`pwa/server.cjs` 支援 `PORT` env（預設仍 3000）。

---

## [1.21.1] - 2026-07-18

### Added
- 新增 PS-243 production acceptance 證據矩陣，分開記錄 responsive viewport、鍵盤順序、reduced motion、200% zoom、synthetic route-loop、資產預算與仍需真機完成的驗收項目。

### Fixed
- Personal Space telemetry 現在依每個 event field 驗證有限類別、日期、布林值與數值範圍；caller retry key 僅留在本機去重，adapter id 只由可信事件 metadata 產生，無效時間與自由文字也不再原樣進入 event payload。

### Validation
- `npm run lint`：通過。
- `npm run test`：40 個檔案、796 個測試通過。
- `npm run test:e2e`：Chromium 26/26 通過；資源競爭造成的 timeout 案例均已單獨重跑，清理 QA session 後完整序列通過。
- Playwright CLI：完成 320×568、390×844、768×1024、1024×768、844×390、reduced-motion、200% zoom 與 10 次 4× CPU throttle route-loop baseline。

---

## [1.21.0] - 2026-07-17

### Added
- 首頁核心區加入 3:2 Personal Space Orbit Window，直接呈現 Workspace Upgrade、每日 Main Quest、主角、規則式 Companion、最近世界變化與待揭曉獎勵。
- 新增 owner-scoped Personal Space V2 狀態、固定 reward epoch、日期化 Main Quest、不可變且可逆的 Reward Ledger、四次每日貢獻完成的 Workspace Upgrade，以及 Gold／hidden stats／relationship 推導。
- 新增 scene-first Full World 與只調整既有擺設的最小 Edit Mode；Home、World、Edit 共用同一份 world snapshot。
- Pin 並 vendor PixiJS 8.18.1，採 poster-first、viewport lazy mount、offscreen/tab suspend、WebGL context recovery 與靜態 fallback。
- 新增 Session deletion retry log、Home-to-Focus-to-reveal-to-World-to-undo E2E，以及 migration、ledger、runtime、route、cache、同步與 editor 回歸測試。
- 新增隱私 allowlist、retry event id 去重且預設 no-op 的 Personal Space telemetry 合約；尚未連接任何外部分析服務。

### Changed
- Personal Space runtime 預設改為 V2，仍保留明確的 `legacy` fallback；既有 V1 key、資產、ownership 與 placements 不被覆寫。
- 初始載入、背景同步與設定頁手動同步現在都會刷新 canonical app state，再靜默 reconcile V2；只有成功的完整 Session 查詢會視為 authoritative。
- Service Worker 安裝殼只預載靜態 fallback poster；Pixi 與 phase props 首次成功使用後再快取，避免把完整場景材質塞進 Home install path。
- Small／Medium／Major Reward Reveal 現在具有不同顯示時間與視覺層級；主角、Companion 與雨天狀態會同步驅動 Pixi 與靜態 poster fallback。

### Fixed
- v1.21 首次 authoritative Session pull 會先完成一次 owner-scoped legacy cutover：遠端尚無對應列的既有本機 Session 會標記待同步並保留重試；切換帳號後也只會還原該 owner 的 pending Session，cutover 完成後才丟棄一般 stale cache。
- persisted placement 只接受有限數值與核准 anchor，避免任意 CSS 注入；Reveal 判斷改讀結構化 reward／metadata，不再因任務或專案名稱含有關鍵字而誤觸發。
- pending profile／Energy 上推失敗時不再顯示「同步完成」，改為保留 owner sidecar 並顯示可重試的同步暫停狀態。
- Pixi canvas 初始化後會保留 960×640 邏輯座標但貼合響應式容器，避免窄螢幕只顯示 canvas 左上角而裁掉主角與 Companion；390px 首頁也不再隱藏 Companion 狀態卡。
- Personal Space V2 的未分帳 V1 資料只允許一個 owner claim；快取開機的 Gold cutover 會先標記 provisional，並在遠端或離線決策完成後只定稿一次。
- Session reconcile 會先依 immutable id 去重；非 authoritative partial snapshot 不再反轉缺席來源，也不會對同一天重複發 Main Quest bundle。
- Undo deletion journal 現在可在重啟後精準完成 XP、Session、Energy 與 V2 reversal，且 owner-scoped profile／Energy pending snapshot 會在 remote pull 前上推並跨 sign-out 保留。
- 新 Session 在遠端 insert 前即標記 pending；authoritative merge 只保留遠端列與真正 pending 本機列，避免跨裝置刪除後被 stale cache 復活。
- Same-device undo 使用實際套用的 Energy delta，在 0／max clamp 邊界可精準回滾。
- Silent authoritative reversal 會移除已失效的正向 pending reveal／recent change，避免世界已回滾後仍播放舊的 +Gold／+Project 動畫。
- 同一 Session 的 ordinary／Daily Main Quest hidden-stat grant 使用不同 immutable identity，不再因 winner promotion 原地改寫 ledger entry。
- 遠端 load、profile／task／Session／Energy 寫入與 trial 啟用現在都綁定預期 authenticated owner；App 另以 generation token 阻止 sign-out／快速切換帳號後的舊請求回填 cache 或重繪畫面。
- Home 同 route 重繪會先 release 再延後 destroy Pixi Application；同步 remount 會取消 teardown，因此任務結算不再重建 Application，離開 route 或登出仍會完成清理。
- 重複 commit／remote merge 不再重複發獎；撤銷 Session 會反轉 Gold、Quest、Project、hidden stats 與 milestone rewards，且 remote resurrection 由 tombstone 阻擋。
- Boot／migration／remote reconciliation 不再重播歷史 reveal；Home 消耗 reveal 後會立即顯示下一筆或回到穩定狀態。
- Editor 寫入加入 world revision guard，localStorage 寫入失敗不再回報假成功；Home 與 Full World 仍保留可讀的靜態 snapshot。
- Route、IntersectionObserver、visibility、timer、listener 與 Pixi runtime cleanup 改為冪等，避免重複 ticker／Application 與離屏持續渲染。
- 遠端載入必須通過 profile、tasks、sessions 與 Energy 完整性檢查後才可定稿 V2；profile／Energy 待同步快照改為逐 owner sidecar，Session delete 也綁定 expected owner，避免快速切換帳號造成誤同步或誤清 tombstone。
- Pixi 初始化途中離頁會先失效 runtime，再於 `init()` settle 後安全 destroy；Home、Full World 與登出都會走最終 route teardown，不再讀取尚未建立的 renderer 或遺留 WebGL context。
- Reward Reveal 的 2.8 秒正常動畫與 0.7 秒 reduced-motion 動畫只在頁籤可見且 Window 位於 viewport 時前進；背景或離屏期間會保留剩餘時間，不會在玩家看不到時消耗 persisted reveal。

### Validation
- `npm run lint`：通過。
- `npm run test`：40 個檔案、792 個測試通過。
- `npm run test:e2e`：Chromium 26/26 通過，包含正式 Focus 結束、Pixi failure fallback、off-screen suspend/resume、三輪 Home／World route loop、reduced motion 與 legacy fallback。
- Playwright 390×844 視覺檢查：Pixi runtime ready、主角與 Companion 可見、Project／Companion 狀態卡並列、無水平溢出。

### Known limitations
- 首個 V2 場景仍使用明確標記為 `fallback-proof` 的既有 16:9 美術，以 cover-crop 顯示於 3:2；最終 3:2 action／Companion 資產包與 1.5 MB 目標仍需後續美術驗收。
- 低階 Android／iOS 實機效能、鍵盤操作與 reduced-motion 的人工驗證仍待完成；自動化通過不代表這些實機驗收已完成。
- V2 世界狀態目前 local-first；跨裝置同步需要另行核准的後端 schema 設計。

---

## [1.20.6] - 2026-07-07

### Changed（資料層重構，零行為/資料格式變化 — handoff Phase 14–18 完結）
- `platform/proofStore.js`：orbit_proof_* 佐證圖片存取（讀/寫/統計/清除）單一化，key 與「登出不清除」行為不變
- `storage.saveUserLocal()`：profile 樂觀更新與 dev tools 不再硬編碼 'yoyo_user'
- storage.js 四實體欄位映射表化（FIELD_MAP 表驅動，新增同步欄位＝加一列）；先以 12 個 characterization tests 鎖住 `||`/`??` 預設值語義再改，零漂移
- `flags.js`：七個跨模組旗標 key 常數化（字串值不變）
- profile.js 14 處 `import('../app.js')` 動態匯入改靜態；移除 app.js 死 re-export 與只寫不讀的 `_isGuest`

### Added
- 焦點計時器狀態機單元測試 ×6（fake timers：暫停補償、最低有效門檻、略過/早退/達標結算）——補上最後一個無自動測試的高風險區
- 測試總數 649 → 667；e2e 22/22、lint 0

---

## [1.20.5] - 2026-07-07

### Fixed
- `window.showToast` 從未被綁定，settings/export 共 13 處全域呼叫拋 TypeError——最明顯症狀：設定頁「從雲端同步資料」成功後按鈕永久卡在「同步中…」（handoff Q7）
- 登出後重新進入登入頁，登入表單被重複綁定 submit 監聽，送出時 signIn/signUp 觸發兩次
- 週視圖以 UTC 產生 7 天窗口，UTC+8 使用者在本地 00:00–07:59 看到的統計整體偏移一天；改用本地日期與全 app 一致（handoff Q2）
- 個人頁升等公式說明仍是 v1.4.0 舊公式文字，更新為 v1.4.1 分段公式（handoff Q3）
- 恢復/娛樂型且 value≠D 的任務卡顯示誤導性「+XX XP」（實際結算 0 XP），改顯示「回能」／「娛樂」；engine 結算規則不變（handoff Q4 決議 (a)）

### Added
- `tests/unit/feedback.test.js`（window.showToast 綁定迴歸防護）＋任務卡標籤迴歸測試 ×2（649 tests）

---

## [1.20.4] - 2026-07-07

### Changed（純重構，零功能/UI/資料格式變化）
- app.js 由 2217 行拆分為模組：`router.js`、`theme.js`（含液態玻璃）、`dayCycle.js`、`sessionFlow.js`、`focusTimer.js`、`authFlow.js`、`version.js` 與 `ui/`（feedback / header / proNav / proofSheet / sessionRow），app.js 收斂為 367 行開機編排
- 消除重複：escHtml ×6、XP 權重表 ×3、Pro 導流片段 ×6、session 列渲染 ×2、即時/計時結算組裝整段重複、開機序列 ×3
- 斷開 settings.js ⇄ app.js 循環依賴；pages/ 不再靜態依賴 app.js
- `APP_VERSION` 移至 `version.js`，`scripts/bump.mjs` 改寫目標同步更新（本版即以新流程發佈）
- 清空全部 5 個既有 lint errors（零行為修復）；lint 門檻改為 0
- 交接文件 `docs/refactor-handoff.md`（14 章節，含 reviewer 驗收指令與風險登記簿）

### 驗證
- unit 643/643、e2e 22/22、lint 0；`window.*` 全域介面與 localStorage/Supabase 資料行為完全不變

---

## [1.20.3] - 2026-06-17

### Added
- Regression coverage for session sync schema mismatches, local-only session preservation, and newest-first history ordering.

### Fixed
- Completed sessions no longer fail cloud sync because of unsupported `sessions.task_icon_img` writes; failed inserts are surfaced and marked pending locally for retry.
- History and today's session logs now sort explicitly by completion time newest-first, regardless of whether data came from local cache or Supabase.

---

## [1.20.2] - 2026-06-10

### Added
- 

### Fixed
- 

---

## [1.20.1] - 2026-06-08

### Fixed
- HW-111: `applyTimeBand()` was defined but never called; now invoked in `init()` so `document.documentElement.dataset.timeBand` is correctly set on every launch.
- HW-109: `setBadge()` / `clearBadge()` were never wired up; now called from `_commitSession`, `deleteSession`, `handleSignOut`, and on init — badge count reflects today's valid completed sessions.
- HW-104: proof capture bottom sheet was never triggered after task completion; `_showProofSheet()` is now called 700 ms after `completeInstant` for any task where `supportsProofCapture()` is true; users can attach or skip the photo, which is stored in `localStorage` under `orbit_proof_<sessionId>`.

---

## [1.20.0] - 2026-06-08

### Added
- Proof photo capture: after completing any non-invalid task, an optional bottom sheet appears allowing users to attach a local photo as accountability proof; images are compressed to ≤320px JPEG using canvas and stored in localStorage under `orbit_proof_<sessionId>`; a 36×36 thumbnail badge appears beside the session row in the daily log; deleting a session removes its proof.
- Web Share growth card: profile page shows a 「分享成長卡」button (「複製成長卡」on unsupported browsers); tapping it invokes the Web Share API with name, level, title, streak, XP, and today's XP; clipboard fallback copies a plain-text card and shows a toast confirming the copy.
- Time-of-day atmosphere layer: `timeBand.js` maps the local hour to morning (5–10), day (10–17), evening (17–21), or night (21–5); `applyTimeBand()` sets `data-time-band` on `<html>` at launch and refreshes every hour; a `--time-tint` CSS token drives a subtle color overlay via `body::after`.
- App badge and notification shell: new `platform/badge.js` exposes `supportsBadge()`, `setBadge(count)`, `clearBadge()`, and a `scheduleLocalReminder()` placeholder; the badge updates to today's valid session count after each task completion and clears when the PWA returns to foreground.

---

## [1.19.1] - 2026-06-08

### Added
- 設定頁帳號區塊新增「↻ 從雲端同步資料」按鈕，讓使用者手動將 Supabase 最新資料寫入 localStorage（解決直接修改 DB 後 App 不更新的問題）
- 兩層頻率限制：10 秒冷卻（防連點）＋ 1 小時最多 3 次（防濫用）
- 同步中顯示旋轉 spinner，完成後 toast 提示並重繪設定頁；未登入時即時告知，不啟動 spinner

---

## [1.19.0] - 2026-06-01

### Added
- Personal Space idle growth window: added a separate idle-game style visual card that appears alongside the existing Current Scene Layer instead of replacing it.
- Idle window prototype renderer and contract: added stage/layout data, asset registry, layered raster rendering, unlock-gated props, prototype fallback badges, and unit coverage for the independent view.
- Idle window editing prototype: the idle card can now open into an immersive landscape-style overlay, toggle edit mode, drag unlocked furniture layers, and persist those positions in a separate idle-window layout state.
- Idle furniture placement feasibility: added CSS rotation for eligible props, direction-variant metadata for larger furniture, and wall / floor / desktop placement planes with drag clamping and footprint metadata.
- Idle placement surface model: desktop props can attach to furniture support surfaces so they follow parent furniture when it moves, and idle layouts now expose left / center / right camera profiles for angle-aware background and furniture expansion.
- Idle window production proof: added art-direction and furniture-variant specs, true left / center / right office background profile assets, and a perspective-correct `office-corner-desk-v3` variant set for wall-aligned placement.
- Idle editor feasibility pass: small props can drag freely and snap to valid support surfaces, furniture overlap warnings are shown during editing, depth hints update from footprint metadata, and the protagonist can follow a desk interaction anchor.
- Idle window background expansion: added strict 16:9 survival rental, building office, and mastery estate background camera sets, with stage-aware idle-window background selection.
- Idle window prop expansion: added 27 extracted transparent office furniture, small prop, wall, storage, and decor assets, and placed a curated subset into the building-stage idle layout.
- Idle window editor maturation: added layer up/down controls, blank-stage drag camera switching, per-item visibility toggles with show-all/hide-all, and a controlled reference-image workflow for future consistent room angles and furniture variants.
- Idle window mobile editor refinement: layer controls now support instant front/back plus fine nudges, furniture visibility is grouped by unlock tier with per-group all/none controls, camera drag is limited to expanded non-edit mode, and editor controls now have touch feedback animations.
- Idle window variant generation queue: added a tested readiness manifest for large furniture direction variants, so future generated assets must declare reference paths, missing side views, and final `perspective-correct` status before being considered complete.
- Idle window asset skill tooling: added a reusable `audit_idle_window_variants.mjs` skill script that prints the current controlled furniture-variant queue in Markdown or JSON before image generation begins.
- Idle window skill-generated sofa variants: generated, split, de-fringed, registered, and wired `office-leather-sofa` left / center / right perspective variants so camera profiles now swap both desk and sofa art.
- Idle window background angle proof: generated and registered an `office-angle-overhead-proof` background from the approved office reference to validate the reference-to-angle-pack workflow for future top-down and overhead views.
- HD-2D-inspired idle-window prototype assets: added the office base background, office prop pack, regenerated desk prop, and a four-frame protagonist idle sprite preview for the building-stage prototype.

---

## [1.18.0] - 2026-05-14

### Added
- Liquid Galss theme: added a dark glass visual theme with translucent cards, edge highlights, neon XP accents, settings preview support, and inclusion in daily random theme selection.
- Motion-reactive glass reflection: Liquid Galss updates highlight position from mobile device orientation when available, with pointer movement as a desktop fallback.
- Liquid Galss reflection refinement: replaced the moving center light spot with angle-based sheen, softened haze, and tilt-responsive rim strength for a more natural glass surface.
- Liquid Galss mobile performance: throttled and smoothed motion updates through `requestAnimationFrame`, reduced per-card backdrop blur on touch devices, and kept blur only on shell/modal surfaces to avoid Safari reloads under motion.
- Liquid Galss mobile stability: added a lower-frequency motion path for touch devices, disabled pointer tracking and heavy sheen overlay layers on mobile, and removed remaining mobile backdrop blur to prevent repeated Chrome/Safari page crashes.
- Liquid Galss iPhone browser tuning: iOS Chrome now uses a static glass path to avoid WebKit page crashes, while touch Safari keeps low-frequency motion with a stronger lightweight glass surface on Today cards.
- Mobile input stability: disabled page-swipe navigation while editing text fields, paused visual viewport height syncing during keyboard entry, and forced 16px form controls on touch devices to prevent iOS zoom jumps.
- Personal Space parallax visibility: increased scene tilt ranges and layer depth multipliers so device tilt has a visible effect on background, furniture, and character layers.
- Focus desk mode manual exit: when the user exits desk mode while the phone is still flat, automatic flat-phone detection stays suppressed until the phone is lifted again.
- Hardware haptics foundation: added a shared PWA haptics adapter with named feedback patterns for focus, task completion, warnings, level-up, unlock, purchase, and scene taps.
- Personal Space motion parallax: added subtle device-tilt and pointer-based depth movement for scene backgrounds, furniture, and character layers with cleanup on rerender.
- Focus desk mode: added a calmer focus presentation that can be toggled manually and can auto-enter after stable flat-phone posture detection, while releasing motion listeners when focus ends.

---

## [1.17.0] - 2026-05-13

### Added
- Modern UI skin: 新增可在設定頁切換的 Classic / Modern UI 外觀層，保留既有 Classic UI，並以 design tokens 套用深色、玻璃感、pill navigation、按鈕、卡片、表單與 modal 的系統化樣式
- Profile avatar sync: 個人頁上傳大頭貼現在會先即時預覽；登入使用者會背景上傳到 Supabase Storage 並同步 `profiles.avatar_url`，遊客則保留為本機頭像
- Leaderboard daily cache: 排行榜新增本機每日快取，當日已更新時再次進入不會重複查詢 Supabase，並在頁面提示每日更新時間與上次更新時間
- Header identity display: 頂部狀態條新增使用者名稱，並與個人頁共用同一個使用者大頭貼來源
- Leaderboard avatars: 排行榜資料新增公開使用者 avatar path，前端每日更新時會產生 signed URL 並快取顯示；沒有頭像或簽名失敗時維持名字首字 fallback
- Floor map room navigation: 地圖視窗內有對應 scene 且已解鎖的房間現在渲染為可點擊按鈕（`is-navigable`），點擊後等同點擊場景切換器，memory scene 房間正確寫入 `memoryViewSceneId`
- Floor map progressive reveal: 只有擁有可用 scene 的樓層正常顯示；下一個鎖定樓層以「升到 Lv.XX 解鎖」teaser 顯示，不洩漏樓層名稱；其餘未解鎖樓層收合為「更多樓層持續升等後陸續開放」一行
- Floor map room lock badges: 鎖定房間右上角顯示「Lv.XX」解鎖等級，隱藏真實名稱，保留解鎖驚喜感
- Floor map office badges: 公司地圖中當前辦公室標示「上班中」，已畢業的舊辦公室標示「回顧」
- Scene enter animation: `.space-scene-shell` 加入 `scene-enter` keyframe（opacity + scale，0.35s），每次場景切換自動觸發進場動畫
- `getSceneMinLevel(sceneId)`: `unlockRules.js` 新增 helper，供地圖 UI 查詢各 scene 的最低解鎖等級
- Memory property rule system: `unlockRules.js` 新增 `MEMORY_PROPERTY_KIND`（`graduated` / `buyback`）與 `MEMORY_PROPERTY_RULES`，作為所有 memory property 的資料層唯一來源；新增 `getGraduatedMemoryScenes`、`isMemoryScene`、`getMemoryPropertyRule` helper，讓 runtime 與 UI 可直接查詢而不需 UI-level 推算
- Memory scene visit log: `gameState.js` 新增 `memorySceneLog` 欄位（按 sceneId 記錄 `firstVisitedAt`）與 `recordMemorySceneVisit` API，為 memory scene 的狀態保存建立最小資料結構
- Floor map memory markers: `world/floorMap.js` 為四個畢業辦公室房間加上 `graduatesAtLevel` 欄位，並新增 `getMemoryRooms(level)` query helper

### Added
- CSV export + PDF report: 設定頁 Pro / 試用用戶新增「📤 資料匯出」card，提供兩個按鈕：（1）「📊 匯出 CSV」下載含所有 sessions 的 CSV 檔（UTF-8 BOM，Excel 直接開啟中文正常顯示）；（2）「📄 產生 PDF 報告」彈出月份選擇器（本月 / 上個月 / 選擇月份 / 全部時間），以 html2canvas + jsPDF 產生 A4 PDF，內含統計摘要、每週 XP 長條圖、最常打卡 Top 5、打卡明細表（≤150 筆時顯示，超過則提示使用 CSV）
- Forgot password flow: 登入頁加「忘記密碼？」連結，彈出 modal 輸入 Email 呼叫 Supabase `resetPasswordForEmail` 寄送重設信；app 攔截 `PASSWORD_RECOVERY` auth 事件，顯示設定新密碼 modal 呼叫 `updatePassword`；切到「註冊」tab 時連結自動隱藏
- Daily plan info modal: 本日計劃標題旁新增「？」按鈕，點擊彈出 modal 說明起床規劃的心理學原理（實行意圖、決策疲勞、心理對比）
- Password visibility toggle: 登入與註冊頁密碼欄位右側新增眼睛 icon，點擊切換明文 / 遮罩顯示

### Fixed
- Google OAuth login UX: Google 按鈕移至 email/password 表單之前，分隔線文字改為「或用電子郵件」，讓用 Google 帳號註冊的使用者不會誤填密碼
- Task card edit mode lost after drag reorder: `_endDrag` now captures which sections have `edit-mode` active before calling `renderHome`, then restores those classes and button labels after the re-render; dragging a card no longer exits editing
- Settings account email stuck on "載入中…": email is now cached in a module-level variable on first async load; subsequent `_renderView` calls (triggered by theme/skin/mode changes) render from the cache instantly instead of resetting to "載入中…"
- Profile sync silent failure: name and avatar changes no longer show a false "✓ 同步完成" when the Supabase session is unavailable; unsaved changes are flagged as `_syncPending` in localStorage and pushed to Supabase before the next remote pull, preventing changes from disappearing after app reload
- Modern skin theme compatibility: `--modern-primary` and `--modern-accent` now resolve to `var(--primary)` / `var(--accent)` instead of hardcoding Apple-blue (`#0a84ff`); `--modern-focus-ring` uses `color-mix()` to follow the active theme color; switching to Modern skin no longer forces the primary color away from the user's chosen theme

### Changed
- Profile name and title preference saves now use explicit local-first persistence with cloud sync instead of silently relying on background sync
- Personal space page now loads persisted `spentGold` and `ownedItems` from local state, deducts spent gold from available gold, and shows a small owned-item snapshot on the page
- Personal space page now renders the starter shop catalog, shows starter item prices and ownership state, and emits a purchase request event hook for future write flow
- Personal space scene layer now switches between rental / office / estate contexts based on stage progression, supports home-work scene switching, moves explanatory UI outside the 2D scene, and treats older office floors as revisitable memory properties
- Personal space scene switcher now uses a segmented `住處 / 上班 / 回顧` category layer, a horizontal scene destination row, a current-scene location highlight, and memory grouping for older office floors plus the Lv.80 buy-back rental scene
- Personal space runtime now reads an interactive scene graph with exit, view, inspect, and npc nodes, emits interaction bus events from scene hotspots, and supports data-driven scene changes through action sequences
- Personal space office window interaction now switches into a placeholder window-view surface with skyline, glass, portrait-slot, and back-to-scene controls
- Personal space now loads the provided 2D asset pack from `pwa/assets/personal-space/`, uses real window-view background and portrait art, and replaces current placeholder furniture blocks with sprite-based props when matching assets exist
- Personal space now uses a sprite-based furniture layout schema for rental and office scenes, with explicit placement, z-order, anchor, scale, and soft shadow metadata instead of relying on raw inline placeholder rectangles
- Personal space local state now separates `ownedItems` from `placedItems`, and scene runtime can apply placement overrides from local layout state without coupling placement data to purchase ownership
- Personal space now defines company-building and estate floor-map schema with explicit building, floor, room, scene, and adjacency data, giving future map UI and room topology changes a stable source of truth
- Personal space now exposes company and estate map icon buttons that open floor-map windows showing each building's floors, rooms, room types, and current scene location
- Floor map excludes corridor and transition rooms (no sceneIds) from display; only rooms with playable scenes appear in the map grid

## [v1.16.0] - 2026-04-21

### Added
- Life-sim foundation documentation sync: README、ROADMAP 與相關設計文件開始反映 Orbit 從成長打卡工具升級到 self-growth life sim 的方向
- Shared agent workflow baseline: 新增 `AGENTS.md`，明確定義 baseline-first、scope control、task lifecycle、documentation synchronization
- Personal space module skeleton: 新增 `pwa/js/personalSpace/`，包含 economy、unlock rules、game state、sceneRuntime、assetRegistry、interactionBus，以及 avatar / npc / world / ui 子模組骨架
- Platform adapter skeleton: 新增 `pwa/js/platform/`，包含 notifications、haptics、share、purchases、storageBridge 的 web fallback / placeholder 介面
- Personal space route and page: 新增 `personalSpace` 頁面、底部導覽入口、scene placeholder、level unlock 顯示與 Gold 估算 UI
- Personal space unit coverage: 新增 `tests/unit/personalSpace.test.js`

### Changed
- Service Worker cache 與 precache 清單同步到 `v1.16.0`
- 文件系統開始區分 README、AGENTS、ROADMAP、CHANGELOG 與 tasks.md 的工作流角色

---

## [v1.8.0] — 2026-04-19

### 新增
- **Pro 升級頁面（SUB-03）**：設定頁 Pro 區塊全面改版
  - 試用中：顯示進度條 + 剩餘天數
  - 已是 Pro：顯示到期日 / 終身標示
  - 未訂閱：顯示功能對比列表 + 三種定價方案（月 NT$99 / 年 NT$699 / 終身 NT$1,999）
  - 金流按鈕預留位置（Stripe 整合待上線）

---

## [v1.7.0] — 2026-04-19

### 新增
- **15 天免費試用流程（SUB-02）**：新用戶首次登入後自動開啟 Pro 試用，`trial_started_at` 寫入 `profiles`；`is_pro=true`、`pro_expires_at=now+15d` 同步設定
- **試用提醒 banner**：試用剩餘 5 天以內（第 10 天起）在頂部顯示軟提醒 banner，可一鍵點擊升級或當日關閉（不重複打擾）
- `storage.isTrialUser()` / `storage.getTrialDaysRemaining()` 試用狀態 helper

---

## [v1.6.0] — 2026-04-19

### 新增
- **Pro 狀態管理模組（SUB-01）**：`profiles` 表新增 `is_pro`、`pro_expires_at`、`trial_started_at` 欄位；`storage.js` 新增 `isProUser()` / `getProExpiry()` helper，所有 Pro 功能 gate 統一走此介面

### 改進
- Service Worker cache name 從 `orbit-v4` 更新為 `orbit-v1.6.0`，確保版本號與 app 同步

---

## [v1.5.0] — 2026-04-18

### 新增
- **任務小卡左滑查看詳細**：向左滑動任務小卡從右側滑出「詳細」按鈕，點擊開啟完整資訊 modal；右滑 / 點擊卡片本體自動收回
- **本日計劃卡拖曳排序**：計劃區塊新增 ⠿ 把手，長按即拖曳，放開後順序持久化至 localStorage
- **設定頁每日隨機主題**：主題卡新增 toggle，開啟後每天從 13 種主題中自動抽選一個（同日重開不重抽，跨日自動更換）

### 改進
- **升等曲線重調**：前期 Lv.1–20 提速約 2×（Lv.1→2 從 120 降至 25 XP），後期 Lv.21+ 分段冪次加速；等級無硬性上限
- **新手教學第二步互動化**：用戶須實際點擊任務小卡加入計劃、再點計劃卡完成，才能推進教學；搭配臨時注入的新手任務卡（1 XP）

### 修正
- 新手教學 spotlight 框不再被畫面邊緣截斷（clamp 至 viewport），tooltip 也不會超出螢幕
- 上下拖曳觸發頁面捲動：`.task-card` 改為 `touch-action: none`（`pan-y` 在 touchstart 提交後無法動態覆蓋）
- 左滑觸發換頁：偵測到水平卡片滑動後，對 `touchend` 呼叫 `stopPropagation()` 阻止 document 換頁 handler
- 任務細節 modal class 由 `'modal'`（無 CSS）修正為 `'modal-overlay'`

---

## [v1.4.0] — 2026-04-17

### 新增
- **Header 頭貼圓圖 + 等級徽章**：個人頁頭像搬至 header，顯示目前等級
- **Service Worker 版本更新偵測**：偵測到新版時顯示 banner，提示重新整理
- **排行榜「累積 XP」第三 tab**：原本週XP / 成長率 tab 再加累積 XP 排名
- **任務細節 modal**：點擊任務小卡 emoji 開啟完整資訊（難度、阻力、完成次數、信心度等）
- **個人頁升等 XP 表「顯示更多」**：里程碑表格可展開查看更多等級
- **Orbit Pro 訂閱佔位卡**：設定頁加入付費方案預告
- **4 個創意主題**：像素 / 動漫 / 哥德蘿莉 / GitHub
- **每日晨間報告**：跨日後顯示昨日統計摘要、成長建議與 AI 分析佔位
- **E2E 自動化測試納入 CI**：Playwright + Chromium，完全 mock Supabase；18 個測試全過

### 修正
- 分頁滑動順序錯誤 + 稱號每日未重置

### 測試
- 新增 leaderboard / review / goals 單元測試，補齊 engine 邊界輸入覆蓋

---

## [v1.3.0] — 2026-04-15

### 新增
- **任務小卡長按拖曳排序**：500ms 長按後進入拖曳模式，手機震動回饋，bounding-rect 命中偵測
- **底部導覽列視覺升級**：移除冗餘分頁指示點，簡化 UI
- **新手教學 Onboarding Tour**：5 步驟引導，可在設定頁重啟教學
- **左右滑動換頁動畫**：切換分頁時帶有滑動轉場動畫 + 分頁指示點
- **3 個新主題**：日系簡約 / Material Design 3 / 賽博龐克
- **稱號完整自訂**：可自訂每個等級稱號；升等 XP 表顯示各等稱號
- **跨日偵測改進**：改用本地時區計算；支援自訂新的一天起始時間（newDayHour）
- **今日頁面「本日計劃」列表**：點擊任務小卡加入計劃，只有從計劃完成才算打卡
- **等級稱號系統**：RPG / 鬼滅之刃 / 職場菁英三種模板
- **自訂任務紫色小圓點標示**（isDefault: false 任務右上角顯示紫點）

### 改進
- Focus Timer UX：精力進度條顯示、計時衝突提示、結束後勵志語、略過時自動補打卡時長

### 修正
- 普通模式下預設任務仍可被編輯
- Skip confirm modal 被 focus overlay 遮擋（z-index 提升至 200）
- 計時任務 XP 顯示為 0（weight map 缺少 `'1'` key）
- 計時任務 XP label 改為「N+ XP」格式
- 連勝中斷歸零移除 -2 懲罰（只歸零，不倒扣）
- S 任務每日上限改用 today() 避免時區錯誤

---

## [v1.2.0] — 2026-04-13

### 新增
- **Focus Timer 背景計時 + 暫停**：App 切換不中斷計時；暫停功能；略過時記錄時長
- **週回顧月視圖**：月曆格式顯示每日 XP、可左右導航月份、月統計摘要
- **UX batch-1（8 項）**：跨日偵測（setInterval）、拖曳排序（Pointer Events）、左右滑動換頁、稱號系統雛型、計劃列表初版、普通模式修正、Skip z-index、XP 說明修正

### 測試
- 新增 DOM 單元測試（home / settings，jsdom），共 130 個
- 新增 Supabase 同步整合測試 + Playwright E2E，總計 194 個

---

## [v1.1.0] — 2026-04-11

### 新增
- **Vitest 測試架構**：unit / integration 測試；修正 engine.js weight map bug
- **GitHub Actions CI**：lint / test / build-check，PR 強制通過才能 merge
- **社群排行榜**：本週 XP 排名 + 成長率排名雙維度，需 opt-in，普通/進階模式分開
- **同步狀態列（sync-banner）**：背景同步時顯示「☁️ 同步中…」→「✓ 已更新」
- **設定頁顯示 APP 版本號**
- **Branch protection ruleset**（main 受保護）

### 修正
- uid() 改用 crypto.randomUUID()，修正資料從未同步 Supabase 的根本問題
- 修正登出 crash（引用不存在的 DOM element）
- 修正登出按鈕無效（signOut 命名衝突）
- 修正 favicon 404

### 新增（直接 push）
- 安全區域（safe-area-inset）支援
- 撤銷打卡：今日 session 可刪除，XP/Energy 自動反轉
- 普通 / 進階模式：普通模式鎖定預設任務防止刷分

---

## [v1.0.0] — 2026-04-10

### 新增
- **Supabase 後端整合**：PostgreSQL schema / RLS 四種 policy / Storage / handle_new_user trigger
- **帳號系統**：email + 密碼登入、Google OAuth、遊客模式
- **雲端同步**：localStorage cache-first，背景同步 Supabase；有快取時直接顯示 App
- **Loading 畫面**：登入跳轉時避免黑屏
- **設定頁帳號區塊**：登出藏在帳號 card，清快取改為小字連結

---

## [v0.1.0] — 2026-04-08

### 新增
- 初始化專案結構（成長監控 → 改名 Orbit）
- 建立 PWA 核心功能：打卡、升等、6 種主題（暗夜紫 / 極光藍 / 翡翠綠 / 赤焰 / 霓虹粉 / 純白光）、背景自訂
- XP / Energy / Streak 三軌核心系統（engine.js 純函數）
- 13 個預設任務模板，依 value / difficulty / resistance 分類
- 防刷機制：B 類每日上限 100 XP、同任務每日最多 3 次、S 任務需填理由
- Focus 計時器：全螢幕、最低有效時間、三段式結果評估
- GitHub Actions 自動部署到 GitHub Pages
- Service Worker（network-first）、可加入主畫面

### 修正
- SW network-first 更新 + Phase 3/4 清掃
- 升級為任務打卡 + 行為系統 v2
