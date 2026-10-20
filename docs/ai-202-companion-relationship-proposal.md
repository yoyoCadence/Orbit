# AI-202 提案：Companion 關係階段與 hidden stats 的最小映射規則

> 狀態：提案（Mode A，只有文件）。核准前不改程式碼。核准後由 `AI-202B` 實作；§8 是它的驗收條件草稿，§9 是需要使用者決定的事。

## 1. 結論

- **關係階段只由「Main Quest 天數」推進**：完成每日主線任務的不同日期數。這是現有資料中最接近「真實行為品質」、又無法刷的訊號：每天最多一天，需要 A／S 級、完成、至少 25 分鐘。
  - 第 4 天：`familiar`（熟悉夥伴）。這就是現在的 Workspace Upgrade 完成，**不改**。
  - 第 12 天：`partner`（合作夥伴）。
  - 第 30 天：`trusted-companion`（信賴夥伴）。
  - 這兩個 milestone 由 active ledger 推導，**不寫成新的 ledger entry**，否則仍在執行舊版程式碼的分頁會把它撤銷（§3.3）。
  - 門檻可調（§9 第 1 點）。
- **hidden stats 不決定階段**。它們每次 Session 都會加、沒有每日上限，連 instant Session 也算，所以很容易刷（§4）。它們回答的是「做了什麼樣的事」，階段回答的是「一起走了多久、多穩」。AI-202B 只把 hidden stats 的顯示改成中文名稱；「夥伴注意到你哪一面」另立任務（§5）。
- **不因缺席降級**。階段只在 Main Quest 日被撤銷、數量跌破門檻時退回；沒有時間衰減（§6）。
- **階段變化的 reveal 由「前後的階段」決定**，不看哪些 ledger entry 被加入或撤銷（§3.4）：
  - 只有階段提升是 `major`；
  - 退回不是 `major`，也不恭喜；
  - 只是換一天承接、階段沒變時，沒有任何關係的 reveal。
- **讓階段看得見**（§7）：
  - 首頁 COMPANION 卡顯示階段；
  - 階段提升時顯示「夥伴關係：合作夥伴」，取代現在的 `companion +1`；
  - 預設台詞依階段不同。
- **ledger 與 `rulesetId` 都不變**。新增兩個本機欄位（V2 state 不同步、不涉及資料庫），需核准（§3.2）：
  - `companion.legacyRelationshipPoints`，讓舊版分頁寫入的過時點數無法汙染計算；
  - `companion.relationshipPolicyId`，替「由 ledger 推導的規則」另外標版本。
- **要修改三處規格**（需核准，§3.3）：
  - vertical slice §6.1「改規則要換 `rulesetId`」與 §13.1 對應的測試要求，改為只適用於 ledger entry；推導出的規則另用 policy id；
  - §7.2「透過 ledger entry 推進」改為「由 active ledger 推導」。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| 階段 | `v2/controller.js` `PERSONAL_SPACE_V2_RELATIONSHIP_STAGES`；`v2/viewModels.js` `RELATIONSHIP_STAGES`；`pages/personalSpaceV2.js` `RELATIONSHIP_LABELS` | 四個有順序的階段：`stranger-observer` → `familiar` → `partner` → `trusted-companion`（陌生觀察者／熟悉夥伴／合作夥伴／信賴夥伴）。同一份清單複製在三個檔案 |
