# PS-249 提案：其他 overlay 蓋住首頁時的 Orbit Window

> 狀態：**已核准**（2026-10-23）。使用者的 §6 決定：R-A＋重播、P1、導覽算被蓋住、佐證大圖加 class、個人空間頁也套用、不延後第一次掛載。實作見 `tasks.md` 的 PS-249A。

## 1. 結論

- INFRA-106 只在 Focus overlay 開啟時暫停 Pixi 場景。其他蓋住首頁的 overlay 有兩個問題，都已在實際 app 中量到（§2）：
  1. **Session 結束後的 reveal 大多在 overlay 底下播完，使用者看不到**（§3.2）：
     - 結算後 reveal 立刻開始（`medium` 4.2 秒、`major` 6 秒）。
     - 升級時 0.6 秒後出現升級畫面（85% 黑）；0.7 秒後出現佐證 sheet（55% 黑＋模糊）。只有 `invalid` 不出現，所以幾乎每次都有。
     - 4.2 秒的 reveal 約有 3.6 秒在底下播放，接著被標記為已看過，**不會重播**。
     - 這正是「Session → 世界改變」的回饋時刻。
     - 每天第一次開啟時的日報與早晨 modal 底下，也會播放還沒看過的 reveal。
  2. **場景在這些 overlay 底下照常每格重畫**（§3.4）：
     - 量測環境中，首頁在 modal、升級畫面底下的 CPU 與沒有 overlay 時相同（每 5 秒約 16.4–16.9 CPU 秒）。在 Focus overlay 底下暫停時降到 1.2 秒，約少 93%。
     - 量測用的是軟體繪圖，絕對值不能代表實機；但「這些 overlay 底下不會比較省」與「暫停能省下大部分」這兩點成立。
- 另外，reveal 的 CSS 動畫不看計時（§3.3）：Orbit Window 不在可視區時動畫照播；`major` 的全螢幕橫幅（`position: fixed`）在 Orbit Window 不在可視區時也會蓋滿畫面。
- 建議（§4、§5）：
  - **一個「被蓋住」的判斷**（C1）：以 `MutationObserver` 觀察 `body` 的直接子元素與常駐 overlay 的 class。主要改 `orbitWindow.js`；佐證大圖（lightbox）沒有 class，需在 `proofSheet.js` 加一個（§4.1）。
  - **被蓋住時 reveal 暫停，關閉後從頭重播**（R-A，§4.2）：
    - 被蓋住、不在可視區、分頁隱藏時，計時與 reveal 的 CSS 動畫都暫停，`major` 橫幅隱藏（目前這三種情況都只有計時暫停，CSS 照播）。
    - 結算時 reveal 在 overlay 出現前已經播了 0.6–1 秒，所以 overlay 關閉後**從頭重播**，使用者才看得到完整的 reveal。
  - **被蓋住時暫停場景**（P1）：所有全螢幕 overlay 都暫停，沿用 INFRA-106 的 `suspend()`／`resume()`。
  - 不建議延後第一次掛載 Pixi（§4.4）：首頁在早晨 modal 關閉時會重新掛載，延後只是把初始化移到使用者看著的時候。
- 不新增 import／export（INFRA-105）。新舊版本混用時不會壞：舊的 `style.css` 下只有計時會等，動畫照舊（§4.2）；舊的 `proofSheet.js` 下大圖不被偵測，與現在相同。

## 2. 量測方式

- **程式碼**：
  - `pwa/js/personalSpace/v2/ui/orbitWindow.js`：`mountOrbitWindow()`、reveal clock、INFRA-106 的 Focus overlay 判斷；
  - `pwa/js/sessionFlow.js`：`commitSession()`、`offerProofSheet()`；
  - `pwa/js/focusTimer.js`、`pwa/js/ui/feedback.js`、`pwa/js/ui/proofSheet.js`、`pwa/js/dayCycle.js`、`pwa/js/tour.js`、`pwa/js/app.js`、`pwa/js/pages/home.js`；
  - `pwa/assets/style.css`。
- **瀏覽器**：本機 Chromium（headless、SwiftShader 軟體繪圖），430×932，沒有 reduced motion（另量一次 reduced motion 的時間線）。
- **時間線**：在頁面內以 `MutationObserver` 記錄：
  - Orbit Window 的 `is-revealing` 出現與消失；
  - 各 overlay 的出現與消失；
  - overlay 出現時，Orbit Window 中各 reveal 動畫的 `currentTime`（`getAnimations({ subtree: true })`）。
  - 流程與 `tests/e2e/flows.test.js`「首頁 Main Quest → Focus 結算 → 世界揭露」相同：Main Quest → Focus →「已完成」→ 30 分鐘 → 確認。
