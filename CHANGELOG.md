# Changelog

所有版本記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [Unreleased]

### 改進
- **升等曲線重調（v1.4.1）**：前期 Lv.1–20 提速約 2×（Lv.1→2 從 120 降至 25 XP），後期 Lv.21+ 分段幂次加速；等級無硬頂上限
- **新手教學第二步互動化**：用戶須實際點擊任務小卡加入計劃、再點計劃卡完成，才能推進教學；搭配臨時注入的新手任務卡（1 XP）
- **新手教學 spotlight 框修正**：高亮框不再被畫面邊緣截斷（clamp 至 viewport），tooltip 也不會超出螢幕

---

## [CI] — 2026-04-17

### 基礎建設
- E2E job 加入 CI（`playwright install --with-deps chromium` → `npm run test:e2e`）
- `pwa/server.js` 改名為 `pwa/server.cjs`，修正 `"type":"module"` 與 `require()` 的 ESM/CJS 衝突
- E2E 測試更新為兩步式計劃流程（task card → plan card），補上 early-end-confirm 步驟
- 共 18 個 E2E 測試，全部通過

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
