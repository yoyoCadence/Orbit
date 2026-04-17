# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [v1.4.0] — 2026-04-17

### 新增
- **每日晨間報告**：跨日後先顯示昨日摘要（XP、完成任務數、連勝天數、有效日徽章、S/A/B/C 分布、Top 3 任務），附規則式建議（最多 3 條），AI 分析佔位區塊
- **Header 頭像 + 等級徽章**：點擊跳轉個人頁；登入後顯示大頭照縮圖，Lv. 標籤即時更新
- **版本更新提示 Banner**：Service Worker `controllerchange` 後顯示可關閉的「新版本已就緒」橫幅
- **排行榜累積 XP 第三 Tab**：三種排名維度（本週 XP / 成長率 / 累積 XP）
- **任務細節 Modal**：點擊任務 emoji 查看難度、阻力、XP 公式、taskNature 等細節
- **個人頁升等表「顯示更多」**：初始顯示 10 列，按需 +10，避免渲染過多 DOM
- **付費訂閱 UI 佔位**：設定頁 Pro 卡片，列出功能特色，邏輯 TBD
- **4 種創意主題**：像素風格 / 日系動漫 / 哥德蘿莉 / GitHub App 風格

### 改進
- 任務拖曳改為**長按 500ms 觸發**（移除拖曳把手圖示），與點擊事件不再衝突
- 分頁指示改為 **Tab 底部高亮色塊**，移除小圓點（更乾淨、節省空間）
- profiles 表新增 `title_template / custom_title / is_public / new_day_hour` 欄位（migration 005）

### 修正
- PAGE_ORDER 滑動順序與底部 Nav 排列不一致（#bug1）
- 首次登入後稱號模板每日重置為預設值（profiles 表缺少欄位導致 fallback，#bug2）
- `requestAnimationFrame` 未加入 ESLint globals，導致 tour.js 持續報 lint 錯誤

---

## [v1.3.0] — 2026-04-15

### 新增
- 今日頁面「本日計劃」列表：點擊任務小卡加入計劃，只有從計劃完成才算打卡
- 跨日偵測：setInterval 每分鐘偵測時區跨日，不重啟 App 也能自動彈出早晨 modal
- 等級稱號系統：RPG / 鬼滅之刃 / 職場菁英三種模板，支援自訂稱號
- 左右滑動手勢切換分頁（Touch Events）
- 自訂任務紫色小圓點標示（isDefault: false 任務右上角顯示紫點）
- 任務小卡拖曳排序（Pointer Events drag-and-drop，順序持久化至 localStorage）

### 修正
- 普通模式下預設任務（isDefault: true）仍可被編輯的問題
- Skip confirm modal 被 focus overlay 遮擋（z-index 提升至 200）
- 計時任務小卡 XP 顯示為 0（weight map 缺少 `'1'` key，與 engine.js 不一致）
- 任務小卡拖曳在行動裝置上無法作動（drag-handle 補 `touch-action: none`）
- 計時任務 XP 顯示改為「N+ XP」格式，明確告知為最低值

---

## [v1.2.0] — 2026-04-10

### 新增
- 社群排行榜：本週 XP 排名 + 成長率排名雙維度，需 opt-in，普通/進階模式分開
- 設定頁顯示 APP 版本號
- 同步狀態列（sync-banner）：背景同步時顯示「☁️ 同步中…」→「✓ 已更新」

### 修正
- uid() 改用 crypto.randomUUID()，修正資料從未同步 Supabase 的根本問題
- handleSignOut crash（引用不存在的 DOM element）

---

## [v1.1.0] — 2026-04-05

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
