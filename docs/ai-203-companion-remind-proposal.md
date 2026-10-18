# AI-203 提案：Companion `remind` 的資料來源與頻率

> 狀態：**提案，等待使用者核准**（2026-10-18）。Mode A：只產出規格，不改程式碼。核准後建立實作任務 `AI-203B`，並把 §7 寫成它的驗收條件。

## 1. 結論

- 「使用者選定的目標」建議用**今日計畫**（`dailyPlan`）中的專注任務。這是現有資料裡唯一由使用者明確選擇的來源，Main Quest 也已經用它挑選行動目標。不新增資料欄位。
- `missedPatterns` 改由 view model 從 `dailyPlan`、`tasks` 與今日 Sessions 即時推導。不寫入任何 state。
- 頻率上限用條件限制，不用計數器：條件成立時才出現，使用者完成一次有效的專注，或把任務移出今日計畫，就自動結束。不需要持久化，selector 保持純函式。
- 另外有一個產品問題要先決定（§5）：Momentum 不會因為「沒來」而下降，所以 `remind` 只會出現在「有在用、但有效天數少」的使用者身上，不會出現在久未回來的使用者身上。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| 觸發條件 | `pwa/js/personalSpace/v2/companionEngine.js` `getCompanionReaction()` | Momentum 為 `low` 且 `hasSelectedGoal(missedPatterns)` 為真時，回傳 `remind`，台詞 key 是 `companion.goal.gentle-reminder` |
| 資料來源 | `pwa/js/personalSpace/v2/viewModels.js` `buildPersonalSpaceV2Snapshot()` | 傳入 `coreState.missedPatterns`，但沒有任何程式碼寫入這個欄位，所以 production 中 `remind` 永遠不會出現 |
| 優先順序 | `docs/personal-space-v2-vertical-slice.md` §7.2 | 第 6 條：「Low Momentum：`observe`；只有在存在使用者選定的目標時，才可以使用 bounded `remind`」 |
| 語氣 | product spec §3.2 原則 5、vertical slice §7.2 | 不可羞辱、威脅或情緒勒索；只能用核准的台詞 key |
| 「目標」資料 | `pwa/js/state.js` | 舊的 `goals` 已由 `tasks` 取代；Goals 頁實際上是完成紀錄。**沒有目標資料模型** |
| 今日計畫 | `storage.getDailyPlan()`、`v2/controller.js` | `dailyPlan` 是使用者加入今日計畫的 task id，每天重設，只存本機。V2 controller 已把它放進 `coreState.dailyPlan` |
| Main Quest | `viewModels.js` `selectMainQuestActionTarget()` | 先從 `dailyPlan` 找符合條件的專注任務，找不到才退回全部 tasks |
| Momentum | `pwa/js/personalSpace/v2/momentum.js` | 取**最近 7 個有 Session 的日期**（不是最近 7 個日曆天）計算有效天數：0–2 天 `low`、3–4 `stable`、5–6 `strong`、7 `peak` |
| 今日 Sessions | `buildPersonalSpaceV2Snapshot()` | `recentSessions` 只取 `date === effectiveDate` 的 Session，因此 `approach`／`rest` 只回應今天的完成 |

## 3. 「使用者選定的目標」從哪裡來

| 選項 | 說明 | 評估 |
|---|---|---|
| **A（建議）今日計畫** | `dailyPlan` 中 `impactType === 'task'` 的任務 | 使用者每天明確選擇；Main Quest 已在用；不需新欄位。限制：只存本機，換裝置不會帶過去 |
| B 新增「目標」欄位 | 在 V2 state 加 `companion.selectedGoalId`，並提供選擇 UI | 需要新 UI 與新 state 欄位（本機、不涉及 schema）；範圍大，而且與今日計畫重疊 |
| C 全部 tasks | 任何專注任務都算 | 拒絕。這不是「使用者選定」，違反 vertical slice §7.2 第 6 條 |

## 4. `missedPatterns` 的計算（選項 A）

在 `buildPersonalSpaceV2Snapshot()` 中推導，取代 `coreState.missedPatterns`：

```js
// 對 effectiveDate 當天：
missedPatterns = dailyPlan
  .map(id => tasks.find(task => task.id === id))
  .filter(task => task && task.impactType === 'task')          // 只算專注任務
  .filter(task => !todaySessions.some(session =>
    session.taskId === task.id && PRODUCTIVE_RESULTS.has(session.result)))
  .map(task => ({ goalId: task.id, selectedByUser: true, source: 'daily-plan' }));
```