| 計算 | `controller.js` `relationshipPointsForState()`、`relationshipStageForPoints()`、`applyReconciliationToV2State()` | 點數＝（遷移時的基準）＋ ledger 中所有 `relationship` entry 的總和；階段＝`floor(點數)`，限制在 0–3 |
| 唯一來源 | `v2/rewardRules.js` `getProjectCompletionRewardSpecs()` | Workspace Upgrade 完成（第 4 個 Main Quest 日）給 `relationship:companion +1`。**只有這一個來源**，所以階段最多到 `familiar`，`partner` 與 `trusted-companion` 永遠到不了 |
| 退回 | `v2/reconciler.js` | 撤銷第 4 天的 Session 時，milestone 改由下一個 Main Quest 日承接；沒有就退回。沒有時間衰減 |
| Companion 行為 | `v2/companionEngine.js` `getCompanionReaction()` | 收到 `relationshipStage` 與 `hiddenStats`，但**完全不使用**；`relationshipDelta` 永遠是 0。階段對狀態、台詞、動畫都沒有影響 |
| 顯示 | `pages/personalSpaceV2.js` 詳細面板 | 只有完整頁面的 Companion 詳細面板寫「夥伴關係 · 熟悉夥伴」。首頁卡片、Pixi 場景都不顯示 |
| 階段提升的 reveal | `controller.js` `revealKind()`；`ui/orbitWindow.js` `buildRewardLines()`；`personalSpaceV2.js` `rewardLine()` | 只要含 `relationship` reward，不論加入或撤銷，reveal 都是 `major`。首頁的 `major` 沒有標題時顯示「WORLD MILESTONE／世界里程碑已解鎖」。文字：首頁 `companion +1`、完整頁面「夥伴關係 +1」 |
| reward 行 | `orbitWindow.js` `buildRewardLines()`；`personalSpaceV2.js` `rewardLine()` | 首頁每一種 reward 都顯示原始 key：`daily-main-quest +100`、`main-focus:<date> +1`、`workspace-upgrade +25`、`formal-workstation +1`、`companion +1`、`depth +1`。完整頁面有中文名稱表，但 hidden stats 顯示 ledger key（`depth.ordinary +1`） |
| hidden stats | `rewardRules.js` `mapSessionToHiddenStat()` | 6 項：`discipline`、`depth`、`vitality`、`order`、`courage`、`craft`。每筆有效且 productive 的 Session（或至少 30 分鐘的恢復）依優先順序給一項 +1 或 +2；Main Quest 改給 `depth +3`。**總數沒有上限、沒有每日上限、沒有門檻** |
| hidden stats 顯示 | `orbitWindow.js`、`personalSpaceV2.js` | 沒有任何畫面顯示總數，只在 reward 行出現 |
| Telemetry | `v2/telemetry.js` | `companion_interacted` 只有 `companionState`、`interactionKey`、`renderMode`，沒有階段或 hidden stats |
| 規格 | vertical slice §6.1、§7.2、§8.3、§13.1、§14；product spec §3.2、§8.1、§8.3；art bible §10 | 改規則要換 `rulesetId`（§6.1、§13.1）；關係「透過 ledger entry」推進（§7.2）；全畫面的 `major` 只用於專案完成、房間／章節解鎖與**關係階段提升**（§8.3）；hidden stats 與關係必須能從 active ledger 推導（§14）；不可因錯過而羞辱或懲罰；LLM 不得決定關係 |
| 既有問題（BUG-113） | `v2/revealSelectors.js`、`controller.js` `revealKind()` | 「專案完成」與 `major` 的判斷不看 reward 是加入還是撤銷，也不看專案原本是否已完成。已重現：<br>– 專案完成後，每個 Main Quest 日的 reveal 都讓 Companion 再說「工作站完成了」（進度 ≥ 100 且含 `project_progress`）；<br>– 撤銷任何一天，甚至撤銷完成那一天，Companion 也恭喜；<br>– 撤銷第 4 天、由第 5 天承接時，兩個 reveal 都是 `major` 並恭喜 |

README 的「關係進化草案」列了 5 個不同的階段（陌生觀察／陪跑提醒／理性教練／理解型夥伴／高階顧問）。程式碼與 vertical slice 用的是上面 4 個。本提案沿用程式碼的 4 個，並建議 README 註明以 vertical slice 為準（§9 第 7 點）。

## 3. 階段推進規則

### 3.1 為什麼用 Main Quest 天數

| 候選訊號 | 可否刷 | 跨裝置一致 | 評估 |
|---|---|---|---|
| **Main Quest 天數（建議）** | 否：每個 effective date 最多一天，需 A／S、`complete`、≥ 25 分鐘 | 是：只用同步的 Session 欄位 | 代表「持續的深度投入」。第 4 天已經是現有的 `familiar` 門檻，規則一致 |
| hidden stats 總和 | 是：每筆有效且 productive 的 Session 都加，instant（`durationMinutes: 0`）也算；同一個任務每天最多 3 次，但任務數量不限 | 是 | 違反 product spec「真實行為優先於刷」 |
| 有任何有效 Session 的天數 | 部分：一天一次，但一筆 instant 就算 | 是 | 門檻太低，與「品質」無關 |
| 有效天（`isEffectiveDay`） | 否 | 是，但當天的判斷會隨之後的 Session 翻轉（娛樂超過 120 分鐘） | milestone 的錨點不穩定 |
| Streak | 否 | **否**：`streakDays` 是可變的 profile 欄位，會被重設，與 Pro 保護卡相關 | 無法 deterministic replay；也會讓錯過一天變成關係懲罰 |
| 點擊、聊天、互動次數 | 是 | 否：telemetry 不是 reward 來源 | 違反任務目標本身（「不是聊天次數」）與 vertical slice §11（telemetry 不能當 reward 的依據） |

### 3.2 推導方式

- 「Main Quest 日」＝ active ledger 中 `quest_progress` entry 的**不同** `main-focus:<date>` key 數。這已經是 reconciler 每天只選一個 winner 的結果；以 key 計數，重複的 entry 也不會多算。非 authoritative 的部分快照會保留被省略的 Session 的 entry（`reconciler.js` 的 `preservedOmittedSourceIds`），所以 reconcile 結果的 `activeRewards` 已經是完整的計數來源。
- **milestone 不寫進 ledger，而是在 `applyReconciliationToV2State()` 由 active ledger 推導**（理由見 §3.3）：
  - `derivedMilestones` ＝ Main Quest 日數 ≥ 12 時 1，≥ 30 時再加 1；
  - 點數 ＝ `max(legacy 點數, ledger 中 relationship entry 的總和 ＋ derivedMilestones)`。ledger 中的 relationship 只有現有的專案完成 1 點。
  - 階段仍由 `relationshipStageForPoints()` 決定，不改：4 天 1 點 → `familiar`；12 天 2 點 → `partner`；30 天 3 點 → `trusted-companion`。
