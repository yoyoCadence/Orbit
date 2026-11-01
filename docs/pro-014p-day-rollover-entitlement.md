# PRO-014P 提案：`server` source 下，換日處理不再把「Pro 狀態不明」當成「不是 Pro」

> 狀態：提案（2026-11-01），只寫文件、不改程式碼。屬 entitlement 啟動流程，依 AGENTS.md §3 需使用者核准（§10）後才實作。擋 `PRO-014H` cutover。

## 1. 結論

- **問題**：
  - 換日處理 `processYesterdayStreak()`（`pwa/js/dayCycle.js`）中，有三件事看 `storage.isProUser()`：每月補滿保護卡、連勝歸零時的保護卡 offer、SUB-16 連勝解鎖。
  - 在 `server` source 下，`isProUser()` 只看 entitlement snapshot。snapshot 超過 24 小時（`SNAPSHOT_TTL_MS`）就讀成「不是 Pro」。
  - 回訪的使用者走 cached-user 路徑：**先換日、後在背景 refresh**（`pwa/js/app.js` 的 `init()`）。
  - 「漏了一天」的情況，上一次 refresh 一定在 24 小時以前（§2.2）。所以**在 `server` source 下，回訪的付費使用者幾乎不可能拿到保護卡 offer**。這不是邊界情況，而是主路徑。
  - `lastStreakDate` 已經推進，之後 refresh 成功也不會補做（§3 實測）。
- **另一個既有缺陷（本提案一併處理）**：
  - `refreshProEntitlement()` 的註解說「網路失敗（throw）保留 snapshot」，但 repo 內的 Supabase client 遇到網路失敗**不會 throw**，而是回傳 `{ error, status: 0 }`（§3 實測）。
  - 結果：refresh 時網路斷一下，snapshot 就被刪除，付費使用者立刻變成非 Pro。既有測試以 `throw` 模擬網路失敗，所以沒有抓到。
- **建議（方案 D，§4）**：
  - 連勝照常計算（與 Pro 無關）。
  - 補卡與 offer 在狀態不明時記成一筆「待補做」，等下一次取得權威結果時補做一次。
  - SUB-16 在狀態不明時直接略過（不消耗 `streakUnlockUsed`）。`PRO-014L` 會把它移出換日、改由 server 判斷資格（§8），所以這裡不為它設計延後機制。
  - `legacy` source（目前的 production）下狀態永遠已知，不會產生待補做，**行為不變**。
  - 不需要 tasks.md 原方向（方案 T）的「延後整個換日、依日期重播」與訪客標記。
- **這會改寫 tasks.md 的「方向」與「完成條件」**（§7 列出原文與改寫），需要你同意。

## 2. 問題細節

### 2.1 依賴 Pro 的三件事

| 位置（`processYesterdayStreak()`） | 條件 | snapshot 過期時（被當成非 Pro） |
| --- | --- | --- |
| 每月補滿保護卡 | `isProUser()` 且月份變了 → `streakShieldCount = 2` | 不補。同一個月之後有一次狀態已知的換日才補；整個月都過期就整個月不補 |
| 歸零時的保護卡 offer | 漏了一天、`isProUser()`、保護卡 > 0、`prevStreak >= 2` → 寫入 `orbit_shield_pending` | **永久遺失**：`prevStreak` 只存在這一刻，`lastStreakDate` 推進後不會再判斷 |
| SUB-16 連勝解鎖 | `streakDays >= 45`、`!isProUser()`、`!streakUnlockUsed` → client 寫 `isPro`、`proExpiresAt`（+30 天）、`streakUnlockUsed = true` | 付費使用者被當成非 Pro：一次性的 `streakUnlockUsed` 被用掉，看到「解鎖 30 天 Pro」的 modal。終身付費者 profile 的 `proExpiresAt` 被改成 30 天後（`server` source 不讀這個欄位，但資料被改壞） |

連勝本身的計算（`processStreakForDate()`、漏一天歸零）與 Pro 無關。

### 2.2 為什麼漏了一天時 snapshot 幾乎一定過期

