# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [v1.5.0] — 2026-04-18

### 新增
- **任務小卡左滑查看詳細**：向左滑動任務小卡從右側滑出紫色「詳細」按鈕，點擊開啟完整資訊 modal（難度、阻力、完成次數、成功標準等）；右滑 / 點擊卡片本體自動收回
- **本日計劃卡拖曳排序**：計劃區塊新增 ⠿ 把手，長按即拖曳，放開後順序持久化至 localStorage
- **設定頁每日隨機主題**：主題卡新增 toggle，開啟後每天從 13 種主題中自動抽選一個（同日重開不重抽，跨日自動更換）

### 改進
- **升等曲線重調**：前期 Lv.1–20 提速約 2×（Lv.1→2 從 120 降至 25 XP），後期 Lv.21+ 分段冪次加速；等級無硬性上限
- **新手教學第二步互動化**：用戶須實際點擊任務小卡加入計劃、再點計劃卡完成，才能推進教學；搭配臨時注入的新手任務卡（1 XP）

### 修正
- **新手教學 spotlight 框截斷**：高亮框不再被畫面邊緣截斷（clamp 至 viewport），tooltip 也不會超出螢幕
- **上下拖曳觸發頁面捲動**：`.task-card` 改為 `touch-action: none`，瀏覽器不再攔截垂直 pointer events（原 `touch-action: pan-y` 在 touchstart 提交後無法動態覆蓋）
- **左滑觸發換頁**：偵測到水平卡片滑動後，對 `touchend` 呼叫 `stopPropagation()`，阻止 document 層的頁面切換 handler 觸發
- **任務細節 modal 不可見**：`showTaskDetail` 的 overlay class 由 `'modal'`（無 CSS 定義）修正為 `'modal-overlay'`

---

## [v1.4.0] — 2026-04-17

### 新增
- **Header 頭貼圓圖 + 等級徽章**：個人頁頭像搬至 header，顯示目前等級（PR #32）
- **Service Worker 版本更新偵測**：偵測到新版本時顯示 banner，提示用戶重新整理（PR #33）
- **排行榜「累積 XP」第三 tab**：原有本週 XP / 成長率兩個 tab 新增累積 XP 排名（PR #34）
- **任務細節 modal**：點擊任務小卡 emoji 開啟完整資訊 modal（難度、阻力、完成次數、上次完成日期、信心度）（PR #35）
- **個人頁升等 XP 表「顯示更多」**：升等里程碑表格可展開查看更多等級（PR #36）
- **Orbit Pro 訂閱佔位卡**：設定頁加入付費方案預告卡（PR #37）
- **4 個創意主題**：像素 / 動漫 / 哥德蘿莉 / GitHub（PR #38）
- **每日晨間報告**：跨日後顯示昨日統計摘要、成長建議與 AI 分析佔位（PR #39）
- **任務小卡長按啟動拖曳排序**：500ms 長按後進入拖曳模式，手機震動回饋（PR #30）
- **底部導覽列視覺升級**：移除冗餘分頁指示點，簡化 UI（PR #31）
- **E2E 自動化測試納入 CI**：Playwright + Chromium，完全 mock Supabase；18 個測試全過（PR #40）

### 修正
- 分頁滑動順序錯誤 + 稱號每日重置問題（PR #29）

### 測試
- 新增 leaderboard / review / goals 單元測試，補齊 engine 邊界輸入覆蓋（PR #28）

---

## [v1.3.0] — 2026-04-15

### 新增
- **今日頁面「本日計劃」列表**：點擊任務小卡加入計劃，只有從計劃完成才算打卡
- **跨日偵測**：setInterval 每分鐘偵測時區跨日，支援自訂新的一天起始時間（newDayHour）
- **等級稱號系統**：RPG / 鬼滅之刃 / 職場菁英三種模板，支援完整自訂稱號；升等 XP 表顯示各等稱號
- **左右滑動手勢切換分頁**（Touch Events）+ 滑動轉場動畫 + 分頁指示點
- **自訂任務紫色小圓點標示**（isDefault: false 任務右上角顯示紫點）
- **任務小卡拖曳排序**：Pointer Events drag-and-drop，改寫為 bounding-rect 命中偵測；順序持久化至 localStorage
- **新手教學 Onboarding Tour**：5 步驟引導，可在設定頁重啟
- **3 個新主題**：日系簡約 / Material Design 3 / 賽博龐克
- **Focus Timer UX 改進**：背景計時（App 切換不中斷）、暫停功能、略過時自動補打卡時長、精力進度條、計時衝突提示、結束後顯示勵志語
- **週回顧月視圖**：月曆格式顯示每日 XP、可左右導航月份、月統計摘要

### 修正
- 普通模式下預設任務（isDefault: true）仍可被編輯的問題
- Skip confirm modal 被 focus overlay 遮擋（z-index 提升至 200）
- 計時任務小卡 XP 顯示為 0（weight map 缺少 `'1'` key，與 engine.js 不一致）
- 任務小卡拖曳在行動裝置上無法作動（drag-handle 補 `touch-action: none`）
- 計時任務 XP 顯示改為「N+ XP」格式，明確告知為最低值
- 連勝中斷歸零移除 -2 懲罰（只歸零，不倒扣）
- S 任務每日上限改用 today() 避免時區錯誤

---

## [v1.2.0] — 2026-04-13

### 新增
- **社群排行榜**：本週 XP 排名 + 成長率排名雙維度，需 opt-in，普通/進階模式分開
- **設定頁顯示 APP 版本號**
- **同步狀態列（sync-banner）**：背景同步時顯示「☁️ 同步中…」→「✓ 已更新」
- **Focus Timer 背景計時 + 暫停**（基礎版）：App 切換不中斷；略過時補打卡時長記錄

### 修正
- uid() 改用 crypto.randomUUID()，修正資料從未同步 Supabase 的根本問題
- handleSignOut crash（引用不存在的 DOM element）

### 測試
- 新增 DOM 單元測試（home.js / settings.js，jsdom），共 130 個測試
- 新增 Supabase 同步整合測試 + Playwright E2E，總計 194 個測試

---

## [v1.1.0] — 2026-04-11

### 新增
- Supabase 後端整合：schema / RLS / Storage / handle_new_user trigger
- 帳號系統：email + 密碼、Google OAuth、遊客模式
- 雲端同步：localStorage cache-first，背景同步 Supabase
- 撤銷打卡：今日 session 可刪除，XP/Energy 自動反轉
- Vitest 測試架構：unit / integration / e2e
- GitHub Actions CI：lint / test / build-check，PR 強制通過才能 merge
- Branch protection ruleset（main 受保護）

---

## [v1.0.0] — 2026-03-28

### 新增
- XP / Energy / Streak 三軌核心系統（engine.js 純函數）
- 13 個預設任務模板，依 value / difficulty / resistance 分類
- 防刷機制：B 類每日上限 100 XP、同任務每日最多 3 次、S 任務需填理由
- Focus 計時器：全螢幕、最低有效時間、三段式結果評估
- 6 種 App 主題（暗夜紫 / 極光藍 / 翡翠綠 / 赤焰 / 霓虹粉 / 深海靛）
- PWA：Service Worker（network-first）、可加入主畫面
- 手機安全區域：safe-area-inset 支援
