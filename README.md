# 🚀 Orbit — 個人成長監控系統

一個以「行為分類 × 積分機制」為核心的 PWA，幫助你區分哪些行為真正讓你成長，而不只是讓你「感覺有在做事」。

**線上版：** https://yoyocadence.github.io/Orbit/

---

## 為什麼做這個？

大多數習慣追蹤 App 把所有任務一視同仁——打卡就加分。問題是：整理桌面和完成一份深度報告，對你的長期成長意義完全不同。

Orbit 的設計出發點是：**讓系統幫你誠實地判斷今天是否真的有進步。**

---

## 核心概念

系統追蹤三條獨立的線：

| 指標 | 代表什麼 | 如何增加 |
|------|---------|---------|
| **XP** | 長期成長累積 | 完成 task 類任務（依 value/difficulty/resistance 計算）|
| **Energy** | 今日可用精力 | 每日重置；恢復/娛樂可回能；任務會消耗 |
| **Streak** | 節奏穩定性 | 達成「有效日」條件才算連勝 |

### 有效日條件（三者同時達成）
1. 當日 productiveXP ≥ 50
2. 至少完成 1 個 A 或 S 任務
3. 娛樂總時數 ≤ 120 分鐘

---

## 任務分類系統

每個任務有四個維度：

### impactType（對系統的影響）
- `task` — 消耗精力、獲得 XP
- `recovery` — 回復精力、不給 XP
- `entertainment` — 少量回能、不給 XP

### taskNature（行為本質）
- `growth` — 連做 30-90 天會明顯變強
- `maintenance` — 不做會亂，但做了不會變強
- `obligation` — 必要的例行事務
- `recovery` — 休息恢復
- `entertainment` — 放鬆消遣

### value（長期價值）
- `S` — 明顯讓你變強（僅限 growth 類）
- `A` — 有實質幫助
- `B` — 維持運轉
- `D` — 放鬆消遣（固定 0 XP）

### category（執行方式）
- `instant` — 點擊即完成
- `focus` — 進入計時模式，結束後評估品質

---

## XP 計算公式

```
baseXP = round(20 × valueWeight × difficultyWeight × resistanceWeight)
finalXP = round(baseXP × resultMultiplier × streakMultiplier)
```

| value | 權重 | difficulty | 權重 | resistance | 權重 |
|-------|------|-----------|------|-----------|------|
| S | 3.2 | 低 (0.4) | 0.4 | 低 (1.0) | 1.0 |
| A | 2.2 | 中 (0.7) | 0.7 | 中 (1.2) | 1.2 |
| B | 1.2 | 高 (1.0) | 1.0 | 高 (1.4) | 1.4 |
| D | 0   |           |      |           |      |

**focus 任務結果乘數：**
- 完成 → ×1.0
- 部分完成 → ×0.6
- 無效投入 → ×0（但 session 仍記錄）

**streak 加成：** 每 5 連勝 +2%，最高 +12%

---

## Energy 系統

每日根據早晨狀態重置：
- 充沛 → 100
- 普通 → 90
- 疲憊 → 75

任務耗能公式：
```
energyCost = round(8 × difficultyEnergy × resistanceEnergy × valueEnergyFactor)
```

娛樂超過 60 分鐘後，後續回能效率 ×0.7。
娛樂超過 120 分鐘，當天不可成立有效日。

---

## 防刷機制

- B 類任務每日最多計入 100 XP
- 同一任務每日最多完成 3 次（計 XP）
- entertainment / D 類永遠 0 XP
- S 任務必須填寫「原因」與「成功標準」才能建立
- 每日最多新增 2 個 S 任務

---

## 功能列表

- **今日首頁** — stats bar（XP / 連勝 / 精力 / 娛樂分鐘）、任務分三區塊、今日紀錄
- **focus 計時器** — 全螢幕計時、最低有效時間提示、三段式結果評估
- **週回顧** — 每日 XP 長條圖、任務價值分佈、待校準任務清單
- **個人頁** — 等級進度、精力條、streak 連勝
- **設定** — 6 種主題、自訂背景圖、任務 CRUD（含所有新欄位）
- **PWA** — 可加入主畫面、離線可用

---

## 等級系統

```
xpRequired(level) = round(120 + 45 × (level-1) + 10 × (level-1)^1.35)
```

Lv.1 需 120 XP，之後每級遞增。等級稱號從「初心者」到「超越者」共 11 階。

---

## 本地開發

```bash
# clone 後進入 pwa 資料夾啟動 server
node pwa/server.js
# 開啟 http://localhost:3000
```

---

## 技術架構

- **純 Vanilla JS**（無框架）ES Modules
- **PWA**：Service Worker（network-first for JS/CSS）+ Web App Manifest
- **儲存**：localStorage（單機版）
- **部署**：GitHub Actions → GitHub Pages（push main 自動上線）

```
pwa/
├── index.html
├── sw.js               # Service Worker
├── assets/style.css    # 全部樣式（含 6 主題）
└── js/
    ├── engine.js       # 純函式計算引擎
    ├── app.js          # 路由、timer、session 提交
    ├── state.js        # 全域狀態
    ├── storage.js      # 資料存取抽象層
    ├── leveling.js     # 等級系統
    ├── defaultTasks.js # 預設任務模板
    └── pages/          # home / goals / review / profile / settings
```

---

## Roadmap

- [ ] Supabase 後端整合（帳號系統 + 雲端同步）
- [ ] 跨裝置資料同步
- [ ] 社群排行榜
