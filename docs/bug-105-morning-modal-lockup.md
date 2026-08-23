# BUG-105 調查報告：跨日晨間 modal 卡死

> 建立日期：2026-08-04
> 調查版本：v1.23.0（`origin/main` @ c1db6e8）
> 狀態：**D-1 / D-3 已於 v1.23.1 修正**（分支 `fix/bug-105-morning-modal-lockup`，對應 tasks.md 的 BUG-105）。
> **D-2 / D-4 仍未處理**，追蹤於 tasks.md 的 BUG-106。修正內容見文末第七節。

---

## 一、使用者回報

> 「今天早上打開 APP 卡在問我今天睡得如何的畫面，怎麼按都沒反應，重開也是。但下午重開就好了。」

對應畫面為 `showMorningModal()` 的「☀️ 今天的狀態？」（😊 充沛 / 😐 普通 / 😴 疲憊），
定義於 [`pwa/js/dayCycle.js:310-344`](../pwa/js/dayCycle.js)。
它只在「跨日後第一次開啟 App」時出現，前面會先顯示昨日總結 `showDailyReport()`。

---

## 二、為什麼會變成「永久卡死」而不是單次失敗

這是所有後續缺陷共用的放大器，必須先理解：

1. **這兩個 modal 沒有任何逃生口。** `#daily-report-modal` 與 `#morning-modal` 都沒有關閉鈕、
   沒有點背景關閉、沒有 ESC、沒有逾時。相較之下 `forgot-pw-modal`
   （[`pwa/js/authFlow.js:66-68`](../pwa/js/authFlow.js)）兩者都有。
2. **「今天已經問過了」的狀態只在 click handler 整段跑完後才寫入。**
   `state.energy.lastResetDate` 由 `resetEnergyIfNewDay(ms)` 更新，而它排在 handler 的第 4 行。
3. **modal 掛在 `document.body` 上，不在 `#main-app` 內。** 任何「隱藏 `#main-app`」的動作都清不掉它。

三者相加的結果：handler 只要在中途丟出任何例外，就會變成
**畫面不關 → 沒有任何錯誤提示 → 每次點擊重複同一個例外 → 重開 App 因狀態沒推進而完全重演**。
這正好是使用者描述的症狀。

---

## 三、缺陷清單

### D-1（已重現）晨間 modal 的 click handler 沒有錯誤處理，且把可能拋錯的寫入排在關閉之前

[`pwa/js/dayCycle.js:334-343`](../pwa/js/dayCycle.js)

```js
modal.querySelectorAll('.morning-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const ms = btn.dataset.state;
    state.user.morningState = ms;   // state.user 為 null → TypeError
    storage.saveUser(state.user);   // localStorage 寫入失敗 → throw
    modal.remove();                 // ← 前面一炸就永遠跑不到
    resetEnergyIfNewDay(ms);
    renderPage(currentHash());
  });
});
```

整段沒有 `try/catch`，也沒有任何失敗回饋。

**重現方式**（Playwright，本機 `node pwa/server.cjs`）：
以 `energy.lastResetDate = 昨天` 的快取使用者開啟 App，點掉日報後，
在點擊 `.morning-btn` 前讓 `localStorage.setItem('yoyo_user', …)` 丟 `QuotaExceededError`。

| 觀測項 | 正常 | 寫入失敗 |
|---|---|---|
| 點擊後 `#morning-modal` 數量 | 0 | **1（畫面不關）** |
| 使用者可見的錯誤訊息 | — | **無** |
| console | 乾淨 | `pageerror: quota` |

#### D-1a 觸發來源：`localStorage` 寫滿

[`pwa/js/storage.js:26-28`](../pwa/js/storage.js) 的 `set()` 沒有 `try/catch`：

```js
function set(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
}
```

localStorage 額度約 5 MB，而目前存放的內容包含 base64 背景圖（`yoyo_bgImage`，
可達數 MB）、歷年 `yoyo_sessions`、排行榜快取、Personal Space V2 狀態、
owner-scoped pending 快照。長期使用會逼近上限，且 `set()` 是所有寫入的唯一入口。

#### D-1b 觸發來源：`state.user` 變成 `null`

- [`pwa/js/personalSpace/v2/controller.js:563`](../pwa/js/personalSpace/v2/controller.js)
  的 `refreshCanonicalStateAndReconcilePersonalSpaceV2()` 會把 `centralState.user`
  直接重設為 `storageApi.getUser()`，boot 期間會被呼叫多次。
- [`handleSignOut()`（`pwa/js/app.js:239-261`）](../pwa/js/app.js) 會設 `state.user = null`、
  執行 `storage.clearAll()`，並把 `#main-app` 加上 `hidden` — 但 **modal 在 `document.body` 上，會留在畫面**。
