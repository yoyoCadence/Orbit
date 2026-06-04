# Orbit Tasks

本文件是 Orbit 的可交接任務清單，供 Codex、Claude Code 與人類開發者共用。

規則：

- 任務狀態固定為 `Backlog / Next / In Progress / Done`
- 任務應可直接執行，不依賴聊天上下文
- 任務粒度保持小而明確
- 任務內容以目前 repo 現況與 `README.md`、`ROADMAP.md` 為準

---

## Backlog

- [ ] **HW-104** Camera proof capture for task deliverables
  - Goal: allow users to attach an optional local photo proof to a completed task or session, optimized for mobile camera capture.
  - Scope: PWA-only file/camera input, local preview/compression, localStorage-safe metadata shape; no cloud upload or schema changes.
  - Acceptance: a completed session can show a small proof thumbnail locally, and clearing local cache removes it.

- [ ] **HW-105** Personal Space achievement photo wall
  - Goal: let selected task proof photos appear as framed memories inside Personal Space.
  - Scope: local-only photo references, simple wall/frame rendering in existing 2D scene runtime, placeholder fallback when images are unavailable.
  - Acceptance: user can mark one local proof image as displayable and see it in a Personal Space room without touching auth/storage schema.

- [ ] **HW-106** Ambient noise focus signal
  - Goal: use microphone volume level as an optional focus-environment signal, not as recording.
  - Scope: permission-gated Web Audio volume meter, no audio persistence, UI states for quiet / normal / noisy.
  - Acceptance: focus mode can show a live ambient state and stops microphone tracks when leaving the view.

- [ ] **HW-107** Location context mode
  - Goal: support optional coarse context labels such as home / work / outside for task suggestions.
  - Scope: privacy-first local-only geolocation prompt, coarse saved labels, no precise coordinate sync.
  - Acceptance: user can opt in, assign current place to a label, and see context-aware task hints.

- [ ] **HW-108** Web Share achievement cards
  - Goal: let users share daily / weekly growth summary cards from mobile.
  - Scope: generate a lightweight share payload using Web Share API with clipboard fallback; no external service.
  - Acceptance: share button works on supported phones and copy fallback works elsewhere.

- [ ] **HW-109** App badge and notification shell
  - Goal: introduce restrained PWA badge/notification hooks for daily core tasks and review reminders.
  - Scope: platform adapter only, permission-gated notifications, local scheduling placeholders; no push server.
  - Acceptance: supported browsers can show/clear badge count and local reminder copy is centralized.

- [ ] **HW-110** Offline action queue and sync hints
  - Goal: make offline task completion feel intentional and visible.
  - Scope: local pending-action queue UI, sync status messaging, reuse existing storage bridge patterns; no schema migration.
  - Acceptance: user can complete tasks offline and see a clear pending-sync state when connection returns.

- [ ] **HW-111** Time-of-day atmosphere layer
  - Goal: make Orbit feel more alive by shifting UI and Personal Space atmosphere by local time.
  - Scope: local time-based tokens for morning / day / evening / night; no external weather dependency.
  - Acceptance: Personal Space and Liquid Galss background subtly change by time band.

- [ ] **INFRA-101** 設定 Custom SMTP（Resend）並自訂 email 寄件人名稱與模板
  - 目標：讓 auth email（重設密碼等）以「Orbit」名義寄出，而非「Supabase Auth」；並把 email 內容換成品牌模板
  - 目前限制：Supabase 內建 email 每天只能寄 2 封，Sender name 無法自訂，不適合正式上線
  - 步驟：
    1. 在 resend.com 免費註冊，取得 API key
    2. Supabase → Authentication → Notifications → Email → SMTP Settings → Enable Custom SMTP
       - Host: `smtp.resend.com`、Port: `465`、Username: `resend`、Password: Resend API key
       - Sender email: `onboarding@resend.dev`（有自訂域名後再換）、Sender name: `Orbit`
    3. Authentication → Notifications → Email → Templates，更新 Reset Password / Confirm Signup 模板（英文品牌版內容已備好，ask Claude）
  - 備註：Resend 免費方案 3,000 封/月；之後有域名可換成 `noreply@yourdomain.com`

