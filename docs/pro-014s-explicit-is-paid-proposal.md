# PRO-014S 提案：`my_pro_status()` 明確回傳是否付費

> 狀態：提案（只寫文件），等擁有者決定 §7。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production。屬於可選的強化，沒有正確性上的急迫性。

## 1. 結論

- **現在**：`my_pro_status()` 只告訴 client「有沒有 Pro」（`is_active`）和兩個日期（`expires_at`、`trial_ends_at`）；「是付費還是試用」由 client 從日期推斷。
- **自 014（PRO-014R）起這個推斷是精確的**，目前沒有錯誤。
- **建議**：
  - 讓 `my_pro_status()` 多回傳一欄 `is_paid`，client 有這一欄時直接用，沒有時（舊的 server）照舊推斷；
  - **不單獨做**：等下一次本來就要改 `my_pro_status()` 的時候一起做（例如接上真正的付款、或 PRO-014G），省一次 migration 與擁有者套用。

## 2. 現況（2026-11-11 的 main）

- **RPC**（`pwa/db/014_my_pro_status_trial_cap.sql`）回傳一列：
  - `is_active`：`is_pro_active(is_pro, pro_expires_at, trial_started_at)`；
  - `expires_at`：`is_pro` 為 true 時的 `pro_expires_at`，否則 null（所以「終身付費」與「沒付費」都是 null）；
  - `trial_ends_at`：只在試用能延長付費以外的存取時才有值（014 的修正）。
- **client 的推斷**（`pwa/js/platform/proEntitlement.js` 的 `getPaidProStateFromSnapshot()`）：
  - `expires_at` 在未來 → 有到期日的付費；
  - 沒有 `expires_at`、也沒有進行中的試用 → 只有終身付費能解釋「有 Pro」；
  - 沒有 `expires_at`、有進行中的試用 → 算試用。
- **用到的地方**：設定頁的 Pro 區塊（付費顯示到期日、試用顯示倒數與「升級 Pro」）、設定頁的帳號狀態（「付費 Pro／試用／免費」）、`storage.isPaidProUser()`／`getProExpiry()`。
- **風險在哪**：推斷依賴 014 的「付費涵蓋試用時不回報試用日期」這條規則。只要之後有人改 `my_pro_status()` 或付款的資料模型而沒注意到這條，付費的人可能被當成試用（看到「升級 Pro」），或試用的人被當成終身付費。這是畫面錯誤，不是授權錯誤：`isProUser()` 只看 `is_active` 與到期，不受推斷影響。

## 3. 提案

### 3.1 資料庫（S1）

- `my_pro_status()` 多回傳 `is_paid boolean`：

  ```sql
  COALESCE(e.is_pro = true AND (e.pro_expires_at IS NULL OR e.pro_expires_at > now()), false) AS is_paid
  ```

- **改回傳型別要 `DROP FUNCTION` 再建立**（`CREATE OR REPLACE` 不能改 `RETURNS TABLE`），在同一個 transaction 裡：
  1. `DROP FUNCTION public.my_pro_status();`
  2. `CREATE FUNCTION …`（014 的內容加上 `is_paid`，其餘不變）；
  3. 重新 `REVOKE ALL … FROM public, anon` 與 `GRANT EXECUTE … TO authenticated`（新函式會拿到預設權限）。
- **欄位加在最後面**：舊版 client 讀 `is_active`、`expires_at`、`trial_ends_at`，多一欄不影響（`normalizeProStatusRows()` 只檢查這三欄存在）。
- **測試**（ASSERT，本機 PG，沿用 014 的測試）：付費有期限、終身付費、試用中、試用中又終身付費、付費已過期、從沒付費，各自的 `is_paid`；權限（anon 不能執行）；舊的三欄結果不變。
- **回滾**：再執行一次 014 的定義（同樣 DROP＋CREATE＋權限）。新版 client 在沒有 `is_paid` 時退回推斷，所以回滾不會壞。

### 3.2 Client（S2）

- `normalizeProStatusRows()`：`is_paid` 存在時必須是 boolean（不是就當整列不可信），不存在時為 `null`（舊的 server）。
- snapshot 多存 `isPaid`；舊的 snapshot 沒有這一欄 → 照舊推斷。
- `getPaidProStateFromSnapshot()`：`isPaid` 是 boolean 就直接用；是 null 就用現在的推斷。
- `isProUser()` 不變（仍只看 `is_active` 與到期）。
- INFRA-105：只改既有模組內部的邏輯，不新增跨模組的 export。

### 3.3 順序

S1（repo）→ 擁有者套用 → S2（repo）。S2 也可以先上：沒有 `is_paid` 時行為與現在相同。

## 4. 好處與代價

- **好處**：付費／試用的判斷不再依賴 014 的那條規則；之後接上真正的付款（例如有期限的訂閱比試用短）時，畫面不會因為推斷而顯示錯誤。
- **代價**：一次 migration（擁有者在 production 套用）、client 的修改與測試。現在的推斷沒有錯，單獨做的收益小。

## 5. 與其他任務的關係

- **PRO-014G**（簽章的 receipt）：也要改 `my_pro_status()` 的回傳。若之後要做，兩者一起做，只 DROP＋CREATE 一次。
- **PRO-014E**（排行榜）：`get_leaderboard()` 的 `is_pro` 若決定只標付費的人（PRO-014E §9 第 5 點），可以用同一個付費判斷式。
- **PRO-017**（邀請制解鎖 Pro）：若邀請獎勵是有期限的 Pro，會寫進 `pro_entitlements`；`is_paid` 要不要把它算作「付費」需要在 PRO-017 一起決定（例如改名 `is_granted` 或另加來源欄位）。

## 6. 驗收

- 六種情況（§3.1 的測試）下，設定頁顯示的狀態與 server 一致。
- 舊版 client 在新的 server 上照常運作；新版 client 在舊的 server 上照常運作。
- `isProUser()` 的結果在所有情況下與修改前相同。

## 7. 需要擁有者決定

1. **時機**：
   - A（建議）：等下一次要改 `my_pro_status()` 時一起做（PRO-014G、接上付款或 PRO-017）；
   - B：現在單獨做（S1 → 套用 → S2）；
   - C：不做（推斷已精確，維持現狀並在 014 的註解保留那條規則的說明）。
2. **邀請或活動送的 Pro 算不算「付費」**（與 PRO-017 一起決定）：算（畫面顯示到期日，不顯示「升級 Pro」），或另外標示來源。
