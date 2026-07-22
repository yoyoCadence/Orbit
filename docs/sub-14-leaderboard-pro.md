# SUB-14 排行榜 Pro 強化 — Migration 提案 v3（送審）

- 狀態：**提案中；reviewer 確認 schema 後才實作 client 並執行 migration。migration 尚未於 Supabase 執行。**
- 分支：`feat/sub-14-leaderboard-pro`；Migration：[`pwa/db/011_leaderboard_pro.sql`](../pwa/db/011_leaderboard_pro.sql)
- v2：entitlement 改 server-owned、修正 view 安全模型敘述、補驗證清單。
- v3（本次，回應第二輪 review）：**不 backfill** 不可信 profiles Pro 值；SECURITY DEFINER 收緊（`search_path = ''` + schema qualification + 顯式權限契約）；`is_pro_active` **fail closed**（非 NULL boolean）＋ trial `<= now()` 上界；補「無 row → false」「未來 trial → false」驗證項；付費 Pro 路徑已拍板。

## 功能範圍

1. **Pro 頭像光環**（排行榜）— 對 Pro 生效中的公開使用者顯示光環 + `✦`。
2. **自訂顯示名稱（全站，Pro 專屬）** — 套用於 header／profile／排行榜／Personal Space；非 Pro 或未設定回退 `name`；Pro 失效自動回退。

## ⚠️ 範圍說明（重要）

reviewer 的 P1「Pro entitlement 可被使用者偽造」其實是**整個 Pro 系統既有的安全漏洞**（不只 SUB-14）：目前 `profiles_update` 只限制 row 擁有者、不限欄位，任何 authenticated user 都能對自己的 profile 寫 `is_pro = true`。SUB-14 只是讓它以「公開 Pro 徽章」顯性化。因此本提案把 SUB-14 擴大為 **Pro entitlement 伺服器授權化**的前置工作。

## Schema 變更（server-owned entitlement）

1. **`is_pro_active(...)` STABLE function（fail closed）** — 單一來源的 Pro 生效規則；view 與 `my_pro_status()` 共用，避免 SQL/JS 分叉。整體 `COALESCE(..., false)` 保證回傳非 NULL boolean（**無 entitlement row → false**）；trial 加 `<= now()` 上界，**未來時間戳不判為 Pro**。
2. **`entitlements` table（server-owned）** — `user_id` PK、`is_pro`、`pro_expires_at`、`trial_started_at`、`updated_at`。**雙層防護**：table privileges（`REVOKE ALL FROM anon, authenticated` 後只 `GRANT SELECT` 給 authenticated）＋ RLS（只 `SELECT` own row、無 write policy）→ authenticated 無法自寫 Pro，只有 `service_role`／SECURITY DEFINER RPC 能寫。**刻意不 backfill**（見下）。
3. **`start_trial()` SECURITY DEFINER RPC** — client 只能「開始試用」，伺服器寫 `now()`、`COALESCE` 保證一次性、不接受 client 傳入時間。
4. **`my_pro_status()` SECURITY DEFINER RPC** — current-user 讀自己的 server-authoritative Pro 狀態，供 client `isProUser()`（同一份規則）。
5. **SECURITY DEFINER hardening** — 兩支 RPC 皆 `SET search_path = ''` 並完整 schema qualification（`public.entitlements`、`public.is_pro_active(...)`、`auth.uid()`）；RPC 權限 `REVOKE FROM public, anon` 後只 `GRANT EXECUTE` 給 authenticated（[Supabase 官方建議](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)）。
6. **`profiles.display_name`** — 使用者內容（可自寫），`CHECK` 長度 ≤ 20 且拒絕控制字元/換行（emoji 允許）；client 另會 trim、渲染時 escape。
7. **`leaderboard_view`（`security_barrier = true`）** — `is_pro_active` 改由 join `entitlements` 計算；`display_name` 只在 `is_pro_active` 時經 `CASE`＋`NULLIF(btrim(...),'')` 暴露。

### 不 backfill（reviewer 決策）

`profiles.is_pro/pro_expires_at/trial_started_at` 在本 migration 前可由 authenticated 自寫，若 `INSERT ... SELECT FROM profiles` 會把**偽造的 lifetime Pro／未來 trial 洗成可信 entitlement**。因此 **011 不 backfill 任何 Pro 值**：用安全預設（無 row = 非 Pro）；試用由 `start_trial()` 按需建立；已知合法付費 Pro 由管理員以 `service_role` 依人工核准清單另行 seed；pre-production 既有 trial 於 cutover 後由使用者重開一次，換取乾淨信任邊界。

