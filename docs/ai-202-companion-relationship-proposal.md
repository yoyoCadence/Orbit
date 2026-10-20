# AI-202 提案：Companion 關係階段與 hidden stats 的最小映射規則

> 狀態：提案（Mode A，只有文件）。核准前不改程式碼。核准後由 `AI-202B` 實作；§8 是它的驗收條件草稿，§9 是需要使用者決定的事。

## 1. 結論

- **關係階段只由「Main Quest 天數」推進**：完成每日主線任務的不同日期數。這是現有資料中最接近「真實行為品質」、又無法刷的訊號：每天最多一天，需要 A／S 級、完成、至少 25 分鐘。
  - 第 4 天：`familiar`（熟悉夥伴）。這就是現在的 Workspace Upgrade 完成，**不改**。
  - 第 12 天：`partner`（合作夥伴），新的 ledger milestone。
  - 第 30 天：`trusted-companion`（信賴夥伴），新的 ledger milestone。
  - 門檻可調（§9 第 1 點）。
- **hidden stats 不決定階段**。它們每次 Session 都會加、沒有每日上限，連 instant Session 也算，所以很容易刷（§4）。它們回答的是「做了什麼樣的事」，階段回答的是「一起走了多久、多穩」。AI-202B 只把 hidden stats 的顯示改成中文名稱；「夥伴注意到你哪一面」另立任務（§5）。
- **不因缺席降級**。階段只在它的來源 Session 被撤銷或刪除時退回，這是現有行為；沒有時間衰減（§6）。
- **讓階段看得見**（§7）：
  - 首頁 COMPANION 卡顯示階段；
  - 階段提升時顯示「夥伴關係：合作夥伴」，取代現在的 `companion +1`；
  - 平常的 `observe` 台詞依階段不同。
- **不需要新的資料欄位**。新的 milestone 放進既有的 `rewardLedger`，不改 schema。沿用現有的 `rulesetId`，只新增 entry，不改任何既有 entry（§3.3，需核准）。

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

- 「Main Quest 日」＝ active ledger 中 `quest_progress` 且 `rewardKey` 為 `main-focus:<date>` 的 entry，每個日期一筆。這已經是 reconciler 每天只選一個 winner 的結果。
- 依（`sessionDate`、`createdAt`、`id`）排序，與 `projectEngine.js` 的 `projectEntryOrder` 相同。
- 第 N 個（N = 12、30）存在時，產生一筆 milestone entry，錨定在第 N 天的 winner Session：
  - `rewardType: 'relationship'`；
  - `rewardKey`：`companion:partner`、`companion:trusted-companion`。必須和現有的 `companion` 不同，因為 ledger id 是 `reward:<rulesetId>:<sourceId>:<rewardType>:<rewardKey>`。同一個 Session 在撤銷後可能從第 12 天變成第 4 天，key 相同就會撞 id；
  - `metadata.tier: 'relationship-milestone'`，**不可**用 `'project-completion'`，否則 `revealSelectors.isProjectCompletionReveal()` 會把它當成專案完成；
  - `metadata.relationshipMilestone`：`'partner'` 或 `'trusted-companion'`，加上 `mainQuestDay`（12 或 30）。
- 推導方式與 project completion 相同：從「保留的 entry ＋ 預期的 entry」推導，**不**在非 authoritative 的部分快照中原樣保留（對應 `reconciler.js` 對 `projectMilestone: 'completed'` 的處理）。這樣撤銷第 N 天時會改由新的第 N 天承接，部分快照也不會重複或遺失。
- 點數仍是所有 `relationship` entry 的總和，不改 `relationshipStageForPoints()`：
  - 4 天：1 點（現有）→ `familiar`
  - 12 天：2 點 → `partner`
  - 30 天：3 點 → `trusted-companion`
- `companionEngine` 仍不能改變關係（vertical slice §7.2、§17）；它只讀取階段來挑選台詞（§7）。

### 3.3 Ruleset 與既有資料

