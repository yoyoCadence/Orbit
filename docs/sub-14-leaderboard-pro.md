# PRO-014A — Server-owned Pro entitlement foundation

- 狀態：**migration 與 contract tests 已收斂；尚未於任何 Supabase 環境執行。**
- 分支：`feat/sub-14-leaderboard-pro`；Migration：[`pwa/db/011_leaderboard_pro.sql`](../pwa/db/011_leaderboard_pro.sql)
- 本文件只涵蓋 `PRO-014A`。client cutover、trial UI、`display_name`、排行榜 glow 與 Personal Space 投影分別留給 `PRO-014B`～`PRO-014F`。

## 本次範圍

1. `public.pro_entitlements`：server-owned 的 Pro／到期／試用時間單一資料來源。
2. `public.is_pro_active(...)`：fail-closed 的生效規則。
3. `public.start_trial()`：不接受 client 時間參數、伺服器寫入且不可重開的受控 RPC。
4. `public.my_pro_status()`：只回傳目前登入者狀態的 read RPC。
5. RLS、table/function grants 與可在現有 Vitest CI 執行的 SQL contract tests。

本次不修改既有 `profiles` 欄位、`leaderboard_view`、client 程式、auth flow 或任何使用者介面，也不做版本 bump。

## ⚠️ 範圍說明（重要）

目前 `profiles_update` 只限制 row 擁有者、不限欄位，任何 authenticated user 都能對自己的 profile 寫 `is_pro = true`。`PRO-014A` 先建立新的可信任邊界，但在 `PRO-014B` 完成 client cutover 前，既有 UI 仍讀 legacy profile 欄位；因此本 migration 單獨部署不會立即修復 client gate，也不會改變現有使用者行為。

## Schema 變更（server-owned entitlement）

1. **`is_pro_active(...)` STABLE function（fail closed）** — `COALESCE(..., false)` 保證回傳非 NULL boolean；trial 加 `<= now()` 上界，未來時間戳不判為 Pro。此 helper 不授權給 client roles，只供受控 DB function 呼叫。
2. **`pro_entitlements` table（server-owned）** — `user_id` PK、`is_pro`、`pro_expires_at`、`trial_started_at`、`updated_at`。**雙層防護**：table privileges（先對 `PUBLIC`／`anon`／`authenticated` `REVOKE ALL`，再只 `GRANT SELECT` 給 `authenticated`）＋ RLS（唯一 policy 僅允許 `(select auth.uid()) = user_id` 的 `SELECT`，無 write policy）。
3. **`start_trial()` SECURITY DEFINER RPC** — client 只能「開始試用」，伺服器寫 `now()`、`COALESCE` 保證一次性、不接受 client 傳入時間。
4. **`my_pro_status()` SECURITY DEFINER RPC** — 只以 `(select auth.uid())` 查目前登入者，無 row／未登入／資料異常皆回傳 `false`。
5. **SECURITY DEFINER hardening** — 兩支 RPC 皆 `SET search_path = ''` 並完整 schema qualification（`public.pro_entitlements`、`public.is_pro_active(...)`、`auth.uid()`）；函式建立後立即對 `PUBLIC`／`anon` revoke，只向 `authenticated` grant 必要 RPC（[Supabase 官方建議](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)）。

### 不 backfill（reviewer 決策）

`profiles.is_pro/pro_expires_at/trial_started_at` 在本 migration 前可由 authenticated 自寫，若直接 backfill 會把偽造值洗成可信 entitlement。因此 011 不搬移任何 legacy Pro 值：無 row 即非 Pro；合法付費名單的轉換程序需在 `PRO-014D` 另行審核，且不得由前端執行。

## 自動 contract tests

[`tests/unit/proEntitlementsSql.test.js`](../tests/unit/proEntitlementsSql.test.js) 會在既有 `npm test` 中檢查 migration contract：

- 唯一 RLS policy 是 owner-scoped `SELECT`，且使用 `(select auth.uid())`。
- `authenticated` 沒有 table write privilege，也沒有 INSERT／UPDATE／DELETE policy。
- `SECURITY DEFINER` RPC 固定空 `search_path`、只查 calling user、拒絕公開執行。
- trial 時間只能由 server `now()` 產生且採一次性 `COALESCE`。
- migration 不含 `display_name`、`leaderboard_view` 或 client/UI cutover。

執行：`npm run test -- tests/unit/proEntitlementsSql.test.js`

## Migration 驗證清單（執行後須逐項記錄）

本任務不執行 migration。`PRO-014D` 在獨立非 production 專案套用後，至少逐項記錄：

1. owner 只能讀自己的 row；A 無法讀取 B。
2. authenticated 對自己的 row 直接 insert／update／delete 全部失敗。
3. anon 無法讀 table，也無法執行兩支 RPC。
4. `start_trial()` 重複與併發呼叫都回傳同一個 `trial_started_at`。
5. 無 row、已到期、未來 trial 與 NULL 組合都由 `my_pro_status()` fail closed。
6. Supabase Security／Performance Advisors 無新增警告。

## 部署順序、相容期與觀測

1. 合併 `PRO-014A`，但不套用 migration。
2. `PRO-014B` 完成可信 snapshot 與 fail-closed cache；`PRO-014C` 再切換 trial／所有 Pro gate。
3. `PRO-014D` 取得明確核准後，先在獨立非 production 專案套用 011 並跑完整驗證矩陣。
4. 觀測 RPC permission errors、`start_trial` 錯誤率、row 數與到期分布；不得記錄 access token 或 service key。
5. 通過後才另案規劃 production rollout；真實付款授權必須來自受信任後端／金流 webhook，不得把 privileged key 放進 client。

相容期內 legacy profile 欄位保持不動，現有 client 行為不變；新 table 預設為空，直到後續任務完成前不得作為使用者可見 gate。

## Rollback

在 client cutover 前，依 `011_leaderboard_pro.sql` 末段反向移除 `my_pro_status`、`start_trial`、`is_pro_active` 與 `pro_entitlements` 即可。若已進入 client cutover，必須先把 client gate 回退到相容讀路徑，再移除 DB objects；禁止直接在 production 嘗試未演練的 rollback。