- **疊放順序**：在首頁的 Orbit Window 中放入 `major` 橫幅，開啟各 overlay，以 `document.elementsFromPoint()` 檢查畫面中央由上而下是哪些元素。
- **成本**：每種狀態量 5 秒，讀 `/proc` 中所有 Chromium 程序（renderer、GPU、browser）的 CPU 時間合計。另外以 CDP `Performance.getMetrics` 量 renderer 主執行緒的時間。UI 為 modern 外觀（modal 帶 8 px 模糊）。
  - 軟體繪圖把 GPU 的工作算在 CPU 上，所以絕對值遠高於實機，只能比較狀態之間的差別。
  - 主執行緒時間在各狀態都只有每 5 秒 30–110 ms：Pixi 每格的 JS 很少，成本在繪圖。
  - Reduced motion 時場景只畫一次（INFRA-106），不受 overlay 影響。
- 量測腳本在 session 的 scratchpad（`ps249/measure.test.js`、`ps249review/probe*.mjs`），不提交。

## 3. 現況

### 3.1 蓋住首頁的 overlay

| overlay | 來源 | 何時出現 | z-index | 背景 | 怎麼關 |
|---|---|---|---:|---|---|
| `#focus-overlay` | `focusTimer.js` | Focus 進行中 | 80 | 92% 黑 | 結束、縮小。**INFRA-106 已暫停場景** |
| `#levelup-overlay` | `ui/feedback.js` `showLevelUp()` | `commitSession()` 後 600 ms，若升級 | 100 | 85% 黑 | 使用者按關閉 |
| `.modal-overlay` | 多處，見下 | 見下 | 50（Focus 中的確認為 200） | 65% 黑；modern 外觀 72%＋8 px 模糊 | 各自的按鈕 |
| `.pro-sheet-overlay`＋`.pro-sheet` | `ui/proofSheet.js` `showProofSheet()`（佐證）、`pages/settings.js`（Pro 介紹） | 佐證：每次 Session（即時任務也是；計時 Session 結果為無效時除外），`commitSession()` 後 700 ms 加上載入 `proofCapture.js` | 150、sheet 500 | 55% 黑＋3 px 模糊；sheet 蓋住下半部 | 跳過、確認、點背景；淡出 300 ms 後才移除 |
| 佐證大圖（lightbox） | `ui/proofSheet.js` `showProofLightbox()` | 點首頁最近 Session 的佐證縮圖 | 600 | 88% 黑 | 點一下；**只有 inline style，沒有 class 或 id** |
| `.shield-confirm-overlay` | `dayCycle.js` `dismissStreakShield()` | 放棄連勝保護卡前的確認（「確定放棄保護卡？」） | 9998 | 55% 黑 | 取消、確認 |
| `.tour-backdrop`＋`.tour-spot` | `tour.js` | 新使用者的導覽 | 9000、9001 | 聚光燈以外 72% 黑（`.tour-spot` 的 box-shadow）；置中步驟的背景 72% 黑 | 導覽結束 |

`.modal-overlay` 的來源：

- `focusTimer.js`：
  - 結果選擇（`#result-picker`）：Focus 結束時；此時 Focus overlay 已隱藏。
  - 提前結束確認、「已完成」確認：z 200，在 Focus overlay 之上。
- `dayCycle.js`：每天第一次開啟時的日報、早晨狀態，以及連勝解鎖。
- `pages/home.js`：任務細節、計劃說明（使用者主動開啟）。
- `index.html` 的 `#focus-duration-picker`（Pro 的 Focus 時長選擇）：開始 Focus 前出現。
  - 與其他 modal 不同，它**一直在 DOM 中**（在 `#app` 之內，不是 `body` 的直接子元素），以 `hidden` class 開關。
- `export.js`、`authFlow.js`、`titleBreathing.js`、`pages/settings.js`、`pages/profile.js`：不在首頁出現，或是使用者主動開啟。

除了 `#focus-duration-picker`，動態建立的 overlay 都直接加在 `body` 底下。

### 3.2 Session 結束後的時間線（量測）

從按下「已完成」的確認開始計時：

