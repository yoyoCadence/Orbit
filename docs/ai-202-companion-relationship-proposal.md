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
- **不因缺席降級**。階段只在它的來源 Session 被撤銷或刪除時退回，這是現有行為；沒有時間衰減（§6）。
- **讓階段看得見**（§7）：
  - 首頁 COMPANION 卡顯示階段；
  - 階段提升時顯示「夥伴關係：合作夥伴」，取代現在的 `companion +1`；
  - 平常的 `observe` 台詞依階段不同。
- **ledger 與 `rulesetId` 都不變**。只新增一個本機欄位 `companion.legacyRelationshipPoints`（V2 state 不同步、不涉及資料庫），讓舊版分頁寫入的過時點數無法汙染計算（§3.2，需核准）。vertical slice §7.2「透過 ledger entry 推進」要改寫為「由 active ledger 推導」（需核准）。

## 2. 現況

| 項目 | 位置 | 事實 |
|---|---|---|
| 階段 | `v2/controller.js` `PERSONAL_SPACE_V2_RELATIONSHIP_STAGES`；`v2/viewModels.js` `RELATIONSHIP_STAGES`；`pages/personalSpaceV2.js` `RELATIONSHIP_LABELS` | 四個有順序的階段：`stranger-observer` → `familiar` → `partner` → `trusted-companion`（陌生觀察者／熟悉夥伴／合作夥伴／信賴夥伴）。同一份清單複製在三個檔案 |
| 計算 | `controller.js` `relationshipPointsForState()`、`relationshipStageForPoints()`、`applyReconciliationToV2State()` | 點數＝（遷移時的基準）＋ ledger 中所有 `relationship` entry 的總和；階段＝`floor(點數)`，限制在 0–3 |
| 唯一來源 | `v2/rewardRules.js` `getProjectCompletionRewardSpecs()` | Workspace Upgrade 完成（第 4 個 Main Quest 日）給 `relationship:companion +1`。**只有這一個來源**，所以階段最多到 `familiar`，`partner` 與 `trusted-companion` 永遠到不了 |
| 退回 | `v2/reconciler.js` | 撤銷第 4 天的 Session 時，milestone 改由下一個 Main Quest 日承接；沒有就退回。沒有時間衰減 |
| Companion 行為 | `v2/companionEngine.js` `getCompanionReaction()` | 收到 `relationshipStage` 與 `hiddenStats`，但**完全不使用**；`relationshipDelta` 永遠是 0。階段對狀態、台詞、動畫都沒有影響 |
| 顯示 | `pages/personalSpaceV2.js` 詳細面板 | 只有完整頁面的 Companion 詳細面板寫「夥伴關係 · 熟悉夥伴」。首頁卡片、Pixi 場景都不顯示 |
| 階段提升的 reveal | `controller.js` `revealKind()`；`ui/orbitWindow.js` `buildRewardLines()`；`personalSpaceV2.js` `rewardLine()` | `relationship` reward 讓 reveal 成為 `major`。文字：首頁 `companion +1`、完整頁面「夥伴關係 +1」 |
| hidden stats | `rewardRules.js` `mapSessionToHiddenStat()` | 6 項：`discipline`、`depth`、`vitality`、`order`、`courage`、`craft`。每筆有效 Session 依優先順序給一項 +1 或 +2；Main Quest 改給 `depth +3`。**沒有上限、沒有每日上限、沒有門檻** |
| hidden stats 顯示 | `orbitWindow.js`、`personalSpaceV2.js` | 沒有任何畫面顯示總數。只在 reward 行出現英文 key：首頁 `depth +1`，完整頁面是 ledger key `depth.ordinary +1`（`rewardLine()` 讀 `rewardKey`） |
| Telemetry | `v2/telemetry.js` | `companion_interacted` 只有 `companionState`、`interactionKey`、`renderMode`，沒有階段或 hidden stats |
| 規格 | vertical slice §6.1、§7.2、§14；product spec §3.2、§8.1、§8.3；art bible §10 | 關係「透過 ledger entry」推進；hidden stats 與關係必須能從 active ledger 推導；不可因錯過而羞辱或懲罰；LLM 不得決定關係 |
| 既有問題（BUG-113） | `v2/revealSelectors.js` `isProjectCompletionReveal()` | 專案完成後，只要 reveal 含 `project_progress:workspace-upgrade` 且進度 ≥ 100 就算「專案完成」。之後**每一個** Main Quest 日的 reveal 都會讓 Companion 再說一次「工作站完成了。」（以 reconciler ＋ controller ＋ engine 重現：第 5 天得到 `congratulate`／`companion.project.workspace-upgrade.complete`） |

