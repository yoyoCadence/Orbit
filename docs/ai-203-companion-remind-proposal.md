# AI-203 提案：Companion `remind` 的資料來源與頻率

> 狀態：**提案，等待使用者核准**（2026-10-18，依獨立 review 改寫）。Mode A：只產出規格，不改程式碼。核准後建立實作任務 `AI-203B`，並把 §8 寫成它的驗收條件。

## 1. 結論

- **目標來源**：今日計畫（`dailyPlan`）中，符合 Main Quest 資格的任務，也就是 `isMainQuestTaskEligible()`：專注類、A／S 級、未封存或停用。
  - 這是現有資料裡唯一由使用者每天明確選擇的來源。
  - 新手導覽的教學任務（instant、B 級）與 instant／恢復型任務不算。
  - 不新增資料欄位。
- **`missedPatterns` 由 view model 即時推導**，不寫入任何 state，`companionEngine.js` 不改。
- **三個保護條件**，避免出現得太早或太頻繁：
  - 歷史不足時不提醒：有 Session 的日期少於 3 天，就不出現 `remind`（§5）；
  - 今天已完成一次合格的專注就結束；
  - 計畫日期與 effective date 不一致時不使用該計畫（§4.2）。
- **需要使用者決定**的產品問題見 §9：
  - Momentum 不看日曆天；
  - 首頁小卡上的呈現方式；
  - 頻率與台詞。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| 觸發條件 | `pwa/js/personalSpace/v2/companionEngine.js` `getCompanionReaction()` | Momentum 為 `low` 且 `hasSelectedGoal(missedPatterns)` 為真時回傳 `remind`（台詞 key `companion.goal.gentle-reminder`） |
| 資料來源 | `pwa/js/personalSpace/v2/viewModels.js` `buildPersonalSpaceV2Snapshot()` | 傳入 `coreState.missedPatterns`，但 `pwa/js` 中沒有任何寫入點，所以 production 中 `remind` 永遠不會出現 |
| 規格 | `docs/personal-space-v2-vertical-slice.md` §7.2 第 6 條 | Low Momentum 時用 `observe`；只有存在使用者選定的目標時，才可以用 bounded `remind` |
| 語氣 | product spec §3.2 原則 5、vertical slice §7.2 | 不可羞辱、威脅或情緒勒索；只能用核准的台詞 key |
| 「目標」資料 | `pwa/js/state.js`、`pages/goals.js` | `goals` 已由 `tasks` 取代；Goals 頁實際上是完成紀錄。**沒有目標資料模型** |
| 今日計畫 | `storage.getDailyPlan()`、`v2/controller.js` | 存成 `{ date, taskIds }`，`date` 是**日曆日**（`utils.today()`），只存本機。V2 controller 把 `taskIds` 放進 `coreState.dailyPlan` |
| Main Quest | `viewModels.js` `selectMainQuestActionTarget()`、`isMainQuestTaskEligible()` | 先從 `dailyPlan` 找符合資格的任務，找不到才退回全部 tasks。資格：`impactType 'task'`、`category 'focus'`、A／S 級、未封存或停用 |
| 教學任務 | `pwa/js/tour.js` | `tour-task` 是 `category 'instant'`、B 級，導覽中會加入今日計畫；不符合 Main Quest 資格 |
| Momentum | `pwa/js/personalSpace/v2/momentum.js` | 取**最近 7 個有 Session 的日期**計算有效天數：0–2 `low`、3–4 `stable`、5–6 `strong`、7 `peak`。**沒有任何 Session 的新使用者是 `low`** |
| Effective date | `viewModels.js` `resolveEffectiveDate()` | Sessions 與快照用 `newDayHour`（預設 5 點）切日；今日計畫用日曆日。vertical slice §7.1 已指出兩者必須對齊 |
| 優先順序 | `companionEngine.js` | 第 3、4 條只看今天**最新**的一筆非 `invalid` Session |
| 呈現 | `ui/orbitWindow.js`、`pages/personalSpaceV2.js`、`pwa/assets/style.css` | 首頁小卡與完整頁面共用同一份快照；vertical slice 要求兩者一致。首頁 COMPANION 卡會一直顯示台詞，`remind` 動畫是無限循環 |

