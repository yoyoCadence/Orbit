# PRO-014R＋PRO-014N 提案：`my_pro_status()` 不再用試用日期限制付費帳號

> 狀態：**提案，等待使用者核准**（2026-10-31）。只寫文件，不改程式碼、不動 production。屬 Pro entitlement 路徑與 RPC 變更（AGENTS.md §3 高風險），核准前不實作。

## 1. 結論

- **問題**：
  - 切到 `server` source（`PRO-014H`）之後，「先試用、後買終身」的使用者會被判定為**不是 Pro**（`PRO-014R`）。
  - 在試用期間買了終身方案的人，會被顯示成「試用中」，試用結束後也一樣失去 Pro（`PRO-014N` 描述的歧義，以及它衍生的授權錯誤）。
- **原因**：`my_pro_status()` 只要帳號開始過試用，就回傳 `trial_ends_at`，付費帳號也一樣。client 把 `expires_at` 和 `trial_ends_at` 中較晚的一個當成 Pro 的上限；終身付費的 `expires_at` 是 NULL，上限就只剩已經過去的試用結束日。
- **建議（方案 A）**：只改 RPC 的一個欄位。當付費已經涵蓋整段試用（終身，或到期日不早於試用結束），`trial_ends_at` 回傳 NULL。
  - 同一個函式以 `CREATE OR REPLACE` 更新，回傳欄位與型別不變，權限、`SECURITY DEFINER`、`search_path` 都保留。
  - **client 不需要改邏輯**，舊版 app 也立即適用。
  - 12 個情境的實測全部正確（§3）。
- **對 production 的影響**：目前是 `legacy` source，`refreshProEntitlement()` 在 `legacy` 下不會呼叫這個 RPC（`pwa/js/storage.js`）。所以套用後到 `PRO-014H` 切換前，**一般使用者沒有任何可見變化**。
- **PRO-014N**：它的完成條件「終身付費與試用可明確區分；試用期間購買終身方案顯示為付費」，方案 A 已經做到。建議以 A 結案；明確回傳 `is_pro` 欄位（方案 B）列為之後可選的加固。

## 2. 問題細節

`pwa/db/011_leaderboard_pro.sql` 目前的定義：

```sql
CREATE OR REPLACE FUNCTION public.my_pro_status()
RETURNS TABLE (
  is_active boolean,
  expires_at timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(
      public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at),
      false
    ) AS is_active,
    CASE
      WHEN e.is_pro = true THEN e.pro_expires_at
      ELSE NULL
    END AS expires_at,
    CASE
      WHEN e.trial_started_at IS NOT NULL AND e.trial_started_at <= now()
        THEN e.trial_started_at + public.pro_trial_duration()
      ELSE NULL
    END AS trial_ends_at
  FROM (SELECT auth.uid() AS user_id) AS caller
  LEFT JOIN public.pro_entitlements e ON e.user_id = caller.user_id;
$$;
```

client 端（`pwa/js/platform/proEntitlement.js`）：

- `isProFromSnapshot()` 以 `entitlementExpiryMs()` 為上限，而它取 `expiresAt` 與 `trialEndsAt` 之中**較晚**的一個；兩者都沒有才是無上限（終身）。
- `getPaidProStateFromSnapshot()` 用推斷判斷付費或試用：
  - 未到期的 `expiresAt` ⇒ 付費；
  - 沒有 `expiresAt`，也沒有生效中的試用 ⇒ 終身付費；
  - 其餘 ⇒ 試用。
- `getTrialEndsAtFromSnapshot()` 決定是否顯示「試用剩 X 天」的橫幅。

終身付費（`is_pro = true`、`pro_expires_at = NULL`）但試用已過期時，RPC 回傳 `is_active = true`、`expires_at = NULL`、`trial_ends_at = 過去`。client 的上限因此是過去的時間，`isProFromSnapshot()` 回傳 false，**server 明明說 active，client 卻拒絕**。

`PRO-014N` 原本寫「純呈現層，不影響授權」，這是錯的，2026-10-31 已更正。

## 3. 實測（2026-10-31）

