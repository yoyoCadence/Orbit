# PRO-014A — Server-owned Pro entitlement foundation

- 狀態：**migration 與 contract tests 已收斂；尚未於任何 Supabase 環境執行。**
- 分支：`feat/sub-14-leaderboard-pro`；Migration：[`pwa/db/011_leaderboard_pro.sql`](../pwa/db/011_leaderboard_pro.sql)
- 本文件只涵蓋 `PRO-014A`。client cutover、trial UI、`display_name`、排行榜 glow 與 Personal Space 投影分別留給 `PRO-014B`～`PRO-014F`。

## 本次範圍

1. `public.pro_entitlements`：server-owned 的 Pro／到期／試用時間單一資料來源。
2. `public.pro_trial_duration()` 與 `public.is_pro_active(...)`：唯一 trial 長度常數與 fail-closed 生效規則。
3. `public.start_trial()`：不接受 client 時間參數、伺服器寫入且不可重開的受控 RPC。
4. `public.my_pro_status()`：只回傳目前登入者的 `is_active`、`expires_at`、`trial_ends_at` read model，避免 client 重複 15 天常數與有效性規則。
5. RLS、table/function grants 與可在現有 Vitest CI 執行的 SQL contract tests。

本次不修改既有 `profiles` 欄位、`leaderboard_view`、client 程式、auth flow 或任何使用者介面，也不做版本 bump。

## ⚠️ 範圍說明（重要）

目前 `profiles_update` 只限制 row 擁有者、不限欄位，任何 authenticated user 都能對自己的 profile 寫 `is_pro = true`。`PRO-014A` 先建立新的可信任邊界，但在 `PRO-014B` 完成 client cutover 前，既有 UI 仍讀 legacy profile 欄位；因此本 migration 單獨部署不會立即修復 client gate，也不會改變現有使用者行為。

## Schema 變更（server-owned entitlement）

1. **`pro_trial_duration()` IMMUTABLE + `is_pro_active(...)` STABLE（fail closed）** — trial 長度只在內部 helper 定義一次，active window 與 status 到期日共用；`COALESCE(..., false)` 保證回傳非 NULL boolean，trial 加 `<= now()` 上界，未來時間戳不判為 Pro。兩支 helper 都不授權給 client roles，只供受控 DB function 呼叫。
2. **`pro_entitlements` table（server-owned）** — `user_id` PK、`is_pro`、`pro_expires_at`、`trial_started_at`、`updated_at`。`BEFORE UPDATE` trigger 只在 entitlement 欄位實際改變時刷新 `updated_at`，涵蓋受控 RPC 與管理端 seed／續期。**雙層防護**：table privileges（先對 `PUBLIC`／`anon`／`authenticated` `REVOKE ALL`，再只 `GRANT SELECT` 給 `authenticated`）＋ RLS（唯一 policy 僅允許 `(select auth.uid()) = user_id` 的 `SELECT`，無 write policy）。
3. **`start_trial()` SECURITY DEFINER RPC** — client 只能「開始試用」，伺服器寫 `now()`、`COALESCE` 保證一次性、不接受 client 傳入時間。
4. **`my_pro_status()` SECURITY DEFINER RPC** — 只以 `auth.uid()` 查目前登入者；固定回傳一列 server-derived snapshot，無 row／未登入／資料異常時 `is_active = false` 且日期為 NULL；`expires_at` 只在 `is_pro = true` 時回傳，未來 trial 不回傳 `trial_ends_at`，合法 trial 結束日與 active window 共用 `pro_trial_duration()`。
5. **SECURITY DEFINER hardening** — 兩支 RPC 皆 `SET search_path = ''` 並完整 schema qualification（`public.pro_entitlements`、`public.is_pro_active(...)`、`auth.uid()`）；函式建立後立即對 `PUBLIC`／`anon` revoke，只向 `authenticated` grant 必要 RPC（[Supabase 官方建議](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)）。

### 不 backfill（reviewer 決策）

`profiles.is_pro/pro_expires_at/trial_started_at` 在本 migration 前可由 authenticated 自寫，若直接 backfill 會把偽造值洗成可信 entitlement。因此 011 不搬移任何 legacy Pro 值：無 row 即非 Pro；合法付費名單的轉換程序需在 `PRO-014D` 另行審核，且不得由前端執行。

## 自動 contract tests

[`tests/unit/proEntitlementsSql.test.js`](../tests/unit/proEntitlementsSql.test.js) 會在既有 `npm test` 中檢查 migration contract：

