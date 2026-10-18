# PRO-014Q 變更說明：開發者面板的模擬資料不可外流，backup 只擋自己的帳號

> 狀態：**變更說明，等待使用者核准**（2026-10-18，依獨立 review 改寫）。屬 entitlement 路徑，核准前不改程式碼。

## 1. 結論

這項任務要處理兩個問題，第二個比原本的描述嚴重：

1. **原本的問題**：`FLAG_DEV_BACKUP` 只檢查存不存在。開發者換帳號後，新帳號的 profile 不上雲，`server` source 下 entitlement 也不 refresh。
2. **review 時發現、main 上已存在的問題**：結束模擬（「↩ 還原原始資料並重啟」）之後，下一次啟動會把**模擬期間的 user**（含模擬的 `totalXP`，`legacy` source 下還有 `isPro`）推到真實帳號的 `profiles`。
   - `legacy`（目前 production）下，`profiles.is_pro` 由 client 寫入，repo 的 migration 沒有欄位層級的保護。所以這條路徑會把**真的 Pro** 寫進開發者的真實帳號，模擬的 XP 也會覆蓋真實 XP。

影響範圍仍只有開發者模式的裝置。條件是 localhost、ngrok，或 `localStorage.orbit_dev_panel === '1'`（`settings.js` `_isDevMode()`）。一般使用者的裝置沒有這個旗標，行為不變。

建議方案 **Q3**（§4）：

- 模擬開始時，backup 一定屬於目前帳號；
- 結束模擬時，丟棄模擬期間排入的 profile 同步；
- guard 只放行「明確屬於其他帳號」的 backup，格式錯誤一律擋住（fail closed）。

## 2. 現況

### 2.1 三個只檢查「存在」的地方

| 呼叫點 | 行為 |
|---|---|
| `storage.upsertProfile()` | backup 存在就 return false，不上雲 |
| `storage.refreshProEntitlement()` | backup 存在就 return false，不呼叫 RPC（`legacy` source 下在這之前就已經 return） |
| `settings.js` `_devReset()` | 把 backup 存回本機 user，刪除旗標與模擬的 projection |

- backup 由 `_devBackupOnce()` 建立，內容是 `JSON.stringify(storage.getUser() ?? {})`。沒有 user 時是 `{}`，**不一定有 `id`**。
- 只有在不存在時才會寫入，所以既有的 backup 不會被替換。
- `storage.clearAll()` 不刪 backup。
- 換帳號不一定經過登出：`app.js` 的 `onAuthStateChange` 遇到 `SIGNED_IN` 且 user id 不同時，直接 `loadAndStart()`，不呼叫 `clearAll()`。

### 2.2 模擬資料外流的路徑（main 上已存在）

1. 模擬期間，正常使用就會呼叫 `storage.saveUser()`，例如完成 Session（`sessionFlow.js`）或換日（`dayCycle.js`）。
2. `saveUser()` 先把**整個 user**（含模擬值）寫成該 owner 的 pending profile snapshot（`profileSyncPending:<ownerId>`），再呼叫 `upsertProfile()`。
3. `upsertProfile()` 因 backup 存在而 return false，所以 pending snapshot 不會被清除。登出時也會保留，因為 `clearAll()` 刻意不刪 owner-scoped 的 pending。
4. 開發者按「還原」：`_devReset()` 刪除 backup 並重新載入，但**不處理 pending snapshot**。
5. 啟動時 `loadFromRemote()` 發現該 owner 有 pending profile，於是呼叫 `upsertProfile()`。此時 guard 已經不在，模擬值就被推上雲端。

## 3. 為什麼原本的方案 Q2 不行

原 Q2 是「backup 只在 `backup.id === 目前帳號` 時生效」，review 找到兩個漏洞：

- **P1**：`_devBackupOnce()` 只在 backup 不存在時寫入。若裝置上留著帳號 B 的 backup（或 `{}`），帳號 A 開始模擬時不會寫入自己的 backup。`hasDevBackupFor(A)` 為 false，A 的模擬值會在下一次 `saveUser()` 直接上雲。這比現在更糟：現在任何 backup 都會擋。
- **P1**：Q2 沒有處理 §2.2 的 pending snapshot。Q1（登出時清除 backup）也一樣，清掉 guard 後，下次登入會把該 owner 的模擬 pending 推上雲。

## 4. 方案 Q3（建議）

### 4.1 backup 的歸屬

- 新增 `readDevBackup()`：解析失敗、不是物件，或沒有非空字串的 `id` 時，回傳 `{ malformed: true }`；否則回傳 `{ ownerId, user }`。
- 新增 `isDevBackupBlocking(ownerId)`：
  - 沒有 backup → 不擋；
  - 格式錯誤 → **擋**（fail closed，與現況相同）；
  - `ownerId` 為空 → **擋**；
  - `backup.ownerId === ownerId` → 擋；
  - 只有「格式正確且屬於其他帳號」時才不擋。
