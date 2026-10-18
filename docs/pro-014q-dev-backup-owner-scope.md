# PRO-014Q 變更說明：開發者面板的模擬資料不可外流，backup 只擋自己的帳號

> 狀態：**變更說明，等待使用者核准**（2026-10-18，依兩輪獨立 review 改寫）。屬 entitlement 路徑，核准前不改程式碼。

## 1. 結論

這項任務要處理三個問題，後兩個是 review 時在 main 上發現的：

1. **原本的問題**：`FLAG_DEV_BACKUP` 只檢查存不存在。開發者換帳號後，新帳號的 profile 不上雲，`server` source 下 entitlement 也不 refresh。
2. **模擬資料外流**：結束模擬（「↩ 還原原始資料並重啟」）後，下一次啟動會把模擬期間的 user 推到真實帳號的 `profiles`。這包括模擬的 `totalXP`，以及 `legacy` source 下的 `isPro`。
   - `legacy`（目前 production）下 `profiles.is_pro` 由 client 寫入，repo 的 migration 沒有欄位層級的保護。這條路徑會把**真的 Pro** 寫進開發者的真實帳號。
3. **登出後回不來**：模擬中的帳號登出後，在同一台裝置上無法再登入。`loadFromRemote()` 推送 pending profile 失敗就會丟出錯誤，沒有本機快取時會被送回登入畫面，因此按不到「還原」。

影響範圍只有開發者模式的裝置。條件是 localhost、ngrok，或 `localStorage.orbit_dev_panel === '1'`（`settings.js` `_isDevMode()`）。一般使用者的裝置沒有 backup，行為不變。

建議方案 **Q4**（§4），核心規則是：**模擬只存在於一個帳號的一次登入期間。**

- backup 改成帶版本與 owner 的格式；舊格式一律擋住所有帳號（fail closed）。
- 結束模擬時（還原、登出、換帳號），一定丟棄該帳號的 pending profile。
- 只有新格式、而且明確屬於其他帳號的 backup 才放行。

## 2. 現況

### 2.1 三個只檢查「存在」的地方

| 呼叫點 | 行為 |
|---|---|
| `storage.upsertProfile()` | backup 存在就 return false，不上雲 |
| `storage.refreshProEntitlement()` | backup 存在就 return false，不呼叫 RPC（`legacy` source 下在這之前就已經 return） |
| `settings.js` `_devReset()` | 把 backup 存回本機 user，刪除旗標與模擬的 projection |

- backup 由 `_devBackupOnce()` 建立，內容是 `JSON.stringify(storage.getUser() ?? {})`。沒有 user 時是 `{}`，**不一定有 `id`**。
- 只有在不存在時才會寫入，所以既有的 backup 不會被替換。因此裝置上可能留著帳號 B 的 backup，而帳號 A 正在模擬。
- `storage.clearAll()` 不刪 backup。
- 換帳號不一定經過登出：`app.js` 的 `onAuthStateChange` 遇到 `SIGNED_IN` 且 user id 不同時，直接 `loadAndStart()`。

### 2.2 模擬資料外流的路徑（main 上已存在）

1. 模擬期間，正常使用就會呼叫 `storage.saveUser()`，例如完成 Session（`sessionFlow.js`）或換日（`dayCycle.js`）。
2. `saveUser()` 先把**整個 user**（含模擬值）寫成該 owner 的 pending profile snapshot（`profileSyncPending:<ownerId>`），再呼叫 `upsertProfile()`。
3. `upsertProfile()` 因 backup 存在而 return false，所以 pending 不會被清除。登出時也會保留，因為 `clearAll()` 刻意不刪 owner-scoped 的 pending。
4. 開發者按「還原」：`_devReset()` 刪除 backup 並重新載入，但**不處理 pending**。
5. 啟動時 `loadFromRemote()` 推送該 owner 的 pending profile。guard 已經不在，模擬值就上雲了。