- 漏一天＝`lastStreakDate` 早於昨天（以 `newDayHour` 劃分的有效日期）。也就是昨天整天沒有啟動過 app（換日只在啟動時跑一次，`bootSequenceGuard`）。
- refresh 也只在啟動、連線恢復時跑。上一次啟動最晚在前天的有效日期結束前，這次最早在今天的有效日期開始時，相隔至少 24 小時，所以 `nowMs - fetchedAtMs >= SNAPSHOT_TTL_MS` 成立。
- 例外只有：頁面跨日一直開著、期間觸發過連線恢復同步（`_syncAfterReconnect`）；或遇到 23 小時的夏令時間日。

### 2.3 啟動順序

| 路徑 | 順序 | 換日時的 snapshot |
| --- | --- | --- |
| cached-user（`init()`，回訪使用者的主路徑） | `bootWithLocalState()`（換日）→ 背景 `_loadRemote()` → `refreshProEntitlement()` | 上一次 refresh 留下的，常常已過期 |
| `loadAndStart()`（首次登入、登出後再登入） | `_loadRemote()` → `refreshProEntitlement()` → 換日 | 剛 refresh 的；但 `_loadRemote()` 失敗時跳過 refresh；refresh 遇到網路失敗時 snapshot 被刪（§1 的既有缺陷） |
| `_syncAfterReconnect()` | refresh → 重新載入 state → render | 不跑換日 |

## 3. 實測（2026-11-01，以 repo 的真實模組在 vitest／Node 中執行，測試檔已刪除）

**換日（`processYesterdayStreak()`，`server` source，終身付費、`prevStreak = 10`、保護卡 2 張、漏了一天）**：

| snapshot | 換日後連勝 | `orbit_shield_pending` | `lastStreakDate` |
| --- | --- | --- | --- |
| 剛取得（< 24h） | 0 | `{"prevStreak":10}` | 今天 |
| 過期（> 24h） | 0 | `null` | 今天 |
| 過期，換日後 refresh 成功 | 0 | `null`（`isProUser()` 已是 true，但 offer 不會回來） | 今天 |

**Supabase client 的錯誤形式（`pwa/vendor/supabase.js`，以自訂 `fetch` 呼叫 `rpc('my_pro_status')`）**：

| `fetch` 的行為 | `rpc()` 的結果 |
| --- | --- |
| reject（`TypeError: Failed to fetch`，即離線） | **不 throw**，回傳 `{ status: 0, error: { message: 'TypeError: Failed to fetch' }, data: null }` |
| HTTP 500 | 回傳 `{ status: 500, error: { code: 'XX000', … } }` |

- 逾時（`AbortError`）走同一個 catch，也是 `status: 0`。
- `rpc()` 用 POST，client 只重試 GET／HEAD／OPTIONS，所以不會重試。

**`db.refreshProEntitlement()`（`server` source，終身付費的 snapshot 剛取得）**：

- RPC 回傳 `{ status: 0, error }` 一次之後，snapshot 被刪除，`isProUser()` 由 true 變成 false。
- 原因是 `applyProStatusResponse()` 把任何 `error` 都當成權威的「清除」。
- `tests/unit/proEntitlementGate.test.js` 的「網路失敗（throw）保留既有 snapshot」以 `mockRejectedValueOnce` 模擬。真實 client 不會走到那條路。

## 4. 方案

三個方案都先需要同一個判斷：換日當下 Pro 狀態是 `pro`、`not-pro` 還是 `unknown`（§6.1）。差別在 `unknown` 時做什麼。

### D：連勝照常，補卡與 offer 延後補做（建議）

- 連勝照常計算、照常歸零，`lastStreakDate` 照常推進。與 Pro 無關的部分完全不變。
- `unknown` 時：
  - 不補卡、不給 offer，改寫入一筆 owner-scoped 的待補做紀錄（含歸零前的連勝，若這次換日有歸零）。
  - SUB-16 直接略過，不消耗 `streakUnlockUsed`、不記錄。之後狀態已知的換日若仍符合條件就照常發放。
- 下一次取得權威結果時補做一次：先補卡，再判斷 offer，與現在的順序相同。
- 好處：
  - 不改連勝引擎，不需要依日期重播。
  - 永遠拿不到權威結果時（例如殘留的 `FLAG_DEV_BACKUP`、儲存寫入失敗），連勝不會被凍結。最壞結果是：
    - 拿不到補卡與 offer，與不是 Pro 相同；
    - 也拿不到 SUB-16，不是 Pro 的使用者原本會拿到。但 `server` source 下 client 寫入的 SUB-16 本來就沒有效果，`PRO-014L` 之後改由 server 判斷，所以實際權益不受影響。
  - 訪客有本機 `uid()` 產生的 `user.id`、沒有 snapshot，所以是 `unknown`。待補做永遠不會被補做，SUB-16 也不發放。`server` source 下訪客沒有 server entitlement，client 寫入的 SUB-16 沒有效果，`PRO-014L` 的 RPC 也需要登入。所以**不需要新增訪客標記**，但「訪客視為 `not-pro`」改為「訪客是 `unknown`」（§7）。
  - `refreshProEntitlement()` 的回傳值不必改：補做時直接從剛寫入的 snapshot 判斷狀態，與換日用同一個函式。