| 時間 | 事件 |
|---:|---|
| 0.15 s | `commitSession()` → `renderPage()`：首頁重畫，Orbit Window 帶著 reveal 掛載，`is-revealing` 出現，reveal 計時開始，送出 `reward_reveal_started` |
| 0.75 s | 升級畫面出現（`setTimeout(…, 600)`，這次有升級） |
| 0.86 s | 佐證 sheet 出現（`setTimeout(…, 700)`，加上載入 `proofCapture.js`；冷啟動時量到 1.25–1.38 s） |
| 4.43 s | reveal 結束（`medium`，4.2 秒），`onRevealConsumed` 把它從 state 中移除 |

- **Orbit Window 掛載時沒有被蓋住**：結果選擇與確認 modal 已移除、Focus overlay 已隱藏，升級畫面與佐證 sheet 都在之後才出現。
- 第一個 overlay 出現時，reveal 已播了約 0.7–1.05 秒：獎勵條的上升（0.48 秒）已播完，Companion 靠近（1.4 秒）播了一半以上，`major` 橫幅已到最深（6 秒中的 8%，約 0.48 秒）。
- 4.2 秒的 reveal 中，約 3.6 秒在升級畫面（85% 黑）與佐證 sheet 底下。
- Reduced motion 時 reveal 只有 0.5–1 秒：佐證 sheet 在 0.76 秒出現，`medium` 的 reveal 在 0.86 秒就結束。
- 被移除的 reveal 不會再播放（`home.js` 的 `onRevealConsumed` 重畫成沒有 reveal 的視窗）。之後只剩一行靜態的「最近的改變」。
- 量測時場景的狀態一直是 `ready`，沒有暫停。

在結算之前，結果選擇的 modal（65%，modern 外觀加模糊）蓋住首頁的這段時間，場景也照常重畫。Focus overlay 此時已經隱藏，所以 INFRA-106 已恢復播放。

### 3.3 Reveal 計時與畫面（程式碼）

- **計時**：reveal 計時（`syncRevealClock()`）只在分頁可見且 Orbit Window 在可視區時走，否則暫停並保留剩餘時間。它不看任何 overlay，包括 Focus overlay。
  - 「在可視區」來自與場景共用的 `IntersectionObserver`，`rootMargin: '160px'`（為了提早啟動場景）：Orbit Window 在畫面外 160 px 以內仍算在可視區，計時照走。`reward_reveal_started` 在計時第一次開始時送出（以 event id 去重）。
- **畫面**：reveal 的畫面由 markup 上的 class 決定：
  - `is-revealing`、`orbit-window--reveal-<kind>`；
  - 看得到的部分：獎勵條上升、進度條的光暈、`medium` 的外框（`.orbit-window-stage-wrap::after`），以及 `major` 的 `.orbit-window-major-reveal` 橫幅（`position: fixed`、`inset: 0`、z 1200、`pointer-events: none`，6 秒的 CSS 動畫，最深 86% 的深藍）；
  - 主角慶祝與 Companion 靠近的 CSS 動畫在 poster 上；Pixi 就緒後 poster 的透明度是 0，所以只在 poster 模式看得到。Pixi 場景中的慶祝動作由 ticker 驅動，場景暫停時也跟著停。
- **CSS 動畫從 markup 插入就開始**，不看計時，所以：
  - Orbit Window 不在可視區時，計時暫停，但上述動畫已經在看不到的地方播完；
  - `major` 橫幅是 fixed、蓋滿畫面，即使 Orbit Window 在可視區外也會立刻出現。
- **橫幅不會畫在 overlay 之上**：`.orbit-window` 設了 `isolation: isolate`，橫幅的 z 1200 只在 Orbit Window 之內有效。量測時，升級畫面、佐證 sheet、Focus overlay 與 `.modal-overlay` 都蓋在橫幅之上，橫幅只是被調暗；沒有 overlay 時橫幅在最上層。
- Reveal 的 CSS 規則用 `animation` 簡寫（會把 `animation-play-state` 重設為 `running`），選擇器的權重是 (0,3,0)；`medium` 的外框在 `::after` 上。

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

