# Orbit 訂閱策略文件

> 本文件記錄 Orbit Pro 的商業邏輯、心理學設計原則、功能分界，以及實作待辦清單。
> 最後更新：2026-04-19

---

## 一、核心設計哲學

**免費版 = 無限深度的個人成長體驗。Pro = 放大洞察力、社交存在感、進階工具。**

最常見的 freemium 錯誤：閹割核心功能，讓免費用戶感到受辱。  
Orbit 的做法：讓免費版真的好用，讓 Pro 讓人覺得「值得」而非「必需」。

付費牆設計：「窗」而非「牆」。Pro 功能在 UI 中可見但淡化（✦ 圖示），點擊才滑出升級邀請卡，**不是強制 modal**。

---

## 二、心理學與行為學基礎

### Orbit 現有設計已命中的心理機制

| 機制 | 現有功能 | 效果 |
|------|----------|------|
| **Variable Reward（變動獎勵）** | XP、升等、隨機主題 | 多巴胺觸發，類賭博機制，上癮性強 |
| **Loss Aversion（損失厭惡）** | Streak 連勝 | 怕失去 streak 遠勝過期望得到 XP |
| **Sunk Cost（沉沒成本）** | 累積 XP / 歷史紀錄 | 用越久越不想換 app |
| **Social Comparison（社會比較）** | 排行榜 | 看到別人成長會觸發競爭本能 |
| **Progress Principle（進度感）** | XP 圖表、等級條 | 視覺化進度是最強的內在動機來源 |

### 訂閱轉換的最佳心理時機

1. 剛建立 streak 第 7–14 天（「我有東西值得保護了」）
2. 剛升級那一刻（情緒高峰，最捨得花錢）
3. 自然碰到限制（第 31 天想看更早的紀錄）

### 稱號設計的特殊心理邏輯

免費用戶可以看到所有 Pro 稱號模板，但不能直接點選套用——他們可以把想要的模板文字**手動打進去**。

這是刻意的設計：讓用戶感覺「自己繞過了付費牆」，產生「賺到」感，強化對 app 的認同與留存。Pro 的價值是「一鍵選取，不用手打」的便利性，而不是獨佔內容。

### 任務數量不設上限的理由

不限制免費用戶的任務數量：
- 有些免費用戶會鑽漏洞，用大量簡單任務刷 XP
- 現有 XP 計算（value / difficulty / resistance）已提高作惡成本
- 讓免費用戶「覺得賺到」比讓他們「感到受限」更有留存價值
- 長期看：高度使用的免費用戶是未來付費的最佳候選人

---

## 三、定價設計

### 方案（台灣市場定價）

| 方案 | 價格 | 定位 |
|------|------|------|
| 月費 | NT$99/月 | 衝動購買門檻，不到一杯咖啡 |
| 年費 | NT$699/年（省 41%） | 主推方案，提高 LTV |
| 終身 | NT$1,999 一次 | 平台信任度夠高後推出，重度用戶 |

定價心理學：月費 vs 年費差距要夠大，讓年費感覺「顯然更划算」。

### 15 天免費試用

- 新用戶首次登入後自動開啟 Pro 試用
- 第 10 天顯示軟提醒（banner，非強制 modal）：「還有 5 天試用，繼續你的成長旅程」
- 試用到期後**降級而非鎖定**：用戶資料全保留，只是無法使用 Pro 功能

---

## 四、免費 vs Pro 功能分界

### 永遠免費（核心留存功能，不可收費）

- 全部任務追蹤、XP、升等、Streak 連勝
- Focus Timer 基礎功能
- 今日計劃
- 週 / 月基礎回顧（近 30 天）
- 前 5 個主題
- Onboarding
- 基礎排行榜（可見自己排名）
- 自訂稱號（手動輸入，可看但不能直接套用 Pro 模板）
- 任務數量無上限

### Pro 功能

#### 現有功能重新定義

| 功能 | 免費版 | Pro 版 |
|------|--------|--------|
| 歷史紀錄深度 | 近 30 天 | 無限歷史 |
| 週/月回顧範圍 | 近 3 個月 | 無限 |
| 主題 | 前 5 種 | 全部 13 種 + 每日隨機 |
| 稱號選擇 | 手動輸入文字 | 一鍵套用任意模板 |
| 資料匯出 | 無 | CSV 全部歷史 |

#### 新功能（Pro 專屬）

**Streak Shield**（心理學最強轉換鉤子）
- Pro 每月重置 2 張保護卡
- 意外斷連勝時，隔天出現「使用保護卡恢復？」提示
- 保護卡使用後 streak 視為未中斷，session 補一筆 `is_shield: true`
- 免費用戶可見此功能存在，但保護卡數量為 0

**Habit Heatmap**
- GitHub contribution graph 風格，顏色深度對應當日 XP
- 免費：近 90 天；Pro：完整歷史（自帳號建立起）
- 可截圖分享（帶 Orbit watermark）