- 代價：
  - 補做時用的是「補做當下」的 Pro 狀態，不是歸零那一刻的。正常情況兩者相隔幾秒（背景 refresh）；只有長時間離線、期間 Pro 狀態剛好改變時才會不同。
  - 歸零後到補做前的幾秒，畫面顯示連勝 0、還沒有保護卡橫幅；補做後重新 render 才出現。

### T：延後整個換日，依日期重播（tasks.md 原方向）

- `unknown` 時整個換日延後，不推進 `lastStreakDate`，記錄待處理日期；取得權威結果時依序重播每一天。
- 問題：
  - **連勝被凍結**：狀態不明期間顯示舊的連勝，每日報告也是舊的。
  - **要改連勝引擎**：
    - 現在只會「評估昨天」或「漏了就歸零」。不推進 `lastStreakDate` 的話，隔天的換日會看到漏了一天而歸零。
    - 所以必須新增依日期重播的邏輯，而且要完全重現「沒有啟動＝漏一天」的現有語意。
    - 這會改到所有 `server` source 使用者與 Pro 無關的行為。
  - **永遠 `unknown` 時連勝永遠不動**（殘留的 `FLAG_DEV_BACKUP`、寫入失敗、沒有標記的訪客）。
  - 需要新增訪客標記（tasks.md 已註明）、`refreshProEntitlement()` 改回傳 `{ status }` 並更新呼叫端。
- 相對 D 的好處：只有「歸零與 offer 同時出現」這一點。重播時用的也是重播當下的狀態，這一點與 D 相同。

### S：cached-user 啟動先等 refresh 再換日（不建議）

- 讓回訪使用者的開機等網路，違反 offline-first 的立即開機。
- 離線或 refresh 失敗時仍需要 `unknown` 的處理，所以最後還是要做 D 或 T。

## 5. 建議

採用 **D**。理由：

1. 問題只在依賴 Pro 的事，D 只動它們；T 為了它們凍結並重寫與 Pro 無關的連勝。
2. 最壞情況：D 是「拿不到 Pro 才有的東西、但不浪費一次性解鎖」；T 是「連勝停住」。
3. D 少了訪客標記、日期重播、回傳值改版三項工作，測試面也小得多。

## 6. 核准後的實作（一個 PR）

### 6.1 狀態判斷：`pro`／`not-pro`／`unknown`

- `pwa/js/platform/proEntitlement.js` 新增 `getProStatusFromSnapshot(ownerId, nowMs)`。依序：
  - `unknown`：
    - 沒有 `ownerId`、寫入失敗的 latch、snapshot 不存在或無法解析、owner 不符；
    - 超過 `SNAPSHOT_TTL_MS`、時鐘倒退；
    - `isActive` 但到期日落在取得 snapshot 之後、現在之前：取得之後可能已在 server 續約，snapshot 無法回答。
  - `pro`：`isActive` 且未過 `entitlementExpiryMs()`。
  - `not-pro`：其餘，也就是 `isActive: false`，或取得時就已過期。
- `isProFromSnapshot()` 改為 `getProStatusFromSnapshot(...) === 'pro'`，結果與現在相同（`unknown` 與 `not-pro` 都不是 Pro）。兩者共用一套規則，不會分歧。
- `storage.getProRolloverStatus()`：`legacy` source 回傳 `isProUser() ? 'pro' : 'not-pro'`（永遠已知）；`server` source 回傳上面的結果。

### 6.2 待補做紀錄

