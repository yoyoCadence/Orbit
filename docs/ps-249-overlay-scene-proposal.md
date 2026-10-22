# PS-249 提案：其他 overlay 蓋住首頁時的 Orbit Window

> 狀態：**提案**（Mode A，只寫文件、不改程式碼），等待使用者決定 §6。

## 1. 結論

- INFRA-106 只在 Focus overlay 開啟時暫停 Pixi 場景。其他蓋住首頁的 overlay 有兩個問題，都已在實際 app 中量到（§2）：
  1. **Session 結束後的 reveal 大多在 overlay 底下播完，使用者看不到**（§3.2）：
     - 結算後 reveal 立刻開始（`medium` 4.2 秒、`major` 6 秒）。
     - 升級時 0.6 秒後出現升級畫面（85% 黑）；0.7 秒後出現佐證 sheet（55% 黑＋模糊）。只有 `invalid` 不出現，所以幾乎每次都有。
     - 4.2 秒的 reveal 約有 3.6 秒在底下播放，接著被標記為已看過，**不會重播**。
     - 這正是「Session → 世界改變」的回饋時刻。
     - `major` reveal 的全螢幕橫幅（z 1200）反而畫在升級畫面與佐證 sheet **之上**。
     - 每天第一次開啟時的日報與早晨 modal 底下，也會播放還沒看過的 reveal。
  2. **場景在這些 overlay 底下照常每格重畫**（§3.4）：
     - 量測環境中，首頁在 modal、升級畫面底下的 CPU 與沒有 overlay 時相同（每 5 秒約 16.4–16.9 CPU 秒）。在 Focus overlay 底下暫停時降到 1.2 秒，約少 93%。
     - 量測用的是軟體繪圖，絕對值不能代表實機；但「這些 overlay 底下不會比較省」與「暫停能省下大部分」這兩點成立。
- 建議（§4、§5）：
  - **一個「被蓋住」的判斷**（C1）：只改 `orbitWindow.js`，以 `MutationObserver` 觀察 `body` 的子元素與已知 overlay 的 class，不改各 overlay 的擁有者。
  - **被蓋住時暫停 reveal**（R-A）：計時暫停；reveal 的 CSS 動畫與 `major` 橫幅也暫停並隱藏，overlay 關閉後才開始或繼續。效果與目前「不在可視區、分頁隱藏」相同。
  - **被蓋住時暫停場景**（P1）：所有全螢幕 overlay 都暫停，沿用 INFRA-106 的 `suspend()`／`resume()`。
  - 可選：被蓋住時延後第一次掛載 Pixi（每天第一次開啟時，日報與早晨 modal 底下不必初始化 WebGL）。
- 新增的程式碼都在 `orbitWindow.js` 與 `style.css`，不新增 import／export（INFRA-105）。新舊版本混用時，維持現在的行為。

## 2. 量測方式

- **程式碼**：
  - `pwa/js/personalSpace/v2/ui/orbitWindow.js`：`mountOrbitWindow()`、reveal clock、INFRA-106 的 Focus overlay 判斷；
  - `pwa/js/sessionFlow.js`：`commitSession()`、`offerProofSheet()`；
  - `pwa/js/focusTimer.js`、`pwa/js/ui/feedback.js`、`pwa/js/ui/proofSheet.js`、`pwa/js/dayCycle.js`、`pwa/js/app.js`、`pwa/js/pages/home.js`；
  - `pwa/assets/style.css`。
- **瀏覽器**：本機 Chromium（headless、SwiftShader 軟體繪圖），430×932，沒有 reduced motion。
- **時間線**：在頁面內以 `MutationObserver` 記錄：
  - Orbit Window 的 `is-revealing` 出現與消失；
  - 各 overlay 的出現與消失。
  - 流程與 `tests/e2e/flows.test.js`「首頁 Main Quest → Focus 結算 → 世界揭露」相同：Main Quest → Focus →「已完成」→ 30 分鐘 → 確認。
