# Orbit PWA — 測試計畫

> 建立日期：2026-04-16  
> 現況：207 個測試（unit only）  
> 目標：覆蓋所有業務邏輯 + 所有頁面渲染

---

## 一、已發現缺陷（實作前需修正）

### BUG-1：sessionStorage 缺少 `task_icon_img` 欄位（中優先）
- **位置：** `storage.js` `loadFromRemote()`
- **說明：** `app.js` 的 `completeInstant` / `_submitFocusResult` 建立 session 時存了 `taskIconImg`，但 `storage.js` 從 Supabase 載入時的 mapping 沒有對應此欄位。裝置同步後圖示會消失。
- **修法：** 在 `loadFromRemote` sessions mapping 加入 `taskIconImg: s.task_icon_img || null`（或直接移除 session 上的 taskIconImg，改由 taskId 查 task）

### BUG-2：`calcGrowthRate` 當 `avgWeekXP < 1` 回傳 null 但呼叫端不處理 undefined（低優先）
- **位置：** `leaderboard.js` line 15
- **說明：** `avgWeekXP < 1` 回傳 `null`，然後 line 80 `filter(r => r.growthRate !== null)` 正確過濾，沒有實際 bug，但 `null` 和正常值的語意應更明確。

---

## 二、測試計畫（共 5 個新測試檔案）

---

### 📁 tests/unit/engine-edge.test.js
**新增：** `engine.js` 現有測試補充邊界輸入
**目標測試數：** ~25

#### calcBaseXP
| # | 情境 | 預期 |
|---|------|------|
| 1 | task.difficulty = undefined → weight map miss | 回傳 0 |
| 2 | task.resistance = undefined | 回傳 0 |
| 3 | task.value = undefined | 回傳 0 |
| 4 | impactType = 'recovery'（非 task）| 回傳 0 |
| 5 | value = 'D' | 回傳 0 |

#### calcDailyStats
| # | 情境 | 預期 |
|---|------|------|
| 6 | sessions 為空陣列 | productiveXP=0, hasASTask=false, isEffectiveDay=false |
| 7 | session 缺少 `isProductiveXP` 欄位（undefined）| 不 crash，productiveXP=0 |
| 8 | session 缺少 `durationMinutes`（undefined）| entertainmentMinutes=0 |
| 9 | 同一天 A 任務 result='invalid'：hasASTask 應為 false | false |
| 10 | productiveXP=50 但 entertainmentMinutes=121 → 剛好超標 | isEffectiveDay=false |
| 11 | productiveXP=50, hasASTask=true, entertainmentMinutes=120 → 剛好達標 | isEffectiveDay=true |

#### calcStreakMultiplier
| # | 情境 | 預期 |
|---|------|------|
| 12 | streakDays = "10"（字串） | 不 crash，Math.floor 後等同 10 |
| 13 | streakDays = 30 → 乘數上限 1.12 | 1.12 |
| 14 | streakDays = 0 | 1.00 |
| 15 | streakDays = null | 1.00（|| 0 guard） |

#### calcEnergyGain
| # | 情境 | 預期 |
|---|------|------|
| 16 | durationMinutes = 14 → 低於最小門檻 | 0 |
| 17 | impactType = 'task' | 0 |
| 18 | entertainment + totalBefore = 61 → quality 打折 | 驗算: 14min short-form → baseRecovery=6, quality=0.4*0.7=0.28, round(6*0.28)=2 |

#### reorderTasks
| # | 情境 | 預期 |
|---|------|------|
| 19 | 空陣列 | 回傳 [] |
| 20 | 只有一個任務，fromId=toId | 回傳 [同一個] |

#### processStreakForDate
| # | 情境 | 預期 |
|---|------|------|
| 21 | streakDays = undefined, isEffectiveDay = true | 1（0+1） |
| 22 | streakDays = null, isEffectiveDay = false | 0 |

#### getDailyTaskXP / getDailyTaskCount
| # | 情境 | 預期 |
|---|------|------|
| 23 | 無任何 session | 0 |
| 24 | 有 session 但 taskId 不符 | 0 |
| 25 | isProductiveXP = false 的 session 不計入 XP | 不累加 |

---

### 📁 tests/unit/leaderboard.test.js
**新增：** `leaderboard.js` 純函數邏輯（需 export 或 re-test via module mock）
**目標測試數：** ~15

> 注意：`calcGrowthRate` 和 `isNewUser` 目前是模組內部函數，需先 export。