- **C1（建議）**：在 `orbitWindow.js` 判斷，不改各 overlay 開關的方式。
  - 沿用 INFRA-106 的 `MutationObserver`，判斷擴大成：
    - 一直在 DOM 中、以 `hidden` class 開關的 `#focus-overlay`、`#levelup-overlay`、`#focus-duration-picker`，有任一個沒有 `hidden`；
    - 或 `body` 的直接子元素中，有不帶 `hidden` 的 `.modal-overlay`、`.pro-sheet-overlay`、`.shield-confirm-overlay`、`.tour-backdrop`，或佐證大圖。
  - 不能只看「有沒有 `.modal-overlay`」：`#focus-duration-picker` 隱藏時也是 `.modal-overlay`，這樣判斷會一直算「被蓋住」，reveal 永遠不播。所以常駐的三個以 id 與 `hidden` 判斷，動態加入的只看 `body` 的直接子元素並排除 `hidden`。
  - 觀察 `body` 的子元素（`childList`，不含 `subtree`），以及常駐三者的 `class`（它們開關時 `body` 的子元素不變）。
  - **佐證大圖**只有 inline style，選擇器找不到它。建議在 `proofSheet.js` 加一個 class（例如 `proof-lightbox`）；舊版的 `proofSheet.js` 不加，大圖就不被偵測，與現在相同。另一個做法是不處理：大圖是使用者主動點開、很快關掉的。
  - **邊界情況**：
    - 導覽換到需要換頁的步驟時，先移除 backdrop，兩個 animation frame 之後才加回（`tour.js` `_showStep()`）。中間會短暫算成「沒被蓋住」，計時、telemetry 與場景會在恢復與暫停之間來回。所以「被蓋住 → 沒被蓋住」等兩個 animation frame 再生效；「被蓋住」立即生效。
    - 佐證 sheet 關閉後淡出 300 ms 才移除，這段時間仍算被蓋住。不另外看淡出的 class（`body` 子元素的 class 變化不在觀察範圍），reveal 晚 300 ms 開始。
  - 不改各 overlay 的擁有者的開關流程（`focusTimer.js`、`feedback.js`、`dayCycle.js`、`tour.js`……；`proofSheet.js` 只加 class），新舊版本混用時也不會有缺少的 export。
  - 新增 overlay 時要加入這份清單。以單元測試列出 `style.css` 中 `position: fixed; inset: 0` 的規則，提醒更新：
    - 需要排除不是 overlay 的規則：`[data-time-band] body::after`、`major` 橫幅本身、`.space-idle-overlay`、`.space-map-window`；
    - 這個檢查找不到只用 inline style 的 overlay（例如佐證大圖），也找不到 `.tour-spot`（以 box-shadow 調暗）。
- **C2**：各 overlay 開關時發出事件（例如 `orbit:overlay-open`／`close`）。
  - 比較明確，但要改八個以上的模組。
  - 舊版的模組不會發事件，計數會卡住（只開不關）。
  - 不建議。

### 4.2 Reveal 在被蓋住時

- **R-A（建議）**：被蓋住，與不在可視區、分頁隱藏一樣，稱為 **held**：
  - 計時暫停（`syncRevealClock()` 多看一個條件）。
  - **畫面也暫停**：Orbit Window 加上 `is-reveal-held` class。
    - CSS 以 `animation-play-state: paused` 暫停 reveal 的動畫。
      - 不能用 `.orbit-window.is-reveal-held *`：權重 (0,2,0) 低於 reveal 規則的 (0,3,0)，而且 `*` 不含 `::after`。
      - 要逐一寫出選擇器（含 `.orbit-window-stage-wrap::after`），放在 reveal 規則之後，或用 `!important`。
    - `major` 橫幅在 held 時隱藏（`visibility: hidden`）：Orbit Window 不在可視區或分頁隱藏時，不會再蓋滿畫面。
  - **Reveal 用自己的可視判斷**：另建一個 `rootMargin: 0` 的 `IntersectionObserver`（或等效的幾何檢查），只給 reveal 的計時與 held 使用。
    - 現有的 160 px 判斷保留給場景的啟動、暫停與恢復。
    - 若沿用 160 px 的判斷，Orbit Window 剛捲出畫面（160 px 以內）時，計時與動畫仍在走，`major` 橫幅仍蓋滿畫面，正是要修正的情況。
  - 動畫在暫停時插入，會停在第一格（量測確認；`major` 橫幅停在 0% 的透明度），恢復後從 0 開始。
  - **Overlay 關閉後怎麼繼續**（需要決定，§6.1）：
    - **重播（建議）**：被 overlay 蓋住時 reveal 還沒播完，overlay 關閉、Orbit Window 在可視區時就從頭播放。
      - 計時重設為完整長度；CSS 動畫倒回 0：對 `getAnimations({ subtree: true })` 設 `currentTime = 0`（Chromium 含 `::after`），或移除再加回 reveal 的 class。
      - 原因：結算時 Orbit Window 掛載時沒有被蓋住（§3.2），reveal 在 overlay 出現前已播了 0.6–1 秒。只「接續」的話，使用者關掉佐證 sheet 後看到的是 reveal 的後段；`major` 橫幅已到最深，會直接以最深的顏色出現、沒有淡入。
      - 只有被 overlay 蓋住時重播；不在可視區、分頁隱藏時仍接續（與現在的計時相同，只多了 CSS 暫停）。
      - `reward_reveal_started` 仍在第一次開始時送出一次（event id 去重）；`completed` 在重播結束後送出。
    - **接續**：從停下的地方繼續。實作最少，但結算後看到的是 reveal 的後段，如上。
    - 其他做法，不建議：
      - 由 `sessionFlow.js` 在結算前標記「接下來會被蓋住」，讓 reveal 一開始就 held：要改 `orbitWindow.js` 以外的流程，舊版的 `sessionFlow.js` 不會標記；
      - 掛載後等一小段時間再開始：佐證 sheet 的出現時間包含動態載入，冷啟動時超過 1.2 秒，等多久都不可靠。
  - 新舊版本混用時：舊的 `style.css` 沒有 `is-reveal-held` 的規則，動畫照舊播放，計時仍會等，也就是較早結束的畫面配較晚的「已看過」；不影響資料。