- [ ] **PS-211** 為 personal space 新增常用資產 preload / cache 策略
  - 目標：降低切換頁面或切回 personal space 時重新顯示圖片的等待感
  - 範圍：`pwa/js/personalSpace/`、service worker / asset loading 相關模組、相關測試或文件
  - 完成條件：目前常用場景素材可預載或快取，window view 與主要家具切頁後不再明顯延遲出現
  - 備註：應在主要場景與資產集合較穩定後再做，避免過早優化 placeholder 階段的載入策略

- [ ] **AI-201** 建立 AI companion behavior layer 的 rule-based 狀態模型
  - 目標：先定義 `observe / approach / remind / congratulate` 等狀態與觸發條件
  - 對應 roadmap：Phase 2

- [ ] **AI-202** 定義 companion relationship stage 與 hidden stats 的最小映射規則
  - 目標：讓 companion 關係變化可由真實行為驅動，而不是聊天次數
  - 對應 roadmap：Phase 2 / Phase 4

- [ ] **DOC-201** 補一份 personal space state 流程說明文件
  - 目標：說明 `user.totalXP -> level -> unlock -> gold -> ownedItems -> scene` 的資料流
  - 對應 roadmap：Phase 2

- [ ] **PLAT-201** 定義 `platform` adapters 在 PWA 與 future hybrid shell 的行為差異表
  - 目標：讓未來包成 native 時有清楚替換點
  - 對應 roadmap：Phase 5 準備

- [ ] **PRO-014** 排行榜 Pro 強化
  - 目標：完成 roadmap 既有 SUB-14
  - 對應 roadmap：銝剜?

- [ ] **PRO-017** 邀請制解鎖 Pro
  - 目標：完成 roadmap 既有 SUB-17
  - 對應 roadmap：銝剜?

- [ ] **AI-015** AI 晨間報告
  - 目標：完成 roadmap 既有 SUB-15
  - 對應 roadmap：?瑟? 2.x


---

## Next

- [ ] **PS-227** Generate controlled idle furniture variants from approved references
  - Goal: replace one-view-only expanded props with true `front / left-wall-flush / right-wall-flush` variants that preserve material identity.
  - Scope: use the `orbit-idle-window-assets` reference workflow for sofa, coffee table, bookcase, filing cabinet, trophy display, rug, and other large layout-critical props; register variant metadata and camera preferences.
  - Acceptance: each selected large prop has authored variants, no CSS rotation or mirror-only final art, and visual QA confirms material/palette/silhouette consistency across views.


---

## In Progress

- [ ] 目前無進行中的正式任務

---

## Done

- [x] **PS-232** Prove reference-to-angle-pack generation for idle backgrounds
  - Completed: generated `office-angle-overhead-proof` from the approved building office center background, registered it as a non-runtime `angle-proof`, and documented the overhead/top-down background workflow in the idle-window asset skill.

- [x] **PS-231** Validate first skill-generated furniture variant loop
  - Completed: generated sofa side variants from the approved front prop, split and cleaned the chroma-key sheet with skill tooling, registered `left-wall-flush` / `front` / `right-wall-flush` variants, and wired sofa camera preferences into the idle layout.

- [x] **PS-230** Add reusable idle variant audit script to the asset skill
  - Completed: added `audit_idle_window_variants.mjs` to the project and installed `orbit-idle-window-assets` skill, documented the command, and verified Markdown/JSON output from the Orbit repo root.

- [x] **PS-229** Add controlled idle furniture variant generation queue
  - Completed: added a tested `variantReadiness` manifest for large furniture direction variants, documented the controlled generation queue, and kept PS-227 focused on actual authored image generation instead of uncontrolled prompt batching.