- 已刪除的任務、恢復型與娛樂型任務不算。
- `PRODUCTIVE_RESULTS` 與 `companionEngine.js` 相同：`complete`、`partial`、`instant`。
- 形狀符合現有的 `hasSelectedGoal()`（`selectedByUser === true` 或有 `goalId`），`companionEngine.js` 不必改。

## 5. 先決定的產品問題：Momentum 不反映「沒來」

`deriveMomentum()` 取最近 7 個**有 Session 的日期**。連續 7 天有效、之後一個月沒開 app 的使用者，回來時仍是 `peak`，Companion 顯示 `work`。所以：

- `remind` 只會出現在「最近有在用、但有效天數 ≤ 2」的使用者身上；
- 最需要提醒的久未回來的使用者，反而永遠看不到 `remind`。

這可能是刻意的「不因缺席懲罰」設計（art bible 禁止任何暗示被拋棄或情緒懲罰的表現），也可能是疏漏。兩個選擇：

- **M1（建議，維持）**：不改 Momentum。`remind` 的對象是「有在用但卡住」的人，與不懲罰缺席的原則一致。
- **M2**：Momentum 改用日曆天視窗。影響 PS-236 已驗收的邊界測試、氛圍與 `work` 狀態，範圍遠大於 AI-203，需另立任務。

## 6. 頻率與冷卻

`remind` 是 Companion 的姿勢加一句台詞，不是推播。主要風險是「一直掛著，讓人覺得被盯」。

| 選項 | 做法 | 評估 |
|---|---|---|
| **F1（建議）條件式** | 只在 §4 的 `missedPatterns` 非空、Momentum 為 `low`、今天沒有任何有效的專注 Session 時出現。使用者完成一次有效專注，或把任務移出今日計畫，就結束 | 不需持久化，selector 保持純函式，可測試；上限來自使用者自己的行動 |
| F2 時段限制 | F1 再加上「本地時間 12:00 之後才出現」 | 早上剛排好計畫時不會立刻被提醒；代價是要注入時間，測試多一個維度 |
| F3 次數冷卻 | 記錄 `lastRemindedOn`，每天最多出現 N 次或 N 分鐘 | 需要在顯示時寫入 state，破壞「selector 不改 durable state」的規則（product spec §8.3），需新增 reducer 指令；不建議 |

「今天沒有任何有效的專注 Session」這一條必須明確檢查。優先順序第 3、4 條只看今天**最新**的一筆有效 Session：例如先完成一次專注、之後又記了一筆娛樂，第 4 條就不會命中。

## 7. 驗收條件草稿（AI-203B，核准後寫入 tasks.md）

- Momentum 為 `low`、今日計畫有尚未完成的專注任務、今天沒有有效 Session 時，Companion 為 `remind`，台詞 key 為 `companion.goal.gentle-reminder`。
- 下列任一情況不出現 `remind`：
  - 今日計畫為空，或只有恢復型、娛樂型任務；
  - 計畫中的任務已刪除；
  - 計畫中的每個專注任務今天都有有效 Session；
  - Momentum 不是 `low`。
- 完成一次有效專注後，下一次 render 不再是 `remind`。
- 不新增 state 欄位，也不寫入任何 state；`companionEngine.js` 的優先順序不變。
- 兩處台詞統一：同一個 key 在 `pwa/js/personalSpace/v2/ui/orbitWindow.js` 與 `pwa/js/pages/personalSpaceV2.js` 的文字不同，改成同一句（文字由使用者選）。
- telemetry 已列入 `remind`，不需改動。
- 只在選了 F2 時：12:00 前不出現，測試以注入的 `options.now` 驗證。

## 8. 需要使用者決定

1. **目標來源**：A 今日計畫（建議）／B 新增目標欄位。
2. **Momentum**：M1 維持（建議）／M2 另立任務改為日曆天。
3. **頻率**：F1 條件式（建議）／F2 加時段限制。
4. **台詞**：兩處現有文字擇一，或另寫一句：
   - 「你選擇的目標還在這裡，準備好時再開始。」
   - 「你選擇的目標仍在這裡，準備好時再回來就好。」
