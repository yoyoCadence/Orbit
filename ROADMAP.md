# Orbit Roadmap

目前版本：**v1.5.0**

這份文件記錄 Orbit 的公開功能規劃方向。功能依優先順序排列，會隨專案進展持續更新。

---

## 近期（v1.6.x）

- [ ] **Service Worker 版本連動** — cache name 隨版本號自動更新，確保部署後舊快取正確失效
- [ ] **補齊單元測試** — swipe reveal、任務詳情 modal、設定頁隨機主題 toggle
- [ ] **補齊 E2E 測試** — 加入計劃 → 完成流程、Focus Timer pause/resume

---

## 中期（v1.7.x – v1.9.x）

### Pro 訂閱系統
Orbit 將推出 Pro 方案。免費版保留完整核心體驗（任務追蹤、XP、Streak、Focus Timer、基礎回顧），Pro 在此之上擴充深度：

- **歷史深度** — 免費：近 30 天；Pro：無限歷史 + 資料匯出
- **主題** — 免費：5 種；Pro：全部 13 種 + 每日隨機主題
- **Streak Shield** — Pro 每月 2 張保護卡，意外斷連勝時可補救
- **稱號模板選擇器** — Pro 一鍵套用模板；免費仍可手動輸入自訂稱號
- **Habit Heatmap** — GitHub contribution graph 風格，全年每日 XP 熱力圖
- **進階儀表板** — 任務效率分析、最佳時段、Streak 里程碑預測
- **Focus Timer 進階** — 自訂 Pomodoro 時長、計時音效、Session 備注

### 努力解鎖 Pro（給付不起的用戶）
- 連勝 60 天 → 自動獲得 30 天 Pro
- 邀請 3 位朋友完成 Onboarding → 30 天 Pro

---

## 長期（v2.x）

- **AI 晨間報告** — 接入 Claude API，根據近期 XP 趨勢給個人化建議
- **公開個人頁面** — 可分享的成長檔案（等級、稱號、Heatmap 縮圖）
- **排行榜強化** — Pro 頭像光環、自訂排行榜顯示名稱
- **邀請 & 社交** — 雙邊獎勵邀請機制、夥伴進度分享

---

## 已完成

- v1.5.0 — 每日隨機主題 toggle、任務左滑詳細按鈕、拖曳排序修正
- v1.4.0 — Header 頭像、任務細節 Modal、晨間報告、10 種主題
- v1.3.x — CI E2E、新手教學互動化、長按拖曳防選字

完整版本歷史請見 [CHANGELOG.md](CHANGELOG.md)。