- [x] **PS-228** Refine mobile idle editor controls and grouped furniture library
  - Completed: changed layer controls to instant back/front with separate fine nudges, grouped the furniture visibility library by unlock tier with per-group all/none controls, limited camera drag to expanded non-edit mode, prevented image drag thumbnails, and added touch feedback animations for idle editor controls.

- [x] **PS-226** Mature idle editor placement controls and consistency generation workflow
  - Completed: added selected-item layer up/down controls, blank-stage drag camera switching without Camera +/- buttons, item visibility toggles with show-all/hide-all controls, and a reference-image workflow in the idle-window skill for consistent future room angles and furniture variants.

- [x] **PS-225** Generate stage-wide idle-window background sets
  - Completed: generated and registered strict 16:9 `left / center / right` background sets for survival rental, building office, and mastery estate, then wired stage-aware background selection into the idle-window layout without replacing the existing Personal Space scene layer.

- [x] **PS-224** Replace proof office camera backgrounds with strict 16:9 assets
  - Completed: replaced the office proof camera backgrounds with strict 16:9 v2 production background assets, preserved the proof assets, and verified idle-window asset resolution with focused tests.

- [x] **PS-223** Add idle-window character furniture anchors
  - Completed: added furniture-defined character anchors and wired the protagonist to follow `corner-desk.desk-work`, including live editor updates when the desk is dragged while keeping the existing idle sprite contract.

- [x] **PS-222** Add idle editor depth sorting and collision feasibility
  - Completed: added footprint-based overlap warnings, editor invalid-placement styling, z-depth hints from placement depth, and unit coverage for overlap detection without persisting invalid state separately.

- [x] **PS-221** Add free movement and support-surface snapping
  - Completed: expanded desk and shelf support surfaces, added eligible-surface metadata for small props, and verified dragged props can move freely then snap to valid parent surfaces such as shelf tiers.

- [x] **PS-220** Add real idle-window camera profiles
  - Completed: generated and registered true `left / center / right` office background assets, tied them to camera profiles, and verified camera switching changes the actual background image.

- [x] **PS-219** Add perspective-correct desk variants
  - Completed: generated `office-corner-desk-v3` with true `front`, `left-wall-flush`, and `right-wall-flush` transparent variants, registered them, and tied desk variants to camera profile switching instead of CSS rotation or mirror-only art.

- [x] **PS-218** Add idle window production art and placement specs
  - Completed: added `docs/idle-window-art-direction-spec.md` and `docs/idle-window-furniture-variant-spec.md` with camera, support-surface, footprint, variant, anchor, scale, and acceptance rules for expansion before generating more assets.

- [x] **HW-103** Focus desk mode by phone posture
  - Completed: added a calmer focus desk presentation with a manual fallback button, optional device-orientation permission flow, stable flat-phone detection, and cleanup when minimizing or ending focus.

- [x] **HW-102** Personal Space motion parallax
  - Completed: added throttled device-orientation/pointer parallax for Personal Space scenes, with CSS tilt variables, layered background/furniture movement, and cleanup on rerender.

- [x] **HW-101** Haptics feedback adapter
  - Completed: expanded the platform haptics adapter with named vibration patterns and wired task completion, focus start/milestone, warnings, level-up, unlock, purchase, and scene tap feedback.

- [x] **UI-202** Add Liquid Galss glass theme with device-angle highlights
  - Completed: added the `liquid-galss` app theme to settings and daily random theme selection; introduced glass tokens/surfaces in CSS; wired `deviceorientation` plus pointer fallback to update reflection CSS variables; bumped to v1.18.0 and documented the change.

