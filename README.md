# 🚀 Orbit — 個人成長監控系統

一個以「行為分類 × 積分機制」為核心的 PWA，幫助你區分哪些行為真正讓你成長，而不只是讓你「感覺有在做事」。

**線上版：** https://yoyocadence.github.io/Orbit/  
**目前版本：** v1.16.0 — [查看版本歷史](CHANGELOG.md)

---

## 為什麼做這個？

大多數習慣追蹤 App 把所有任務一視同仁，打卡就加分。問題是：整理桌面和完成一份深度報告，對你的長期成長意義完全不同。

Orbit 的設計出發點是：**讓系統幫你誠實地判斷今天是否真的有進步。**

---

## 核心概念

系統追蹤三條獨立的線：

| 指標 | 代表什麼 | 如何增加 |
|------|---------|---------|
| **XP** | 長期成長累積 | 完成 `task` 類任務，依 `value / difficulty / resistance` 計算 |
| **Energy** | 今日可用精力 | 每日重置；恢復/娛樂可回能；任務會消耗 |
| **Streak** | 節奏穩定性 | 達成「有效日」條件才算連勝 |

### 有效日條件（三者同時達成）

1. 當日 `productiveXP >= 50`
2. 至少完成 1 個 A 或 S 任務
3. 娛樂總時數 `<= 120` 分鐘

**連勝規則：** 達成有效日 → `streak + 1`；未達成 → **streak 歸零**

---

## 任務分類系統

每個任務有四個維度：

### impactType（對系統的影響）

- `task`：消耗精力、獲得 XP
- `recovery`：回復精力、不給 XP
- `entertainment`：少量回能、不給 XP

### taskNature（行為本質）

- `growth`：連做 30-90 天會明顯變強
- `maintenance`：不做會亂，但做了不會變強
- `obligation`：必要的例行事務
- `recovery`：休息恢復
- `entertainment`：放鬆消遣

### value（長期價值）

- `S`：明顯讓你變強，僅限 `growth` 類
- `A`：有實質幫助
- `B`：維持運轉
- `D`：放鬆消遣，固定 `0 XP`

### category（執行方式）

- `instant`：點擊即完成
- `focus`：進入計時模式，結束後評估品質

---

## XP 計算公式

```text
baseXP = round(20 × valueWeight × difficultyWeight × resistanceWeight)
finalXP = round(baseXP × resultMultiplier × streakMultiplier)
```

| value | 權重 | difficulty | 權重 | resistance | 權重 |
|-------|------|-----------|------|-----------|------|
| S | 3.2 | 低 (0.4) | 0.4 | 低 (1.0) | 1.0 |
| A | 2.2 | 中 (0.7) | 0.7 | 中 (1.2) | 1.2 |
| B | 1.2 | 高 (1.0) | 1.0 | 高 (1.4) | 1.4 |
| D | 0 |  |  |  |  |

**focus 任務結果乘數：**

- 完成 → ×1.0
- 部分完成 → ×0.6
- 無效投入 → ×0，但 session 仍記錄

**streak 加成：** 每 5 連勝 +2%，最高 +12%

---

## Energy 系統

每日根據早晨狀態重置：

- 充沛 → 100
- 普通 → 90
- 疲憊 → 75

任務耗能公式：

```text
energyCost = round(8 × difficultyEnergy × resistanceEnergy × valueEnergyFactor)
```

娛樂超過 60 分鐘後，後續回能效率 ×0.7。  
娛樂超過 120 分鐘，當天不可成立有效日。

---

## 防刷機制

- B 類任務每日最多計入 100 XP
- 同一任務每日最多完成 3 次，才會繼續計 XP
- `entertainment / D` 類永遠 0 XP
- S 任務必須填寫「原因」與「成功標準」才能建立
- 每日最多新增 2 個 S 任務

---

## 功能列表

