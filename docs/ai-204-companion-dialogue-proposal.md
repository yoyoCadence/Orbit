# AI-204 提案：統一 Companion 台詞文案

> 狀態：**提案（Mode A），等待使用者決定**（2026-10-19）。核准前不改程式碼。經 Codex 與獨立 review 後改寫（第一版以「小卡放得下」為理由，實測是錯的，見 §4）。

## 1. 結論

- 建議新增 `pwa/js/personalSpace/v2/content/companionDialogue.js`，匯出唯一一份凍結的文案表（8 個 key）。`ui/orbitWindow.js` 與 `pages/personalSpaceV2.js` 都從這份表取字，刪除各自的副本。
- 要決定的是兩件事：
  - **文字**：每個 key 一句；
  - **小卡怎麼顯示**：目前首頁與完整頁面的狀態小卡都是單行，在常見寬度下，兩版文字幾乎都會被截斷（§4）。
- 建議：
  - 文字採**目前首頁小卡的版本**（W-A），理由是句子較短，語氣一致；
  - 小卡改為**最多兩行**（D2）。W-A 全部 8 句在兩行內放得下。
- 不改 key、不改 `companionEngine.js` 的狀態判斷、不改 telemetry 的 `interactionKey`。

## 2. 現況

### 兩份文案表

- `pwa/js/personalSpace/v2/ui/orbitWindow.js` 的 `COMPANION_DIALOGUE_MESSAGES`：首頁的 Orbit Window 使用（`home.js` → `buildHomeWindowViewModel` → `orbitWindow.js` 的 model 正規化）。
- `pwa/js/pages/personalSpaceV2.js` 的 `COMPANION_MESSAGES`：「空間」完整頁面使用。頁面把它設成 `companion.message`（與名稱 `label`）傳給同一個 renderer，renderer 優先採用 `companion.message`，所以會蓋過小卡的表；詳細資訊面板也從這份表查字。
- 8 個 key 中有 7 個文字不同；`companion.goal.gentle-reminder` 已在 AI-203B 統一。

### 台詞出現的五個地方

| 位置 | 來源 | 顯示方式 |
|---|---|---|
| 首頁 Orbit Window 的 COMPANION 狀態小卡 | `orbitWindow.js` 的表 | 單行、9 px、`white-space: nowrap` 加省略號（`style.css` 的 `.orbit-window-state-card > span`） |
| 首頁點小卡跳出的 toast | 同上（`home.js` 的 `showToast(companion.message)`） | 全文 |
| 完整頁面的狀態小卡 | `personalSpaceV2.js` 的表 | 與首頁同一個元件，單行截斷 |
| 完整頁面底部 dock 的「夥伴」按鈕 | 同上（`<small>`） | 8 px，會換行（沒有 `nowrap`） |
| 完整頁面的夥伴詳細資訊面板 | 同上 | 全文 |

共用一份表之後，這些位置都自動一致。

### 測試與限制

- **有測試釘住文字**（第一版寫「沒有」，是錯的）：
  - `tests/unit/personalSpaceOrbitWindowLifecycle.test.js:46`：`momentum.low` 的小卡文字包含「不用急」。選 W-B，或 W-C 改了這句，就要更新。
  - `tests/unit/home.test.js:244`、`tests/unit/personalSpaceV2Page.test.js:236`、`:276`、`:292`：完整的 gentle-reminder 句子。這句不變，但改用共用表後仍要確認。
  - e2e 沒有斷言台詞文字，只用 `[data-orbit-companion]` 選擇器。
- telemetry 只送 `companionState`／`interactionKey`，不送文字。vertical slice §11 禁止送出 dialogue text，所以改文字不影響 telemetry。
- 文字規範：
  - `docs/personal-space-v2-product-spec.md` §3.2 Principles 第 5 條：Companion 不羞辱、不威脅、不情緒勒索。
  - `docs/personal-space-v2-vertical-slice.md` §7.2：描述觀察到的模式或專案變化，不重複空泛的稱讚。