- legacy 點數是**下限，不是加分**：
  - 遷移時 legacy 的關係階段只「seed 一次」，而且「遷移不給關係進度」（technical design §7.2）。目前程式碼把它當成基準再加上 ledger，所以 legacy 為 `quiet-familiarity`（1 點）的使用者完成專案就到 `partner`。若沿用加法，這類使用者會在第 4 天到 `partner`、第 12 天到 `trusted-companion`，門檻不再固定（Codex review 指出）。
  - 改為下限後：一開始就是 `familiar`；第 4 天仍是 `familiar`；第 12、30 天才到 `partner`、`trusted-companion`，與其他使用者相同。
  - 實際上：legacy 程式從未寫過關係階段（`gameState.js` 只有預設值 `stranger-observer`），`quiet-familiarity` 只出現在測試 fixture 中，所以現有使用者的 legacy 點數都是 0。這條規則是為了讓所有情況都有定義。
- `companion.legacyRelationshipPoints`：**新的本機欄位**（V2 state 只存在本機、不同步；不涉及資料庫）。
  - 新版第一次 reconcile、欄位還不存在時寫入一次：`max(0, 已儲存的點數 − 已儲存 ledger（reconcile 之前）中 relationship 的總和)`。這就是現在程式碼每次推算的「遷移基準」，也就是 legacy 點數。此時還沒有任何程式寫過推導出的 milestone，所以算出來的就是真正的 legacy 點數。
  - 欄位存在但不是有限的非負數時，視為 0，不從已儲存的點數重新推算。
  - 之後新版**不再從已儲存的點數反推**，每次都從欄位與 ledger 重新計算。
  - 理由：舊版分頁會把它不認得的點數當成基準保留（§3.3）。如果舊版分頁撤銷了一個 Session，讓 Main Quest 日數跌破門檻，反推的值會多 1，而且永遠修不回來。存下來的值不受舊版分頁影響。
  - 舊版的 `normalizePersonalSpaceV2State()` 與 `applyReconciliationToV2State()` 都會保留 `companion` 中不認得的欄位（`...rawCompanion`、`...state.companion`），所以舊版分頁不會刪掉它。
- `companion.relationshipPolicyId`：**新的本機欄位**，記錄算出目前點數的規則版本，例如 `RELATIONSHIP_POLICY_ID = 'ai202-main-quest-days-v1'`。
  - 每次 reconcile 寫入目前的 policy id。
  - 用途是標示規則版本（§3.3），以及讓之後改規則時可以辨認「這份 state 是哪一版算的」。
  - reveal **不需要**依 policy id 特別處理：「之前的階段」一律以**目前的規則**從舊 ledger 計算（§3.4），所以規則改變造成的補進度（例如歷史上已有 25 天，第一次以新規則計算就到 `partner`）已經包含在「之前」之中，不會被當成本次的變化；本次 ledger 的變化跨過門檻時（例如第一次 reconcile 就是記錄第 12 天），仍照常排入 reveal。
- 階段的 reveal 規則見 §3.4。
- `companionEngine` 仍不能改變關係（product spec §8.3、vertical slice §7.2）；它只讀取階段來挑選台詞（§7）。

### 3.3 與舊版分頁並存、ruleset 與既有資料

同一個瀏覽器的多個分頁共用 `localStorage` 中的 V2 state。舊版程式碼會在兩種情況下讀寫新版的 state：

- 更新時，`sw.js` 的 `skipWaiting`／`clients.claim` 只讓已開啟的分頁顯示「重新整理」橫幅（`index.html`）。使用者按下之前，該分頁仍執行舊版程式碼並繼續 reconcile。
- 部署後的第一次載入：`sw.js` 對 JS 是 stale-while-revalidate，所以先執行快取中的舊版 JS。

所以新規則必須讓**舊版程式碼看到新版寫入的 state 時不會改壞它**。

| 方式 | 舊版分頁的反應 | 評估 |
|---|---|---|
| K1 沿用 `rulesetId`，新增 milestone ledger entry（本提案第一版） | 舊版 reconciler 遇到同一 ruleset、來源 Session 還在、但它不預期的 entry 會**撤銷它**（`reconciler.js` 的比對迴圈）；新版再把它恢復。階段來回跳動，還會重複出現階段提升的 reveal | 拒絕（Codex review 指出） |
| K2 換新 `rulesetId`，新增 ledger entry | 舊版保留新 ruleset 的 entry、繼續替自己的 ruleset 給獎勵；在舊版分頁記錄的 Session 會兩個 ruleset 各給一次 hidden stats，並被新版當成基準永久保留。而且以現有的程式碼換 `rulesetId`，`activeCurrentRulesetEntries()` 會濾掉舊 entry，「遷移基準」包含了舊 ledger，hidden stats 與關係都會重複計算（Gold 不會：`earnedGold` 只看目前 ruleset 的總和）。要另寫遷移與明確的基準 | 範圍大，不建議 |
| **K4（建議）不新增 ledger entry，由 active ledger 推導 milestone ＋ 存下 legacy 點數** | 舊版把新版多出的點數當成「遷移基準」保留（已儲存的點數 − 它的 ledger 總和 ＋ 它的 ledger 總和），所以階段不變。只有舊版分頁撤銷的 Session 跨過門檻時會暫時不準，新版下一次 reconcile 會從存下的 legacy 點數與 ledger 重新計算 | 舊版不會撤銷或重複任何東西；ledger 規則與 `rulesetId` 都不變 |

以目前 main 的 `reconcileRewardLedger()` ＋ `applyReconciliationToV2State()` 模擬舊版分頁驗證過（13 個 Main Quest 日）：

