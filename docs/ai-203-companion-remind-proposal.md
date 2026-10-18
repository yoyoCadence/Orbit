# AI-203 提案：Companion `remind` 的資料來源與頻率

> 狀態：**提案，等待使用者核准**（2026-10-18，依獨立 review 改寫）。Mode A：只產出規格，不改程式碼。核准後建立實作任務 `AI-203B`，並把 §8 寫成它的驗收條件。

## 1. 結論

- **目標來源**：今日計畫（`dailyPlan`）中，符合 Main Quest 資格的任務，也就是 `isMainQuestTaskEligible()`：專注類、A／S 級、未封存或停用。
  - 這是現有資料裡唯一由使用者每天明確選擇的來源。
  - 新手導覽的教學任務（instant、B 級）與 instant／恢復型任務不算。
  - 不新增資料欄位。
- **`missedPatterns` 由 view model 即時推導**，`companionEngine.js` 不改。
- **保護條件**，避免出現得太早或太頻繁：
  - 歷史不足時不提醒：有 Session 的日期少於 3 天，就不出現 `remind`（§5）；
  - 今天已完成一次合格的專注就結束；
  - 日曆日與 effective date 不同時（00:00 到 `newDayHour`）不提醒（§4.2）；
  - **每天只在固定時段提醒**（§7.1 F4）：只在本地時間 12:00–14:00（可調）之間出現，時段結束時自動回到 `observe`。不寫入任何 state。
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
| 呈現 | `ui/orbitWindow.js`、`pages/personalSpaceV2.js`、`runtime/pixiSceneRuntime.js`、`pwa/assets/style.css` | 首頁小卡與完整頁面共用同一份快照；vertical slice 要求兩者一致。首頁 COMPANION 卡會一直顯示台詞。Pixi 場景載入後，`remind` 的靠近動作只播一次（約 0.9 秒）；只有 Pixi 未載入時的靜態 fallback，CSS 動畫會無限循環 |

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
// now：resolveEffectiveDate() 使用的同一個時間（options.now，未提供時為 Date.now()）
// effectiveDate：快照的 effective date；calendarDate = localDateString(now)
// coreState.dailyPlan：與首頁今日計畫清單相同的資料（記憶體中的 state.dailyPlan）
const planIds = calendarDate === effectiveDate ? coreState.dailyPlan : [];
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

今日計畫存成 `{ date, taskIds }`，`date` 是**日曆日**；Sessions 與快照則用 `newDayHour` 切日。在 00:00 到 `newDayHour` 之間，兩者不同，而且今日計畫本身的日期就不可靠：

- 首頁清單用 `storage.getDailyPlan()`，日曆日一換就回傳空陣列。這時 effective date 還是昨天，如果改讀原始紀錄，Companion 會提醒一份首頁顯示為空的計畫，使用者也無法從清單移除任務來結束提醒。
- `saveDailyPlan()` 每次儲存都把**整份**計畫蓋上當下的日曆日。若 app 開著跨過午夜，記憶體中仍是昨天的計畫；這時新增、移除或拖曳排序任何一項，整份昨天的計畫都會變成今天的。`dayCycle.js` 的重設只在 app 開著、跨過 `newDayHour` 時執行。

所以本任務不嘗試修正日期，只做兩件事：

1. **只用首頁顯示的計畫**：`coreState.dailyPlan`，也就是記憶體中的 `state.dailyPlan`。首頁新增、移除、拖曳任務後會更新它並重新 render，所以提醒內容與使用者看到的清單一致。
   - 在 00:00 到 `newDayHour` 之間，記憶體中的計畫仍是昨天的，直到 `dayCycle.js` 換日重設。下一點的限制剛好涵蓋這段時間。
2. **00:00 到 `newDayHour` 之間不提醒**：日曆日不等於 effective date 時，`planIds` 為空。
   - 兩個日期必須用**同一個 `now`** 計算：`calendarDate = localDateString(now)`，`now` 與 `resolveEffectiveDate()` 相同（`options.now`）。不可呼叫讀取真實時鐘的 `utils.today()`，否則快照不再是純函式，測試結果會依機器時間而變。
   - 若呼叫端直接傳入 `effectiveDate`，也要傳入 `now`；沒有傳入時以 `Date.now()` 計算 `calendarDate`。