- 新 key `orbit_pro_rollover_pending`（`pwa/js/flags.js`），內容 `{ ownerId, prevStreak }`。`prevStreak` 是這次換日歸零前的連勝；沒有歸零或小於 2 時為 `null`。
- **每次 `unknown` 的換日都寫入**（沒有歸零時 `prevStreak` 為 `null`），因為補卡也靠這筆紀錄觸發。
- 同一個 owner 再一次 `unknown` 換日時合併：新的 `prevStreak` 不是 `null` 才取代（與現在 offer 只有一格、後來的覆蓋前面的相同）。**不同 owner 時整筆取代，`prevStreak` 不繼承**（否則 A 的連勝會交給 B，正是 BUG-115 的問題）。
- `ownerId` 與目前的 user 不符時忽略、不刪除（與 BUG-115 的方向一致，A 回來時仍可補做）；登出不刪除。只有一格：B 的 `unknown` 換日會覆蓋 A 的紀錄，A 延後的部分遺失，結果與現在相同。
- 裝置從本機覆寫的 `server` 回到 `legacy` 時，留下的紀錄會以 `legacy` 的判斷補做。
- 紀錄沒有期限：A 登出後隔了幾週才回來，延後的 offer 仍會補上。與現在 offer 放著不用的行為相同（§9「offer 放著不用」）。

### 6.3 換日

```js
export function processYesterdayStreak() {
  if (!state.user) return;
  resolvePendingProRollover();                  // 先補做之前延後的（狀態已知時）
  const todayStr = eToday();
  if (state.user.lastStreakDate === todayStr) return;
  const status = storage.getProRolloverStatus();
  // …連勝計算不變；歸零時記下 prevStreak…
  if (status === 'unknown') recordPendingProRollover({ prevStreak });
  else applyProOnlyRolloverEffects(status, { prevStreak });
  // SUB-16：只在 not-pro 時；unknown 略過、不消耗 streakUnlockUsed。PRO-014L 會整段移除（§8）。
  if (status === 'not-pro' && state.user.streakDays >= 45 && !state.user.streakUnlockUsed) { /* 現有的 client 寫入 */ }
  state.user.lastStreakDate = todayStr;
  storage.saveUser(state.user);
}
```

- `applyProOnlyRolloverEffects(status, { prevStreak })` 是補卡與 offer 的唯一實作，換日與補做共用：`pro` 時月份變了就補滿，`prevStreak >= 2` 且保護卡 > 0 就寫 offer；`not-pro` 什麼都不做。
- 補卡從「連勝計算之前」移到「之後」。連勝計算不讀保護卡數量，所以結果相同。
- `legacy` 下 `isProUser()` 讀的是儲存中的 user，原本三次呼叫之間儲存不變，所以改成只算一次，結果也相同。

### 6.4 補做

- `resolvePendingProRollover()` 依序：
  1. 讀紀錄；owner 不符就忽略。
  2. `getProRolloverStatus()` 仍是 `unknown` 就保留紀錄。
  3. 否則**先刪除紀錄、再套用** `applyProOnlyRolloverEffects()`。最多一次，寧可漏給也不重複給（同一個分頁內；多個分頁以舊的 `state.user` 互相覆蓋是既有的問題）。
  4. `saveUser()`。
- 補做只會改保護卡數量與 offer，兩者都在既有的重新 render 中顯示（首頁的橫幅與 🛡 讀 `orbit_shield_pending`）。SUB-16 不在補做之內，所以沒有「modal 只在 `showMainApp()` 顯示」的問題。
- 呼叫點：
  - `processYesterdayStreak()` 開頭（上面）。
  - `loadAndStart()`：setup／開機分支之前（`startTrial()` 重新讀取 `state.user` 之後、`hideLoading()` 之前）。
    - 更早的話，`state.user` 可能還是另一個帳號的快取（`!remoteLoaded && !hasCurrentOwnerCache` 會在後面返回）。
    - 也可能被 `startTrial()` 的重新讀取蓋掉。
    - BUG-106 的情況下第二次開機會跳過換日，cached-user 的背景同步也會因為 session 已存在而跳過，所以這裡要明確呼叫。
  - cached-user 的背景同步與 `_syncAfterReconnect()`：refresh 與 `loadStateFromStorage({ authoritative: true })` 之後、`renderPage()` 之前。

### 6.5 暫時性失敗不刪 snapshot

- `refreshProEntitlement()` 取用 `rpc()` 回傳的 `status`。以下視為暫時性失敗，與 throw 相同處理，保留 snapshot、回傳 `false`：
  - `status === 0`：網路失敗、逾時；
  - 408、429；
  - 5xx。