#### calcGrowthRate
| # | 情境 | 預期 |
|---|------|------|
| 1 | totalXP=0, weekXP=0 | null（avgWeekXP < 1） |
| 2 | 剛建立帳號（createdAt = 現在），totalXP=100, weekXP=100 | 100%（1 週 active） |
| 3 | totalXP=500, weekXP=100，活躍 10 週 | avgWeekXP=50, rate=200% |
| 4 | totalXP=1000, weekXP=0（這週沒做）| 0% |
| 5 | createdAt = 無效字串 | 不 crash（NaN guard） |
| 6 | weekXP > totalXP（資料異常）| 不 crash |

#### isNewUser
| # | 情境 | 預期 |
|---|------|------|
| 7 | createdAt = 13 天前 | true |
| 8 | createdAt = 14 天前 | false |
| 9 | createdAt = 今天 | true |
| 10 | createdAt = 無效字串 | 不 crash |

#### 排行榜整合（renderLeaderboard 需 mock supabase）
| # | 情境 | 預期 |
|---|------|------|
| 11 | supabase 回傳空陣列 | 顯示「本週尚無上榜玩家」或 empty state |
| 12 | 包含新用戶（< 14 天）→ 不出現在成長率排名 | filter 後不含 |
| 13 | tab 切換：week → growth → 回 week | 渲染正確 tab |
| 14 | supabase 回傳 error | 不 crash，顯示 fallback |
| 15 | 個人資料 isPublic=false → 不上榜 | 驗證 filter 邏輯 |

---

### 📁 tests/unit/review.test.js
**新增：** `review.js` 週視圖 + 月視圖渲染
**目標測試數：** ~25  
**環境：** jsdom（需加到 vitest.config.js environmentMatchGlobs）

#### 週視圖
| # | 情境 | 預期 |
|---|------|------|
| 1 | 無任何 session | 本週成長XP=0、有效天數=0、顯示空資料提示 |
| 2 | 有一個 A 任務 session（今日）→ 本週成長XP 正確 | finalXP 加總 |
| 3 | hasASTask + XP≥50 + 娛樂≤120m → 有效日 +1 | effectiveDays=1 |
| 4 | 娛樂 = 121m → 不是有效日 | isEffectiveDay=false |
| 5 | 任務價值分佈：只有 B 任務 → distHtml 100% B | 驗證 DOM |
| 6 | 最常完成任務：出現在列表 | 驗證 .top-task-row |
| 7 | 無效次數計算正確 | 驗證 .time-dist-val |
| 8 | 待校準任務：confidence < 80 → 出現在校準列表 | 驗證 .calibrate-row |
| 9 | 所有任務可信 → 顯示「所有任務標籤可信 ✓」 | 驗證 DOM |

#### 月視圖
| # | 情境 | 預期 |
|---|------|------|
| 10 | 當月無 session → 月成長 XP=0 | 驗證 .review-stat-val |
| 11 | 跨月導航：上月按鈕 → monthLabel 改變 | 驗證 .month-nav-label |
| 12 | 當月或未來月：「›」按鈕 disabled | disabled attribute |
| 13 | 過去月：「›」按鈕 enabled | not disabled |
| 14 | 月曆格：月份第一天星期對齊正確（leading empties） | 驗證 .cal-cell-empty 數量 |
| 15 | 有效日格子有 cal-dot-effective 樣式 | 驗證 CSS class |
| 16 | 未來日期格子有 cal-dot-future 樣式 | 驗證 CSS class |
| 17 | 今日格子有 cal-cell-today 樣式 | 驗證 CSS class |
| 18 | 最長連勝計算：4 天有效 + 1 天中斷 + 3 天有效 → bestStreak=4 | 驗證 .review-stat-val |
| 19 | 本月最常完成任務顯示 | 驗證 .top-task-row |

#### Toggle
| # | 情境 | 預期 |
|---|------|------|
| 20 | 預設顯示週視圖 | section-title 含「週回顧」 |
| 21 | 點擊「月視圖」按鈕 → 切換 | section-title 含「月視圖」 |
| 22 | 切換回「週視圖」→ 顯示週視圖 | section-title 含「週回顧」 |

---

### 📁 tests/unit/goals.test.js
**新增：** `goals.js` 紀錄頁面渲染
**目標測試數：** ~12  
**環境：** jsdom

