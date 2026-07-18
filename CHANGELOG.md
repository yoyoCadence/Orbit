# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

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