## 3. 對照表

觸發條件依 `companionEngine.getCompanionReaction()` 的判斷順序。「最近一次有效 Session」是當天（effective date）最新一筆結果不是 `invalid` 的 Session；「完成」指結果為 `complete`、`partial` 或 `instant`。

| key | 觸發條件 | W-A：首頁小卡版（字數） | W-B：完整頁面版（字數） |
|---|---|---|---|
| `companion.project.workspace-upgrade.complete` | 專案完成的 reveal | 工作站完成了。這個房間記得你一路累積的努力。（22） | 正式工作站完成了。這個空間會記得你為它付出的每一次努力。（28） |
| `companion.project.workspace-upgrade.progress` | 主線任務或專案進度的 reveal | 工作空間改變了，下一個有用的步驟已經看得見。（22） | 工作空間有了變化，下一個有意義的步驟也已經清楚可見。（26） |
| `companion.recovery.completed` | 最近一次有效 Session 是完成的恢復 | 休息也算數。穩定的節奏需要恢復。（16） | 恢復也算數。適當休息，是能長久前進的一部分。（22） |
| `companion.session.productive-complete` | 最近一次有效 Session 是完成的任務 | 這次行動在空間裡留下了痕跡。（14） | 剛才完成的工作，已經在這個世界留下痕跡。（20） |
| `companion.momentum.strong` | Momentum 為 strong 或 peak | 你最近的節奏很穩，我會繼續陪你前進。（18） | 你最近的節奏很穩定，我會繼續在旁邊陪你一起工作。（24） |
| `companion.goal.gentle-reminder` | Momentum 為 low，且 AI-203B 的條件全部成立：本地時間 12:00–14:00、至少 3 天有 Session、今日計畫中有符合 Main Quest 資格的目標、今天還沒有對這類目標完成的 Session | 你選擇的目標還在這裡，準備好時再開始。（19） | （相同） |
| `companion.momentum.low` | Momentum 為 low，不符合提醒條件 | 不用急，我們可以從一個清楚的小行動重新開始。（22） | 不用勉強自己，我們可以從一個清楚的小行動重新開始。（25） |
| `companion.observe` | 其他情況 | 我會在這裡看著你的空間慢慢成形。（16） | 我正在看著這個空間，隨著你的真實努力慢慢改變。（23） |

## 4. 小卡放不下完整的句子

獨立 review 在真實 app 中量測了首頁（完整頁面的小卡是同一個元件，寬度相同）：

| 視窗 | 小卡文字寬度 | W-A | W-B |
|---|---|---|---|
| 390×844（手機） | 約 135 px | 8 句中 7 句被截斷，只有「這次行動在空間裡留下了痕跡。」完整 | 8 句全部被截斷 |
| 768、1024 寬 | 約 131 px | 7 句被截斷 | 全部被截斷 |
| 320 寬（≤340 px 時改為單欄） | 約 250 px | 全部完整 | 1 句被截斷（`complete`，差 2 px） |

- 也就是說，**不論選哪一版，常見寬度下首頁小卡都只看得到半句**；完整的句子只出現在點擊後的 toast 與完整頁面的詳細資訊面板。
- 9 px 的中文一行約 14–15 字，兩行約 28–30 字。W-A 全部 ≤ 22 字，兩行放得下；W-B 最長 28 字，在 131 px 寬度下剛好在邊緣。
- 顯示方式的選項：
  - **D1：維持單行截斷**。不改 CSS；點擊小卡看全文。代價是平常只看得到半句。
  - **D2：小卡最多兩行**（`-webkit-line-clamp: 2`）。改 `style.css` 一處；小卡高度可能增加約 11 px。要跑 PS-243 的 e2e（200% 縮放、44 px 操作區）確認版面。
  - **D3：每個 key 一短一長**。仍是同一份表，但每個 key 有小卡用的短句與全文。文案量加倍，每句都要使用者選定。