另一項要求：從清單移除任務後，下一次建立快照時提醒就要結束。測試應直接固定快照的輸入（`coreState.dailyPlan`），而不是依賴 controller 何時重新讀取 storage。

今日計畫的日期模型本身（午夜後儲存會把舊計畫改成新日期、與 effective date 不一致）影響 Main Quest 與首頁，vertical slice §7.1 已要求對齊。建議另立任務，不放在 AI-203B。

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
| F1 只用條件 | 只在 §4 的 `missedPatterns` 非空且 Momentum 為 `low` 時出現。今天完成一次合格的專注，或把任務移出今日計畫，就結束 | 不需持久化，可測試；上限來自使用者自己的行動 |
| F2 只限開始時間 | F1 再加上「本地時間 12:00 之後才出現」 | 只延後開始，沒有結束：使用者不理會時仍會掛到當天結束 |
| **F4（建議）每日固定時段** | F1 的條件之外，只在本地時間 `[12:00, 14:00)` 之間出現（時段可調）。時段結束就回到 `observe`，當天不再出現 | 真正的上限（每天最多 2 小時），而且**不寫入任何 state**。判斷只依注入的 `now`，selector 保持純函式，可測試。代價：使用者若只在時段外打開 app，就看不到提醒 |
| F3 每日一段（不建議） | 第一次顯示時記錄 `companion.remindWindow = { date, firstShownAtMs }`，之後 30 分鐘內出現 | 對使用者最精準，但實作成本高，見下方 |

F4 的細節：

- 時段用與 `calendarDate` 相同的 `now` 計算。00:00 到 `newDayHour` 的限制（§4.2）照舊。
- **時段邊界的重新 render**：快照只在 render 時重建，`dayCycle.js` 的換日監看也不會每分鐘重繪 Companion。所以首頁小卡與完整頁面要：
  - 在時段開始前掛載時，排一個計時器在時段開始時 refresh；
  - 顯示 `remind` 時，排一個計時器在時段結束時 refresh；
  - 監聽 `visibilitychange`，頁面重新可見時重新判斷，因為裝置休眠會讓計時器延後；
  - unmount 時取消計時器與監聽。首頁可沿用 `mountOrbitWindow()` 回傳的 cleanup。
- `newDayHour` 在 12 以後時（資料庫允許 0–23，設定頁只提供 0–8），時段落在 00:00 到 `newDayHour` 的限制內，當天不會提醒。
- 兩頁用同一個時段，所以會一起結束；重新掛載不會延長。

F3 為什麼不建議：獨立 review 確認，要讓「第一次顯示後 30 分鐘」安全成立，還需要：

- 首頁小卡的寫入路徑：首頁目前只有 `reconcileAndSavePersonalSpaceV2()`（不帶 `expectedRevision`），需要新的 controller 函式來讀取、套用、以 revision 儲存，並通知首頁重繪；
- `persist()` 必須回傳錯誤類型：它目前對所有錯誤都 reconcile 並 render。若不區分 revision 衝突與儲存錯誤，儲存失敗時會「render → 寫入 → 失敗 → render」無限循環；
- 「第一次顯示」要定義成文件可見、而且小卡在畫面內。否則背景分頁或捲到畫面外的 render 就會用掉當天的額度；
- `firstShownAtMs` 要存成 epoch 毫秒並驗證，格式錯誤的同日紀錄要可以修復，寫入失敗要 fail closed；
- 每次 revision 遞增會多送一次 `orbit-window-viewed` telemetry。

對一句 Companion 台詞來說，這些成本遠高於 F4。若你仍偏好 F3，上述各點要全部寫進 AI-203B 的驗收條件。

### 7.2 首頁小卡上的呈現

同一份快照同時驅動首頁小卡與完整頁面，vertical slice 要求兩者一致，所以不建議只在其中一處隱藏 `remind`。

- 動畫：Pixi 場景載入後，`remind` 的靠近動作只播一次（約 0.9 秒）。只有 Pixi 未載入時的靜態 fallback，CSS 會讓 `remind`（與 `approach` 共用）無限循環。
- 文字：首頁 COMPANION 卡會一直顯示台詞，直到條件結束。這是「被盯」感的主要來源，F1 的結束條件就是為此設計。

