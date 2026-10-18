# PRO-014Q 變更說明：開發者面板的 backup 只對建立它的帳號生效

> 狀態：**變更說明，等待使用者核准**（2026-10-18）。屬 entitlement 路徑（AGENTS.md §3），核准前不改程式碼。

## 1. 結論

- 建議做法：`FLAG_DEV_BACKUP` 只在「backup 裡的 `id` 等於目前帳號」時才生效。帳號不同時，三個呼叫點都把它當成不存在。
- 不需要改資料格式：backup 本來就是整個 user 物件的 JSON，裡面有 `id`。
- 影響範圍只有開發者模式的裝置。開發者模式要符合下列任一條件：localhost、ngrok，或 `orbit_dev_panel = '1'`（`settings.js` `_isDevMode()`）。一般使用者的裝置不會有這個旗標。

## 2. 問題

`FLAG_DEV_BACKUP`（`orbit_dev_backup`）由等級模擬器與 Pro 模擬器建立（`settings.js` `_devBackupOnce()`）。三個地方只檢查它**存不存在**，不檢查它屬於誰：

| 呼叫點 | 行為 | 換帳號後的結果 |
|---|---|---|
| `storage.upsertProfile()` | 存在就 return false，不上雲 | 新帳號的 profile 永遠不會上雲 |
| `storage.refreshProEntitlement()` | 存在就 return false，不呼叫 RPC | `server` source 下新帳號拿不到 entitlement，fail closed |
| `settings.js` `_devReset()` | 把 backup 存回本機 user，再刪除旗標 | 把**前一個帳號**的 user 寫到目前帳號的本機資料上 |

backup 也不會在登出時清除：`storage.clearAll()` 沒有刪它，所以它會一直留到開發者按「重設」。

另外，換帳號不一定經過登出：`app.js` 的 `onAuthStateChange` 遇到 `SIGNED_IN`、而且 user id 不同時，會直接呼叫 `loadAndStart()`，不會呼叫 `clearAll()`。所以只在登出時清除，仍有漏洞。

## 3. 方案

| 方案 | 做法 | 評估 |
|---|---|---|
| **Q2（建議）owner-scoped** | 新增 `readDevBackup()`，回傳解析後的 backup（失敗回 null）；新增 `hasDevBackupFor(ownerId)`。三個呼叫點都改成只對 `backup.id === ownerId` 生效 | 涵蓋所有換帳號路徑；舊的 backup 不必遷移 |
| Q1 登出時清除 | `clearAll()` 一併刪除 `FLAG_DEV_BACKUP` | 一行就能改，但不涵蓋不經登出的換帳號（§2） |
| Q1＋Q2 | 兩者都做 | Q2 已經足夠；Q1 只讓登出後的狀態更乾淨 |

建議只做 Q2，理由：

- Q1 會在登出時丟掉 backup。真實 profile 本來就在 server 上，因為模擬期間 `upsertProfile()` 不會上雲，所以丟掉 backup 不會遺失資料。
- 但 Q1 會改變「重設」按鈕的既有行為：重新登入同一帳號後，面板不會再顯示有 backup。
- 要不要加 Q1，交給使用者決定（§6）。

## 4. Q2 的具體變更（核准後實作）

1. **`pwa/js/storage.js`**（或 `flags.js` 旁的小 helper）：
   - `readDevBackup()`：`JSON.parse(localStorage.getItem(FLAG_DEV_BACKUP))`；格式錯誤或沒有字串 `id` 時回 `null`。
   - `hasDevBackupFor(ownerId)`：`readDevBackup()?.id === ownerId`。
2. **`upsertProfile(user, expectedOwnerId = user?.id)`**：把 `if (localStorage.getItem(FLAG_DEV_BACKUP))` 改為 `if (hasDevBackupFor(expectedOwnerId))`。
3. **`refreshProEntitlement(userId)`**：改為 `if (hasDevBackupFor(userId))`。帳號不同時照常呼叫 RPC。
4. **`settings.js` `_devReset()`**：
   - backup 的 `id` 與目前 user 相同：還原（照舊）。
   - 不同：不還原，只刪除旗標與模擬的 projection，避免把別人的 user 寫進來。
   - 面板的 `hasBackup` 顯示也改成 owner-scoped。
5. **格式錯誤的 backup**（無法 parse，或沒有 `id`）：
   - 這是唯一的行為選擇點。建議視為「不屬於任何人」，也就是不擋 refresh 與 upsert。
   - 代價：舊格式若沒有 `id`，模擬中的 projection 可能被 server 結果覆蓋。這只發生在開發者裝置上，而且是 fail open 到「真實的 server 結果」，不會授予任何權限。
6. **測試**（`tests/unit/proEntitlement.test.js`、`tests/unit/proDevPanel.test.js`）：
   - 同帳號有 backup：`refreshProEntitlement` 與 `upsertProfile` 照舊略過。
   - 不同帳號有 backup：兩者照常執行。
   - `_devReset()` 遇到不同帳號的 backup：不呼叫 `saveUserLocal`，旗標被刪除。
   - 格式錯誤的 backup：不擋 refresh 與 upsert。
7. **版本**：patch（`npm run bump`）。

## 5. 不會改變的事

- `legacy` source（目前 production）下，`refreshProEntitlement()` 一開始就 return，不受影響。
- 同一個開發者帳號的模擬流程完全照舊。
- 不涉及 schema、RPC、RLS 或 Supabase 設定。

## 6. 需要使用者決定

1. **是否核准 Q2**（建議：核准）。
2. **是否加上 Q1**（登出時清除 backup）：建議不加，理由見 §3。
3. **格式錯誤的 backup**：建議視為不屬於任何人（§4 第 5 點）。另一個選擇是視為屬於所有人，也就是照舊擋住，那就和現在一樣 fail closed。
