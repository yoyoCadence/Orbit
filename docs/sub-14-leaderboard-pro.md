# SUB-14 排行榜 Pro 強化 — Migration 提案 v2（送審）

- 狀態：**提案中；reviewer 確認 schema 後才實作 client 並執行 migration。migration 尚未於 Supabase 執行。**
- 分支：`feat/sub-14-leaderboard-pro`；Migration：[`pwa/db/011_leaderboard_pro.sql`](../pwa/db/011_leaderboard_pro.sql)
- v2 變更：回應 PR #132 review — entitlement 改 server-owned、修正 view 安全模型敘述、補驗證清單。

## 功能範圍

1. **Pro 頭像光環**（排行榜）— 對 Pro 生效中的公開使用者顯示光環 + `✦`。
2. **自訂顯示名稱（全站，Pro 專屬）** — 套用於 header／profile／排行榜／Personal Space；非 Pro 或未設定回退 `name`；Pro 失效自動回退。

## ⚠️ 範圍說明（重要）

reviewer 的 P1「Pro entitlement 可被使用者偽造」其實是**整個 Pro 系統既有的安全漏洞**（不只 SUB-14）：目前 `profiles_update` 只限制 row 擁有者、不限欄位，任何 authenticated user 都能對自己的 profile 寫 `is_pro = true`。SUB-14 只是讓它以「公開 Pro 徽章」顯性化。因此本提案把 SUB-14 擴大為 **Pro entitlement 伺服器授權化**的前置工作。

## Schema 變更（server-owned entitlement）

1. **`is_pro_active(is_pro, pro_expires_at, trial_started_at)` STABLE function** — 單一來源的 Pro 生效規則（付費未過期/永久，或 15 天試用內）；view 與 client 的 `my_pro_status()` 共用，避免 SQL/JS 規則分叉（對應 reviewer 對「不要 generated column、可用 view/STABLE function」的答覆）。
2. **`entitlements` table（server-owned）** — `user_id` PK、`is_pro`、`pro_expires_at`、`trial_started_at`、`updated_at`。RLS：**只給 `SELECT` own row，不建立任何 write policy** → authenticated 無法 insert/update/delete，只有 `service_role` 或下述 SECURITY DEFINER RPC 能寫。含自 `profiles` 的 backfill。
3. **`start_trial()` SECURITY DEFINER RPC** — client 只能「開始試用」，伺服器寫入 `now()` 且 `COALESCE` 保證一次性；不接受 client 傳入時間。
4. **`my_pro_status()` SECURITY DEFINER RPC** — 讓 current-user 讀自己的 server-authoritative Pro 狀態，供 client `isProUser()` 使用（同一份規則）。
5. **`profiles.display_name`** — 使用者內容（可自寫），`CHECK` 長度 ≤ 20 且拒絕控制字元/換行（emoji 允許）；client 另會 trim、渲染時 escape。
6. **`leaderboard_view`（`security_barrier = true`）** — `is_pro_active` 改由 join `entitlements` 計算；`display_name` 只在 `is_pro_active` 時經 `CASE`＋`NULLIF(btrim(...),'')` 暴露。

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
5. 一般 authenticated **無法**改自己的 entitlement（insert/update/delete 皆被 RLS 拒絕）；`start_trial()` 只能開始一次。
6. A **無法**改 B 的 `display_name`（`profiles_update` 仍 `auth.uid() = user_id`）。

## 待決定：付費 Pro 授予路徑（需 product / reviewer 拍板）

entitlement 改 server-owned 後，**client 不能再自行寫 `is_pro`**。試用已由 `start_trial()` RPC 解決，但**付費 Pro 需要一個受信任的寫入者**（service_role）：Supabase Edge Function／webhook（金流回呼）／或人工 admin。目前 app 是純 client PWA，尚無此後端。這是本提案唯一的架構性未決點；在拍板前，付費 Pro 可先由人工 service_role 授予。

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