- K1：加入一筆錨定在第 12 天的 `relationship:companion:partner` entry 後，舊版把它撤銷（`reversedAt` 被設定），階段由 `partner` 掉回 `familiar`。
- K4：把點數設為 2（`partner`）、加上 `legacyRelationshipPoints: 0` 後，舊版在 authoritative、部分快照、新增第 14 天三種情況下都維持 `partner`，ledger 不變，欄位被保留。
- 舊版分頁撤銷第 12、13 天時，它仍顯示 `partner`（過時）；新版下一次 reconcile 由存下的 legacy 點數與 ledger 重新算回 `familiar`。這就是需要存下 legacy 點數的原因。

K4 的其他影響：

- **與規格的衝突（需核准修改，§9 第 3 點）**：K4 改變了既有 ruleset `ps-v2-workspace-v1` 下關係的推導方式。vertical slice §6.1（「Changing a rule requires a new `rulesetId`」）與 §13.1（「Changed rules require a new ruleset id rather than mutating history」）因此需要改寫；本提案已說明換 `rulesetId` 不安全。建議的新文字：
  - `rulesetId` 標示 **ledger entry** 的版本：Session 得到哪些 reward、amount 與 metadata。改這些仍要換 `rulesetId`。
  - 只由 active ledger 推導、不寫入 ledger 的規則（例如本提案的關係 milestone）以各自的 policy id 標示版本，並寫入 state。改這類規則：
    - 不得新增、撤銷或修改任何 ledger entry；
    - 上一版程式讀到新 state 時不得改壞它；
    - 要在 `docs/personal-space-state-flow.md` 記錄新舊公式。
  - §7.2「透過 ledger entry 推進」改為「由 active ledger 推導」。符合 §14「hidden stats 與關係必須能從 active ledger entry 推導」。
- 推導出的階段變化是推導的 state，不是 ledger reward。product spec §8.1「每個 reward 都可追溯到來源 Session」不適用於它；它可追溯到「第 N 個 Main Quest 日」。
- 沒有 ledger id 衝突、`metadata.tier` 或部分快照保留 milestone entry 的問題。
- 階段提升的 reveal 行會放在第 N 天那筆 Session 的 reveal 裡，該 reveal 含 `project_progress:workspace-upgrade`，所以仍依賴 BUG-113：不先修，Companion 會被判斷成「專案完成」。
- 歷史：
  - **R1（建議）**：epoch（2026-07-17）以後的 Main Quest 日都算。已經有 12 或 30 天的使用者，第一次以新規則計算時直接到對應階段，不補播 reveal（「之前的階段」以新規則計算，§3.2）；只有本次記錄的 Session 跨過門檻時才有 reveal。
  - R2：只算新版上線之後的 Main Quest 日。需要第二個 epoch 常數；已累積的歷史不算，對長期使用者不公平；好處是不會一次跳兩階。

### 3.4 階段變化的 reveal 與 Companion 反應

判斷依據是 state 的**前後**，不是 reveal 中哪些 ledger entry 被加入或撤銷：

- 「之前的階段」用新規則從**舊的已儲存 ledger** 計算，不讀已儲存的點數。舊版分頁可能寫入過時的點數，但它寫入的 ledger 反映的是真實的 Session 變化。
- 「專案是否完成」也比較前後（`activeProject.completed`）。這是 BUG-113 的修正方向。

| 情況 | reveal | Companion |
|---|---|---|
| **階段提升**，同時完成專案（第 4 天） | `major`；reveal 行加上「夥伴關係：熟悉夥伴」 | `congratulate`，**沿用已核准的**專案完成台詞 `companion.project.workspace-upgrade.complete` |
| **階段提升**，沒有完成專案（第 12、30 天） | `major`，標題「夥伴關係：合作夥伴」（首頁不再顯示預設的「世界里程碑已解鎖」）；reveal 行「夥伴關係：合作夥伴」 | `congratulate`，新台詞 `companion.relationship.stage-up` |
| 專案完成但階段沒變（legacy 下限已是 `familiar`） | 與現在相同 | 專案完成台詞 |
| **階段退回**（撤銷後跌破門檻） | **不是** `major`，類別由其他 reward 決定；reveal 行「夥伴關係：熟悉夥伴」，不寫「−1」或「降級」 | `observe`＋**目前階段的 `observe` 台詞**（例如 `companion.observe.familiar`），優先於進度與 Session 分支（見下方優先順序）；主角不做慶祝動作 |
| 其他撤銷（沒有跨過門檻） | 類別由其他 reward 決定 | 同上：`observe`＋目前階段的 `observe` 台詞，不恭喜、不 `approach` |
| **換一天承接**（撤銷後由下一個 Main Quest 日補上，階段與專案狀態都沒變） | 沒有關係或解鎖的 reveal 行，不是 `major` | 不恭喜 |
| 歷史上的補進度（第一次以新規則計算時，舊 ledger 依新規則就已是該階段）、`queueReveal: false`、或由舊版分頁寫入 | 不排入階段的 reveal | — |

Companion 的優先順序（有待播放的 reveal 時；取代 `companionEngine.js` 目前的第 1、2 條）：

