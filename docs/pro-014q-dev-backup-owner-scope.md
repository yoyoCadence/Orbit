# PRO-014Q 變更說明：開發者面板的模擬不可寫進真實資料

> 狀態：**變更說明，等待使用者核准**（2026-10-18，經四輪獨立 review 後重寫）。屬 entitlement 路徑，核准前不改程式碼。

## 1. 結論

PRO-014Q 原本只處理「開發者的 backup 擋住其他帳號」。review 時在 main 上又發現兩個更嚴重的問題，只影響開發者模式的裝置：

- **模擬資料外流到真實帳號**：模擬的 `totalXP`，以及 `legacy` source 下的 `isPro`，可能被推到 `profiles`。`legacy`（目前 production）下 `profiles.is_pro` 由 client 寫入，所以這會授予**真的 Pro**。
- **登出後回不來**：模擬中的帳號登出後，在同一台裝置上無法再登入。

三輪 review 的經驗是：只要模擬的做法是**把假值寫進真實的 user 物件**，每一條會保存或同步 user 的路徑都可能把它送出去。這些路徑包括 pending profile 佇列、`_syncPending` fallback、離線的快取啟動、換帳號、`saveUser()`。補一條、review 就再找到一條（§3），這是結構問題，不是漏寫。

建議：

- **立即止血 S0**（小改動）：「還原」改為完整清理（刪除 backup、所有 pending profile、本機 user 與 projection 後重新載入），堵住最常見的外流路徑。
- **結構修正 Q6**：移除開發者面板的兩種模擬（等級與 Pro），改用測試帳號；舊的 backup 機制只保留為一次性清理。
  - 第四輪 review 證明，連「讀取時套用的 overlay」（Q5）也會外流：overlay 改變 `isProUser()` 的結果，而 `dayCycle.js` 依這個結果寫入真實資料。§3 有細節。
  - 只要模擬能影響任何會寫入的判斷，就有外流的可能；不模擬才是唯一沒有這類風險的做法。

影響範圍：只有開發者模式的裝置。條件是 localhost、ngrok，或 `localStorage.orbit_dev_panel === '1'`（`settings.js` `_isDevMode()`）。一般使用者的裝置沒有 backup，行為不變。

**請專案擁有者自行檢查**：如果曾在自己的帳號用過「模擬 Pro」或「模擬等級」，請到 Supabase 確認該帳號 `profiles` 的 `is_pro`、`pro_expires_at`、`total_xp` 是否正確。我沒有 Supabase 的權限。

## 2. 現況（main）

### 2.1 模擬怎麼運作

`settings.js` 的開發者面板有兩種模擬：

- **模擬等級**：`_devApplyLevel()` 先 `_devBackupOnce()`，再把 `user.totalXP` 改成目標等級的 XP，用 `saveUserLocal()` 寫入本機。
- **模擬 Pro**：
  - `legacy` source：改 `user.isPro`、`proExpiresAt`、`trialStartedAt`；
  - `server` source：寫入一份模擬的 projection snapshot。

`_devBackupOnce()` 只在 backup 不存在時寫入 `JSON.stringify(storage.getUser() ?? {})`。沒有 user 時是 `{}`，而且既有的 backup 不會被替換。

backup 存在時，`upsertProfile()` 與 `refreshProEntitlement()` 直接 return false。不檢查 backup 屬於誰，所以換帳號後其他帳號也被擋住（PRO-014Q 原本的問題）。

### 2.2 外流路徑

模擬期間，正常使用就會呼叫 `saveUser()`，例如完成 Session（`sessionFlow.js`）或換日（`dayCycle.js`）。`saveUser()` 會把**整個 user**（含模擬值）寫成 owner 的 pending profile，再嘗試上雲。guard 擋住上雲，所以 pending 一直留著，登出也不會清除。

之後只要 guard 消失，下列任一條路徑就會把模擬值推上雲：

- 按「還原」：`_devReset()` 刪除 backup，但不處理 pending。下一次啟動時，`loadFromRemote()` 會推送 pending。
- `loadFromRemote()` 的 `_syncPending` fallback：本機 user 帶著這個旗標時，也會被推送。
- 離線時用快取啟動，會先跑換日（`dayCycle.js` → `saveUser()`），再載入遠端資料。
- 換帳號（`SIGNED_IN` 且 id 不同）不呼叫 `clearAll()`。若新帳號載入失敗，前一個帳號的模擬 user 會留在本機。

### 2.3 登出後回不來

模擬中的帳號登出後再登入時，以下三點同時成立：

- backup 仍在，所以 `upsertProfile()` 失敗；
- 該帳號有 pending profile，所以 `loadFromRemote()` 丟出錯誤；
- `clearAll()` 已清除本機 user，所以沒有同 owner 的快取。