- **成本**：每種狀態量 5 秒，讀 `/proc` 中所有 Chromium 程序（renderer、GPU、browser）的 CPU 時間合計。另外以 CDP `Performance.getMetrics` 量 renderer 主執行緒的時間。UI 為 modern 外觀（modal 帶 8 px 模糊）。
  - 軟體繪圖把 GPU 的工作算在 CPU 上，所以絕對值遠高於實機，只能比較狀態之間的差別。
  - 主執行緒時間在各狀態都只有每 5 秒 30–110 ms：Pixi 每格的 JS 很少，成本在繪圖。
  - Reduced motion 時場景只畫一次（INFRA-106），不受 overlay 影響。
- 量測腳本在 session 的 scratchpad（`ps249/measure.test.js`），不提交。

## 3. 現況

### 3.1 蓋住首頁的 overlay

| overlay | 來源 | 何時出現 | z-index | 背景 | 怎麼關 |
|---|---|---|---:|---|---|
| `#focus-overlay` | `focusTimer.js` | Focus 進行中 | 80 | 92% 黑 | 結束、縮小。**INFRA-106 已暫停場景** |
| `#levelup-overlay` | `ui/feedback.js` `showLevelUp()` | `commitSession()` 後 600 ms，若升級 | 100 | 85% 黑 | 使用者按關閉 |
| `.modal-overlay` | 多處，見下 | 見下 | 50（Focus 中的確認為 200） | 65% 黑；modern 外觀 72%＋8 px 模糊 | 各自的按鈕 |
| `.pro-sheet-overlay`＋`.pro-sheet` | `ui/proofSheet.js` `showProofSheet()`（佐證）、`pages/settings.js`（Pro 介紹） | 佐證：每次 Session（即時任務也是；計時 Session 結果為無效時除外），`commitSession()` 後 700 ms | 150、sheet 500 | 55% 黑＋3 px 模糊；sheet 蓋住下半部 | 跳過、確認、點背景 |
| `.shield-confirm-overlay` | `dayCycle.js` | 使用連勝保護前確認 | 9998 | 55% 黑 | 取消、確認 |
| `.tour-backdrop`＋`.tour-spot` | `tour.js` | 新使用者的導覽 | 9000、9001 | 聚光燈以外 72% 黑（`.tour-spot` 的 box-shadow）；置中步驟的背景 72% 黑 | 導覽結束 |

`.modal-overlay` 的來源：

- `focusTimer.js`：
  - 結果選擇（`#result-picker`）：Focus 結束時；此時 Focus overlay 已隱藏。
  - 提前結束確認、「已完成」確認：z 200，在 Focus overlay 之上。
- `dayCycle.js`：每天第一次開啟時的日報、早晨狀態，以及連勝解鎖。
- `export.js`、`authFlow.js`、`titleBreathing.js`、`pages/settings.js`：不在首頁出現，或是使用者主動開啟。

### 3.2 Session 結束後的時間線（量測）

從按下「已完成」的確認開始計時：

| 時間 | 事件 |
|---:|---|
| 0.15 s | `commitSession()` → `renderPage()`：首頁重畫，Orbit Window 帶著 reveal 掛載，`is-revealing` 出現，reveal 計時開始 |
| 0.75 s | 升級畫面出現（`setTimeout(…, 600)`，這次有升級） |
| 0.86 s | 佐證 sheet 出現（`setTimeout(…, 700)`） |
| 4.43 s | reveal 結束（`medium`，4.2 秒），`onRevealConsumed` 把它從 state 中移除 |

- 4.2 秒的 reveal 中，約 3.6 秒在升級畫面（85% 黑）與佐證 sheet 底下。
- 被移除的 reveal 不會再播放（`home.js` 的 `onRevealConsumed` 重畫成沒有 reveal 的視窗）。之後只剩一行靜態的「最近的改變」。
- 量測時場景的狀態一直是 `ready`，沒有暫停。

在結算之前，結果選擇的 modal（65%，modern 外觀加模糊）蓋住首頁的這段時間，場景也照常重畫。Focus overlay 此時已經隱藏，所以 INFRA-106 已恢復播放。

### 3.3 Reveal 計時與畫面（程式碼）