1. 專案由未完成變為完成 → `congratulate`＋專案完成台詞（第 4 天）。
2. 階段提升 → `congratulate`＋`companion.relationship.stage-up`。
3. **撤銷的 reveal**（階段退回，或只含被撤銷的 reward）→ `observe`＋目前階段的 `observe` 台詞（選 S2 時是 `companion.observe`），並在此結束，不再往下判斷。必須排在第 4、5 條之前：
   - 現在的 `isQuestOrProjectProgressReveal()` 不看方向，撤銷的 reveal 含被撤銷的 `project_progress`，會變成 `approach`＋「工作空間改變了，下一個有用的步驟已經看得見」（撤銷第 12 天時專案仍是 100%，這句是錯的）；
   - 就算 selector 忽略撤銷，當天若還有其他有效 Session，「最新 Session」分支也會先命中，在撤銷的當下說「這次行動在空間裡留下了痕跡」。
4. **加入的**任務或專案進度 → `approach`＋進度台詞。
5. 之後沿用現有的分支（最新的恢復或一般 Session、Momentum）。

這改變了 vertical slice §7.2 的 Companion 優先順序，列入 §9 第 3 點的規格修改。主角在 reversal reveal 時不做慶祝動作。

其他規則：

- 解鎖與關係的 reward 行都由**前後狀態**產生，不直接由 entry 產生：
  - 解鎖由未解鎖變為解鎖（第 4 天）時，顯示解鎖行（例如「解鎖：正式工作站」，名稱來自共用的名稱表），它仍是 vertical slice §4.3 的 Major reward；
  - 前後都已解鎖（換一天承接）時不顯示；
  - 關係行同理（上表）。
- 套用以上規則後沒有任何 reward 行、也沒有階段資訊的 reveal，不排入。例如撤銷第 4 天、由第 5 天承接時，第 5 天的 reveal 只剩搬過去的解鎖與關係 entry。
- 同一次 reconcile 產生多個 reveal 時，階段資訊放在 `main-focus` entry 有變化（加入或撤銷）的那個 Session 的 reveal。例如剛好 12 天時撤銷第 2 天，會產生第 2、4、5 天三個 reveal：階段退回放在第 2 天的 reversal reveal；第 4、5 天只是換一天承接，沒有行而不排入。

- `relationship` 與 `world_unlock` entry 不再直接產生 reward 行；關係行只來自前後比較。
- 階段資訊記在 reveal 上（例如 `reveal.relationshipStage = { from, to }`）。
  - 待播放的 reveal 中**最多保留一段淨的階段變化**：`from` 是最早一段尚未播放的階段資訊的 `from`，`to` 是目前階段，放在最新一個帶階段資訊的 reveal 上，其餘 reveal 的階段資訊移除；`from` 與 `to` 相同時全部移除。現在的 `revealMatchesActiveLedger()` 只檢查該 Session 自己的 entry，會留下過時的階段資訊，兩個方向都會發生：
    - 第 12 天的提升尚未播放時撤銷較早的一天，目前已回到 `familiar`，不能再顯示「合作夥伴」；
    - 退回 `familiar` 尚未播放時又新增一個 Main Quest 日回到 `partner`，不能再顯示「夥伴關係：熟悉夥伴」與退回的反應（Codex review 指出）。
  - 搬移或移除階段資訊後，**重新計算**受影響 reveal 由階段衍生的呈現欄位：`kind`（是否仍為 `major`）、`title`（「夥伴關係：…」）與關係行，依 §3.4 的規則由剩下的內容決定；剩下沒有任何行的 reveal 不排入（或移出佇列）。現在的佇列會把 `kind`／`title` 獨立存下來，`renderOrbitWindow()` 直接使用，只刪掉階段資訊會留下「WORLD MILESTONE」或舊的關係標題（Codex review 指出）。
  - 舊版的 `normalizeRevealQueue()` 會保留 reveal 上不認得的欄位，舊版分頁只是不顯示它。
- 時間軸上沒有被提示的階段變化（舊版分頁、開啟時的 reconcile）只會在卡片標籤上看到。這是可接受的：同一個 Session 不會恭喜兩次。

## 4. hidden stats 不決定階段

- **刷**：每筆有效且 productive 的 Session 都給一項，instant（`durationMinutes: 0`）也算。同一個任務每天最多 3 次，但任務可以任意新增，所以總數沒有上限。
- **偏向**：Main Quest 每天給 `depth +3`、Main Quest 的 Session 不再給一般的 stat，所以專注型使用者幾乎只有 `depth`。若用「至少 3 種 stat 都有點數」當門檻，最認真的專注使用者反而卡關。
- **語意**：README 的定位是「補充人格維度」，回答「什麼樣的人」，不是「多親近」。

所以本提案的映射是：**階段＝一起走了多久（Main Quest 天數）；hidden stats＝走的方式（Session 的種類）**。兩者互不換算。

## 5. hidden stats 的最小表達

選項：

- **H1（建議）只改顯示名稱**：
  - reward 行與「最近的世界變化」顯示中文名稱，取代 `depth +1`、`depth.ordinary +1` 與 `depth.daily-main-quest +3`：紀律、深度、活力、秩序、勇氣、技藝（名稱見 §9 第 5 點）。
  - 首頁目前**每一種** reward 都顯示原始 key（§2）。首頁與完整頁面改為共用同一份名稱表，涵蓋所有 reward 類型（金幣、主線任務、工作空間進度、解鎖、hidden stats），放在既有模組中，不新增需要加入 `sw.js` SHELL 的檔案。否則第 12 天的首頁 reveal 會中英混雜。
  - 不顯示總數，維持「hidden」。