README 的「關係進化草案」列了 5 個不同的階段（陌生觀察／陪跑提醒／理性教練／理解型夥伴／高階顧問）。程式碼與 vertical slice 用的是上面 4 個。本提案沿用程式碼的 4 個，並建議 README 註明以 vertical slice 為準（§9 第 7 點）。

## 3. 階段推進規則

### 3.1 為什麼用 Main Quest 天數

| 候選訊號 | 可否刷 | 跨裝置一致 | 評估 |
|---|---|---|---|
| **Main Quest 天數（建議）** | 否：每個 effective date 最多一天，需 A／S、`complete`、≥ 25 分鐘 | 是：只用同步的 Session 欄位 | 代表「持續的深度投入」。第 4 天已經是現有的 `familiar` 門檻，規則一致 |
| hidden stats 總和 | 是：每筆有效 Session 都加，instant 也算，沒有上限 | 是 | 違反 product spec「真實行為優先於刷」 |
| 有任何有效 Session 的天數 | 部分：一天一次，但 1 分鐘的 instant 也算 | 是 | 門檻太低，與「品質」無關 |
| 有效天（`isEffectiveDay`） | 否 | 是，但當天的判斷會隨之後的 Session 翻轉（娛樂超過 120 分鐘） | milestone 的錨點不穩定 |
| Streak | 否 | **否**：`streakDays` 是可變的 profile 欄位，會被重設，與 Pro 保護卡相關 | 無法 deterministic replay；也會讓錯過一天變成關係懲罰 |
| 點擊、聊天、互動次數 | 是 | 否：telemetry 不是 reward 來源 | 違反任務目標本身（「不是聊天次數」）與 vertical slice §11（telemetry 不能當 reward 的依據） |

### 3.2 推導方式

- 「Main Quest 日」＝ active ledger 中 `quest_progress` 且 `rewardKey` 為 `main-focus:<date>` 的 entry，每個日期一筆。這已經是 reconciler 每天只選一個 winner 的結果。非 authoritative 的部分快照會保留被省略的 Session 的 entry（`reconciler.js` 的 `preservedOmittedSourceIds`），所以 reconcile 結果的 `activeRewards` 已經是完整的計數來源。
- **milestone 不寫進 ledger，而是在 `applyReconciliationToV2State()` 由 active ledger 推導**（理由見 §3.3）：
  - `derivedMilestones` ＝ Main Quest 日數 ≥ 12 時 1，≥ 30 時再加 1；
  - 點數 ＝ `max(legacy 點數, ledger 中 relationship entry 的總和 ＋ derivedMilestones)`。ledger 中的 relationship 只有現有的專案完成 1 點。
  - 階段仍由 `relationshipStageForPoints()` 決定，不改：4 天 1 點 → `familiar`；12 天 2 點 → `partner`；30 天 3 點 → `trusted-companion`。
- legacy 點數是**下限，不是加分**：
  - 遷移時 legacy 的關係階段只「seed 一次」，而且「遷移不給關係進度」（technical design §7.2）。目前程式碼把它當成基準再加上 ledger，所以 legacy 為 `quiet-familiarity`（1 點）的使用者完成專案就到 `partner`。若沿用加法，這類使用者會在第 4 天到 `partner`、第 12 天到 `trusted-companion`，門檻不再固定（Codex review 指出）。
  - 改為下限後：一開始就是 `familiar`；第 4 天仍是 `familiar`；第 12、30 天才到 `partner`、`trusted-companion`，與其他使用者相同。
  - 實際上：legacy 程式從未寫過關係階段（`gameState.js` 只有預設值 `stranger-observer`），`quiet-familiarity` 只出現在測試 fixture 中，所以現有使用者的 legacy 點數都是 0。這條規則是為了讓所有情況都有定義。
- `companion.legacyRelationshipPoints`：**新的本機欄位**（V2 state 只存在本機、不同步；不涉及資料庫）。
  - 新版第一次 reconcile、欄位還不存在時寫入一次：`max(0, 已儲存的點數 − ledger 中 relationship 的總和)`。這就是現在程式碼每次推算的「遷移基準」，也就是 legacy 點數。此時還沒有任何程式寫過推導出的 milestone，所以算出來的就是真正的 legacy 點數。
  - 之後新版**不再從已儲存的點數反推**，每次都從欄位與 ledger 重新計算。
  - 理由：舊版分頁會把它不認得的點數當成基準保留（§3.3）。如果舊版分頁撤銷了一個 Session，讓 Main Quest 日數跌破門檻，反推的值會多 1，而且永遠修不回來。存下來的值不受舊版分頁影響。
  - 舊版的 `normalizePersonalSpaceV2State()` 與 `applyReconciliationToV2State()` 都會保留 `companion` 中不認得的欄位（`...rawCompanion`、`...state.companion`），所以舊版分頁不會刪掉它。
