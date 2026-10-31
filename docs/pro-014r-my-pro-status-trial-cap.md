# PRO-014R＋PRO-014N 提案：`my_pro_status()` 不再用試用日期限制付費帳號

> 狀態：**提案，等待使用者核准**（2026-10-31）。只寫文件，不改程式碼、不動 production。屬 Pro entitlement 路徑與 RPC 變更（AGENTS.md §3 高風險），核准前不實作。

## 1. 結論

- **問題**：
  - 切到 `server` source（`PRO-014H`）之後，「先試用、後買終身」的使用者會被判定為**不是 Pro**（`PRO-014R`）。
  - 不只這些人：app 啟動時，只要 profile 沒有 `trialStartedAt` 就會呼叫 `start_trial()`（`pwa/js/app.js`），而它的 `ON CONFLICT … COALESCE` 會替已存在的終身資料列補上試用起點。因此**為 `PRO-014H` 寫入核准名單的每一個終身帳號**，都會依序變成第 7 列、再變成第 5 列（§3），最後失去 Pro。
  - 在試用期間買了終身方案的人，會被顯示成「試用中」，試用結束後也一樣失去 Pro（`PRO-014N` 描述的歧義，以及它衍生的授權錯誤）。
- **原因**：`my_pro_status()` 只要帳號開始過試用，就回傳 `trial_ends_at`，付費帳號也一樣。client 把 `expires_at` 和 `trial_ends_at` 中較晚的一個當成 Pro 的上限；終身付費的 `expires_at` 是 NULL，上限就只剩已經過去的試用結束日。
- **建議（方案 A）**：只改 RPC 的一個欄位。當付費已經涵蓋整段試用（終身，或到期日不早於試用結束），`trial_ends_at` 回傳 NULL。
  - 同一個函式以 `CREATE OR REPLACE` 更新，回傳欄位與型別不變，權限、`SECURITY DEFINER`、`search_path` 都保留。
  - **client 不需要改邏輯**，舊版 app 也立即適用。
  - 12 個情境的實測全部正確（§3）。
- **對 production 的影響**：目前是 `legacy` source，`refreshProEntitlement()` 在 `legacy` 下不會呼叫這個 RPC（`pwa/js/storage.js`），所以套用後到 `PRO-014H` 切換前，**一般使用者沒有任何可見變化**。只有以本機覆寫改用 `server` source 的驗證裝置會呼叫它。
- **PRO-014N**：它的完成條件原文是「終身付費與試用可明確區分，**不需推斷**；試用期間購買終身方案顯示為付費」，範圍是「client 改讀該欄位、**移除推斷邏輯與其測試**」。
  - 方案 A 做到前半與後半的結果：區分正確、試用期間購買終身顯示為付費（§3 第 7 列）。
  - 但 A **保留** `getPaidProStateFromSnapshot()` 的推斷，只是讓推斷在 014 之後變得精確，並沒有「不需推斷」。
  - 所以「以 A 結案 PRO-014N」等於**重新定義** PRO-014N：推斷保留且精確，「不需推斷、明確的 `is_pro` 欄位」改列為可選的方案 B。這需要你在 §9 明確同意。

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

**為什麼會擴及所有終身帳號**：`pwa/js/app.js` 在登入後，只要 profile 沒有 `trialStartedAt` 就呼叫 `start_trial()`，付費與否都一樣。`start_trial()` 用 `ON CONFLICT … DO UPDATE SET trial_started_at = COALESCE(e.trial_started_at, EXCLUDED.trial_started_at)`（011），會替已存在、沒有試用起點的終身資料列補上「現在」。

- 寫入核准名單的終身帳號（第 6 列）第一次登入後就變成第 7 列。
- 15 天後試用結束，變成第 5 列，在 `server` source 下失去 Pro。
- 已在 PostgreSQL 16 重現：終身資料列加上 `start_trial()` 之後，現行 RPC 回傳 15 天後的 `trial_ends_at`，提案回傳 NULL。

## 3. 實測（2026-10-31）