- **計時**：reveal 計時（`syncRevealClock()`）只在分頁可見且 Orbit Window 在可視區時走，否則暫停並保留剩餘時間。它不看任何 overlay，包括 Focus overlay。
- **畫面**：reveal 的畫面由 markup 上的 class 決定：
  - `is-revealing`、`orbit-window--reveal-<kind>`；
  - `major` 另有 `.orbit-window-major-reveal` 橫幅：`position: fixed`、`inset: 0`、z 1200、`pointer-events: none`，6 秒的 CSS 動畫，最深 86% 的深藍。
- **CSS 動畫從 markup 插入就開始**，不看計時，所以：
  - Orbit Window 不在可視區時，計時暫停，但主角慶祝、Companion 靠近與 `medium` 的外框動畫已經在看不到的地方播完；
  - `major` 橫幅是 fixed、蓋滿畫面，即使 Orbit Window 在可視區外也會立刻出現；
  - `major` 橫幅畫在升級畫面（100）、佐證 sheet（150／500）與 Focus overlay（80）之上，只低於導覽與連勝保護確認。
- **Pixi 的部分**：場景中主角與 Companion 的慶祝動作由 ticker 驅動，場景暫停時也跟著停。

### 3.4 成本（量測，軟體繪圖）

每種狀態 5 秒、所有 Chromium 程序合計的 CPU 時間：

| 狀態 | CPU（ms） | 場景 |
|---|---:|---|
| 首頁，沒有 overlay | 16,850 | 播放 |
| 首頁，`.modal-overlay`（modern，72%＋8 px 模糊） | 16,440 | 播放 |
| 首頁，升級畫面（85% 黑） | 16,820 | 播放 |
| 首頁，Focus overlay（INFRA-106） | 1,220 | 暫停 |
| 設定頁（沒有 Orbit Window） | 50 | — |

實機以 GPU 繪圖，數字會小很多。但 overlay 底下的場景仍每格重畫，也仍然耗電；模糊的 overlay 底下，每一格還要重算模糊。

## 4. 方案

### 4.1 怎麼知道「被蓋住」

- **C1（建議）**：只改 `orbitWindow.js`。
  - 沿用 INFRA-106 的 `MutationObserver`，判斷擴大成：
    - `#focus-overlay`、`#levelup-overlay` 沒有 `hidden`；
    - 或 `body` 之下有 `.modal-overlay`、`.pro-sheet-overlay`、`.shield-confirm-overlay`、`.tour-backdrop`。
  - 觀察 `body` 的子元素（`childList`），以及前兩者的 `class`。
  - 不改各 overlay 的擁有者（`focusTimer.js`、`feedback.js`、`dayCycle.js`、`proofSheet.js`、`tour.js`……），新舊版本混用時也不會有缺少的 export。
  - 新增 overlay 時要加入這份清單；以單元測試列出 `style.css` 中 `position: fixed; inset: 0` 的規則，提醒更新。
- **C2**：各 overlay 開關時發出事件（例如 `orbit:overlay-open`／`close`）。
  - 比較明確，但要改八個以上的模組。
  - 舊版的模組不會發事件，計數會卡住（只開不關）。
  - 不建議。

### 4.2 Reveal 在被蓋住時

- **R-A（建議）**：被蓋住，與不在可視區、分頁隱藏一樣：
  - 計時暫停（`syncRevealClock()` 多看一個條件）。
  - **畫面也暫停**：Orbit Window 加上 `is-reveal-held` class。
    - CSS 以 `animation-play-state: paused` 暫停 reveal 的動畫；
    - `major` 橫幅在 held 時隱藏（`visibility: hidden`），不會畫在 overlay 之上。
  - Overlay 關閉、Orbit Window 在可視區時，計時與動畫從停下的地方繼續。
  - 一開始就被蓋住（Session 結束時通常如此）時，動畫停在第一格；`major` 橫幅停在 0% 的透明度。所以使用者關掉佐證 sheet 後，看到完整的 reveal。
  - 順便修正兩件事：不在可視區時 CSS 動畫已經播完；`major` 橫幅在可視區外就出現。
  - 新舊版本混用時：舊的 `style.css` 沒有 `is-reveal-held` 的規則，動畫照舊播放，計時仍會等，也就是較早結束的畫面配較晚的「已看過」；不影響資料。