- 建議 **W-A＋D2**：
  - W-A 的長度在兩行內都放得下；
  - D2 讓首頁一眼看得到完整的一句，不必多維護一套短句。

## 5. 核准後的變更

- **新增** `pwa/js/personalSpace/v2/content/companionDialogue.js`：
  - `COMPANION_DIALOGUE`：凍結的 8 個 key 與選定的文字；
  - `getCompanionDialogue(key)`：找不到 key 時回傳 `companion.observe` 的文字。
    - 這會改變一個行為：目前未知的 key 會原樣顯示 `dialogueKey` 字串（`orbitWindow.js` 的 fallback 鏈）。
    - engine 只會產生這 8 個 key，所以實際上不會發生。
- **`ui/orbitWindow.js`**：刪除 `COMPANION_DIALOGUE_MESSAGES`，改用共用表。保留 `companion.message`／`companion.dialogue` 的覆寫順序，不改 renderer 的介面。
- **`pages/personalSpaceV2.js`**：刪除 `COMPANION_MESSAGES`；`message`、dock 與詳細資訊面板都改用共用表。
- **D2 時**：`style.css` 的 COMPANION 小卡文字改為最多兩行。
- **夥伴名稱**（若一併統一，見 §6 第 3 點）：
  - 名稱一起放進共用模組；
  - 首頁目前**一律**顯示 `Orbit Guide`，因為首頁的 view model 從不提供名稱，renderer 用預設值；
  - `personalSpace/assetRegistry.js` 的 `'Orbit Guide'` 是 legacy 資料、沒有被讀取，不需要改。
- **`sw.js`**：`SHELL` 加入新模組。`orbitWindow.js` 從 `app.js` 靜態可達，`serviceWorkerShell.test.js` 會檢查。
- **測試**：
  - 共用表的 8 個 key 與 telemetry 的 dialogue `interactionKey` 允許清單一致。允許清單目前在 `telemetry.js` 私有的 `EVENT_SCHEMAS` 裡，要嘛把清單匯出成常數，要嘛只驗證「每個 key 都能送出」（只能證明是子集合）；建議匯出。
  - 同一個 view model，首頁小卡、toast、完整頁面的小卡、dock 與詳細資訊面板顯示相同的台詞。
  - 未知 key 回到 `companion.observe`。
  - 更新 §2 列出的既有斷言（`不用急` 等），依選定的文字調整。
- **版本**：`npm run bump -- patch`（使用者可見的文字與版面）；CHANGELOG 列出改變的句子。
- **asset baseline**：新檔案在 `js/personalSpace/v2/` 下，計入 V2 延遲載入預算（目前 277,660／307,200 bytes gzip，有空間）；版本號改變後也要重新產生。

## 6. 需要使用者決定

1. **文字**：W-A（首頁小卡版，建議）、W-A′（W-A，但 `complete` 的「這個房間」改為「這個空間」，與其他句子用字一致）、W-B（完整頁面版），或 W-C（逐句指定）。
2. **小卡顯示**：D2（最多兩行，建議）、D1（維持單行截斷），或 D3（一短一長）。
3. **夥伴名稱**（順帶發現，不在原任務內）：首頁一律顯示 `Orbit Guide`，完整頁面顯示「Orbit 夥伴」。建議一併統一為「Orbit 夥伴」；若不想擴大範圍，另立任務。
4. 是否接受 §5 的共用模組做法。

## 7. 驗收條件草稿（核准後寫入 tasks.md）

- 程式碼中只有一份 Companion 文案表；首頁小卡、toast、完整頁面的小卡、dock 與詳細資訊面板都從它取字。
- 8 個 key 的文字與使用者選定的完全相同。
- 同一個 view model，各位置顯示相同的台詞。
- 選 D2 時：390 px 與 1024 px 寬度下，選定的 8 句在小卡上完整顯示，不被截斷；PS-243 的 e2e 通過。
- lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