方法：
- 在 PostgreSQL 16 上套用真實的 001、004、005_profiles_extra_cols、006、011、013 migration。
- 用 12 種 `pro_entitlements` 狀態，以 `authenticated` 身份呼叫 `my_pro_status()`，取得現行與提案兩個版本的回應。
- 把回應交給**真實的** client 模組（`applyProStatusResponse` → `isProFromSnapshot`／`getPaidProStateFromSnapshot`／`getTrialEndsAtFromSnapshot`）。
- 分別在取得當下與 3 小時後判讀。粗體是錯誤的結果。

| # | 情境 | 應為 | 現行 | 提案 | 試用橫幅（現行 → 提案） |
|---|---|---|---|---|---|
| 1 | 免費，從未試用 | 非 Pro | 非 Pro | 非 Pro | 無 → 無 |
| 2 | 試用中（第 1 天） | 試用 | 試用 | 試用 | 顯示 → 顯示 |
| 3 | 免費，試用已過期 | 非 Pro | 非 Pro | 非 Pro | 無 → 無 |
| 4 | 付費 30 天後到期，試用已過期 | 付費 | 付費 | 付費 | 無 → 無 |
| 5 | **終身，試用已過期**（PRO-014R） | 終身 | **非 Pro** | 終身 | 無 → 無 |
| 6 | 終身，從未試用 | 終身 | 終身 | 終身 | 無 → 無 |
| 7 | **試用期間買了終身**（PRO-014N） | 終身 | **試用**（試用結束後變成非 Pro） | 終身 | 顯示 → 無 |
| 8 | 試用期間買了 30 天方案 | 付費 | 付費 | 付費 | **顯示** → 無 |
| 9 | 付費已過期，試用已過期 | 非 Pro | 非 Pro | 非 Pro | 無 → 無 |
| 10 | 付費已過期，試用中 | 試用 | 試用 | 試用 | 顯示 → 顯示 |
| 11 | 付費 2 小時後到期，試用還剩 13 天 | 付費；3 小時後試用 | 付費 → 試用 | 付費 → 試用 | 顯示 → 顯示 |
| 12 | 試用開始時間在未來 | 非 Pro | 非 Pro | 非 Pro | 無 → 無 |

- 第 8 列：現行會對付費使用者顯示試用倒數，提案不會。
- 第 11 列：付費比試用先結束時，試用仍然有用，所以提案照常回報試用日期；3 小時後付費到期，由試用接手。

套用提案後，函式的權限不變：`authenticated` 可執行、`anon` 不可，`SECURITY DEFINER` 與 `search_path=""` 也保留。

## 4. 方案

### A：RPC 只改 `trial_ends_at` 的回報條件（建議）

```sql
CREATE OR REPLACE FUNCTION public.my_pro_status()
RETURNS TABLE (
  is_active boolean,
  expires_at timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(
      public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at),
      false
    ) AS is_active,
    CASE
      WHEN e.is_pro = true THEN e.pro_expires_at
      ELSE NULL
    END AS expires_at,
    CASE
      WHEN e.trial_started_at IS NULL OR e.trial_started_at > now() THEN NULL
      -- The trial is reported only while it can still extend access beyond
      -- what payment already gives; a lifetime or longer-lasting purchase
      -- makes it irrelevant, and reporting it would cap that purchase.
      WHEN e.is_pro = true
        AND (e.pro_expires_at IS NULL
             OR e.pro_expires_at >= e.trial_started_at + public.pro_trial_duration())
        THEN NULL
      ELSE e.trial_started_at + public.pro_trial_duration()
    END AS trial_ends_at
  FROM (SELECT auth.uid() AS user_id) AS caller
  LEFT JOIN public.pro_entitlements e ON e.user_id = caller.user_id;
$$;
```

- 規則只有一句：**試用只在還能延長付費以外的存取時才回報。**
- 回傳欄位、型別、名稱都不變。
  - `normalizeProStatusRows()` 要求每個宣告的欄位都在，這點仍然成立。
  - `CREATE OR REPLACE` 保留既有的 `GRANT`／`REVOKE`。
- client 的推斷因此變成精確：
  - `active`、沒有 `expiresAt`、也沒有 `trialEndsAt`，只可能是終身；
  - 只要試用是存取的原因，日期就一定會出現。
- 回滾：重新執行 011 的 `my_pro_status()` 定義（§2）。只改函式，不涉及資料。

### B：新增 `is_pro`（或 `is_paid`）回傳欄位（PRO-014N 原本的方向）