- **帳號系統**：email + 密碼註冊/登入、Google OAuth、遊客模式
- **雲端同步**：登入後資料同步 Supabase，換裝置不丟失
- **今日首頁**：stats bar（XP / 連勝 / 精力 / 娛樂分鐘）、任務三區塊、今日紀錄
- **撤銷打卡**：今日紀錄每筆可撤銷，自動扣回 XP 和精力
- **Focus 計時器 Pro**：全螢幕倒數/計時、最低有效時間提示、結果評估、自訂時長（Pro）、音效（Pro）、Session 備註（Pro）；XP 依時間線性縮放
- **週回顧 / 月回顧**：每日 XP、價值分佈、有效日與趨勢整理
- **個人頁**：等級進度、精力條、streak、Habit Heatmap（免費 90 天 / Pro 365 天）、進階數據儀表板（Pro）
- **設定頁**：主題、自訂背景圖、任務 CRUD、Focus Timer 預設與音效（Pro）
- **普通 / 進階模式**：普通模式鎖定預設任務防止刷分；進階模式全開放
- **任務小卡左滑查看詳細**：左滑顯示詳細按鈕，開啟任務資訊 modal
- **本日計劃拖曳排序**：支援長按拖曳，順序可持久化
- **排行榜**：本週 XP 與成長率雙排名
- **PWA**：可加入主畫面、離線可用
- **手機適配**：支援 safe-area-inset、Dynamic Island / notch
- **Pro 訂閱系統**：月費 NT$99 / 年費 NT$699 / 終身 NT$1,999；15 天試用；Streak Shield；45 天連勝解鎖 30 天 Pro

---

## 等級系統

### 現行公式（v1.4.1，分段設計）

```text
Lv.1–20  ：xpRequired = round((50 + 14×(level-1)) / 2)
Lv.21+   ：xpRequired = round((330 + 10n + 3n^1.3) / 2)
           n = level - 20
```

等級無硬性上限，稱號從「初心者」到「超越者」共 11 階。

### 關鍵數字對比（舊公式 vs 現行公式）

| 里程碑 | 舊公式（v1.0–v1.4.0） | 現行公式（v1.4.1） |
|--------|----------------------|-----------------|
| Lv.1→2 需求 | 120 XP | **25 XP** |
| Lv.20→21 需求 | 316 XP | **158 XP** |
| Lv.50→51 需求 | 365 XP | **440 XP** |
| 達 Lv.20（普通用戶 57XP/日） | 64 天 | **32 天** |
| 達 Lv.50（積極用戶 150XP/日） | 144 天 | **72 天** |
| 達 Lv.120（積極用戶） | 2,500+ 天 | **457 天** |

> 前期（Lv.1–20）整體提速約 2 倍；後期（Lv.21+）維持長期挑戰性。

### 舊公式（v1.0.0–v1.4.0，保留供對照）

```text
xpRequired(level) = round(120 + 45 × (level-1) + 10 × (level-1)^1.35)
```

Lv.1 需 120 XP，統一公式無分段，升等門檻前期偏高。

---

## 本地開發

```bash
# clone 後啟動本地 server
node pwa/server.cjs
```

啟動後開啟 `http://localhost:3000`

環境變數（`.env`）：

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## 技術架構

- **純 Vanilla JS**：ES Modules，無框架
- **PWA**：Service Worker + Web App Manifest
- **後端**：Supabase（PostgreSQL + Auth + Storage）
- **儲存策略**：localStorage 快取優先，背景同步 Supabase
- **RLS**：完整 SELECT / INSERT / UPDATE / DELETE policy
- **部署**：GitHub Pages

```text
pwa/
├── index.html
├── sw.js
├── assets/
│   └── style.css
├── db/
│   ├── 001_schema.sql
│   ├── 002_rls_policies.sql
│   ├── 003_storage.sql
│   ├── 004_triggers.sql
│   ├── 005_profiles_extra_cols.sql
│   ├── 005_leaderboard.sql
│   ├── 006_pro_status.sql
│   ├── 007_streak_shield.sql
│   ├── 008_streak_unlock.sql
│   └── 009_focus_timer_pro.sql
└── js/
    ├── config.js
    ├── supabase.js
    ├── auth.js
    ├── engine.js
    ├── app.js
    ├── state.js
    ├── storage.js
    ├── leveling.js
    ├── defaultTasks.js
    ├── platform/
    ├── personalSpace/
    └── pages/
```

---

## 排行榜設計

排行榜有兩種排名維度，解決不同問題：

### 1. 本週 XP 排名

- 統計最近 7 天的 `productiveXP` 總和
- 每週滾動更新，不看歷史累積總量
- 優點是本週努力就能上榜，老用戶不能靠歷史 XP 躺分

### 2. 成長率排名（核心設計）

```text
個人平均週XP = totalXP / max(加入天數 / 7, 1)
成長率 = 本週XP / max(個人平均週XP, 1) × 100%
```

- 100%：本週表現與自己平均相同
- >100%：超越自己平均，正在成長
- <100%：低於平均，正在懈怠
- 新人友善：新人加入第一週表現好，成長率就可能很高
- 老手有約束：等級高但本週沒動作，成長率會低
- 加入未滿 2 週的用戶顯示「新人」標籤，不參與成長率排名

### 公平性規則

