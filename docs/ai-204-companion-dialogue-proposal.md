# AI-204 提案：統一 Companion 台詞文案

> 狀態：**提案（Mode A），等待使用者選定文字**（2026-10-19）。核准前不改程式碼。

## 1. 結論

- 建議新增 `pwa/js/personalSpace/v2/content/companionDialogue.js`，匯出一份凍結的文案表（8 個 key）。`ui/orbitWindow.js` 與 `pages/personalSpaceV2.js` 都改為 import 這份表，刪除各自的副本。
- 每個 key 只有一句。建議**全部採用首頁小卡目前的文字**（方案 A），理由見 §4。使用者也可以改選完整頁面版（方案 B），或逐句指定（方案 C）。
- 不改 key、不改 `companionEngine.js` 的狀態判斷、不改 telemetry 的 `interactionKey`。

## 2. 現況

- 兩份文案表：
  - `pwa/js/personalSpace/v2/ui/orbitWindow.js` 的 `COMPANION_DIALOGUE_MESSAGES`：首頁的 Orbit Window 小卡使用。
  - `pwa/js/pages/personalSpaceV2.js` 的 `COMPANION_MESSAGES`：「空間」完整頁面使用。它把文字當成 `companion.message` 傳給同一個 renderer（蓋過小卡的表），詳細資訊面板也用它。
- 結果：同一個 Companion 狀態，在首頁與完整頁面說不同的話。8 個 key 中有 7 個不同；`companion.goal.gentle-reminder` 已在 AI-203B 統一。
- 沒有測試釘住這些文字。telemetry 只記錄 key，不記錄文字（vertical slice 禁止送出 dialogue text），所以改文字不影響 telemetry。
- 文字限制（`docs/personal-space-v2-product-spec.md` §3 第 5 條、`docs/personal-space-v2-vertical-slice.md` §7.2）：不羞辱、不威脅、不情緒勒索；描述觀察到的模式或專案變化，不重複空泛的稱讚。

## 3. 對照表

觸發條件依 `companionEngine.getCompanionReaction()` 的判斷順序。

| key | 觸發條件 | 首頁小卡（方案 A） | 完整頁面（方案 B） |
|---|---|---|---|
| `companion.project.workspace-upgrade.complete` | 專案完成的 reveal | 工作站完成了。這個房間記得你一路累積的努力。 | 正式工作站完成了。這個空間會記得你為它付出的每一次努力。 |
| `companion.project.workspace-upgrade.progress` | 主線任務或專案進度的 reveal | 工作空間改變了，下一個有用的步驟已經看得見。 | 工作空間有了變化，下一個有意義的步驟也已經清楚可見。 |
| `companion.recovery.completed` | 最近一次有效 Session 是完成的恢復 | 休息也算數。穩定的節奏需要恢復。 | 恢復也算數。適當休息，是能長久前進的一部分。 |
| `companion.session.productive-complete` | 最近一次有效 Session 是完成的任務 | 這次行動在空間裡留下了痕跡。 | 剛才完成的工作，已經在這個世界留下痕跡。 |
| `companion.momentum.strong` | Momentum 為 strong 或 peak | 你最近的節奏很穩，我會繼續陪你前進。 | 你最近的節奏很穩定，我會繼續在旁邊陪你一起工作。 |
| `companion.goal.gentle-reminder` | low，且今日計畫有尚未開始的目標（AI-203B） | 你選擇的目標還在這裡，準備好時再開始。 | （相同） |
| `companion.momentum.low` | low，沒有可提醒的目標 | 不用急，我們可以從一個清楚的小行動重新開始。 | 不用勉強自己，我們可以從一個清楚的小行動重新開始。 |
| `companion.observe` | 其他情況 | 我會在這裡看著你的空間慢慢成形。 | 我正在看著這個空間，隨著你的真實努力慢慢改變。 |

## 4. 為什麼建議方案 A（小卡版）

- 小卡是使用者最常看到的地方（首頁），句子較短，在窄螢幕上不會換成三行以上。完整頁面的卡片較大，短句一樣放得下；反過來，長句放進小卡會擠。
- 兩版的語氣都符合 §2 的限制，差別主要在長度。
- 小卡版有一處用字不一致：`complete` 說「這個房間」，其他句子都說「空間」。可以順手改成「這個空間」，列為方案 A 的可選調整（A′）。

## 5. 核准後的變更

- 新增 `pwa/js/personalSpace/v2/content/companionDialogue.js`：
  - `COMPANION_DIALOGUE`：凍結的 8 個 key 與選定的文字；
  - `getCompanionDialogue(key)`：找不到 key 時回傳 `companion.observe`。
- `ui/orbitWindow.js`：刪除 `COMPANION_DIALOGUE_MESSAGES`，改用共用表。保留 `companion.message`／`companion.dialogue` 的覆寫順序，避免改變 renderer 的介面。
- `pages/personalSpaceV2.js`：刪除 `COMPANION_MESSAGES`，`message` 與詳細資訊面板都改用共用表。
- `sw.js` 的 `SHELL` 加入新模組（`serviceWorkerShell.test.js` 會檢查）。
- 測試：
  - 共用表的 key 與 telemetry `interactionKey` 允許清單中的 dialogue key 完全一致；
  - 同一個 view model，小卡與完整頁面顯示相同的文字；
  - 未知 key 回到 `companion.observe`。
- 版本：`npm run bump -- patch`（使用者可見的文字改變）；CHANGELOG 列出改變的句子。
- `ps243:assets` 重新產生 baseline（V2 模組大小改變）。

## 6. 需要使用者決定

1. 文字：方案 A（小卡版，建議）、A′（小卡版，`complete` 改說「這個空間」）、B（完整頁面版），或 C（逐句指定）。
2. 是否接受 §5 的共用模組做法。
3. （順帶發現，不在原任務內）夥伴的名稱也不一致：首頁小卡在 view model 沒有給名稱時顯示 `Orbit Guide`（`ui/orbitWindow.js` 的預設值），完整頁面顯示「Orbit 夥伴」。建議一併統一為「Orbit 夥伴」，放進同一個共用模組；若不想擴大範圍，另立任務。

## 7. 驗收條件草稿（核准後寫入 tasks.md）

- 程式碼中只有一份 Companion 文案表；兩個畫面都從它取字。
- 8 個 key 的文字與使用者選定的完全相同。
- 同一個 view model，首頁小卡與完整頁面顯示相同的台詞。
- lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
