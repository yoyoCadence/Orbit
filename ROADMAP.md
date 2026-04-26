# Orbit Roadmap

> 2026-04-26 sync note: PS-205~PS-212 personal space 地圖系統全部完成並 merged（PR #91~97）。v1.16.x 近期工作以 SUB-13 CSV 匯出為主，personal space 下一步為 AI companion（AI-201）或 preload 優化（PS-211）。

目前版本：**v1.16.0**（Unreleased 已累積大量 personal space 功能，待下次打版）

這份文件記錄 Orbit 的公開功能規劃方向。功能依優先順序排列，會隨專案進展持續更新。

---

## 近期（v1.16.x）

- [ ] **SUB-13 資料匯出** — 一鍵匯出所有打卡紀錄為 CSV（Pro 專屬）

---

## 中期

- **SUB-14 排行榜 Pro 強化** — Pro 頭像光環、自訂顯示名稱
- **SUB-17 邀請制解鎖** — 邀請 3 位朋友完成 Onboarding → 30 天 Pro

---

## 長期（v2.x）

- **SUB-15 AI 晨間報告** — 接入 Claude API，根據近期 XP 趨勢給個人化建議
- **Personal Space 3D readiness** — 建立 interactive scene graph，讓門、電梯、窗景、家具與 NPC 互動可由資料驅動，未來能接 2D / 3D runtime
- **公開個人頁面** — 可分享的成長檔案（等級、稱號、Heatmap 縮圖）
- **邀請 & 社交** — 雙邊獎勵邀請機制、夥伴進度分享

---

## 已完成

- v1.16.x（Unreleased）— **Personal Space 地圖系統**（PS-205~PS-212）：公司 / 豪宅樓層地圖視窗、可點擊房間切換場景、樓層漸進揭露、解鎖等級標示、上班中 / 回顧 badge、走廊移除、場景切換進場動畫；memory property 規則正式化（MEMORY_PROPERTY_RULES）；memoryViewSceneId 區分回顧導航與 stale 選擇
- v1.15.0 — **SUB-12** Focus Timer Pro（自訂倒數時長、Web Audio 音效、Session 備注）+ **refactor** isProUser() 含試用統一判斷
- v1.14.0 — **SUB-16** Streak 解鎖 Pro（連勝 45 天 → 自動獲得 30 天免費 Pro）+ **SUB-UX1** 所有 Pro 限定功能標上「✦ Pro 專屬」角徽
- v1.13.0 — **SUB-11** 進階數據儀表板（任務效率分析、最佳時段分佈、Streak 里程碑預測）
- v1.12.0 — **SUB-10** Habit Heatmap（GitHub 風格，免費 90 天 / Pro 365 天）
- v1.11.0 — **SUB-07** 稱號模板門控（免費只能自訂文字，Pro 一鍵套用）
- v1.10.0 — **SUB-04** 統一 Pro 標誌 UI（`.pro-badge--inline`、`.feature-locked`）
- v1.9.0  — **SUB-06** 主題門控（免費前 5 個，Pro 全部 13 個 + 每日隨機主題）+ **SUB-09** Streak Shield（Pro 每月 2 張保護卡）
- v1.8.0  — **SUB-03** Pro 升級頁面（年費錨定、底部 sheet、功能詳情 popover）
- v1.7.0  — **SUB-02** 15 天免費試用流程
- v1.6.0  — **SUB-01** Pro 狀態管理模組
- v1.5.0  — **SUB-05** 歷史深度限制（goals 30 天 / review 3 個月）
- v1.4.x  — 每日隨機主題、任務左滑詳細、拖曳排序、Header 頭像、新手教學

完整版本歷史請見 [CHANGELOG.md](CHANGELOG.md)。