- 普通模式 / 進階模式分開排名
- 需主動 opt-in 才顯示在排行榜
- 排行榜只顯示暱稱與等級，不暴露 email 或 `user_id`

---

## Roadmap

- [x] XP / Energy / Streak 三軌系統
- [x] Supabase 後端整合（帳號 + 雲端同步）
- [x] 普通 / 進階模式
- [x] 撤銷打卡
- [x] 社群排行榜（本週 XP + 成長率雙排名）
- [x] 今日頁面任務小卡拖曳排序
- [x] 本日計劃置頂列表
- [x] 跨日偵測 + 自訂新的一天起始時間
- [x] 等級稱號系統（RPG / 鬼滅之刃 / 職場菁英模板 + 自訂稱號）
- [x] 左右滑動手勢切換分頁 + 換頁動畫
- [x] App 主題風格
- [x] 新手教學（Onboarding Tour）
- [x] Pro 訂閱系統（試用、Streak Shield、Heatmap、進階儀表板、Focus Timer Pro）

### 待辦 / Backlog

#### Pro 功能

- [ ] **SUB-13 資料匯出**：一鍵匯出所有打卡紀錄為 CSV
- [ ] **SUB-14 排行榜 Pro 強化**：Pro 頭像光環、自訂顯示名稱
- [ ] **SUB-17 邀請制解鎖**：邀請 3 位朋友完成 Onboarding → 30 天 Pro
- [ ] **SUB-15 AI 晨間報告**：接入 Claude API，根據近期 XP 趨勢給個人化建議

#### 基礎建設

- [x] CI 單元 + 整合測試（Vitest）

---

## Product Positioning / Orbit 升級方向

Orbit 現在不再只被定義為一個「成長打卡工具」，而是正逐步升級成一個：

**把一個人的成長軌跡，轉成可居住、可互動、可展示的 self-growth life sim。**

這代表未來 Orbit 的回饋不只停留在數字：

- 高價值行為會改變空間、物件、氛圍與角色行為
- 世界會逐漸反映使用者的節奏與特質
- 成長會被「看見」，不只是被記錄

Orbit 長期要支撐：

- personal space
- avatar identity
- AI companion relationship
- shop 與 furniture economy
- 可分享的成長空間 / 成長卡片
- 只賣表達方式、不賣成長本身的商業化
- PWA first，未來 hybrid / native ready

---

## Design Philosophy

Orbit 的設計哲學如下：

1. **成長可視化**  
   成長不只是數字，而是要轉譯成空間、角色、氛圍、物件與行為。

2. **世界記得你是誰**  
   系統應根據長期行為模式，讓世界逐漸反映這個人的節奏與特質。

3. **不賣成長本身，只賣表達方式**  
   付費應該聚焦在風格、外觀、裝飾、展示，而不是直接賣 XP 或勝利。

4. **先做可持續擴張的母體**  
   不追求一次性炫技，而是建立模組化、可分版本遞進的系統。

5. **PWA first, hybrid ready**  
   現在保留手機瀏覽器加入桌面的使用方式，未來再清楚包裝成 hybrid / native shell。

---

## Three-Layer Product Structure

### Layer 1：Core Retention

強化日常留存循環：

- 選任務
- 做任務
- 成長被世界看見
- 系統 / companion 給回饋
- 更願意維持節奏

### Layer 2：Identity

建立自我投射：

- 個人空間
- avatar
- 風格與氛圍
- AI companion 關係
- 成長屬性的人格化

### Layer 3：Social / Monetization

建立分享與商業化可能：

- 成長分享卡
- 空間展示
- cosmetic paid content
- 身份感與表達層

---

## Core Loop

Orbit 的核心循環不是「完成任務拿分數」，而是：

1. 選擇高價值行為
2. 執行行為
3. 成長被空間 / 角色 / 世界看見
4. AI companion / 系統給出回饋
5. 形成節奏與身份感
6. 推動下一次行為選擇

---

## Personal Space System

個人空間是 Orbit 進入 life-sim 的第一個核心模組。

### 定位

個人空間不是單純裝潢，而是：

- 使用者成長狀態的具象化載體
- 會隨等級、長期行為模式與資源投入逐步演化
- 未來與 AI companion、任務建議、社群分享整合

### 空間進化原則

空間應反映人生階段，而不只是家具數量。

### 三大階段

1. **生存期**  
   簡陋租屋，功能少，氛圍偏冷、簡單。主場景是租用的小房間，先讓生活穩住。

2. **建設期**  
   開始進入公司大樓上班。主場景從單純租屋擴張成「租屋處 + 公司」，可在同一棟大樓裡逐步解鎖更高樓層與更高級的辦公空間。