- H2：H1 ＋ 完整頁面 Companion 詳細面板加一行「最近常見：深度、秩序」。
  - 取最近 7 個 effective date 的一般 hidden stat entry，只算 `ordinary` tier，排除 Main Quest 固定的 `depth +3`，取前兩名，不顯示數字。
  - 需要新的 view model 推導與 1 行版面。
- H3：讓 hidden stats 影響 Companion 的台詞（例如依最近最多的面向挑 `observe` 台詞）。
  - 需要 6 句新台詞與 telemetry key，建議等 H1 上線後另立任務（候選 `AI-205`）。

## 6. 不因缺席降級

固定規則，不是選項：

- 階段不會因為沒有使用、錯過 Main Quest、Streak 中斷或 Momentum 變低而下降。
- 唯一會下降的情況，是 Main Quest 日被撤銷或刪除，使數量跌破門檻。第 4 天的專案完成仍是 ledger entry，沿用現有規則：由下一個 Main Quest 日承接，沒有才退回（vertical slice §6.4、§7.2）。product spec §8.1 也要求每個 reward 都可以隨來源撤銷。
- 依據：
  - product spec §3.2 原則 3、4、5（長期進度不因錯過一天被破壞；恢復是策略；不羞辱或威脅）；
  - art bible §10「不可暗示因缺席而被拋棄或懲罰」；
  - AI-203 提案「不因缺席降級」。

## 7. 讓階段看得見

現在階段只出現在完整頁面的詳細面板裡，對使用者幾乎不存在。

選項：

- **S1（建議）**：
  1. 首頁 COMPANION 卡的標籤顯示階段，例如 `COMPANION · 熟悉夥伴`，與完整頁面共用同一個名稱表。`stranger-observer` 也顯示，讓使用者知道關係會改變。
     - 實測（Chromium）：`COMPANION · 陌生觀察者` 寬 111 px。兩欄版面最窄時（341 px 寬）標籤只有 112 px 可用，只剩 1 px。標籤目前沒有 `nowrap`，太長會換行而不是被截斷。
     - 所以驗收條件是「4 個階段在各寬度都是單行，且留有餘裕」；放不下時縮短文字（例如只顯示階段名稱）或調整字距，由 AI-202B 量測後決定。
  2. 階段變化的 reveal 行與 Companion 反應依 §3.4。
  3. 依階段改變**最常看到的兩句預設台詞**。Companion 的預設台詞取決於 Momentum（`companionEngine.js`）：
     - `stable` 且今天沒有 Session、沒有 reveal 時是 `companion.observe`；
     - `strong`／`peak` 時是 `work` 狀態的 `companion.momentum.strong`；
     - 已到 `partner` 以上的使用者通常是 `strong`／`peak`，所以只改 `observe` 幾乎看不到。
     - 兩句各依 3 個階段（`familiar`、`partner`、`trusted-companion`）增加一句；`stranger-observer` 沿用現有台詞。共 6 句，加上階段提升 1 句。
  4. 新台詞都放進 `companionDialogue.js`，並同步加入 telemetry 的 `COMPANION_DIALOGUE_INTERACTION_KEYS` 與 `companionEngine`（AI-204B 的既有流程）：
     - `ai204CompanionDialogue.test.js` 的 `APPROVED` 表要更新；
     - engine 中的 key 要寫成字面字串，那個測試以 regex 比對。
- S2：只做 1 與 2（標籤與 reveal），只新增階段提升的 1 句台詞。
- S3：維持現狀，只修推進規則。

不在本任務範圍：Pixi 場景中 Companion 的位置或姿態隨階段變化。art bible 要求「逐漸改變存在感與熟悉度」，但需要新素材，與 PS-248 一起評估。

台詞候選（S1；語氣遵守 vertical slice §7.2：描述觀察到的事，不羞辱、不施壓、不空泛稱讚）：

| key | 候選 |
|---|---|
| `companion.observe`（陌生觀察者，沿用） | 我會在這裡看著你的空間慢慢成形。 |
| `companion.observe.familiar` | 我開始熟悉你的節奏了。 |
| `companion.observe.partner` | 這個空間是我們一天一天累積起來的。 |
| `companion.observe.trusted-companion` | 你的節奏我很熟悉了，需要時我都在。 |
| `companion.momentum.strong`（陌生觀察者，沿用） | 你最近的節奏很穩，我會繼續陪你前進。 |
| `companion.momentum.strong.familiar` | 這幾天的節奏很穩，我跟得上你。 |
| `companion.momentum.strong.partner` | 我們的步調越來越一致了，繼續一起前進。 |
| `companion.momentum.strong.trusted-companion` | 這份穩定是你一天天建立的，我一直都在。 |
| `companion.relationship.stage-up` | 我們一起走過的日子，又多了一些。 |

## 8. 驗收條件草稿（AI-202B，核准後寫入 tasks.md）

前提：BUG-113 已修正（或併入本任務，§9 第 9 點）。

推進：

- 11 個 Main Quest 日 → `familiar`；第 12 個 → `partner`；第 30 個 → `trusted-companion`。用 controller 層級的測試，Session 只用同步的欄位。
- 同一天多筆 Main Quest 候選只算一天；100 筆 instant 或一般 Session 不改變階段（hidden stats 會增加）。
- 只有恢復、沒有 Main Quest 的日子不推進。
- 沒有任何時間輸入：同一組 Sessions 在任何「今天」reconcile 的結果相同；長時間沒有 Session 不會降級。