## 3. 「使用者選定的目標」從哪裡來

| 選項 | 說明 | 評估 |
|---|---|---|
| **A（建議）今日計畫** | `dailyPlan` 中符合 `isMainQuestTaskEligible()` 的任務 | 使用者每天明確選擇；與 Main Quest 用同一條資格規則；不需新欄位。限制：只存本機，換裝置不會帶過去；日期需對齊（§4.2） |
| B 新增「目標」欄位 | 在 V2 state 加 `companion.selectedGoalId`，並提供選擇 UI | 需要新 UI 與新的本機 state 欄位；範圍大，而且與今日計畫重疊 |
| C 全部 tasks | 任何專注任務都算 | 拒絕。這不是「使用者選定」，違反 vertical slice §7.2 第 6 條 |

## 4. 計算方式（選項 A）

### 4.1 推導

在 `buildPersonalSpaceV2Snapshot()` 中推導，取代 `coreState.missedPatterns`：

```js
// effectiveDate：快照的 effective date
// planRecord：storage 原始的 { date, taskIds }（需新增讀取原始紀錄的方法，見 4.2）
const planIds = planRecord?.date === effectiveDate ? planRecord.taskIds : [];
// 不可重用 recentSessions：它只保留 7 筆
const todaySessions = sessions.filter(s => s?.date === effectiveDate);
const workedOnGoalToday = todaySessions.some(s =>
  PRODUCTIVE_RESULTS.has(s.result) && isMainQuestTaskEligible(taskById.get(s.taskId)));

missedPatterns = (workedOnGoalToday || momentum.observedDays < 3) ? [] : planIds
  .map(entry => (entry && typeof entry === 'object') ? entry : taskById.get(entry))
  .filter(isMainQuestTaskEligible)
  .map(task => ({ goalId: task.id, selectedByUser: true, source: 'daily-plan' }));
```

- `PRODUCTIVE_RESULTS` 與 `companionEngine.js` 相同：`complete`、`partial`、`instant`。
- 計畫項目同時接受 id 與物件，與 `selectMainQuestActionTarget()` 一致（production 只存 id）。
- 已刪除、封存或停用的任務，以及 instant、恢復、娛樂、教學任務都不算。
- 回傳的形狀符合現有的 `hasSelectedGoal()`，所以 `companionEngine.js` 不必改。

### 4.2 日期對齊

`storage.getDailyPlan()` 只比對日曆日。若直接使用，會有兩個問題：

- 00:00 到 `newDayHour` 之間重新載入，計畫會變空（effective date 還是昨天，但日曆日已換）。這是安全的方向：不提醒。
- 00:00 到 `newDayHour` 之間建立的計畫，記在新的日曆日。若 app 在換日時沒開著，`dayCycle.js` 的重設不會發生，到了早上這份計畫會被當成當天的計畫。

做法：讀取原始的 `{ date, taskIds }`，只有在 `date === effectiveDate` 時才使用。上面第二種情況，計畫是凌晨為「新的一天」排的，早上使用它符合使用者的意圖。這屬於本任務能處理的範圍。把今日計畫整體改成以 effective date 為準（vertical slice §7.1）影響 Main Quest，另立任務。

## 5. 歷史不足時不提醒

沒有 Session 的新使用者，Momentum 是 `low`。若沒有保護，新使用者一把 A／S 專注任務加入今日計畫，Companion 就會立刻提醒。這在使用者剛排好計畫時出現，等於催促。

- **G1（建議）**：`momentum.observedDays < 3` 時不提醒。「有效天數偏低」至少要有 3 個有 Session 的日期才有意義，與 `stable` 的門檻一致。
- G0：不加保護。新使用者也會看到提醒。

## 6. Momentum 不看日曆天

`deriveMomentum()` 取最近 7 個**有 Session 的日期**，不是最近 7 個日曆天。所以 `remind`（以及 `low` 的氣氛）取決於「最近 7 個有用的日子裡有幾天有效」，與中間隔了多久無關：

- 最近有在用、但有效天數 ≤ 2 的使用者：會看到。
- 久未回來、離開前也偏弱的使用者：回來時**也會**看到。
- 久未回來、但離開前很穩定的使用者：回來時是 `strong`／`peak`，Companion 顯示 `work`，看不到提醒。