- 唯一 RLS policy 是 owner-scoped `SELECT`，且使用 `(select auth.uid())`。
- `authenticated` 沒有 table write privilege，也沒有 INSERT／UPDATE／DELETE policy。
- `SECURITY DEFINER` RPC 固定空 `search_path`、只查 calling user、拒絕公開執行。
- trial 時間只能由 server `now()` 產生且採一次性 `COALESCE`。
- status RPC 直接回傳 `is_active`、經狀態過濾的付費到期日與 trial 結束日，不讓 client 重複有效性常數或渲染無意義／未來日期。
- entitlement 實際變更會由 trigger 維護 `updated_at`，重複 no-op trial 不會改寫 timestamp。
- migration 不含 `display_name`、`leaderboard_view` 或 client/UI cutover。

執行：`npm run test -- tests/unit/proEntitlementsSql.test.js`

## Migration 驗證清單（執行後須逐項記錄）

本任務不執行 migration。`PRO-014D` 在獨立非 production 專案套用後，至少逐項記錄：

1. owner 只能讀自己的 row；A 無法讀取 B。
2. authenticated 對自己的 row 直接 insert／update／delete 全部失敗。
3. anon 無法讀 table，也無法執行兩支 RPC。
4. `start_trial()` 重複與併發呼叫都回傳同一個 `trial_started_at`。
5. 無 row、已到期、未來 trial 與 NULL 組合都由 `my_pro_status()` fail closed；`is_pro = false` 不回 `expires_at`，未來 trial 不回 `trial_ends_at`，合法 trial 結束日由共享 helper 計算。
6. 管理端實際變更 entitlement 時 `updated_at` 會刷新；重複 no-op trial 不會改寫 timestamp。
7. Supabase Security／Performance Advisors 無新增警告。
8. 依 preview 專案當下的 Data API exposure 設定驗證 `my_pro_status` RPC；不得為了 client read 擴大 `pro_entitlements` table exposure。

## 既有 Pro cutover 程序（須於 PRO-014D 演練）

1. **名單來源**：只接受可追溯的管理員核准清單或未來 billing／webhook 紀錄；禁止從 client-writable `profiles.is_pro`、`pro_expires_at`、`trial_started_at` 匯入。現階段若沒有可驗證的付費紀錄，核准名單應為空。
2. **核准與輸入**：由兩人覆核 user UUID、授權類型與到期日，產生一次性 seed input；不得把 access token、service key 或 email 寫進 repo。seed 只在 Supabase SQL Editor 或受信任 backend 以管理權限執行。
3. **時點**：先在 preview 套用 011，再 seed 核准名單，完成 row count／抽樣與跨帳號 denial；只有上述結果與 rollback 演練通過後，才可排 production schema-first rollout。client gate 必須在 production migration 與 seed 對帳成功後才啟用。
4. **對帳與 rollback**：保存核准筆數、成功筆數、拒絕／重複筆數與執行人；若任一筆不符，停止 client rollout，依核准 input 移除或修正 seed row，必要時在 client cutover 前執行本文件 rollback。
5. **trial 使用者**：不搬移 legacy trial；pre-production 使用者在 cutover 後可透過受控 `start_trial()` 重新開始一次，production 是否採相同策略須在 rollout 前另行核准並公告影響。

## 部署順序、相容期與觀測

1. PR #132 完成 `PRO-014A` 的 code review／CI 後即可合併，但不得在任何 Supabase 環境套用 migration；`PRO-014D` 不阻擋 #132 review。
2. `PRO-014B` 完成 server-derived 的 UI entitlement projection 與 fail-closed cache（已完成，非安全邊界 —— 見 [`pro-014-entitlement-integrity.md`](pro-014-entitlement-integrity.md) 第 0 節）；`PRO-014C` 完成 trial RPC 與 gate 路徑但**不做 cutover**。production cutover 是 `PRO-014H`，前置為 C、D、`PRO-014I`，並需另行核准。
3. `PRO-014D` 取得明確核准後，在獨立非 production 專案套用 011，依上述程序演練核准名單 seed、權限矩陣、觀測與 rollback。
4. preview 通過後才另案核准 production schema-first rollout：先 migration／seed／對帳，再啟用 client gate；任何階段失敗都停止後續步驟。
5. 觀測 RPC permission errors、`start_trial` 錯誤率、row 數與到期分布；不得記錄 access token 或 service key。真實付款授權必須來自受信任後端／金流 webhook，不得把 privileged key 放進 client。

相容期內 legacy profile 欄位保持不動，現有 client 行為不變；新 table 預設為空，直到後續任務完成前不得作為使用者可見 gate。

## Rollback

在 client cutover 前，依 `011_leaderboard_pro.sql` 末段順序移除 `my_pro_status`、`start_trial`、`pro_entitlements`、trigger helper、`is_pro_active` 與 `pro_trial_duration`。若已進入 client cutover，必須先把 client gate 回退到相容讀路徑，再移除 DB objects；禁止直接在 production 嘗試未演練的 rollback。