除了 pending，還有兩條路徑會把模擬值推上雲：

- `loadFromRemote()` 的 fallback：本機 user 帶 `_syncPending` 時也會推送。
- 下一次 `saveUser()`。

### 2.3 登出後回不來（main 上已存在）

模擬中的帳號 A 登出後再登入時，有三個條件同時成立：

- backup 仍在，所以 `upsertProfile()` return false；
- A 有 pending profile，所以 `loadFromRemote()` 丟出錯誤（`No authenticated profile sync session`）；
- `clearAll()` 已清掉 A 的本機 user，所以 `loadAndStart()` 判定沒有同 owner 的快取。

結果 A 被送回登入畫面，「還原」按鈕在設定頁，到不了。

## 3. 前兩版方案為什麼不夠

| 版本 | 做法 | review 找到的問題 |
|---|---|---|
| Q2（初稿） | guard 只在 `backup.id === 目前帳號` 時生效 | `_devBackupOnce()` 不替換既有 backup：留著 B 的 backup 時，A 開始模擬沒有自己的 backup，模擬值直接上雲。也沒有處理 §2.2 的 pending |
| Q3（第二版） | 開始模擬時 backup 必屬目前帳號；還原時丟棄 pending | 只防止**新的**情況。從 main 升級的裝置可能已經處於「B 的 backup ＋ A 正在模擬」，Q3 會在第一次啟動時放行 A 的模擬值。清除格式錯誤的 backup 時也沒有處理目前帳號的 pending。也沒有處理 §2.3 |

## 4. 方案 Q4（建議）

### 4.1 backup 格式與分類

新寫入的 backup 改成 `{ v: 2, ownerId, user }`。`readDevBackup()` 回傳五種之一：

| 分類 | 條件 |
|---|---|
| `none` | 沒有 backup |
| `own` | `v === 2` 且 `ownerId === 目前帳號` |
| `foreign` | `v === 2` 且 `ownerId` 是非空字串、不等於目前帳號 |
| `legacy` | 其他任何內容：Q4 之前寫入的舊格式（包含 `{}`、帶 `id` 的 user 物件）、解析失敗 |
| 目前帳號為空 | 視同 `legacy` |

舊格式無法證明「目前帳號沒有在模擬」，所以和格式錯誤一樣處理。

### 4.2 guard（`upsertProfile`、`refreshProEntitlement`）

- `none`、`foreign`：放行。
- `own`、`legacy`：擋住（`legacy` 與現況相同）。

`foreign` 可以放行，是因為 §4.3 保證：有 `foreign` backup 時，目前帳號不可能開始模擬。

### 4.3 開始模擬（`_devBackupOnce()`）

| 分類 | 行為 |
|---|---|
| `none` | 寫入 `{ v: 2, ownerId, user }` |
| `own` | 不覆寫，保留模擬前的狀態（照舊） |
| `foreign`、`legacy` | **拒絕模擬**，提示先「清除殘留的模擬資料」 |
| 沒有登入的 user | 拒絕模擬，不再寫入 `{}` |

### 4.4 結束模擬

結束模擬一律做三件事：

- 刪除 backup；
- 刪除該 owner 的 pending profile（`profileSyncPending:<ownerId>`）；
- 清除模擬的 projection。

三種時機：

1. **還原**（`own`，設定頁按鈕）：上述三件事，再把 backup 裡的 user 存回本機並重新載入（照舊）。
2. **登出**（`handleSignOut()`）：若 backup 是登出帳號的 `own`，在 `clearAll()` 前結束模擬，不還原 user。下次登入時從 server 載入真實資料。這解決 §2.3。
3. **換帳號**（`SIGNED_IN` 且 id 不同）：在載入新帳號前，對**前一個帳號**做第 2 點。前一個帳號的 id 取自當時的本機 user。

這三種時機都會丟掉模擬期間真實發生的 profile 變動，例如連勝推進。這與現在「還原到模擬前的 user」的語意一致。Sessions 的同步不受 backup 影響，模擬期間完成的 Session 照常保存。

