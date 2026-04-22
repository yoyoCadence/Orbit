# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Changed
- Personal space page now loads persisted `spentGold` and `ownedItems` from local state, deducts spent gold from available gold, and shows a small owned-item snapshot on the page

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