- `upsertProfile(user, expectedOwnerId)` 改為 `if (isDevBackupBlocking(expectedOwnerId)) return false`。
- `refreshProEntitlement(userId)` 同樣改寫。

### 4.2 開始模擬

`_devBackupOnce()` 改為：

- 沒有登入的 user（沒有 `id`）：拒絕模擬並顯示提示。不再寫入 `{}`。
- 沒有 backup：寫入目前 user（照舊）。
- 已有**目前帳號**的 backup：不覆寫（照舊，保留模擬前的狀態）。
- 已有**其他帳號**或格式錯誤的 backup：**拒絕模擬**，提示先清除殘留的模擬。不自動覆寫，因為那會讓另一個帳號的 pending 失去保護。

### 4.3 結束模擬（同一個帳號）

`_devReset()` 在現有步驟之前，先丟棄目前 owner 的 pending profile snapshot（`profileSyncPending:<ownerId>`）。

- 這會一併丟掉模擬期間真實發生的 profile 變動，例如連勝推進。
- 這與現在的語意一致：還原 backup 本來就會回到模擬前的 user。
- Sessions 的同步不受 backup 影響，模擬期間完成的 Session 照常保存。

### 4.4 清除殘留（其他帳號或格式錯誤）

開發者面板的「還原」按鈕目前只在 `hasBackup` 時顯示。改為依 backup 的狀態顯示不同按鈕：

- **目前帳號的 backup**：「↩ 還原原始資料並重啟」（§4.3）。
- **其他帳號或格式錯誤的 backup**：「清除殘留的模擬資料」。
  - 刪除 backup 本身；
  - 刪除 backup 所屬 owner 的 pending profile snapshot（格式錯誤時無法得知 owner，只刪 backup）；
  - 不還原 user，不動目前帳號的資料。

### 4.5 不採用 Q1（登出時清除 backup）

backup 跨登出保留，該 owner 的同步就會一直被擋，直到開發者在同一個帳號按「還原」（§4.3）。這是安全的預設。登出時清除會打開 §2.2 的路徑。

## 5. 對 production 的影響

- `upsertProfile()` 的 guard 在 `legacy`（production）下也會執行。但只有 localStorage 有 `orbit_dev_backup` 的裝置會進入新的判斷，其他裝置 `getItem` 回 `null`，行為不變。
- 不涉及 schema、RPC、RLS 或 Supabase 設定。
- **建議專案擁有者自行檢查**：如果曾在自己的帳號用過開發者面板的「模擬 Pro」或「模擬等級」，之後按過「還原」，請到 Supabase 確認該帳號 `profiles` 的 `is_pro`、`pro_expires_at`、`total_xp` 是否正確。

## 6. 測試（核准後實作）

- 既有的 `'{}'` guard 測試照舊通過，因為格式錯誤仍會擋：
  - `tests/unit/proEntitlementGate.test.js`（dev backup 存在時不呼叫 RPC）；
  - `tests/unit/storage-mapping.test.js`（`orbit_dev_backup` 存在時不上雲）。
- 新增：
  - 其他帳號的 backup 不擋 refresh 與 upsert；同帳號、格式錯誤、`ownerId` 為空時都擋。
  - 有其他帳號的 backup 時，`_devApplyLevel()`／`_devApplyPro()` 拒絕模擬，不寫入任何 user 或 projection。
  - **回歸測試（§2.2）**：模擬中 `saveUser()` 排入 pending → `_devReset()` → 下一次 `loadFromRemote()` 不會 upsert 模擬值。
  - 清除殘留：刪除 backup 與該 owner 的 pending，不呼叫 `saveUserLocal`。
  - 面板依 backup 狀態顯示正確的按鈕（`tests/unit/proDevPanel.test.js`）。
- 版本：`npm run bump -- patch`。

## 7. 需要使用者決定

1. **是否核准 Q3**（建議：核准）。
2. **格式錯誤的 backup**：Q3 建議擋住（fail closed），並提供「清除殘留」按鈕。這修正了初稿「視為不屬於任何人」的建議，因為那會讓模擬值外流。
3. **排程**：2026-10-17 的 Next 規則是只自行排入低風險項目。PRO-014Q 屬 entitlement 路徑，這次為了寫變更說明移入 In Progress。若希望高風險項目連變更說明都要先問，請告知，我會把它移回 Backlog。
4. **§5 的帳號檢查**：需要你自己確認，我沒有 Supabase 的權限。