- 其他帶 `error` 的回應維持清除：401／403、RPC 不存在、契約不符。這些是權威的答案。例外：PostgREST 的 JWT 錯誤（`PGRST301`、`PGRST303`，例如 JWT 過期；也是 401）是 token 的問題，不是對 entitlement 的回答。裝置時鐘錯誤時它會每次出現，所以視為暫時性，由 `SNAPSHOT_TTL_MS` 限制保留的時間。snapshot 只是 UI 投影、不是安全邊界，所以暫時性錯誤時沿用 `SNAPSHOT_TTL_MS` 的 grace window 是它原本的用途。
- `legacy` 下 refresh 在呼叫 RPC 前就返回，所以沒有影響。
- 已知限制，不在這個 PR：`refreshProEntitlement()` 在 `_session()` 回傳 null 時清除 snapshot。Supabase client 換發 token 時遇到網路失敗也會回傳 null session，此時 UI 會失去 Pro，直到下次 refresh。在 D 之下換日仍安全（沒有 snapshot＝`unknown`）。要區分「已登出」與「換發失敗」需要檢查 auth 錯誤，另案處理。

### 6.6 使用保護卡

- `window.useStreakShield()` 在非 Pro 時直接 return、沒有任何回饋。狀態是 `unknown` 時改為顯示「目前無法確認 Pro 狀態，連線後再試一次」；`not-pro` 維持現狀。

### 6.7 測試

- **先寫 `legacy` 的特性測試，再重構**。目前沒有任何 unit test 執行 `processYesterdayStreak()` 的補卡、offer、SUB-16：`dayCycle.test.js` 不呼叫它，`appBootSequence.test.js` 把它 mock 掉。要先以重構前的程式碼鎖住以下四種結果，重構後同一組測試必須通過：
  - Pro／非 Pro × 歸零／延續；
  - 月份變化；
  - SUB-16 的三個條件；
  - 寫入的欄位。
- `tests/unit/proGateCallSites.test.js` 計算每個檔案的 `storage.isProUser()` 呼叫次數（`dayCycle.js` 4 次），並比對 SUB-16 寫入的原始字串；重構會改到這兩項，要同步更新登記表與比對。
- 狀態判斷：
  - `legacy` 的 pro／not-pro。
  - `server`：
    - 剛取得且有效 → pro；
    - `isActive: false`、取得時就已過期 → not-pro；
    - 取得後才到期、過期、不存在、owner 不符、寫入 latch、時鐘倒退、沒有 owner → unknown。
  - `isProFromSnapshot()` 的既有測試不變。
- 換日：
  - §3 的三列重跑，最後一列改為補做後出現 `{"prevStreak":10}`。
  - `unknown` 時連勝照常歸零、`lastStreakDate` 推進、不補卡、沒有 offer、不做 SUB-16、`streakUnlockUsed` 不變、寫入紀錄；沒有歸零的 `unknown` 換日也寫入紀錄。
- 補做：
  - `pro` → 補卡＋offer；`not-pro` → 沒有 offer、不補卡；仍是 `unknown` → 保留紀錄。
  - 補做兩次只給一次；owner 不符 → 忽略且保留；同一個 owner 的合併規則；不同 owner 時整筆取代、不繼承 `prevStreak`。
  - `loadAndStart()` 中補做的結果不被 `startTrial()` 的重新讀取蓋掉。
- 跨日：第一天 `unknown`、第二天才取得權威結果 → 第一天的 Sessions 在第二天的換日照常評估，第一天的待補做也被補上。
- refresh：
  - `{ status: 0, error }`、408、429、503 保留 snapshot；
  - 401、403、`PGRST202`（RPC 不存在）清除；JWT 錯誤的 401（`PGRST301`／`PGRST303`）保留；
  - `proEntitlementGate.test.js` 新增真實形式的案例，保留原本的 throw 案例。
- 呼叫點：`loadAndStart`、cached-user 背景同步、`_syncAfterReconnect` 在 refresh 之後呼叫補做（`appBootSequence.test.js` 的形式）。
- `legacy`：永遠不寫紀錄；特性測試不改即通過。
- `useStreakShield()`：`unknown` 時顯示提示、不改連勝。

## 7. 改寫 tasks.md 的「方向」與「完成條件」

### 7.1 「方向」

tasks.md 的 PRO-014P 原本的「方向」（全文）：