- **reveal 以「階段前後是否改變」判斷**，不再看新增了哪個 ledger entry：
  - 「之前的階段」用同一個公式從**舊的已儲存 ledger** 計算，不讀已儲存的點數。舊版分頁可能寫入過時的點數，但它寫入的 ledger 反映的是真實的 Session 變化。
  - 只有 `queueReveal: true`（記錄或撤銷 Session）時才排入 reveal，類別為 `major`；開啟 app 與首頁 render 的 reconcile 不排入。
  - 撤銷後由下一個 Main Quest 日補上、階段沒有改變時，不會有關係的 reveal。
- `companionEngine` 仍不能改變關係（vertical slice §7.2、§17）；它只讀取階段來挑選台詞（§7）。

### 3.3 與舊版分頁並存、ruleset 與既有資料

同一個瀏覽器的多個分頁共用 `localStorage` 中的 V2 state。更新時，`sw.js` 的 `skipWaiting`／`clients.claim` 只讓已開啟的分頁顯示「重新整理」橫幅（`index.html`），使用者按下之前，該分頁仍執行舊版程式碼並繼續 reconcile。所以新規則必須讓**舊版程式碼看到新版寫入的 state 時不會改壞它**。

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

- 不新增 ledger entry、不改任何 reward 的 amount 與 metadata，所以 vertical slice §6.1「改規則要換 `rulesetId`」不適用。
- 但 vertical slice §7.2 寫的是「透過 ledger entry 推進」。K4 的 milestone 是「由 active ledger entry 推導」，符合 §14「hidden stats 與關係必須能從 active ledger entry 推導」，但 §7.2 的文字要改寫。這是修改規格，列為需要核准（§9 第 3 點）。
- 沒有 ledger id 衝突、`metadata.tier` 或部分快照保留 milestone entry 的問題。
- 階段提升的 reveal 行會放在第 N 天那筆 Session 的 reveal 裡，該 reveal 含 `project_progress:workspace-upgrade`，所以仍依賴 BUG-113：不先修，Companion 會被判斷成「專案完成」。
- 歷史：
  - **R1（建議）**：epoch（2026-07-17）以後的 Main Quest 日都算。已經有 12 或 30 天的使用者，第一次開啟新版時直接到對應階段；開啟時不排入 reveal，只是階段改變。
  - R2：只算新版上線之後的 Main Quest 日。需要第二個 epoch 常數；已累積的歷史不算，對長期使用者不公平；好處是不會一次跳兩階。

## 4. hidden stats 不決定階段

- **刷**：每筆有效 Session 都給一項，instant 也算，沒有每日上限。一天記 50 筆 1 分鐘的 instant 就是 `discipline +50`。
- **偏向**：Main Quest 每天給 `depth +3`、Main Quest 的 Session 不再給一般的 stat，所以專注型使用者幾乎只有 `depth`。若用「至少 3 種 stat 都有點數」當門檻，最認真的專注使用者反而卡關。
- **語意**：README 的定位是「補充人格維度」，回答「什麼樣的人」，不是「多親近」。

所以本提案的映射是：**階段＝一起走了多久（Main Quest 天數）；hidden stats＝走的方式（Session 的種類）**。兩者互不換算。

## 5. hidden stats 的最小表達

選項：

- **H1（建議）只改顯示名稱**：
  - reward 行與「最近的世界變化」顯示中文名稱，取代 `depth +1` 與 `depth.ordinary +1`：紀律、深度、活力、秩序、勇氣、技藝（名稱見 §9 第 5 點）。
  - 首頁與完整頁面共用同一份名稱表，放在既有模組中，不新增需要加入 `sw.js` SHELL 的檔案。
  - 不顯示總數，維持「hidden」。
- H2：H1 ＋ 完整頁面 Companion 詳細面板加一行「最近常見：深度、秩序」。
  - 取最近 7 個 effective date 的一般 hidden stat entry，只算 `ordinary` tier，排除 Main Quest 固定的 `depth +3`，取前兩名，不顯示數字。
  - 需要新的 view model 推導與 1 行版面。
- H3：讓 hidden stats 影響 Companion 的台詞（例如依最近最多的面向挑 `observe` 台詞）。
  - 需要 6 句新台詞與 telemetry key，建議等 H1 上線後另立任務（候選 `AI-205`）。