## View 安全模型（修正先前錯誤敘述）

先前文件誤稱「views 沿用底層 table RLS」。**更正**：PostgreSQL/Supabase 的 view 預設是 **security definer 並繞過底層 RLS**（[官方文件](https://supabase.com/docs/guides/database/postgres/row-level-security#views)）。既有排行榜正是靠 view owner 權限跨使用者彙整公開資料——若盲目改 `security_invoker = true`，owner-only 的 `profiles_select` 會讓排行榜只剩自己。

因此本 view 的安全邊界是：

- **顯式欄位清單**（不含 email 等敏感欄位）；
- **`WHERE p.is_public = true`**（使用者需自行開啟「顯示於排行榜」）；
- `display_name` 再加一層 `is_pro_active` 閘；
- 設定 `security_barrier = true`，且只 `GRANT SELECT` 給 authenticated。

## Migration 驗證清單（執行後須逐項記錄）

1. A 能在排行榜看到公開的 B。
2. A **看不到**未公開的 C（`is_public = false`）。
3. 非 Pro（或未設定）使用者的 `display_name` 為 `NULL`。
4. Pro 到期後，該使用者的 `is_pro_active` 轉 false、`display_name` 自動回退。
5. 一般 authenticated **無法**改自己的 entitlement（insert/update/delete 皆被 RLS + table privileges 拒絕）；`start_trial()` 只能開始一次。
6. A **無法**改 B 的 `display_name`（`profiles_update` 仍 `auth.uid() = user_id`）。
7. **無 entitlement row** 的公開使用者 → `is_pro_active` 為 `false`（非 NULL）。
8. **未來的 `trial_started_at`**（例：偽造）→ `is_pro_active` 為 `false`。

## 付費 Pro 授予路徑（reviewer 已拍板）

entitlement 改 server-owned 後，**client 不能再自行寫 `is_pro`**。試用已由 `start_trial()` RPC 解決。付費 Pro：

- **目前開發階段**：由管理員以 `service_role` 在 SQL Editor 依人工核准清單授予（`service_role` **永不進 client**）。
- **真正開放購買前**：必須改為 **Supabase Edge Function + 金流 webhook 的冪等授權**。
- ⚠️ 本 PR 明載：**尚不可提供真實付費購買**；此限制不阻擋 schema / client slice。

## Client 變更計畫（schema 確認後才動工）

| 檔案 | 變更 |
|---|---|
| `storage.js` | `isProUser()` 改讀 `my_pro_status()`（server-authoritative）並快取；停止寫 `profiles.is_pro`；試用改呼叫 `start_trial()` RPC。`display_name` 隨 profile 同步。 |
| `settings.js` | Pro 門控「顯示名稱」輸入（≤20、trim、`maxlength`）；沿用 `isProUser()` + `pro-badge--corner` + `_goToProCard()`。 |
| `ui/header.js`、`pages/profile.js` | 顯示名稱改用 `effectiveDisplayName(user)`：`isProUser() && displayName ? displayName : name`。 |
| `personalSpace/v2/viewModels.js` | **僅 presentation projection**：每次 render 由當前 profile + trusted entitlement 推導名稱；**不**把 Pro display name 寫進 V2 world snapshot／ledger／任何持久 domain state（對應 reviewer 第 3 點，避免 Pro 到期殘留舊名）。 |
| `pages/leaderboard.js` | `is_pro_active` → 頭像光環 class + `✦`；名稱用 `r.display_name || r.name`（仍 escape）。 |
| `assets/style.css` | `.lb-avatar--pro` 光環（`prefers-reduced-motion` 下不動畫）。 |

## 測試計畫

- `tests/unit/leaderboard.test.js`：`is_pro_active` → 光環 class 有/無；`display_name` 顯示與回退；仍 escape。
- `tests/unit/settings.test.js`：非 Pro 鎖定/導向 Pro；Pro 可儲存 display_name（trim、長度、空白邊界）。
- entitlement 授權由 migration 驗證清單於 Supabase 人工核對（SQL 不在此 repo 做單元測試）。

## Rollback

見 `011_leaderboard_pro.sql` 末段（還原 view → drop functions → drop entitlements → drop display_name；client 需先停止讀寫）。