> - `refreshProEntitlement()` 改回傳可區分的結果 `{ status: 'pro' | 'not-pro' | 'unknown' }`。
> - 判定依序為：
>   - RPC 成功且 snapshot 寫入成功，依結果回 `pro` 或 `not-pro`；
>   - 否則若有 `SNAPSHOT_TTL_MS` 內的 snapshot，以它判定（離線 grace window）；
>   - 都沒有才是 `unknown`。
> - 從未登入過的訪客不會有 server entitlement，視為 `not-pro`。訪客也有本機 `uid()` 產生的 `user.id`，目前沒有訪客標記，實作需新增。曾登入的 owner 只是 session 暫時無法還原時，若也沒有 TTL 內的 snapshot，仍是 `unknown`。
> - 在 `server` source 下，換日處理（補卡、offer、SUB-16、推進 `lastStreakDate`）只在 `pro` 或 `not-pro` 時執行。
> - `unknown` 時整個換日處理延後：記錄**確切的待處理日期**（可能不只一天），不推進 `lastStreakDate`。得到權威結果時依序重播這些日期，各自依當天的 Sessions 判定，而不是只處理「新的昨天」。

採用 D 後：

1. **（刪除）** `refreshProEntitlement()` 回傳 `{ status }`：回傳值不變，狀態由 `getProStatusFromSnapshot()` 從 snapshot 判斷（§6.1）。
2. **（改寫）** 判定：以 TTL 內的 snapshot 判定，refresh 成功就是剛寫入的 snapshot。另外新增「取得後才到期 → `unknown`」。
3. **（改寫）** 訪客：從 `not-pro` 改為 `unknown`；不新增訪客標記（§4 D 的理由）。
4. **（改寫）** 只在 `pro` 或 `not-pro` 時執行的範圍：從「補卡、offer、SUB-16、推進 `lastStreakDate`」縮小為「補卡、offer、SUB-16」。連勝計算與推進 `lastStreakDate` 一律照常。
5. **（刪除）** 延後整個換日、不推進 `lastStreakDate`、記錄待處理日期並依日期重播。改為：補卡與 offer 寫入待補做紀錄，取得權威結果後補做；SUB-16 略過。
6. **（新增）** 暫時性失敗（`status: 0`、408、429、5xx）不刪 snapshot（§6.5）。

### 7.2 「完成條件」

tasks.md 的 PRO-014P 原本的「完成條件」（全文）：

> - `unknown` 的每種來源（snapshot 過期或不存在時的網路例外與 `FLAG_DEV_BACKUP` 略過、RPC error、格式不符、寫入失敗）都不重設連勝、不補保護卡、不消耗 `streakUnlockUsed`，且不推進 `lastStreakDate`
> - TTL 內的 snapshot 在離線時照常判定
> - 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝）
> - `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊
> - 每個情況各有測試；目前忽略回傳值的呼叫端（`loadAndStart`、cached-user 背景同步、連線恢復同步）行為不變

採用 D 後：

1. **（改寫第 1 條）** `unknown` 的每種來源（同上，加上取得後才到期）：
   - 連勝照常計算與歸零，`lastStreakDate` 照常推進；
   - 不補保護卡、不提供 offer，改寫入待補做紀錄，之後第一次取得權威結果時補做，最多一次；
   - 不做 SUB-16、不消耗 `streakUnlockUsed`。
2. **（不變）** TTL 內的 snapshot 在離線時照常判定。
3. **（補充）** 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝）。新增：第一天的待補做也被補上。
4. **（不變）** `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊。
5. **（改寫第 5 條）** 每個情況各有測試；`refreshProEntitlement()` 的回傳值不變，三個呼叫端在 refresh 之後多呼叫一次補做，除此之外行為不變。
6. **（新增）** 暫時性失敗（`status: 0`、408、429、5xx）與 throw 相同，保留 snapshot；權威的錯誤維持清除。
7. **（新增）** `legacy` source 下永遠不寫待補做紀錄，換日行為與現在相同；以重構前寫好的特性測試證明。

## 8. 與 PRO-014L（草稿 PR #154）的關係

#154（`feat/pro-014l-streak-unlock-rpc`，2026-11-01 對照其 diff）：