- **R-B**：Session 結束後延後 reveal 到佐證 sheet 與升級畫面都關閉。
  - 只處理結算這條路徑；日報、早晨 modal 等其他 overlay 仍會蓋住。
  - 不建議。
- **R-C**：維持現狀。

### 4.3 場景在被蓋住時

- **P1（建議）**：所有 §3.1 的全螢幕 overlay 都暫停場景（`suspend()`，與 INFRA-106 相同）。
  - 這些 overlay 底下的場景至少暗 55%，多半還模糊。場景的動作很小（上下 1.5–6 px、Companion 搖晃），暫停時看起來與播放時幾乎一樣。
- **P2**：只在 85% 以上的 overlay（升級畫面、佐證大圖）暫停。
  - 55–72% 的 modal 底下仍播放；成本只省一部分。
- **P3**：不暫停，只處理 reveal（R-A）。

### 4.4 延後第一次掛載（不建議）

- 每天第一次開啟時，`showMainApp()` 後立刻顯示日報與早晨 modal。此時 Orbit Window 已在可視區，Pixi 會初始化 WebGL、載入圖片並開始播放。
- 被蓋住時可以延後 `startRuntime()`，等 overlay 關閉再掛載；poster 先顯示。PS-211B 已確保畫好第一格才顯示 canvas，所以延後不會閃。
- 但早晨 modal 的按鈕會呼叫 `renderPage()`，首頁重新掛載；PS-211B 讓 Pixi app 跨掛載沿用。所以延後**不會省下**初始化，只是把它從 modal 底下移到使用者看著首頁的時候。
- 得到的是啟動時較少的競爭（日報、早晨 modal 出現時不同時初始化 WebGL）；代價是關閉 modal 後 canvas 較晚接手。P1 已經省下 modal 底下每一格的成本。
- 建議不做，除非實機量到啟動時卡頓。

### 4.5 個人空間頁

- `mountOrbitWindow()` 也用在個人空間頁（`personalSpaceV2.js`，完整世界模式，同樣有 `pendingReveal`）。C1、R-A、P1 在那裡也會生效。
- 建議兩邊一致，測試涵蓋兩種模式；也可以只在首頁的 Orbit Window 啟用（§6.5）。

## 5. 建議與拆分

一個實作任務 **PS-249A**：C1 ＋ R-A（重播）＋ P1。

- 改 `orbitWindow.js` 與 `style.css`；`proofSheet.js` 的佐證大圖加一個 class（§4.1）；加上測試，並調整一個現有的 e2e（§7）。
- 不改 state、reward、ledger 與 telemetry 的事件名稱；`sw.js` 只有版本號的 bump。
- Telemetry 的時間點：
  - 結算後的 `reward_reveal_started` 與現在相同（掛載時就送出，此時還沒被蓋住）；
  - 一開始就被蓋住（例如日報、早晨 modal 底下）時，`started` 會比現在晚，在 overlay 關閉後才送出；
  - `reward_reveal_completed` 在使用者真的看完時才送出。
  - 這是修正，不是改變語意。