結果是被送回登入畫面，而「還原」按鈕在設定頁，到不了。

### 2.4 模擬等級還會影響本機的經濟資料

V2 遷移在 finalize 時，用 `totalXP` 換算等級來計算 `openingGold`（`v2/controller.js` `calculateMigrationOpeningGold()`），之後不再重算。在模擬等級期間 finalize 的裝置，開場 Gold 會永久依模擬等級計算。`sessionFlow.js` 的升級偵測也讀 `totalXP`。

所以「模擬等級」不能只改成顯示層的 overlay。要讓它安全，得改動約 10 個讀取等級的地方，而且有些會影響經濟資料。

## 3. 前幾版為什麼不夠

| 版本 | 做法 | review 找到的漏洞 |
|---|---|---|
| Q2 | guard 只擋 `backup.id === 目前帳號` | 不替換既有 backup：留著 B 的 backup 時，A 開始模擬沒有自己的 backup，模擬值直接上雲；也沒處理 pending |
| Q3 | 開始模擬時 backup 必屬目前帳號；還原時丟 pending | 從 main 升級的裝置可能已處於「B 的 backup ＋ A 正在模擬」；登出後回不來 |
| Q4 | 新版 backup 格式；還原、登出、換帳號時結束模擬 | 舊格式 backup 時，登出或換帳號沒有丟棄 A 的 pending，從其他帳號清除殘留後 A 的模擬值會外流；離線快取啟動與換帳號載入失敗時，模擬 user 留在本機 |
| Q5 | Pro 模擬改為讀取時套用的 overlay，不寫入 user | overlay 改變 `isProUser()`，而 `dayCycle.js` 依它寫入真實資料。真 Pro 帳號模擬 `free` 時，SUB-16 會寫入 `isPro=true`、`proExpiresAt=now+30d`、`streakUnlockUsed=true`：終身付費帳號的 `pro_expires_at` 從 NULL 變成 30 天後到期，一次性解鎖也被用掉。免費帳號模擬 `paid` 時，保護卡會被補滿，`useStreakShield` 也會恢復 `streakDays`，兩者都會同步，恢復的連勝還會計入真實的 45 天 Pro 解鎖。另外 Pro 專屬的 `focusDefaultMinutes` 與專注筆記也會替免費帳號同步 |

每一版都多出好幾個分支條件，仍有未覆蓋的路徑。Q5 若要安全，必須把約 27 個 `isProUser()` 系列呼叫點逐一分成「只影響顯示」與「會導致寫入」，後者改讀真實狀態。漏掉一個就重演上表，而這正是前四版的失敗模式。

## 4. 方案

### S0：立即止血（建議先做，與 Q6 不衝突）

只改 `_devReset()`（「↩ 還原原始資料並重啟」），改成下面的完整清理。Q6 第 3 點的「清除殘留」使用同一套清理：

- 刪除 backup；
- 刪除**所有** `profileSyncPending:*`，以及 v1.21 預發布版可能留下的無 owner 全域 key `profileSyncPending`；
- 刪除本機 user，不再把 backup 存回本機；
- 清除 projection snapshot；
- 重新載入，讓真實資料從 server 取回。

為什麼是「所有」pending，而不只目前帳號的：backup 可能是別的帳號先前模擬時留下的。只刪目前帳號的 pending，其他帳號的模擬 pending 會在 guard 消失後外流。

S0 堵住「模擬 → 還原 → 外流」。限制：

- 清理後若離線，沒有本機快取，會回到登入畫面，等連線後再載入。
- 刪除本機 user 會略過快取 Sessions 的合併。尚未同步的 Sessions 仍保存在 owner-scoped 的 pending sidecar 中，不會遺失；只有還沒完成 session-sync cutover 的舊裝置例外。
- S0 單獨上線也是安全的：模擬仍會寫入本機 user，但在按下「還原」之前，所有上雲都被擋住，而「還原」會刪除所有 pending 與本機 user。原本「其他帳號被擋住」的問題仍在，要等 Q6。

登出、換帳號時的處理交給 Q6。

### Q6：移除模擬，改用測試帳號（建議的結構修正）

1. **移除兩種模擬**
   - 刪除開發者面板的「模擬等級」與「模擬 Pro」：`_devApplyLevel()`、`_devApplyPro()`、`_devProSnapshot()`、`_devBackupOnce()`。
   - 理由：模擬等級見 §2.4；模擬 Pro 見 §3 的 Q5 列。
   - 開發者面板保留其他不改資料的功能。
   - 這會移除 PRO-014M（v1.25.3）為 `server` source 加入的 Pro 模擬。Q6 上線時，`tasks.md` 中「PRO-014H 的實機驗證需要 PRO-014M」的說明要改成使用測試帳號。