- [x] **PRO-013** 資料匯出 CSV + PDF 成長報告
  - 完成：新增 `export.js`；CSV 匯出將所有 sessions 依日期排序，帶 UTF-8 BOM；PDF 報告透過 html2canvas + jsPDF（CDN 懶載入）產生 A4 PDF，含統計摘要、每週 XP 長條圖、Top 5 任務、打卡明細表（>150 筆改顯示提示）；設定頁「📤 資料匯出」card 新增兩個按鈕；月份選擇器支援本月、上個月、任意月份、全部時間四種範圍

- [x] **AUTH-103** 忘記密碼 / 密碼重設流程
  - 完成：`auth.js` 新增 `resetPasswordForEmail` / `updatePassword`；登入頁密碼欄位下加「忘記密碼？」連結，點擊彈出 modal 輸入 Email 寄送重設信；`onAuthStateChange` 攔截 `PASSWORD_RECOVERY` 事件顯示設定新密碼 modal；切到「註冊」tab 時自動隱藏忘記密碼連結

- [x] **UI-201** 本日計劃區塊新增說明視窗
  - 完成：本日計劃標題改為 `section-title-row`，右側新增 `plan-info-btn`（？圓形按鈕）；點擊彈出 modal 說明「起床先規劃本日任務」的三個心理學原理（實行意圖、決策疲勞、心理對比）

- [x] **AUTH-102** 密碼欄位新增顯示 / 隱藏切換按鈕
  - 完成：密碼 input 包入 `.password-input-wrap`，右側加 `.password-toggle-btn`，以 SVG 眼睛 icon 切換 `type=password/text`；app.js 在登入頁初始化時綁定事件

- [x] **AUTH-101** Google OAuth 登入流程 UX 確認與優化
  - 完成：Google 按鈕移至 email/password 表單之前，分隔線文字改為「或用電子郵件」，讓用 Google 註冊的使用者第一眼就看到正確入口，避免誤填密碼

- [x] **BUG-103** 任務小卡移動後意外停止編輯模式
  - 完成：`_endDrag` 在呼叫 `renderHome` 前先記錄所有 `.task-grid.edit-mode` 的 section；重繪後逐一恢復 `edit-mode` class 並把對應「編輯」按鈕改回「完成」，拖曳排序不再退出編輯模式

- [x] **BUG-102** 設定頁帳號區塊帳號名稱下方持續顯示「載入中」
  - 完成：`settings.js` 新增 module-level `_cachedEmail` 變數；首次非同步取得 email 後存入 cache；後續所有 `_renderView` 呼叫直接從 cache render，不再還原成「載入中…」

- [x] **BUG-104** 改使用者名稱 / 上傳大頭貼靜默失敗
  - 完成：`upsertProfile` 改為回傳 `boolean`（true = 已同步，false = 無 session 跳過）；`saveUserAndSync` 傳遞此值，未同步時在 localStorage 標記 `_syncPending: true`；`loadFromRemote` 執行前若發現 `_syncPending`，先把本地資料推上 Supabase 再拉遠端，避免重開後舊資料蓋掉本地變更；改名與頭像上傳的 UI 訊息改為依實際同步結果顯示（已同步 / 已儲存在此裝置，登入後可同步），不再顯示假的「✓ 同步完成」

- [x] **BUG-101** 覆蓋稱號清除後隔天重置回覆蓋值
  - 完成：根因與 BUG-104 相同 — `_syncUserPreference` 呼叫 `saveUserAndSync` 時若無 session，`upsertProfile` 靜默跳過，Supabase 未更新；下次登入 `loadFromRemote` 用舊 cloud 資料蓋掉本地清除結果。BUG-104 的 `_syncPending` 機制同時修正此問題：未同步時標記 pending，`loadFromRemote` 執行前先推本地資料（含已清除的 `customTitle: ''`）再拉遠端

- [x] **SKIN-101** Modern skin 修正：繼承 theme 主色 / accent 而非硬覆蓋
  - 完成：移除 Modern skin 對 `--primary` / `--accent` 的硬覆蓋（Apple-blue #0a84ff），改為讓 `--modern-primary` / `--modern-accent` 直接 `var(--primary)` / `var(--accent)`；`--modern-focus-ring` 改用 `color-mix()` 動態跟隨主色；Modern skin 切換後主色仍由使用者選定的 theme 決定，不再強制換色
  - 分支：`fix/modern-skin-theme-compat`