方法：
- 在 PostgreSQL 16 上套用真實的 001、004、005_profiles_extra_cols、006、011、013 migration。
- 用 12 種 `pro_entitlements` 狀態，以 `authenticated` 身份呼叫 `my_pro_status()`，取得現行與提案兩個版本的回應。
- 把回應交給**真實的** client 模組（`applyProStatusResponse` → `isProFromSnapshot`／`getPaidProStateFromSnapshot`／`getTrialEndsAtFromSnapshot`）。
- 分別在取得當下與 3 小時後判讀。粗體是錯誤的結果。
- 獨立 review 另外跑了 19 個邊界情境（付費到期日等於試用結束、早 1 微秒、未來的試用、`is_pro = false` 但有到期日、在 24 小時 snapshot 內跨越邊界等），每 15 分鐘判讀一次。提案沒有錯判，也沒有多給 Pro；唯一的差異是「在 snapshot 期間才開始的試用」要等下一次重新整理才生效，現行與提案相同。

| # | 情境 | 應為 | 現行 | 提案 | `isTrialUser`／倒數來源（現行 → 提案） |
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
| 11 | 付費 2 小時後到期，試用還剩 14 天 | 付費；3 小時後試用 | 付費 → 試用 | 付費 → 試用 | 顯示 → 顯示 |
| 12 | 試用開始時間在未來 | 非 Pro | 非 Pro | 非 Pro | 無 → 無 |

- 第 8 列：現行會讓付費使用者的 `isTrialUser()` 為 true（成為試用倒數的資料來源），提案不會。首頁的試用橫幅只在剩 5 天以內、且當天未被關閉時顯示，所以這一列的 14 天在當下還不會出現，但到最後 5 天會出現在付費使用者面前。
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
  - `CREATE OR REPLACE` 保留既有的 `GRANT`／`REVOKE`。014 仍在後面重述 `REVOKE ALL … FROM public, anon` 與 `GRANT EXECUTE … TO authenticated`（可重複執行）：若套用時函式不存在（例如 011 被回滾過），`CREATE` 會讓 `anon` 經由預設權限取得執行權，已實測。
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

- 只在取得 snapshot 時試用已經結束，才修好第 5 列。
- 第 7 列不只顯示錯：試用在 snapshot 有效期間結束時，到下一次重新整理之前會**失去存取**（review 的模擬中，24 小時內 96 個判讀點有 92 個錯）。
- 第 8 列的試用倒數仍然錯，而且要部署 client，舊版快取仍有問題。
- 同樣屬於 entitlement 邏輯變更，效益最小。

## 5. 建議

- 採用 **A**。
- `PRO-014N` 以 A 結案，並把它重新定義為「區分正確、推斷精確」；「不需推斷的明確欄位」（B）列入 Backlog 作為可選加固。
- `PRO-014H` 的前置從「`PRO-014R`」改成「014 已套用到 production」。

## 6. 核准後的實作（一個 PR）

1. `pwa/db/014_my_pro_status_trial_cap.sql`：§4 A 的 `CREATE OR REPLACE FUNCTION`，加上重述的 `REVOKE`／`GRANT`。檔頭寫明套用前比對、回滾來源與執行日期（PENDING）。
2. `tests/database/pro014r.test.sql`：
   - **寫成 `bug109.test.sql` 的樣式（純 SQL 的 `DO` 區塊加 `ASSERT`），不用 pgTAP**。pgTAP 的 `ok()`／`is()` 失敗時只回傳「not ok」列、不會中止；Supabase SQL Editor 只顯示最後一個陳述式的結果（`ROLLBACK`），失敗會看起來像通過。`ASSERT` 失敗會中止 transaction 並顯示錯誤，乾跑才有意義。
   - 以 `authenticated` 與 `request.jwt.claim.sub` 逐一呼叫，涵蓋 §3 的 12 個情境與 `>=` 邊界（付費到期日等於試用結束、早 1 微秒）；
   - 斷言 `is_active`，以及 `expires_at`、`trial_ends_at` 的**實際值**，不只是否為 NULL；
   - 全部在 transaction 內，結尾 rollback。在 production 乾跑時，`auth.users` 的合成資料列也會被回滾；也可以改用 5 個測試帳號的 UUID。