**進階數據儀表板**
- 任務效率分析（各任務貢獻 XP 比例）
- 最佳時段分析（哪天、哪個時段完成率最高）
- Streak 里程碑預測（照當前節奏，X 天後可達 30/60/100 天）

**Focus Timer Pro**
- 自訂 Pomodoro 時長（現有固定 25/5）
- 計時結束音效選擇
- Session 備注（計時結束後可附加文字，存入 session 紀錄）

**排行榜 Pro 強化**
- 頭像旁 ✦ Pro 光環（CSS 效果）
- 自訂排行榜顯示名稱（與帳號名稱獨立）
- 公開個人頁面（可分享連結，展示等級、稱號、Heatmap 縮圖）

**AI 晨間報告**（Claude API 整合）
- Pro：Claude API 個人化文字分析（近 7 天 sessions、streak 狀態、建議焦點）
- 免費：固定格式今日任務摘要（現有行為）
- 實作方式：用戶在設定頁貼入自己的 Claude API key，不經過 Orbit 後端

---

## 五、照顧付不起的用戶

### Streak 解鎖 Pro（SUB-16）
- 連勝 60 天 → 自動獲得 30 天 Pro
- 連勝 120 天 → 再得 30 天 Pro（每次獨立計算，不累計）
- 通知：連勝達成動畫後顯示「你的努力解鎖了 Pro 30 天！」
- 邏輯：最努力的免費用戶是最值得培養的付費候選人

### 邀請制解鎖（SUB-17）
- 設定頁產生個人邀請連結（帶 referral code）
- 成功邀請 3 位新用戶完成 onboarding → 獲得 30 天 Pro
- 邀請者與被邀請者各得 15 天試用
- 需 Supabase 建立 `referrals` 表

### 降級設計原則
- 降級後不顯示恐嚇性警告，只顯示「以下功能在 Pro 中提供」
- 免費版永不過期，資料永不刪除

---

## 六、實作清單（SUB 系列）

依優先順序排列：

| ID | 功能 | 說明 | 狀態 |
|----|------|------|------|
| SUB-01 | Pro 狀態管理模組 | `profiles` 新增 `is_pro`、`pro_expires_at`、`trial_started_at`；`isProUser()` helper | 待做 |
| SUB-02 | 15 天免費試用流程 | 新用戶自動開啟試用；第 10 天 banner 提醒；到期自動降級 | 待做 |
| SUB-05 | 歷史深度限制 | 免費 30 天；Pro 無限；超出不刪、升級後即顯示 | 待做 |
| SUB-09 | Streak Shield | Pro 每月 2 張保護卡；`streak_shields` 欄位；補 `is_shield` session | 待做 |
| SUB-06 | 主題門控 | 免費前 5 種；Pro 全部 13 + 隨機；鎖定樣式 | 待做 |
| SUB-03 | Pro 升級頁面 | 設定頁現有佔位處實作完整升級 UI（方案對比 + CTA） | 待做 |
| SUB-04 | Pro 標誌 UI 元件 | `pro-badge` 元件；淡化 + ✦ 鎖定樣式；點擊滑出升級邀請卡 | 待做 |
| SUB-07 | 稱號系統調整 | 免費可手打；免費可看模板但不能點選；Pro 一鍵套用 | 待做 |
| SUB-10 | Habit Heatmap | 熱力圖；免費 90 天；Pro 全歷史；可分享截圖 | 待做 |
| SUB-11 | 進階數據儀表板 | 任務效率、最佳時段、Streak 預測 | 待做 |
| SUB-16 | Streak 解鎖 Pro | 連勝 60/120 天自動獲得 30 天 Pro | 待做 |
| SUB-12 | Focus Timer Pro | 自訂時長、音效、Session 備注 | 待做 |
| SUB-13 | 資料匯出 | 設定頁 CSV 匯出全部 sessions | 待做 |
| SUB-14 | 排行榜強化 | Pro 光環、自訂名稱、公開個人頁面 | 待做 |
| SUB-17 | 邀請制解鎖 | referral code + `referrals` 表 + 雙邊獎勵 | 待做 |
| SUB-15 | AI 晨間報告 | Claude API 整合；用戶自填 API key | 待做 |

---

## 七、後端 Schema 變更（實作時參考）

```sql
-- profiles 新增欄位（SUB-01）
ALTER TABLE profiles
  ADD COLUMN is_pro boolean DEFAULT false,
  ADD COLUMN pro_expires_at timestamptz,
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN streak_shields integer DEFAULT 0;

-- referrals 表（SUB-17）
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id),
  referred_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
-- 需補齊 SELECT/INSERT/UPDATE/DELETE policies
```

---

## 八、一句話策略總結

> 讓免費版像一個完整的遊戲，Pro 像同一個遊戲的 DLC：不買也能玩得很開心，但買了之後會說「早就該買了」。