- 契約最明確，client 不必推斷。
- 改回傳型別不能用 `CREATE OR REPLACE`：要 `DROP FUNCTION` 再建立，並重新 `GRANT`／`REVOKE`（可包在同一個 transaction 裡）。
- client 要改成讀新欄位。舊版 server 沒有這個欄位時，要退回推斷；部署順序是先套 migration，再部署 client。
- 方案 A 不排斥 B，B 可以之後再做。

### C：只改 client（忽略取得 snapshot 時就已結束的試用）

- 修好第 5 列。
- 第 7、8 列的顯示仍然錯，而且要部署 client，舊版快取仍有問題。
- 同樣屬於 entitlement 邏輯變更，效益最小。

## 5. 建議

- 採用 **A**。
- `PRO-014N` 以 A 結案，B 列入 Backlog 作為可選加固。
- `PRO-014H` 的前置從「`PRO-014R`」改成「014 已套用到 production」。

## 6. 核准後的實作（一個 PR）

1. `pwa/db/014_my_pro_status_trial_cap.sql`：只有 §4 A 的 `CREATE OR REPLACE FUNCTION`。檔頭寫明套用前比對、回滾來源與執行日期（PENDING）。
2. `tests/database/pro014r.test.sql`：
   - 照 `pro014d.test.sql` 的方式，以 `authenticated` 與 `request.jwt.claim.sub` 逐一呼叫；
   - 斷言 §3 的 12 個情境的 `is_active`，以及 `expires_at`、`trial_ends_at` 是否為 NULL；
   - 全部在 transaction 內，結尾 rollback。
3. `tests/unit/proEntitlementsSql.test.js`：鎖住 014 的契約：
   - 回傳型別不變；
   - `SECURITY DEFINER` 與 `search_path = ''`；
   - 新條件。
4. client 單元測試：以 §3 的 12 組 RPC 回應為 fixture，鎖住 client 的判讀，包括試用橫幅。
5. `proEntitlement.js`：只更新 `getPaidProStateFromSnapshot()` 的註解，說明推斷在 014 後是精確的。不改邏輯，但檔案屬於部署範圍，所以照 §14 `npm run bump -- patch`。
6. 文件：
   - `docs/pro-test-accounts.md` 的終身帳號說明；
   - `tasks.md`：PRO-014R、PRO-014N 結案，PRO-014H 前置更新；
   - 交接紀錄。

## 7. 套用到 production（專案擁有者執行，與 BUG-109A 同一套流程）

1. 以 `pg_get_functiondef('public.my_pro_status()'::regprocedure)` 比對 production 與 011，存下回滾來源。
2. 乾跑：在同一個 transaction 內套用 014，再跑 `tests/database/pro014r.test.sql`，最後 `ROLLBACK`。
3. 正式套用 014，重新查詢函式定義確認。
4. 驗證：在一台裝置上暫時改用 `server` source。在瀏覽器 console 執行 `localStorage.setItem('orbit_pro_entitlement_source', 'server')` 後重新整理；只能從 `legacy` 往 `server` 的方向設定。登入 `+orbit-lifetime`，應顯示終身付費 Pro。驗完再清掉這個設定。

套用時機不受 `PRO-014H` 限制。在 `legacy` 下套用沒有可見影響，可以先套、先驗證。

## 8. 風險

- **SQL 寫錯**：
  - production 目前不呼叫這個 RPC，影響為零；
  - 第 7 節的乾跑會先抓到錯誤；
  - 回滾只需要重新執行一個函式定義。
- **語意耦合**：「`trial_ends_at` 為 NULL」從「沒有試用」變成「沒有會延長存取的試用」。
  - client 現有的 3 個使用點都只把它當成存取上限或倒數來源，符合新語意；
  - 之後新增的使用者若需要「試用開始過沒有」，應讀別的來源，例如 `start_trial()` 的回傳。這點寫進 014 的檔頭。
- **與 `PRO-014H` 核准名單無關**：擁有者自己的終身 Pro 仍只存在 `profiles`，切換前要另外寫入 `pro_entitlements`。

## 9. 需要使用者決定

1. 採用 **A**（建議）、B 或 C？
2. `PRO-014N` 是否以 A 結案，B 列為可選加固？（建議：是）
3. 實作 PR 合併後，014 由你在 production 套用（我沒有 Supabase 權限）。時間你決定，不必等 `PRO-014H`。