3. **掌控期**  
   主居所轉為豪宅 / 私人空間。除了仍然能回公司上班，也開始擁有更高級的私人辦公室、大客廳、遊戲房等空間，身份感與生活感同時提升。

### 居所 / 工作地點原則

- `survival stage` 只有租屋處
- `building stage` 以公司為主進展，但仍然可以回租屋處
- `mastery stage` 主要居所改為豪宅，租屋處需賣掉，但仍可回公司上班
- 辦公樓層升級後，舊樓層應轉為可回顧的 `memory property`；再次回去時，會像真實公司一樣有其他員工持續在那裡工作
- 更後期應允許使用者把最初的租屋處買回來，並保留當年最後一次離開時的樣貌，形成情感回憶點

### 場景切換原則

場景切換不應只有一種方式，而應同時支援兩條路徑：

1. **快速切換選單**  
   讓使用者不會迷路，也能快速前往想看的場景。

2. **場景內出口互動**  
   讓使用者能直接點場景中的門、出口、電梯，感受到自己是在「走」到下一個空間。

快速切換選單建議固定採兩層：

- 第一層：`住處 / 上班 / 回顧`
- 第二層：顯示該分類下可到達的場景

設計原則：

- `住處`：列出目前可用的主要居住場景
- `上班`：列出目前可用的公司場景與樓層
- `回顧`：列出已轉為 memory property 的舊租屋 / 舊辦公樓層

這個選單不取代場景內出口，而是作為：

- 直接跳轉的快捷入口
- 防迷路的保底方案
- 測試與回顧時更高效率的入口

### 場景內出口規則

- 租屋處與公司一樓之間：優先用門 / 出口切換
- 公司高樓層之間：優先用電梯切換
- 豪宅同樓層不同房間：優先用門切換
- 豪宅跨樓層：優先用電梯切換

若互動觸發後需要移動感，應先做：

- 點出口
- 出口高亮 / 微動畫
- 顯示目標地點
- 再切換場景

不要一開始就把完整角色走路系統綁進來。

### 建築總圖 / 樓層圖

公司大樓與豪宅都應提供：

- 一個地圖圖示按鈕
- 點擊後打開整體樓層 / 房間配置圖的視窗

用途不是取代主切換，而是：

- 幫助理解空間結構
- 幫助玩家知道哪些房間相鄰
- 幫助未來豪宅與公司大樓擴張時維持可讀性

### 未來可變更的空間規劃

因為豪宅與公司大樓的樓層安排未來可能調整，設計上不能把：

- 哪層是什麼房間
- 哪幾個房間相鄰
- 某個出口通往哪裡

直接寫死在頁面 renderer 裡。

應以資料驅動方式描述：

- 場景本體
- 場景出口
- 場景連線
- 入口落點
- 整棟建築 / 豪宅的樓層圖

這樣未來改豪宅格局時，才不需要整個重寫 scene runtime。

### 場景解鎖節點 v0

| Level | Unlock |
|---|---|
| Lv1 | 簡陋租屋 |
| Lv3 | 基礎小家具解鎖 |
| Lv5 | 植物 / 書架 / 裝飾解鎖 |
| Lv8 | 租屋升級版 |
| Lv10 | 公司大樓解鎖，可往返租屋處 / 公司 |
| Lv12 | 公司一樓辦公角落 |
| Lv15 | 正式工位 + 雙螢幕 |
| Lv20 | 二樓小辦公室 |
| Lv30 | 中階高樓層辦公室 |
| Lv40 | 豪宅主廳解鎖，進入 mastery stage |
| Lv45 | 豪宅私人書房 |
| Lv50 | 豪宅大客廳 |
| Lv60 | 豪宅遊戲房 + 大型辦公室 / 私人會議區 |

### 角色行為方向

未來 3D 化後：

- 深度任務 → 去書桌 / 電腦前
- recovery → 去休息區 / 綠植區
- maintenance → 去整理區 / 收納區
- AI companion 可主動靠近、等待、提醒、祝賀、回應

目前這一階段只做架構預留，不完整實作。

---

## Gold Economy

Orbit 未來的核心資源分三層：

- XP：成長與升級，不直接消費
- Gold：用於個人空間內商店購買
- Level Unlock：決定可購買內容與場景等級

### 為什麼要分離 XP 與 Gold

- 避免使用者為了裝潢而扭曲成長評價
- 成長是成長，消費是消費
- 可支撐更健康的經濟與商業化設計

### Gold 獲得公式

每升 1 級獲得：

```text
GoldReward(level) = round(60 + 12 * level + 8 * sqrt(level))
```