art bible 要求 Companion 的表情與肢體不暗示憤怒、被拋棄，或因沒完成的工作而受到情緒懲罰。「不因缺席降級」與這個方向一致，但 Momentum 的定義本身是 PS-236 的設計，不在本任務範圍。兩個選擇：

- **M1（建議，維持）**：不改 Momentum。
- **M2**：改用日曆天視窗。這會影響 PS-236 已驗收的邊界測試、氛圍與 `work` 狀態，範圍遠大於 AI-203，需另立任務。

## 7. 頻率與呈現

### 7.1 頻率

| 選項 | 做法 | 評估 |
|---|---|---|
| **F1（建議）條件式** | 只在 §4 的 `missedPatterns` 非空且 Momentum 為 `low` 時出現。今天完成一次合格的專注，或把任務移出今日計畫，就結束 | 不需持久化，可測試；上限來自使用者自己的行動 |
| F2 時段限制 | F1 再加上「本地時間 12:00 之後才出現」 | 早上剛排好計畫時不會立刻被提醒；要注入時間（`options.now` 已存在） |
| F3 次數冷卻 | 記錄 `lastRemindedOn`，每天最多出現 N 次 | 要新增持久化欄位，以及「已顯示提醒」的 reducer 指令（product spec §8.3 允許 reducer 改 durable state）。範圍較大，第一版不建議 |

### 7.2 首頁小卡上的呈現

同一份快照同時驅動首頁小卡與完整頁面，vertical slice 要求兩者一致，所以不建議只在其中一處隱藏 `remind`。但首頁是開 app 的第一個畫面：COMPANION 卡一直顯示台詞，而 `remind` 動畫是無限循環，正是 §7.1 要避免的「被盯」感。

- **D2（建議）**：狀態與台詞兩處一致，但首頁小卡上的 `remind` 動畫只播一次，然後停在靜止姿勢（只改 CSS）。
- D1：維持現狀，兩處都無限循環。

## 8. 驗收條件草稿（AI-203B，核准後寫入 tasks.md）

- 以下全部成立時，Companion 為 `remind`，台詞 key 為 `companion.goal.gentle-reminder`：
  - Momentum 為 `low`，且 `observedDays ≥ 3`（選 G1 時）；
  - 今日計畫的日期等於 effective date，其中有符合 Main Quest 資格、而且今天還沒完成的任務；
  - 今天沒有合格專注任務的有效 Session。
- 下列任一情況不出現 `remind`：
  - 今日計畫為空，或只有不合格的任務（instant、恢復、娛樂、教學、B 級以下、封存或停用、已刪除）；
  - 計畫日期與 effective date 不同（包含 00:00 到 `newDayHour`）；
  - 今天已有一筆合格專注任務的有效 Session，即使之後又記了別的 Session；
  - 有 Session 的日期少於 3 天（選 G1 時）；
  - Momentum 不是 `low`。
- 新手導覽期間不出現 `remind`。
- 首頁小卡與完整頁面的 Companion 狀態與台詞一致；選 D2 時，首頁小卡的 `remind` 動畫不循環。
- 不新增 state 欄位、不寫入 state；`companionEngine.js` 的優先順序不變。
- 只在選 F2 時：本地 12:00 前不出現，用 `options.now` 測試。

## 9. 需要使用者決定

1. **目標來源**：A 今日計畫（建議）／B 新增目標欄位。
2. **歷史不足**：G1 少於 3 天不提醒（建議）／G0 不保護。
3. **Momentum**：M1 維持（建議）／M2 另立任務改為日曆天。
4. **頻率**：F1 條件式（建議）／F2 加時段限制。
5. **首頁呈現**：D2 動畫只播一次（建議）／D1 維持循環。
6. **台詞**：`companion.goal.gentle-reminder` 在兩個檔案的文字不同，擇一或另寫：
   - 「你選擇的目標還在這裡，準備好時再開始。」（`ui/orbitWindow.js`）
   - 「你選擇的目標仍在這裡，準備好時再回來就好。」（`pages/personalSpaceV2.js`）

   其實 8 個 Companion 台詞 key 在這兩個檔案的文字**全部**不同。建議另立一個小任務統一成一份文案表，不放在 AI-203B 裡。