### 4.5 清除殘留（`foreign`、`legacy`）

設定頁依分類顯示不同按鈕：

- `own`：「↩ 還原原始資料並重啟」（§4.4 第 1 點）。
- `foreign`：「清除殘留的模擬資料」。
  - 刪除 backup；
  - 刪除 backup 所屬 owner 的 pending profile。
  - 目前帳號不可能在模擬（§4.3），所以不動目前帳號。
- `legacy`：「清除殘留的模擬資料」。因為無法得知是誰在模擬，視為**目前帳號也可能在模擬**：
  - 刪除 backup；
  - 刪除目前帳號的 pending profile；
  - 移除本機 user 的 `_syncPending`；
  - 若能解析出 user 的 `id`，也刪除那個 owner 的 pending profile；
  - 清除模擬的 projection；
  - 重新載入，從 server 取得真實資料。

### 4.6 從 main 升級的裝置

升級後第一次啟動時，舊格式的 backup 是 `legacy`，所有帳號照舊被擋，所以不會外流。開發者按「清除殘留」或登出之後才會解除。

## 5. 對 production 的影響

- `upsertProfile()` 的 guard，以及 `handleSignOut()`、`loadAndStart()` 中的結束模擬步驟，在 `legacy`（production）下也會執行。但只有 localStorage 有 `orbit_dev_backup` 的裝置會進入這些分支，其他裝置的行為不變。
- `startTrial()` 會在 guard 之外寫入 `profiles.trial_started_at`，但寫入的是 server 回傳的值，不是模擬值，不構成外流。
- 不涉及 schema、RPC、RLS 或 Supabase 設定。
- **建議專案擁有者自行檢查**：如果曾在自己的帳號用過開發者面板的「模擬 Pro」或「模擬等級」，之後按過「還原」，請到 Supabase 確認該帳號 `profiles` 的 `is_pro`、`pro_expires_at`、`total_xp` 是否正確。

## 6. 測試（核准後實作）

- 既有的 `'{}'` guard 測試照舊通過，因為舊格式仍會擋：
  - `tests/unit/proEntitlementGate.test.js`（dev backup 存在時不呼叫 RPC）；
  - `tests/unit/storage-mapping.test.js`（`orbit_dev_backup` 存在時不上雲）。
- 新增：
  - **分類與 guard**：五種分類各自的放行或阻擋；帶 `id` 的舊格式 user 物件被視為 `legacy`。
  - **開始模擬**：有 `foreign`／`legacy` backup 或沒有 user 時拒絕，不寫入任何 user 或 projection。
  - **外流回歸（§2.2）**：模擬中 `saveUser()` 排入 pending，之後分別經過還原、登出、換帳號，下一次 `loadFromRemote()` 都不會 upsert 模擬值。
  - **登出後回得來（§2.3）**：模擬中登出再登入，可以正常載入。
  - **升級（§4.6）**：舊格式 backup 加上目前帳號的模擬 pending，第一次啟動不 upsert；按「清除殘留」後丟棄 pending，並從 server 重新載入。
  - **面板**：依分類顯示正確的按鈕（`tests/unit/proDevPanel.test.js`）。
- 版本：`npm run bump -- patch`。

## 7. 需要使用者決定

1. **是否核准 Q4**（建議：核准）。
2. **登出或換帳號時自動結束模擬**（§4.4 第 2、3 點）：建議採用。若不採用，§2.3 的「登出後回不來」仍會存在。
3. **排程**：2026-10-17 的 Next 規則是只自行排入低風險項目。PRO-014Q 屬 entitlement 路徑，這次為了寫變更說明移入 In Progress。若希望高風險項目連變更說明都要先問，請告知，我會把它移回 Backlog。
4. **§5 的帳號檢查**：需要你自己確認，我沒有 Supabase 的權限。