每 5 級里程碑額外獎勵：

```text
MilestoneBonus(level) =
- 120 + 20 * level, if level % 5 === 0
- 0, otherwise
```

總金幣：

```text
TotalGold(level) = Σ [GoldReward(i) + MilestoneBonus(i)] for i = 2..level
```

### 家具價格分級

- Decor：80–180
- Small Furniture：220–450
- Functional Furniture：500–900
- Office Equipment：900–1800
- Space Upgrade：2000–5000

### 初版價格表

| 物件 | 價格 |
|---|---:|
| 小盆栽 / 桌燈 / 掛畫 | 100 |
| 小椅子 / 小茶几 / 床頭櫃 | 220 |
| 書桌 / 書架 / 沙發 | 450 |
| 電腦桌 / 雙螢幕 / 白板 | 850 |
| 房間主題包 / 辦公層升級 | 2500 |

### 經濟設計原則

- 早期不能太窮，否則沒有成就感
- 也不能太富，否則沒有選擇感
- 等級提供購買資格，不代表直接送滿
- Gold 要支撐進化感，而不是變成無腦囤積數字

---

## AI Companion Philosophy

AI companion 不應只是聊天機器，而是：

- 成長陪伴者
- 行為鏡子
- 關係會演化的角色

### 兩層嚴格分離

#### 1. Behavior Layer

決定 AI 做什麼：

- 何時靠近
- 何時提醒
- 何時等候
- 何時祝賀
- 何時對附近行為做出反應

這一層應先 rule-based，可測試、低成本、可預期。

#### 2. Dialogue Layer

決定 AI 說什麼：

- 建議文字
- 週評語
- 鼓勵
- 提醒
- 對話內容

這一層之後才接 LLM。

### 關係進化草案

AI companion 的關係應該靠真實行為品質變化，而不是聊天次數：

- 陌生觀察
- 陪跑提醒
- 理性教練
- 理解型夥伴
- 高階顧問

---

## Hidden Stats Direction

Orbit 未來不應只有單一 XP 軸，而應逐步補上 hidden stats / semi-hidden stats。

候選屬性：

- Discipline
- Depth
- Vitality
- Order
- Courage
- Craft

未來用途：

- 改變角色氣質
- 影響空間風格與氛圍
- 影響 AI companion 態度
- 強化分享卡與回顧內容的人格化

這些屬性不取代 XP，而是補充人格維度。

---

## Architecture Direction

為了讓 Orbit 從工具升級為 life-sim，而不破壞現有 PWA，現階段採取「明確擴張接縫」策略。

### Phase 1 新模組

- `pwa/js/personalSpace/`  
  放 scene runtime、economy、unlock logic、avatar / NPC controllers、UI adapters。

- `pwa/js/platform/`  
  放 notifications、haptics、share、purchases、storage bridge 的平台抽象層。

這些模組應保持：

- 與 auth 低耦合
- 與 migrations 低耦合
- 不污染現在的 task / engine 主邏輯

### 未來架構方向

```text
Current PWA shell
  -> core progression systems
  -> personalSpace domain
  -> AI companion behavior systems
  -> platform adapter layer
  -> future native shell / hybrid wrapper
```

---

## Platform Expansion Direction

Orbit 目前仍以 PWA 為主，但平台能力不應散落在各頁面。

預留中的平台模組：

```text
pwa/js/platform/
  notifications.js
  haptics.js
  share.js
  purchases.js
  storageBridge.js
```

這一階段的原則：

- 先做 web fallback / no-op
- 不實作真正付費
- 不做原生工程
- 把未來 hybrid / native 的替換點先整理清楚

---

## Life-sim Roadmap / Phased Delivery

### Phase 1：Architecture Motherframe

- 建立產品哲學與規格文件
- 定義 Gold 與 unlock 規則
- 新增 personal space route 與 placeholder UI
- 建立 personalSpace / platform 骨架

### Phase 2：輕量場景層

- room state visualization
- owned furniture state
- basic shop flow
- 第一批 rule-based AI companion behavior hooks

### Phase 3：3D scene runtime

- scene loading
- avatar placement and movement
- furniture anchors
- behavior-driven movement targets

### Phase 4：Identity depth

- avatar customization
- companion relationship progression
- hidden stats expression
- 更明顯的空間風格變化

### Phase 5：Social / Monetization surfaces

- share cards
- space showcase
- paid expression layers
- hybrid/native packaging readiness

---

## 相關文件

- [AGENTS.md](AGENTS.md)
- [Life Sim Architecture](docs/life-sim-architecture.md)
- [CLAUDE.md](CLAUDE.md)