2. **改用測試帳號**
   - 在 preview Supabase 專案建立固定的測試帳號（免費、試用中、付費、終身、不同等級），由 SQL 直接設定 `profiles` 與 `pro_entitlements`。
   - 寫一份 `docs/` 開發者說明：帳號清單與設定用的 SQL。
   - 這也讓 PRO-014H 的實機驗證有可重現的帳號，不必依賴開發者面板（`tasks.md` 原本寫 PRO-014H 驗證需要 PRO-014M 的面板）。
3. **舊 backup 的一次性清理**
   - Q6 不再寫入 `orbit_dev_backup`。
   - 已存在的 backup 一律視為「可能有帳號正在模擬」：`upsertProfile()` 與 `refreshProEntitlement()` 的 guard 照舊擋住所有帳號（fail closed，與現況相同）。
   - 模擬的 projection 一定與 backup 一起出現：`_devApplyPro()` 先寫 backup 再寫 projection，「還原」與 `clearAll()` 都會清除 projection。projection 本身也從不上傳。
   - 開發者面板只在 backup 存在時顯示「清除殘留的模擬資料」，按下後做 S0 的完整清理。
   - 清除所有 pending 會丟掉這台開發裝置上尚未同步的真實 profile 變動。只發生在開發者裝置上，而且只在開發者主動按下時。
4. **登出後回不來**：Q6 之後不會再產生新的 backup。既有 backup 造成的卡住，從任一能登入的帳號（或訪客）按「清除殘留」即可解除。

### 替代：Q5 改良（不建議）

保留 Pro 模擬但改為 overlay，並把約 27 個 `isProUser()`、`isPaidProUser()`、`isTrialUser()`、`getProExpiry()` 呼叫點逐一分類：

- 只影響顯示或 UI gate 的，讀 overlay；
- 會導致寫入的，改讀真實狀態，例如 `dayCycle.js` 的保護卡補充與使用、SUB-16，以及 `focusTimer.js` 的 `focusDefaultMinutes` 與專注筆記。

每個會寫入的呼叫點都要有測試。成本是一次完整的呼叫點審查，而且之後新增的呼叫點也必須正確分類；風險是漏掉一個就外流。只有在你很需要 app 內模擬時才值得。

### 不建議：Q4 再補

Q4 可以再補上 review 找到的兩條路徑，但它仍然依賴「找出所有會寫入 user 的路徑」。這正是前三版失敗的原因。

## 5. 對 production 的影響

- 一般裝置：沒有 `orbit_dev_backup`，所有分支都不會進入，行為不變。
- Q6 不改 `isProUser()` 等函式。
- `startTrial()` 在 guard 之外寫入 `profiles.trial_started_at`，寫入的是 server 回傳的值，不構成外流。
- 不涉及 schema、RPC、RLS 或 Supabase 設定。

## 6. 測試（核准後實作）

- **S0**：模擬中 `saveUser()` 排入 pending（目前帳號與另一個帳號各一份）→ `_devReset()` → 兩份 pending 都被刪除、本機 user 被刪除，之後兩個帳號的 `loadFromRemote()` 都不會 upsert 模擬值。
- **Q6 清理**：
  - 既有 backup 擋住所有帳號（既有的 `'{}'` 測試照舊通過：`proEntitlementGate.test.js`、`storage-mapping.test.js`）；
  - 「清除殘留」刪除 backup、所有 `profileSyncPending:*`、本機 user 與 projection；
  - 清除後的第一次 `loadFromRemote()` 不推送任何模擬值，包含離線快取啟動與換帳號載入失敗的情況。
- **面板**：沒有「模擬等級」與「模擬 Pro」；只有 backup 存在時顯示「清除殘留」（`proDevPanel.test.js` 需要改寫，或刪除只測模擬的案例）。
- 版本：S0 `npm run bump -- patch`；Q6 移除開發者功能，也用 patch（不影響一般使用者）。

## 7. 需要使用者決定

1. **S0**：是否先做立即止血（建議：是）。
2. **Q6**：是否移除開發者面板的兩種模擬，改用 preview 專案的測試帳號（建議：是）。若想保留 app 內 Pro 模擬，選 Q5 改良，並接受 §4 所述的審查成本與殘餘風險。
3. **測試帳號**：Q6 需要在 preview Supabase 專案建立測試帳號。這要你執行，或給我 preview 專案的權限；我目前沒有 Supabase 權限。
4. **排程**：2026-10-17 的 Next 規則是只自行排入低風險項目。PRO-014Q 屬 entitlement 路徑，這次為了寫變更說明移入 In Progress。若希望高風險項目連變更說明都要先問，請告知，我會把它移回 Backlog。
5. **§1 的帳號檢查**：請你自己確認。