Vertical slice §6.1 規定：「Amount and metadata are immutable for a ruleset. Changing a rule requires a new `rulesetId` plus an explicit migration/reconciliation policy.」

**不建議換 `rulesetId`**。以目前的程式碼換掉會重複計算：
- `activeCurrentRulesetEntries()` 會濾掉舊 ruleset 的 entry，於是舊的總和變成 0；
- 「遷移基準」＝已儲存的總數 − 0，而已儲存的總數已經包含舊 ledger；
- 新 ruleset 再把 epoch 之後的 Session 全部給一次，所以 hidden stats、Gold 與關係都會變成兩倍。

選項：

- **K1（建議）沿用 `ps-v2-workspace-v1`，只新增 entry**：
  - 不改任何既有 entry 的 id、amount、metadata，只多出兩種 milestone；
  - 對 epoch（2026-07-17）以後的歷史生效：已經有 12 或 30 個 Main Quest 日的使用者，第一次開啟新版時直接到對應階段；
  - 開啟時的 reconcile 是 `queueReveal: false`，所以**不會**補播 reveal，只是階段改變；
  - 需要在 vertical slice §6.1 補上：「新增衍生 milestone、且不改變任何既有 entry 的 id、amount、metadata 時，不換 ruleset」。這是修改規格，所以列為需要核准。
- K3 沿用 ruleset，只計算新版上線之後的 Main Quest 日：
  - 需要第二個 epoch 常數；
  - 已累積的歷史不算，對長期使用者不公平；
  - 好處是不會一次跳兩階。
- K2 換新 `rulesetId` 並修正基準的計算：範圍與風險都大（Gold、hidden stats 的遷移），不建議。

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
  - 有第 13 天時，仍是 `partner`，milestone 改錨定在新的第 12 天，不顯示階段行；
  - 沒有時，退回 `familiar`，reveal 文字是「夥伴關係：熟悉夥伴」。
- 非 authoritative 的部分快照（省略較早的 Session）：milestone 由保留的 entry 推導，數量不變；重複套用時 ledger 逐位元相同（與既有的 replay 測試相同）。
- 一個 Session 先後成為第 12 天與第 4 天的錨點時，ledger id 不衝突（不同的 `rewardKey`）。
- milestone 的 `metadata.tier` 是 `relationship-milestone`；第 12 天的 reveal 不會被判斷成專案完成，Companion 不說「工作站完成了」（依賴 BUG-113）。

Ruleset 與既有資料（K1）：

- `RULESET_ID` 不變。固定的 fixture 在改版前後，所有既有 entry 的 id、amount、metadata 都相同，只多出 milestone entry。
- 已有 30 個 Main Quest 日的 state 在開啟時（`queueReveal: false`）直接到 `trusted-companion`，不排入 reveal。
- 已儲存的 hidden stats、Gold 不變（不重複計算）。

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

- vertical slice §4.3 的 `relationship:companion-stage=1` 改為程式碼實際使用的 `relationship:companion=1`，並加上兩個新 milestone；§6.1 補上 ruleset 規則（K1）；§7.2 的階段推進改寫為本提案的規則。
- `docs/personal-space-state-flow.md` 的關係公式補上新 milestone。

## 9. 需要使用者決定

1. **門檻**：
   - N1 第 4／12／30 個 Main Quest 日（建議）。每天都做約 1 個月到信賴夥伴；每週 3 天約 10 週。
   - N2 4／8／16（較快）。
   - N3 4／20／60（較慢）。
2. **輸入**：
   - I1 只算 Main Quest 日（建議）。恢復不會推進關係，但也不會讓關係退步。
   - I2 Main Quest 日 ＋ 至少 30 分鐘的恢復日。符合「恢復是策略」，但只休息也能到信賴夥伴。
3. **既有歷史**：
   - K1 沿用 ruleset、epoch 以後的歷史都算、開啟時不補播（建議；需同意修改 vertical slice §6.1 的規則文字）。
   - K3 只算新版上線之後。
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