| # | 情境 | 預期 |
|---|------|------|
| 1 | 無任何 session → 顯示 empty state | .empty-state 存在 |
| 2 | 有一筆 session → 顯示 session 資料 | taskName 在 DOM 中 |
| 3 | session 按日期分組：兩筆不同日 → 兩個 date-group | .date-group 數量 = 2 |
| 4 | 同一日多筆 → 同一個 date-group | .date-group 數量 = 1 |
| 5 | session.result='instant' → 顯示「✓」icon | 驗證 DOM |
| 6 | session.result='invalid' → 顯示「❌」+ 0 XP | 驗證 DOM |
| 7 | session.finalXP=0, energyGain=10 → 顯示「+10 ⚡」 | 驗證 .log-xp |
| 8 | session.finalXP=0, energyGain=0, result='instant' → 顯示「」（空）| 驗證 .log-xp |
| 9 | session.durationMinutes=30 → 顯示「· 30m」| 驗證 DOM |
| 10 | session.durationMinutes=0 → 不顯示分鐘數 | 驗證 DOM |
| 11 | 日期標頭顯示每日 XP 合計 | 驗證 .date-group-xp |
| 12 | taskName 含 XSS 字元（`<script>`）→ escHtml 正確轉義 | 不含 raw < > |

---

### 📁 tests/unit/storage.test.js
**新增：** `storage.js` 資料遷移函數
**目標測試數：** ~12  
**環境：** node（localStorage 用 vitest 的 jsdom 或手動 mock）

#### migrateV1toV2
| # | 情境 | 預期 |
|---|------|------|
| 1 | 已有 tasks（v2）→ 不執行遷移 | tasks 不被覆蓋 |
| 2 | 無 goals / logs → tasks=[], sessions=[] | 空陣列 |
| 3 | 有 goals 無 logs → tasks 正確建立，sessions=[] | 驗證欄位 |
| 4 | goals + logs 配對：session.taskId = goal.id | 驗證 taskId |
| 5 | 重複執行（idempotence）→ 第二次不改變資料 | 驗證 |
| 6 | goal 缺少 emoji → 預設 '🎯' | 驗證 session.taskEmoji |

#### migrateDefaultFlags
| # | 情境 | 預期 |
|---|------|------|
| 7 | tasks 為 null → 不 crash | 無拋出 |
| 8 | 含預設任務名稱 → isDefault=true | 驗證 flag |
| 9 | 含自訂任務名稱 → isDefault 不被設定 | 保持 undefined |
| 10 | 已有 isDefault=false → 不被覆蓋 | 保持 false |

#### getDailyPlan / saveDailyPlan
| # | 情境 | 預期 |
|---|------|------|
| 11 | date 不是今天 → 回傳 [] | 舊計畫不殘留 |
| 12 | 沒有任何資料 → 回傳 [] | 不 crash |

---

## 三、不納入自動測試的項目（說明原因）

| 功能 | 無法自動測試的原因 | 替代驗證 |
|------|----------------|---------|
| Auth 流程（登入/登出/Google）| 需真實 Supabase 連線 | E2E（待建立 test project） |
| Focus Timer 狀態機 | 依賴 setInterval + DOM 互動 | 手動測試 checklist |
| Onboarding Tour | requestAnimationFrame + DOM 位置 | 手動測試 |
| 換頁動畫 | CSS animation，無法在 jsdom 驗證 | 手動測試 |
| 拖曳排序（home.js）| Pointer Events 在 jsdom 中不完整 | reorderTasks 純函數已測 |
| 晨間 modal | 複雜 DOM 互動 + 時間依賴 | 手動測試 |
| Supabase 雲端同步 | 需真實 DB | Integration test（待） |

---

## 四、實作順序

```
Phase 1（純函數邊界，無 DOM）
  ├── engine-edge.test.js       ~25 tests
  ├── storage.test.js           ~12 tests
  └── leaderboard exports       export calcGrowthRate / isNewUser

Phase 2（需 jsdom）
  ├── leaderboard.test.js       ~15 tests
  ├── review.test.js            ~22 tests
  └── goals.test.js             ~12 tests

Phase 3（Bug fix）
  └── BUG-1: storage.js taskIconImg 修正
```

**預計新增測試數：** ~86  
**完成後總計：** 207 + 86 = ~293 個測試

---

## 五、vitest.config.js 需要新增的 environmentMatchGlobs

```js
['tests/unit/leaderboard.test.js', 'jsdom'],
['tests/unit/review.test.js',      'jsdom'],
['tests/unit/goals.test.js',       'jsdom'],
```