- **R-B**：Session 結束後延後 reveal 到佐證 sheet 與升級畫面都關閉。
  - 只處理結算這條路徑；日報、早晨 modal 等其他 overlay 仍會蓋住。
  - 不建議。
- **R-C**：維持現狀。

### 4.3 場景在被蓋住時

- **P1（建議）**：所有 §3.1 的全螢幕 overlay 都暫停場景（`suspend()`，與 INFRA-106 相同）。
  - 這些 overlay 底下的場景至少暗 55%，多半還模糊。場景的動作很小（上下 1.5–6 px、Companion 搖晃），暫停時看起來與播放時幾乎一樣。
- **P2**：只在 85% 以上的 overlay（升級畫面）暫停。
  - 55–72% 的 modal 底下仍播放；成本只省一部分。
- **P3**：不暫停，只處理 reveal（R-A）。

### 4.4 可選：被蓋住時延後第一次掛載

- 每天第一次開啟時，`showMainApp()` 後立刻顯示日報與早晨 modal。此時 Orbit Window 已在可視區，Pixi 會初始化 WebGL、載入圖片並開始播放。
- 被蓋住時可以延後 `startRuntime()`，等 overlay 關閉再掛載；poster 先顯示。PS-211B 已確保畫好第一格才顯示 canvas，所以延後不會閃。
- 省下的是 WebGL 初始化與第一次載入（實機約數十到一百多 ms，加上圖片解碼），使用者在 modal 底下也看不到。
- 代價：關閉 modal 後 canvas 晚一點才接手（poster 已經完整，看起來相同）。

## 5. 建議與拆分

一個實作任務 **PS-249A**：C1 ＋ R-A ＋ P1（＋可選的 §4.4）。

- 只改 `orbitWindow.js` 與 `style.css`，加上測試。
- 不改 `sw.js`、state、reward、ledger 與 telemetry 的事件名稱。
- `reward_reveal_started`／`completed` 會比現在晚，在使用者真的看得到時才送出。這是修正，不是改變語意。

## 6. 需要使用者決定

1. **Reveal**：R-A 被蓋住時暫停並延後（建議）、R-B 只處理結算後、R-C 維持現狀。
2. **哪些 overlay 暫停場景**：P1 全部（建議）、P2 只有 85% 以上、P3 不暫停。
3. **可選**：被蓋住時延後第一次掛載 Pixi（§4.4）：要或不要。
4. **新使用者的導覽**：導覽（聚光燈以外 72% 黑）是否也算「被蓋住」。
   - 建議算：導覽的步驟都不指向 Orbit Window（header、任務卡、計劃卡、底部導覽、置中說明），導覽期間的 reveal 也看不清楚。
   - 導覽中會開始教學任務的 Focus，結算後的 reveal 也會等導覽結束。

## 7. 驗收條件草稿（核准後寫入 tasks.md）

- **單元測試（`orbitWindow.js`）**，對每種 overlay：
  - 開啟時計時暫停；剩餘時間在關閉後接續；
  - `is-reveal-held` 隨之加上、移除；
  - 場景依 P1／P2 暫停、恢復；
  - 混合情況：overlay 開著時離開可視區、分頁隱藏再回來。
- **e2e**：
  - 重做 §3.2 的流程：佐證 sheet 與升級畫面開著時 reveal 不結束；關閉後才開始計時；結束後 state 中沒有 reveal。
  - `major` reveal 時，橫幅在 overlay 開著時不可見。
  - 場景在 overlay 底下的 `data-runtime-status` 是 `suspended`，關閉後回到 `ready`。
- **新舊版本混用**（INFRA-105）：
  - 舊的 `style.css`：只有計時延後，動畫照舊；
  - 舊的 overlay 模組：C1 不依賴它們。
- **Reduced motion**：reveal 的計時與暫停相同（目前 0.5–1 秒）。

## 附錄：其他發現（不在本提案範圍）

- 結果選擇 modal 的 z 是 50，Focus overlay 是 80。Focus 結束時先隱藏 Focus overlay 再開 modal，所以沒有問題；提前結束確認與「已完成」確認另外設成 200。
- 連勝保護確認（z 9998）高於導覽（9000）。導覽期間不會出現，不影響。
