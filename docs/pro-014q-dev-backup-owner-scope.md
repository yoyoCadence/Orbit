# PRO-014Q 變更說明：開發者面板的模擬不可寫進真實資料

> 狀態：**變更說明，等待使用者核准**（2026-10-18，經三輪獨立 review 後重寫）。屬 entitlement 路徑，核准前不改程式碼。

## 1. 結論

PRO-014Q 原本只處理「開發者的 backup 擋住其他帳號」。review 時在 main 上又發現兩個更嚴重的問題，只影響開發者模式的裝置：

- **模擬資料外流到真實帳號**：模擬的 `totalXP`，以及 `legacy` source 下的 `isPro`，可能被推到 `profiles`。`legacy`（目前 production）下 `profiles.is_pro` 由 client 寫入，所以這會授予**真的 Pro**。
- **登出後回不來**：模擬中的帳號登出後，在同一台裝置上無法再登入。

三輪 review 的經驗是：只要模擬的做法是**把假值寫進真實的 user 物件**，每一條會保存或同步 user 的路徑都可能把它送出去。這些路徑包括 pending profile 佇列、`_syncPending` fallback、離線的快取啟動、換帳號、`saveUser()`。補一條、review 就再找到一條（§3），這是結構問題，不是漏寫。

建議：

- **立即止血 S0**（小改動）：還原時丟棄模擬期間的 pending profile 與本機 user，堵住最常見的外流路徑。
- **結構修正 Q5**：
  - Pro 模擬改成**讀取時套用的 overlay**，完全不寫入 user、pending 或 projection；
  - 移除「模擬等級」；
  - 舊的 backup 機制只保留為一次性清理。

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

每一版都多出好幾個分支條件，仍有未覆蓋的路徑。

## 4. 方案

### S0：立即止血（建議先做，與 Q5 不衝突）

只改 `_devReset()`（「↩ 還原原始資料並重啟」）。改成與 Q5 第 3 點相同的完整清理：

- 刪除 backup；
- 刪除**所有** `profileSyncPending:*`；
- 刪除本機 user，不再把 backup 存回本機；
- 清除 projection snapshot；
- 重新載入，讓真實資料從 server 取回。

為什麼是「所有」pending，而不只目前帳號的：backup 可能是別的帳號先前模擬時留下的。只刪目前帳號的 pending，其他帳號的模擬 pending 會在 guard 消失後外流。

S0 堵住「模擬 → 還原 → 外流」。有一個限制：清理後若離線，沒有本機快取，會回到登入畫面，等連線後再載入。登出、換帳號時的處理交給 Q5。

### Q5：模擬不寫入真實資料（建議的結構修正）

1. **Pro 模擬改為 overlay**
   - 新增 `orbit_dev_pro_sim = { ownerId, status: 'paid' | 'trial' | 'free' }`。
   - 只在 `storage.isProUser()`、`isPaidProUser()`、`isTrialUser()`（以及 `getProExpiry()`）讀取時套用，而且 `ownerId` 必須等於目前 user。
   - 不寫入 user、pending profile 或 projection snapshot，所以沒有任何東西可以外流。
   - 結束模擬就是刪除這個 key。登出時一併刪除，因為 overlay 只屬於一次登入。
   - 模擬期間，真實的 profile 與 entitlement 照常同步：不再需要 guard。
2. **移除「模擬等級」**
   - 理由見 §2.4。
   - 測試不同等級改用專用的測試帳號，或在 preview 專案直接設定 XP。文件寫在 `docs/` 的開發者說明中。
   - 這是功能移除，需要你決定（§6）。
3. **舊 backup 的一次性清理**
   - Q5 不再寫入 `orbit_dev_backup`。
   - 已存在的 backup 一律視為「可能有帳號正在模擬」：guard 照舊擋住所有帳號（fail closed，與現況相同）。
   - 開發者面板顯示「清除殘留的模擬資料」，按下後：
     - 刪除 backup；
     - 刪除**所有** `profileSyncPending:*`；
     - 刪除本機 user 的 `_syncPending`，以及本機 user 本身；
     - 清除 projection snapshot；
     - 重新載入，從 server 取得真實資料。
   - 清除所有 pending 會丟掉這台開發裝置上尚未同步的真實 profile 變動。只發生在開發者裝置上，而且只在開發者主動按下時。
   - 只要 backup 存在，guard 就擋住，所以清理之前不會外流。
4. **登出後回不來**：Q5 之後不會再產生新的 backup。既有 backup 造成的卡住情況，從任一能登入的帳號（或訪客）按「清除殘留」即可解除，因為它刪除的是所有 pending。

### 不建議：Q4 再補

Q4 可以再補上 review 找到的兩條路徑，但它仍然依賴「找出所有會寫入 user 的路徑」。這正是前三版失敗的原因。

## 5. 對 production 的影響

- 一般裝置：沒有 `orbit_dev_backup` 也沒有 `orbit_dev_pro_sim`，所有分支都不會進入，行為不變。
- `isProUser()` 等函式在 `legacy`（production）下也會先檢查 overlay。overlay 只在開發者面板寫入，而且 `ownerId` 必須相符。
- `startTrial()` 在 guard 之外寫入 `profiles.trial_started_at`，寫入的是 server 回傳的值，不構成外流。
- 不涉及 schema、RPC、RLS 或 Supabase 設定。

## 6. 測試（核准後實作）

- **S0**：模擬中 `saveUser()` 排入 pending（目前帳號與另一個帳號各一份）→ `_devReset()` → 兩份 pending 都被刪除、本機 user 被刪除，之後兩個帳號的 `loadFromRemote()` 都不會 upsert 模擬值。
- **Q5 overlay**：
  - overlay 存在時，`isProUser()` 系列依 overlay 回傳，`upsertProfile()` 的 payload 是真實值；
  - `ownerId` 不符時忽略 overlay；
  - 登出後 overlay 被刪除。
- **Q5 清理**：
  - 既有 backup 擋住所有帳號（既有的 `'{}'` 測試照舊通過：`proEntitlementGate.test.js`、`storage-mapping.test.js`）；
  - 「清除殘留」刪除 backup、所有 `profileSyncPending:*`、本機 user 與 projection；
  - 清除後的第一次 `loadFromRemote()` 不推送任何模擬值，包含離線快取啟動與換帳號載入失敗的情況。
- **面板**：沒有「模擬等級」；Pro 模擬寫入 overlay（`proDevPanel.test.js` 需要改寫）。
- 版本：S0 與 Q5 各自 `npm run bump -- patch`。若移除「模擬等級」要算 UX 變動，Q5 也可以用 minor。

## 7. 需要使用者決定

1. **S0**：是否先做立即止血（建議：是）。
2. **Q5**：是否核准結構修正（建議：是）。
3. **移除「模擬等級」**：是否同意（建議：同意，理由見 §2.4）。若要保留，需要另外設計，而且要改動約 10 個讀取等級的地方。
4. **排程**：2026-10-17 的 Next 規則是只自行排入低風險項目。PRO-014Q 屬 entitlement 路徑，這次為了寫變更說明移入 In Progress。若希望高風險項目連變更說明都要先問，請告知，我會把它移回 Backlog。
5. **§1 的帳號檢查**：請你自己確認。