- 從 `processYesterdayStreak()` **整段移除** SUB-16。
- 新增 `requestStreakUnlock()`，在 `bootWithLocalState()` 的開機防護之前、每次開機呼叫。
- `grant_streak_unlock()`（`012_streak_unlock_server.sql`）由 server 的 Sessions 計算 45 天連勝，並負責「每個帳號一次」。帳號已有有效 entitlement 時回傳 `active_entitlement`，不消耗解鎖。
- 同時改了 `app.js`、`storage.js`、`appBootSequence.test.js`、`proGateCallSites.test.js`。

所以：

- PRO-014L 合併後，SUB-16 不再屬於換日，資格與「已是 Pro 就不發放」都由 server 判斷。`requestStreakUnlock()` 仍在 `isProUser()` 為 true 時略過請求，但那只是省一次呼叫；snapshot 過期時多呼叫一次，server 回 `active_entitlement`、不消耗。§2.1 的 SUB-16 傷害由 server 解決，與 PRO-014P 無關。
- D 對 SUB-16 只做最小的處理（`unknown` 略過、不消耗）。它是 #154 合併前的過渡，#154 rebase 時整段刪除即可，D 沒有任何需要保留的 SUB-16 邏輯。
- 衝突範圍：
  - `dayCycle.js`（換日函式）；
  - `app.js`：從 `dayCycle.js` import 的那一段（D 新增 `resolvePendingProRollover`）與 `bootWithLocalState()`；#154 不改 `loadAndStart()`；
  - `storage.js`、`appBootSequence.test.js`、`proGateCallSites.test.js`。
- #154 的 `db.grantStreakUnlock()` 在發放後會呼叫 `refreshProEntitlement()`，成為第四個 refresh 呼叫點。它後面不必補做：既有的三個呼叫點仍會補做。
- #154 的 migration 編號 012 仍未被使用（main 已有 013、014），rebase 後可沿用。
- 順序：P 先合併、#154 之後 rebase，符合你決定的順序。

## 9. 風險與範圍外

- **production（`legacy`）**：
  - 狀態永遠已知，不寫紀錄；refresh 在 `legacy` 下不呼叫 RPC。
  - 變動只有 `processYesterdayStreak()` 的結構（§6.3 說明結果相同）。目前沒有測試覆蓋這段，所以先寫特性測試再重構（§6.7）。
  - PR 仍要 bump 版本（改到 `pwa/`）。
- **範圍外的既有問題（另立 `BUG-115`，見 §10 第 4 點）**：
  - `orbit_shield_pending` 沒有 owner、登出也不刪除。同一台裝置上，A 帳號留下的 offer 會出現在 B 帳號。
  - B 若是 Pro（新帳號都有試用，`legacy` 下試用就是 Pro）按下使用，B 的連勝就變成 A 的。連勝會影響 SUB-16 的 45 天解鎖。
  - production 現在就會發生，需要共用裝置。
- 其他範圍外（不處理、只記錄）：
  - day watcher 不跑換日，頁面跨日一直開著時，換日要等下次啟動（現有行為）。
  - 不是 Pro 時按「使用保護卡」仍沒有回饋（只有 `unknown` 加提示）。
  - offer 放著不用時，使用會把連勝設回歸零前的值，蓋掉之後重新累積的天數（現有行為）。
  - `server` source 下，新帳號的 `startTrial()` 不重新 refresh，開機時的 snapshot 是試用開始前的 `not-pro`，下次 refresh 才更正（現有行為）。
  - `theme.js` 的每日隨機主題也在開機時看 `isProUser()`，snapshot 過期時當天不套用；只影響外觀，下次啟動自行恢復。
  - §6.5 的已知限制（換發 token 失敗時清除 snapshot）。

## 10. 需要使用者決定

1. 採用 **D**（建議）或 T。
2. 同意 §7 改寫 tasks.md 的「方向」與「完成條件」。
3. §6.5「暫時性失敗不刪 snapshot」併入這個 PR（建議：狀態判斷依賴它，而且它本身也擋 cutover）。
4. `BUG-115`（`orbit_shield_pending` 沒有 owner）併入 PRO-014P 的實作 PR，或另開 PR。
   - 建議併入：同一段 offer 程式，`legacy` 也會改到，是 production 的修正。
   - 做法：
     - offer 加上 `ownerId`；首頁、個人頁與 `useStreakShield()` 在不符時忽略、不刪除。
     - 升級前留下、沒有 `ownerId` 的 offer 在登出時刪除。
5. §6.6 的提示文字（建議沿用上面那句）。