- refresh token 過夜失效時 Supabase 會送 `SIGNED_OUT`
  （[`pwa/js/app.js:352-354`](../pwa/js/app.js)），因此上述情境在「早上第一次開」特別容易發生。

> 註：D-1b 為靜態分析結論，尚未實機重現；D-1 的卡死機制本身已重現。

---

### D-2（已重現）單次啟動可能執行兩次 `bootWithLocalState()`，導致 modal 疊層

[`bootWithLocalState()`（`pwa/js/app.js:177-186`）](../pwa/js/app.js) 有兩條呼叫路徑：

- 路徑 A：`init()` 的快取使用者分支（[`pwa/js/app.js:367`](../pwa/js/app.js)）
- 路徑 B：`onAuthStateChange('SIGNED_IN')` → `loadAndStart()`（[`pwa/js/app.js:235`](../pwa/js/app.js)）

路徑 B 的守門條件是 `_currentSession?.user?.id !== session.user.id`，
而 `_currentSession` 是在 `getSession().then(...)`（[`pwa/js/app.js:375`](../pwa/js/app.js)）內才被賦值。
**當 `SIGNED_IN` 早於 `getSession()` resolve 時（token 需要 refresh、網路慢、PWA 由背景恢復），
`_currentSession` 仍是 `null`，路徑 B 會再跑一次完整 boot。**

實測（在 `bootWithLocalState()` 暫時加入 trace 後）確認同一次啟動出現兩次呼叫：

```
[trace] bootWithLocalState energy= {"lastResetDate":"2026-08-03"} eToday= 2026-08-04
[trace] bootWithLocalState energy= {"lastResetDate":"2026-08-04"} eToday= 2026-08-04
```

若第二次 boot 落在使用者還沒點掉第一個 modal 的空檔（遠端同步通常 0.3–3 秒，
正好是使用者閱讀日報的時間），畫面上就會有兩層 `#daily-report-modal` / `#morning-modal`。

---

### D-3（靜態分析）modal 用全域 `document.getElementById` 綁事件，疊層時會綁錯按鈕

[`pwa/js/dayCycle.js:302`](../pwa/js/dayCycle.js)

```js
document.body.appendChild(modal);
document.getElementById('rpt-next-btn').addEventListener('click', …);
```

`document.getElementById` 在 id 重複時只回傳 **DOM 順序中的第一個**。
搭配 D-2 的疊層，事件會綁到被壓在下面那個（看不見的）modal，
**使用者看到的最上層「☀️ 開始新的一天」按鈕完全沒有 listener，按下去必定沒反應**。

同樣寫法也出現在 `showStreakUnlockModal()` 的 `su-close-btn`
（[`pwa/js/dayCycle.js:170`](../pwa/js/dayCycle.js)）。

`showMorningModal()` 用的是 scope 過的 `modal.querySelectorAll('.morning-btn')`，
不受 D-3 影響；但在 D-2 疊層下，第一次點擊只關掉上層、露出下層一模一樣的 modal，
使用者同樣會判定為「沒反應」。

---

### D-4（靜態分析）Supabase client 於 runtime 從 CDN 載入且未鎖版本

[`pwa/js/supabase.js:1`](../pwa/js/supabase.js)

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

`@2` 為浮動版本。驅動 D-2 的 auth 事件行為（`SIGNED_IN` / `TOKEN_REFRESHED` /
`INITIAL_SESSION` 的送出時機與名稱）在 2.x 各版本間有差異，
**可能在完全沒有改動本 repo 程式碼的情況下改變 boot 行為**；CDN 異常時整個 App 也無法啟動。
非本次事故的直接成因，但屬同一區域的風險，一併記錄。

---

## 四、無法確定的部分

早上實際觸發的是 D-1（寫入/null 例外）還是 D-2 + D-3（疊層綁錯按鈕），
**無法從程式碼回推判定** — 兩者的使用者可見症狀完全一致。

「下午重開就好了」與兩種成因都相容：只要任何一次啟動的時序或儲存空間狀況不同而順利點過，
`energy.lastResetDate` 就推進到當天，當日不會再詢問。

---

## 五、修法提案

依「先解除卡死，再處理根因」排序：