## 6. 不因缺席降級

固定規則，不是選項：

- 階段不會因為沒有使用、錯過 Main Quest、Streak 中斷或 Momentum 變低而下降。
- 唯一會下降的情況，是 milestone 的來源 Session 被撤銷或刪除，而且沒有其他 Main Quest 日可以承接。這是現有的 ledger 規則（vertical slice §6.4、§7.2），product spec §8.1 也要求每個 reward 都可以隨來源撤銷。
- 依據：
  - product spec §3.2 原則 3、4、5（長期進度不因錯過一天被破壞；恢復是策略；不羞辱或威脅）；
  - art bible §10「不可暗示因缺席而被拋棄或懲罰」；
  - AI-203 提案「不因缺席降級」。

## 7. 讓階段看得見

現在階段只出現在完整頁面的詳細面板裡，對使用者幾乎不存在。

選項：

- **S1（建議）**：
  1. 首頁 COMPANION 卡的標籤改為 `COMPANION · 熟悉夥伴`，與完整頁面共用同一個名稱表。`stranger-observer` 也顯示（`COMPANION · 陌生觀察者`），讓使用者知道關係會改變。
  2. 階段提升的 reveal 行顯示新階段：「夥伴關係：合作夥伴」，首頁與完整頁面相同。
     - 若撤銷造成退回，顯示「夥伴關係：熟悉夥伴」，不寫「−1」或「降級」。
     - 撤銷後由另一天承接、階段沒變時，不顯示階段行。
  3. 階段提升時，Companion 為 `congratulate`，新台詞 key `companion.relationship.stage-up`。前提是先修好 BUG-113，否則第 12 天的 reveal 會先被判斷成「專案完成」。
  4. 平常的 `observe` 台詞依階段不同：`stranger-observer` 沿用現有台詞，其餘 3 個階段各一句新台詞。
  5. 新台詞都放進 `companionDialogue.js`，並同步加入 telemetry 的 `COMPANION_DIALOGUE_INTERACTION_KEYS` 與 `companionEngine`。這是 AI-204B 的既有流程。
- S2：只做 1 與 2（標籤與 reveal 文字），不新增台詞。
- S3：維持現狀，只修推進規則。

不在本任務範圍：Pixi 場景中 Companion 的位置或姿態隨階段變化。art bible 要求「逐漸改變存在感與熟悉度」，但需要新素材，與 PS-248 一起評估。

台詞候選（S1；語氣遵守 vertical slice §7.2：描述觀察到的事，不羞辱、不施壓、不空泛稱讚）：

| key | 候選 |
|---|---|
| `companion.observe`（陌生觀察者，沿用） | 我會在這裡看著你的空間慢慢成形。 |
| `companion.observe.familiar` | 我開始熟悉你的節奏了。 |
| `companion.observe.partner` | 這個空間是我們一天一天累積起來的。 |
| `companion.observe.trusted-companion` | 你的節奏我很熟悉了，需要時我都在。 |
| `companion.relationship.stage-up` | 我們一起走過的日子，又多了一些。 |

## 8. 驗收條件草稿（AI-202B，核准後寫入 tasks.md）

推進：

- 11 個 Main Quest 日 → `familiar`；第 12 個 → `partner`；第 30 個 → `trusted-companion`。用 controller 層級的測試，Session 只用同步的欄位。
- 同一天多筆 Main Quest 候選只算一天；100 筆 instant 或一般 Session 不改變階段（hidden stats 會增加）。
- 只有恢復、沒有 Main Quest 的日子不推進（選 I1 時，見 §9 第 2 點）。
- 沒有任何時間輸入：同一組 Sessions 在任何「今天」reconcile 的結果相同；長時間沒有 Session 不會降級。

撤銷與部分快照：

- 撤銷第 12 天的 Session：
  - 有第 13 天時，仍是 `partner`，沒有關係的 reveal 行；
  - 沒有時，退回 `familiar`，reveal 文字是「夥伴關係：熟悉夥伴」。
- 非 authoritative 的部分快照（省略較早的 Session）：Main Quest 日數由保留的 entry 計入，階段不變；重複套用時 state 逐位元相同（與既有的 replay 測試相同）。
- 第 12 天的 reveal 不會被判斷成專案完成，Companion 不說「工作站完成了」（依賴 BUG-113）。

與舊版分頁並存、ruleset 與既有資料（K4、R1）：