## 6. 需要使用者決定

1. **Reveal**：
   - R-A：被蓋住、不在可視區、分頁隱藏時，計時與 CSS 動畫都暫停，`major` 橫幅隱藏（建議）；R-B 只處理結算後；R-C 維持現狀。
   - 選 R-A 時，overlay 關閉後：**重播**（建議，看得到完整的 reveal）或**接續**（只看得到後段）。
2. **哪些 overlay 暫停場景**：P1 全部（建議）、P2 只有 85% 以上、P3 不暫停。
3. **延後第一次掛載 Pixi**（§4.4）：建議不做。
4. **新使用者的導覽**：導覽（聚光燈以外 72% 黑）是否也算「被蓋住」。
   - 建議算：導覽的步驟都不指向 Orbit Window（header、任務卡、計劃卡、底部導覽、置中說明），導覽期間的 reveal 也看不清楚。
   - 導覽中會完成教學任務（即時任務，`completeInstant()`），一樣會結算並出現佐證 sheet；結算後的 reveal 會等導覽結束。
5. **範圍**：
   - `proofSheet.js` 的佐證大圖加一個 class，讓 C1 偵測得到（建議）；或不處理大圖。
   - C1、R-A、P1 也套用在個人空間頁的 Orbit Window（建議）；或只在首頁。

## 7. 驗收條件草稿（核准後寫入 tasks.md）

- **單元測試（`orbitWindow.js`）**：
  - 首頁剛掛載、只有隱藏的常駐 overlay（含 `#focus-duration-picker.hidden`）時，不算被蓋住，reveal 照常開始；
  - 開啟、關閉 `#focus-duration-picker`（只切換 class）時，判斷隨之改變；
  - 「沒被蓋住」等兩個 animation frame 才生效：移除再立刻加回 `.tour-backdrop` 時，計時與場景都不變。
- **單元測試（`orbitWindow.js`）**，對每種 overlay：
  - 開啟時計時暫停；
  - 關閉後依 §6.1：重播時計時重設為完整長度，接續時剩餘時間接續；
  - `is-reveal-held` 隨之加上、移除；
  - 場景依 P1／P2 暫停、恢復；
  - 混合情況：overlay 開著時離開可視區、分頁隱藏再回來；
  - Reveal 的可視判斷與場景的分開：只有 160 px 邊界內的觀察回報「在可視區」、`rootMargin: 0` 的回報「不在」時，reveal held、場景照常；
  - 首頁與個人空間頁兩種模式（依 §6.5）。
- **e2e**：
  - 重做 §3.2 的流程：
    - 佐證 sheet 與升級畫面開著時，reveal 不結束；
    - 兩者都關閉後，reveal 從頭播放（各 reveal 動畫的 `currentTime` 接近 0），播完後 state 中沒有 reveal。
    - 這會改變 `tests/e2e/flows.test.js`「首頁 Main Quest → Focus 結算 → 世界揭露」的順序：目前它在關閉佐證 sheet **之前**就等 reveal 結束、檢查 `pendingRewardReveals` 為空。改成先關閉佐證 sheet 再等 reveal 結束。這是預期的行為改變。
  - Held 時，Orbit Window 中每個 reveal 動畫（`getAnimations({ subtree: true })`，含 `::after` 與 `major` 橫幅）都是 `paused`，`currentTime` 不變。jsdom 的單元測試檢查不到這一點。
  - `major` reveal：Orbit Window 捲出可視區時，橫幅不可見、計時暫停，包括剛好捲出不到 160 px 時；捲回後才出現。
  - 場景在 overlay 底下的 `data-runtime-status` 是 `suspended`，關閉後回到 `ready`。
- **新舊版本混用**（INFRA-105）：
  - 舊的 `style.css`：只有計時延後，動畫照舊；
  - 舊的 overlay 模組：C1 不依賴它們；舊的 `proofSheet.js` 下大圖不被偵測，與現在相同。
- **Reduced motion**：reveal 的計時、暫停與重播相同（目前 0.5–1 秒）。

## 附錄：其他發現（不在本提案範圍）

- 結果選擇 modal 的 z 是 50，Focus overlay 是 80。Focus 結束時先隱藏 Focus overlay 再開 modal，所以沒有問題；提前結束確認與「已完成」確認另外設成 200。
- 連勝保護的放棄確認（z 9998）高於導覽（9000）。導覽期間不會出現，不影響。