選項：

- **D2（建議）**：靜態 fallback 的 `remind` 動畫改為只播一次，與 Pixi 一致（只改 CSS）。
- D1：維持現狀。

## 8. 驗收條件草稿（AI-203B，核准後寫入 tasks.md）

名詞：「已推進」指今天有一筆 Session 屬於符合 Main Quest 資格的任務，且 `result` 為 `complete`、`partial` 或 `instant`，不限時長。這比 Main Quest 的完成條件（`complete` 且至少 25 分鐘）寬鬆：只要開始做，提醒就結束。

- 以下全部成立時，Companion 為 `remind`，台詞 key 為 `companion.goal.gentle-reminder`：
  - 沒有更高優先的反應：沒有待播放的 reveal；今天最新的一筆 Session 不是有效的恢復（`rest`），也不是有效的一般任務（`approach`）；
  - Momentum 為 `low`，且 `observedDays ≥ 3`（選 G1 時）；
  - 日曆日等於 effective date；
  - 首頁的今日計畫中有符合 Main Quest 資格的任務；
  - 今天還沒有「已推進」的 Session；
  - 選 F4 時：注入的 `now` 在當天的提醒時段內。
- 下列任一情況不出現 `remind`：
  - 今日計畫為空，或只有不合格的任務（instant、恢復、娛樂、B 級以下、封存或停用、已刪除）；
  - 今日計畫只有 `tour-task`；
  - 00:00 到 `newDayHour` 之間；
  - 今天已有「已推進」的 Session，即使之後又記了別的 Session；
  - 有 Session 的日期少於 3 天（選 G1 時）；
  - Momentum 不是 `low`；
  - 選 F4 時：在提醒時段之外。
- 選 F4 時：
  - 時段開始前與結束後都不是 `remind`，用注入的 `now` 測試，與機器時間無關；
  - 頁面開著不動時，時段結束後會自動 refresh 並離開 `remind`（用假計時器測試）；unmount 時取消計時器；
  - 不新增任何 state 寫入；首頁每次 render 既有的 `reconcileAndSavePersonalSpaceV2()` 儲存不受影響；
  - 時段開始前掛載、頁面一直開著時，時段開始後會自動 refresh 並出現 `remind`；頁面從背景回到前景時會重新判斷。
- 從 `coreState.dailyPlan` 移除最後一個合格任務後，重新建立的快照不再是 `remind`。
- 注入的 `now` 在 00:00 到 `newDayHour` 之間時不出現 `remind`，與執行測試的機器時間無關。
- 首頁小卡與完整頁面的 Companion **狀態與台詞 key** 一致（台詞文字的統一另立任務，見 §9 第 6 點）；選 D2 時，靜態 fallback 的 `remind` 動畫不循環。
- 不新增 state 欄位、不寫入 state（選 F3 時例外，見 §7.1）；`companionEngine.js` 的優先順序不變。

## 9. 需要使用者決定

1. **目標來源**：A 今日計畫（建議）／B 新增目標欄位。
2. **歷史不足**：G1 少於 3 天不提醒（建議）／G0 不保護。
3. **Momentum**：M1 維持（建議）／M2 另立任務改為日曆天。
4. **頻率**：F4 每日固定時段（建議，預設 12:00–14:00，可調）／F3 第一次顯示後 30 分鐘（實作成本高，見 §7.1）／F1 只用條件（使用者不理會時會整天掛著）／F2 只限開始時間。
5. **靜態 fallback 的動畫**：D2 只播一次，與 Pixi 一致（建議）／D1 維持循環。
6. **台詞**：`companion.goal.gentle-reminder` 在兩個檔案的文字不同，擇一或另寫：
   - 「你選擇的目標還在這裡，準備好時再開始。」（`ui/orbitWindow.js`）
   - 「你選擇的目標仍在這裡，準備好時再回來就好。」（`pages/personalSpaceV2.js`）

   其實 8 個 Companion 台詞 key 在這兩個檔案的文字**全部**不同。建議另立一個小任務統一成一份文案表，不放在 AI-203B 裡。
7. **另立任務**：今日計畫的日期模型與 effective date 對齊（§4.2，影響 Main Quest 與首頁）。建議建立，但不放在 AI-203B。