- `RULESET_ID` 不變；ledger 中沒有新的 `rewardType`、`rewardKey` 或 entry。固定的 fixture 在改版前後 ledger 完全相同。
- `companion.legacyRelationshipPoints` 只在欄位不存在時寫入一次；之後即使已儲存的點數被改成別的值（模擬舊版分頁寫入），點數仍由欄位與 ledger 重新計算。
- legacy 階段為 `quiet-familiarity` 的遷移 fixture：一開始是 `familiar`；第 4 天仍是 `familiar`；第 12 天 `partner`；第 30 天 `trusted-companion`。
- 以**目前 main 的** `applyReconciliationToV2State()` 與 `reconcileRewardLedger()` 處理新版寫入的 state（模擬舊版分頁）：
  - 不撤銷、不新增任何 ledger entry；
  - 階段不變；
  - `companion.legacyRelationshipPoints` 被保留。
- 「之前的階段」由舊的已儲存 ledger 計算：已儲存的點數被改成過時的值時，`queueReveal: true` 的 reconcile 不會因此排入階段變化的 reveal。
- 已有 30 個 Main Quest 日的 state 在開啟時（`queueReveal: false`）直接到 `trusted-companion`，不排入 reveal。
- 已儲存的 hidden stats、Gold 不變。

顯示（S1）：

- 首頁卡片與完整頁面顯示同一個階段名稱；名稱表只有一份，階段清單只有一份。
- 首頁卡片的標籤在 320、360、390、414、1024 px 與 200% 縮放下不被截斷（延用 AI-204B 的 e2e）。
- 階段提升時：
  - Companion 為 `congratulate`，台詞 key 為 `companion.relationship.stage-up`；
  - 首頁與完整頁面的 reveal 行都是「夥伴關係：<新階段>」。
- `observe` 的台詞依階段改變；首頁與完整頁面相同。
- hidden stat 的 reward 行顯示中文名稱（H1），兩個頁面都不再出現 `depth.ordinary`。
- 新台詞 key 在 `companionDialogue.js`、telemetry allowlist、`companionEngine` 三處同步（既有測試）。

文件：

- vertical slice §4.3 的 `relationship:companion-stage=1` 改為程式碼實際使用的 `relationship:companion=1`；§7.2 的階段推進改寫為「由 active ledger 推導」與本提案的門檻（K4）；§5.1 的 state 欄位加上 `companion.legacyRelationshipPoints`。
- `docs/personal-space-state-flow.md` 的關係公式改為 `max(legacy 點數, ledger 中的 relationship ＋ 推導的 milestone)`。

## 9. 需要使用者決定

1. **門檻**：
   - N1 第 4／12／30 個 Main Quest 日（建議）。每天都做約 1 個月到信賴夥伴；每週 3 天約 10 週。
   - N2 4／8／16（較快）。
   - N3 4／20／60（較慢）。
2. **輸入**：
   - I1 只算 Main Quest 日（建議）。恢復不會推進關係，但也不會讓關係退步。
   - I2 Main Quest 日 ＋ 至少 30 分鐘的恢復日。符合「恢復是策略」，但只休息也能到信賴夥伴。
3. **機制與既有歷史**（§3.3）：
   - K4 由 active ledger 推導 milestone、存下 `companion.legacyRelationshipPoints`、legacy 點數作為下限（建議）。需同意新增這個本機欄位，並把 vertical slice §7.2「透過 ledger entry 推進」改為「由 active ledger 推導」。
   - 歷史：R1 epoch 以後的 Main Quest 日都算、開啟時不補播（建議）／R2 只算新版上線之後。
4. **顯示**：S1 名稱 ＋ reveal ＋ 台詞（建議）／S2 只有名稱與 reveal／S3 不改。
5. **hidden stats**：
   - H1 只改中文名稱（建議）／H2 加「最近常見」／H3 另立任務做台詞。
   - 名稱：紀律、深度、活力、秩序、勇氣、技藝，可修改。
6. **台詞**（選 S1 時）：§7 的 4 句候選，可逐句修改。
7. **README 的五階段草案**：建議在 README 註明以 vertical slice 的 4 個階段為準。只改文件，可放在 AI-202B。
8. **Telemetry**：
   - T0 不加階段欄位（建議）。目前 production 是 no-op adapter，加了也沒有資料。
   - T1 在 `companion_interacted` 加上 `relationshipStage`，需要改 allowlist 與 vertical slice §11。
9. **BUG-113 的處理**：
   - 另立 BUG-113，在 AI-202B 之前修（建議）。這是現有的錯誤，與本提案的決定無關，也不需要核准新的行為。
   - 併入 AI-202B。