| # | 項目 | 檔案 | 風險 |
|---|---|---|---|
| 1 | 晨間 modal 與日報 handler 加 `try/catch`，**先 `modal.remove()` 再寫入**，失敗改用 `showToast` 回饋 | `dayCycle.js` | 低 |
| 2 | `set()` 加 `try/catch`，配額不足時回傳失敗而非 throw；呼叫端據以提示 | `storage.js` | 低 |
| 3 | `showDailyReport` / `showStreakUnlockModal` 改用 `modal.querySelector(...)` | `dayCycle.js` | 低 |
| 4 | 兩個 modal 進場前先 `document.getElementById(id)?.remove()`，避免疊層 | `dayCycle.js` | 低 |
| 5 | `handleSignOut()` 一併清除 `document.body` 上殘留的 `.modal-overlay` | `app.js` | 低 |
| 6 | 收斂 `bootWithLocalState()` 的重複執行（boot 完成旗標或提前設定 `_currentSession`） | `app.js` | **中**（動到 auth boot 路徑，需獨立驗證） |
| 7 | 補跨日啟動的 E2E 覆蓋 | `tests/e2e/` | 低 |
| 8 | 評估把 Supabase client 鎖版並改為 vendored（比照 `pwa/vendor/pixi.js`） | `supabase.js`、`sw.js` | **中**（需同步 SHELL 清單與 bump 流程） |

1–5 對應 tasks.md 的 **BUG-105**，6–8 對應 **BUG-106**。

---

## 六、既有測試為何沒抓到

跨日啟動流程（日報 + 晨間 modal）目前 **完全沒有 E2E 覆蓋**。
[`tests/e2e/support/seed.js:13-15`](../tests/e2e/support/seed.js) 的共用 fixture 刻意用
`newDayHour: 0` 讓 `effectiveToday(0)` 恆等於 `today()`，以避免 CI 在 UTC 05:00 前跳出日報 modal：

```js
// newDayHour:0 → effectiveToday(0) always equals today(); prevents the
// daily-report modal from appearing when CI runs in UTC before 05:00 local.
newDayHour: 0,
```

這個選擇對既有測試是合理的，但副作用是整條 boot 路徑從未被執行過。
修正時應新增獨立 fixture（`energy.lastResetDate = 昨天`）專門覆蓋此流程。

---

## 七、v1.23.1 實際修正內容

對應 tasks.md 的 **BUG-105**，涵蓋 D-1、D-1a、D-1b、D-3。

| 修正 | 檔案 |
|---|---|
| 晨間 modal handler：先 `modal.remove()` 再寫入，全段包 `try/catch`，`state.user` 為 null 時直接返回 | `pwa/js/dayCycle.js` |
| `set()` 改為回傳 `boolean` 並 `console.error`，不再 throw；`saveUser` / `saveEnergy` 透傳結果 | `pwa/js/storage.js` |
| 寫入失敗時以 `showToast` 明確告知「已套用但無法存到這台裝置」 | `pwa/js/dayCycle.js` |
| 新增 `mountModal()`：掛載前先移除同 id 殘留節點 | `pwa/js/dayCycle.js` |
| 日報／連勝解鎖 modal 改用 `modal.querySelector()` 綁定 CTA | `pwa/js/dayCycle.js` |
| 新增並在 `handleSignOut()` 呼叫 `clearDayCycleModals()`，清除 `body >` 層級的殘留 overlay（靜態 shell 的 `#focus-duration-picker` 在 `#app` 內，不受影響） | `pwa/js/dayCycle.js`、`pwa/js/app.js` |

### 順帶修正（同一流程內的既有缺陷）

選擇今日狀態後未呼叫 `updateHeader()`，header 的精力值會停在前一天的數字，直到其他操作剛好觸發重繪。
只有 `ui/header.js` 會寫入 `#hdr-energy-text`，`renderPage()` 不會。此問題由新增的 E2E 斷言揭露，一併修正。

### 測試

- `tests/unit/dayCycle.test.js`（10 項，jsdom）— 鎖住「寫入成功／寫入回報失敗／寫入拋錯／已登出」四種情況下 modal 都會關閉，
  以及 CTA 綁在自己的 modal 上、同 id 不疊層、`clearDayCycleModals()` 不誤刪靜態 shell 節點
- `tests/e2e/day-cycle-boot.test.js`（3 項）— 跨日啟動完整流程、重開不再重複詢問、寫入失敗時仍可離開並看到提示、
  登出時 overlay 不殘留

### 尚未處理

- **D-2**（單次啟動重複執行 `bootWithLocalState()`）：`mountModal()` 讓疊層不再造成卡死，但**重複 boot 本身仍存在**，
  仍會重複跑 `processYesterdayStreak()` / `checkWeeklyBonus()` 等副作用。屬 BUG-106。
- **D-4**（Supabase client 未鎖版本）：屬 BUG-106。
- `saveBgImage()`（`storage.js`）直接呼叫 `localStorage.setItem` 而未經 `set()`，仍會在配額不足時拋錯；
  base64 背景圖正是最容易撐爆配額的資料，建議一併納入 BUG-106 或另開票處理。