reveal 與 Companion（§3.4）：

- 第 4 天：`congratulate`＋專案完成台詞；reveal 行含由前後狀態產生的解鎖行（「解鎖：正式工作站」）與「夥伴關係：熟悉夥伴」。legacy 下限已是 `familiar` 的 fixture：同樣是專案完成台詞與解鎖行，沒有關係行。
- 第 12 天：`major`，**首頁與完整頁面**的標題與 reveal 行都是「夥伴關係：合作夥伴」（完整頁面的 `localizePageModel()` 目前一律覆寫標題，要改）；`congratulate`＋`companion.relationship.stage-up`；首頁不顯示「世界里程碑已解鎖」。
- 撤銷第 12 天：
  - 有第 13 天時：沒有關係行，不是 `major`，不恭喜；
  - 沒有時：退回 `familiar`，reveal 行「夥伴關係：熟悉夥伴」，不是 `major`；Companion 是 `observe`＋`companion.observe.familiar`，**不是** `congratulate`，也**不是** `approach`／進度台詞；主角不慶祝。
  - 同上，但當天還有另一筆有效的一般 Session：Companion 仍是 `observe`＋`companion.observe.familiar`（撤銷的 reveal 優先於「最新 Session」分支）。
- 專案完成後撤銷第 6 天（沒有跨過門檻），當天另有一筆有效的一般 Session：Companion 是 `observe`＋目前階段的 `observe` 台詞，不是 `congratulate`，也不是 `approach`。
- 剛好 12 天時撤銷第 2 天：只有第 2 天的 reversal reveal 帶階段退回；第 4、5 天換一天承接的 reveal 沒有行，不排入。
- 撤銷第 4 天而第 5 天存在（專案完成改由第 5 天承接）：佇列中**只有第 4 天的撤銷 reveal**（含它自己被撤銷的金幣、進度等行），不是 `major`，Companion 是 `observe`，沒有關係或解鎖的行；第 5 天的 reveal 只剩搬過去的解鎖與關係 entry，沒有任何行，不排入。
- 已排入的第 12 天 reveal 尚未顯示時撤銷較早的一天、階段跌回 `familiar`：該 reveal 不再顯示「合作夥伴」，`kind` 不再是 `major`，首頁不顯示「WORLD MILESTONE」或「夥伴關係：合作夥伴」的標題。
- 退回 `familiar` 的 reveal 尚未顯示時又新增一個 Main Quest 日、回到 `partner`：沒有任何階段的行或反應（淨變化為零）。
- 連續兩次提升都尚未顯示（例如補記多天）：只顯示一段「夥伴關係：<目前階段>」。
- 非 authoritative 的部分快照（省略較早的 Session）：Main Quest 日數由保留的 entry 計入，階段不變；重複套用時 state 逐位元相同（與既有的 replay 測試相同）。

與舊版程式碼並存、規則版本與既有資料（K4、R1）：

- `RULESET_ID` 不變；ledger 中沒有新的 `rewardType`、`rewardKey` 或 entry。固定的 fixture 在改版前後 ledger 完全相同。
- `companion.legacyRelationshipPoints`：
  - 只在欄位不存在時寫入一次，以 reconcile 之前的已儲存 ledger 計算；
  - 之後即使已儲存的點數被改成別的值（模擬舊版分頁寫入），點數仍由欄位與 ledger 重新計算；
  - 欄位無效時視為 0。
- legacy 階段為 `quiet-familiarity` 的遷移 fixture：一開始是 `familiar`；第 4 天仍是 `familiar`；第 12 天 `partner`；第 30 天 `trusted-companion`。
- **舊版相容**：AI-202B 會修改 `applyReconciliationToV2State()`，所以測試保留一份改版前的關係算法（`已儲存的點數 − 舊 ledger 的 relationship ＋ 新 ledger 的 relationship`）作為 fixture；reconciler 沒有改，直接用目前的版本。以此處理新版寫入的 state：
  - 不撤銷、不新增任何 ledger entry；
  - 階段不變；
  - `companion.legacyRelationshipPoints` 與 `companion.relationshipPolicyId` 被保留。
- 「之前的階段」由舊的已儲存 ledger 計算：已儲存的點數被改成過時的值時，`queueReveal: true` 的 reconcile 不會因此排入階段變化的 reveal。
- `relationshipPolicyId` 不存在的 state（第一次以新規則計算）：
  - 已有 30 個 Main Quest 日，開啟時（`queueReveal: false`）直接到 `trusted-companion`，不排入 reveal；
  - 已有 30 個 Main Quest 日，第一次 reconcile 就是記錄第 31 天（`queueReveal: true`）：不排入階段的 reveal（之前依新規則已是 `trusted-companion`）；
  - 已有 11 個 Main Quest 日，第一次 reconcile 就是記錄第 12 天：排入階段提升的 reveal（`familiar` → `partner`）；
  - 已有 29 個 Main Quest 日，第一次 reconcile 就是記錄第 30 天：排入階段提升的 reveal（`partner` → `trusted-companion`）。