3. `tests/unit/proEntitlementsSql.test.js`：鎖住 014 的契約：
   - 回傳型別不變；
   - `SECURITY DEFINER` 與 `search_path = ''`；
   - 新條件。
4. client 單元測試：以 §3 的 12 組 RPC 回應為 fixture，鎖住 client 的判讀，包括 `isTrialUser`／試用倒數。
5. `proEntitlement.js`：只更新註解：`getPaidProStateFromSnapshot()` 的推斷說明（014 後是精確的），以及 `normalizeTimestamp()` 與 `entitlementExpiryMs()` 附近描述 NULL 意義的註解。不改邏輯，但檔案屬於部署範圍，所以照 §14 `npm run bump -- patch`。
6. 文件：
   - `docs/pro-test-accounts.md` 的終身帳號說明；
   - `docs/sub-14-leaderboard-pro.md` 描述 RPC 契約的段落；
   - `npm run bump` 產生的 CHANGELOG 條目；
   - `tasks.md`：PRO-014R、PRO-014N 結案，PRO-014H 前置更新；
   - 交接紀錄。

## 7. 套用到 production（專案擁有者執行，與 BUG-109A 同一套流程）

1. 以 `pg_get_functiondef('public.my_pro_status()'::regprocedure)` 比對 production 與 011，存下回滾來源。
2. 乾跑：在同一個 transaction 內套用 014，再跑 `tests/database/pro014r.test.sql`，最後 `ROLLBACK`。
3. 正式套用 014，重新查詢確認：函式定義；`has_function_privilege('anon', 'public.my_pro_status()', 'EXECUTE')` 為 false、`authenticated` 為 true；`pg_proc` 的 `prosecdef` 為 true、`proconfig` 為 `search_path=""`、owner 未變。
4. 驗證：在一台裝置上暫時改用 `server` source。在瀏覽器 console 執行 `localStorage.setItem('orbit_pro_entitlement_source', 'server')` 後重新整理；只能從 `legacy` 往 `server` 的方向設定。登入 `+orbit-lifetime`，應顯示終身付費 Pro。驗完再清掉這個設定。 另外 4 個測試帳號也要確認沒有回歸（免費、試用中、付費、付費已過期，應與 `docs/pro-test-accounts.md` 的表一致）。

套用時機不受 `PRO-014H` 限制。在 `legacy` 下套用沒有可見影響，可以先套、先驗證。

## 8. 風險

- **SQL 寫錯**：
  - production 一般裝置目前不呼叫這個 RPC，只有以本機覆寫改用 `server` 的驗證裝置會受影響；
  - 第 7 節的乾跑會先抓到錯誤（前提是測試用 `ASSERT`，見 §6 第 2 點）；
  - 回滾只需要重新執行一個函式定義。
- **語意耦合**：「`trial_ends_at` 為 NULL」從「沒有試用」變成「沒有會延長存取的試用」。
  - client 現有的 3 個使用點：`entitlementExpiryMs()` 當存取上限、`getTrialEndsAtFromSnapshot()` 當倒數來源、`getPaidProStateFromSnapshot()` 用它區分付費與試用，三者都符合新語意（第 3 個因此變得精確）。
  - 具體的未來風險：`app.js` 決定是否呼叫 `start_trial()` 的判斷，以及 `storage.js` 的 `getTrialProgressPercent()`，目前讀的是 profile 的 `trialStartedAt`；`PRO-014H` 計畫停止寫回這個欄位。屆時的替代來源**不可**把 `trial_ends_at IS NULL` 當成「從未試用」，應讀 `start_trial()` 的回傳或另外的欄位。這點寫進 014 的檔頭。
- **與 `PRO-014H` 核准名單無關**：擁有者自己的終身 Pro 仍只存在 `profiles`，切換前要另外寫入 `pro_entitlements`。

## 9. 需要使用者決定

1. 採用 **A**（建議）、B 或 C？
2. `PRO-014N` 是否以 A 結案？這代表接受**重新定義**：推斷保留且在 014 後精確，原本「不需推斷、移除推斷邏輯」的條件改由可選的方案 B 承接。（建議：是）
3. 實作 PR 合併後，014 由你在 production 套用（我沒有 Supabase 權限）。時間你決定，不必等 `PRO-014H`。