- [x] **LB-201** 排行榜顯示公開使用者大頭貼
  - 完成：新增 `010_leaderboard_avatars.sql`，讓 `leaderboard_view` 提供 `avatar_url`，並新增 authenticated users 可讀取公開排行榜使用者 avatar object 的 Storage SELECT policy；排行榜每日刷新時會為 avatar path 產生 signed URL 並存入本機快取，row 顯示圖片頭像，失敗或無頭像時維持名字首字 fallback

- [x] **USER-201** 修正使用者名稱 / 大頭貼同步與排行榜快取
  - 完成：個人頁名稱與等級稱號偏好改為本機優先保存並進行雲端同步；大頭貼改為先本機預覽，登入使用者上傳 `avatars` Storage 並把 Storage path 寫回 `profiles.avatar_url`，遊客則保留為本機頭像；排行榜新增每日有效日快取與快取 fallback，頁面顯示每日更新時間與上次更新時間；頂部狀態條新增使用者名稱並與個人頁共用同一頭像來源；555 tests passing

- [x] **PS-212** 地圖視窗支援點選房間切換場景
  - 完成：地圖房間可點擊切換場景；鎖定樓層漸進揭露（只顯示已解鎖樓層 + 下一個 teaser + 其餘收合）；鎖定房間顯示「Lv.XX」但不洩漏名稱；公司辦公室標示「上班中」/「回顧」badge；走廊/景觀等無 sceneId 房間移除；切換場景觸發進場動畫；`getSceneMinLevel` helper 新增；550 tests passing（PR #95 #96 #97）

- [x] **PS-208** 修正住處場景切換邏輯
  - 完成：mastery 階段「住處」tab 改為顯示所有已解鎖豪宅場景（`getUnlockedEstateScenes`）；`rough-room` / `upgraded-rental` 在 Lv.40 透過 `MEMORY_PROPERTY_RULES` 正式畢業進「回顧」；`resolveActiveScene` 跳過 stale memory scene，自動 fallback 到豪宅預設；移除 estate SCENE_OPTIONS 的 maxLevel 誤差；540 tests passing

- [x] **PS-207** 將舊辦公樓層與租屋處正式納入 memory property 規則
  - 完成：新增 `MEMORY_PROPERTY_KIND` 與 `MEMORY_PROPERTY_RULES`（`unlockRules.js`），作為 memory property 的資料層唯一來源；新增 `getGraduatedMemoryScenes`、`isMemoryScene`、`getMemoryPropertyRule` 三個 helper；`gameState.js` 加入 `memorySceneLog` 追蹤欄位與 `recordMemorySceneVisit` API；`world/floorMap.js` 為四個畢業辦公室房間加上 `graduatesAtLevel`，並新增 `getMemoryRooms(level)` query helper；補 26 個測試（523 tests passing）

- [x] **PS-206** 為 personal space 新增地圖視窗入口
  - 完成：新增 `ui/floorMapPanel.js`，personal space 場景列會依目前可用場景顯示公司 / 豪宅地圖圖示；點擊後開啟樓層圖視窗，使用 `world/floorMap.js` 顯示樓層、房間、房間類型與目前所在場景位置

- [x] **PS-205** 定義公司大樓與豪宅的樓層圖 / 房間拓樸資料
  - 完成：新增 `world/floorMap.js`，為公司與豪宅定義 `building / floor / room / scene / adjacency` schema 與查詢 helper；後續地圖視窗與房間拓樸變更可直接讀資料層，不需要重寫 scene runtime