- 已儲存的 hidden stats、Gold 不變。
- `viewModels.js` 的 `resolveRelationshipStage()` 只讀 state 中的階段，移除「基準 ＋ aggregate」的 fallback（它會重複計算並忽略推導的 milestone）。

顯示（S1）：

- 首頁卡片與完整頁面顯示同一個階段名稱；名稱表只有一份，階段清單只有一份。
- 首頁卡片的階段標籤：4 個階段在 341、360、390、414、1024 px 與 200% 縮放下都是單行，且至少留 4 px。延伸 AI-204B 的 e2e，量測標籤（目前只量 `span:last-child`），並 seed 4 個階段。
- `companion.observe` 與 `companion.momentum.strong` 依階段改變；首頁與完整頁面相同。
- reward 行（H1）：首頁與完整頁面共用一份名稱表，涵蓋所有 reward 類型；兩個頁面都不再出現 `depth.ordinary`、`depth.daily-main-quest`、`main-focus:`、`workspace-upgrade`、`formal-workstation`、`companion +1` 等原始 key。
- 新台詞 key 在 `companionDialogue.js`、telemetry allowlist、`companionEngine` 三處同步，`APPROVED` 表更新（既有測試）。

文件：

- vertical slice：
  - §4.3 的 key 改為程式碼實際使用的值：`relationship:companion=1`、`gold:daily-main-quest=100`、`hidden_stat:depth.daily-main-quest=3`；
  - §5.1 的 state 欄位加上 `companion.legacyRelationshipPoints` 與 `companion.relationshipPolicyId`；
  - §6.1、§13.1 改為 §3.3 建議的文字；
  - §7.2 的階段推進改寫為「由 active ledger 推導」與本提案的門檻；Companion 優先順序改為 §3.4 的 5 條（加上階段提升；撤銷的 reveal 一律 `observe` 並結束判斷）。
- `docs/personal-space-state-flow.md` 的關係公式改為 `max(legacy 點數, ledger 中的 relationship ＋ 推導的 milestone)`，並記錄 policy id。

## 9. 需要使用者決定

1. **門檻**：
   - N1 第 4／12／30 個 Main Quest 日（建議）。每天都做約 1 個月到信賴夥伴；每週 3 天約 10 週。
   - N2 4／8／16（較快）。
   - N3 4／20／60（較慢）。
2. **輸入**：只算 Main Quest 日（建議）。恢復不會推進關係，也不會讓關係退步。
   - 曾考慮「Main Quest 日 ＋ 至少 30 分鐘的恢復日」，但與 K4 的點數算法不相容：`familiar` 仍綁在專案完成（4 個 Main Quest 日），恢復日卻能先湊滿 12 天，造成還沒完成專案就先顯示 `familiar`（推導的 1 點），完成時才到 `partner`。要採用，必須改成關卡式（`partner` 需要先 `familiar`），所以不建議。
3. **機制、規則版本與既有歷史**（§3.2、§3.3）：
   - K4（建議）：由 active ledger 推導 milestone，legacy 點數作為下限。需同意：
     - 新增兩個本機欄位 `companion.legacyRelationshipPoints`、`companion.relationshipPolicyId`；
     - 修改 vertical slice §6.1 與 §13.1（`rulesetId` 只標示 ledger entry 的版本，推導的規則另用 policy id）；
     - 修改 §7.2：「透過 ledger entry 推進」改為「由 active ledger 推導」；Companion 優先順序改為 §3.4 的 5 條：加上階段提升；撤銷的 reveal 一律 `observe` 並結束判斷。
   - 歷史：R1 epoch 以後的 Main Quest 日都算、第一次以新規則計算時不補播（建議）／R2 只算新版上線之後。
4. **顯示**：
   - S1 名稱 ＋ reveal ＋ 依階段的預設台詞（建議）／S2 只有名稱與 reveal（含階段提升的 1 句）／S3 不改。
   - 注意：預設台詞依 Momentum 決定（§7），已到 `partner` 以上的使用者主要看到 `strong`／`peak` 的那一句，所以 S1 改兩句。
5. **hidden stats**：
   - H1 只改中文名稱（建議）／H2 加「最近常見」／H3 另立任務做台詞。
   - 名稱：紀律、深度、活力、秩序、勇氣、技藝，可修改。
6. **台詞**：選 S1 時是 §7 的 7 句新台詞（6 句依階段的預設台詞 ＋ 階段提升 1 句），選 S2 時只有階段提升 1 句；都可逐句修改。
7. **README 的五階段草案**：建議在 README 註明以 vertical slice 的 4 個階段為準。只改文件，可放在 AI-202B。
8. **Telemetry**：
   - T0 不加 `relationshipStage` 欄位（建議）。注意：選 S1 時，`companion_interacted` 的 `interactionKey` 就是台詞 key（例如 `companion.observe.partner`），本身已帶出階段。目前 production 是 no-op adapter，不會送出任何資料。
   - T1 另加 `relationshipStage` 欄位：改 allowlist 與 vertical slice §11 的欄位清單（不涉及資料庫）。
9. **BUG-113 的處理**：
   - 另立 BUG-113，在 AI-202B 之前修（建議）。這是現有的錯誤（專案完成與撤銷的 reveal 判斷），與本提案的決定無關，也不需要核准新的行為。它在 `tasks.md` 的 Next 中排在 PS-248 前面；要先做 PS-248 提案也可以。
   - 併入 AI-202B。