- [x] **PS-202** 為 personal space 建立 furniture ownership / placement 的本地資料模型
  - 完成：`personal-space-state` 現在正式區分 `ownedItems` 與 `placedItems`；新增 placement normalization 與 `furnitureState` 解析層，`sceneRuntime` 會讀 local placement state 覆蓋 scene layout，而不把 placement 規則耦合進 runtime 內部

- [x] **PS-210** 為 personal space 建立 sprite-based furniture layout schema
  - 完成：新增 `world/furnitureLayout.js`，把租屋處、公司一樓與現有豪宅場景的家具位置抽成 schema，支援 `assetId / x / y / width / height / z / anchor / scale / shadow`；`sceneRuntime` 會依 schema 渲染家具與地面陰影，不再依賴原本的色塊式 placeholder 容器

- [x] **PS-209** 匯入 personal space 2D 素材包並接上 asset registry
  - 完成：使用者提供的 `window / reference / props` 素材包已放入 `pwa/assets/personal-space/`；`assetRegistry` 與 `sceneRuntime` 會讀取窗景背景、窗外立繪與現有 2D 家具 sprite，無對應資產時仍保留原本 placeholder fallback

- [x] **PS-208** 建立辦公窗景 view node 互動原型
  - 完成：`office-window` view node 現在可切換到窗外 placeholder view，顯示 skyline、玻璃層、窗外立繪 slot 與返回按鈕；返回會依 view 的 `exitAction` 回到原場景

- [x] **PS-204** 為 personal space 建立 interactive scene graph 資料模型
  - 完成：新增 scene graph schema 與範例資料，支援 `exit / view / inspect / npc` interaction nodes、anchors、action sequence、views、asset slots；runtime 會讀取資料渲染 hotspot 並透過 interaction bus 發送 action event，頁面可用通用 `changeScene` action 從公司一樓回到住處

- [x] **PS-203** 將個人空間的場景切換器改為二層分類選單
  - 完成：個人空間場景切換器已改為 `住處 / 上班 / 回顧` 分類列加分類內場景列；舊辦公樓層會歸到 `回顧`，Lv.80 買回最初租屋處也先納入 memory scene 資料

- [x] **PS-201** 將個人空間頁面的 scene placeholder 升級為可描述場景狀態的 2D 視覺層
  - 完成：個人空間頁面已從純文字 placeholder 升級為會反映 stage / scene / owned items 的輕量 2D scene layer

- [x] **PS-102** 建立最小可用的個人空間商店資料流
  - 完成：頁面已列出 `STARTER_CATALOG`，並保留 starter shop 的購買事件接點供下一步實作寫入流程

- [x] **PS-101** 個人空間頁面接入真實 `spentGold / ownedItems` 本地狀態
  - 完成：`personalSpace` 頁面已接入本地 `spentGold / ownedItems`，available gold 會扣除已花費，並顯示已擁有物件快照

- [x] **DOC-001** 補齊 Orbit life-sim foundation 文件基線
  - 完成內容：README 加入 product positioning、design philosophy、personal space、Gold economy、AI companion、hidden stats、platform expansion、life-sim roadmap

- [x] **DOC-002** 建立共享協作規則文件
  - 完成內容：新增 `AGENTS.md`，定義 baseline、scope control、task lifecycle、documentation sync

- [x] **ARCH-001** 建立 `pwa/js/platform/` 骨架
  - 完成內容：`notifications.js`、`haptics.js`、`share.js`、`purchases.js`、`storageBridge.js`

- [x] **ARCH-002** 建立 `pwa/js/personalSpace/` 骨架
  - 完成內容：economy、unlock rules、game state、scene runtime、asset registry、interaction bus、avatar / npc / world / ui 子模組

- [x] **UI-001** 新增個人空間頁面與 route
  - 完成內容：`personalSpace` route、底部 nav、最小 page renderer、scene placeholder、Gold / unlock 顯示

- [x] **TEST-001** 補上個人空間頁面基本單元測試
  - 完成內容：`tests/unit/personalSpace.test.js`
