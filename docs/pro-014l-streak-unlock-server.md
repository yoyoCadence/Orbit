# PRO-014L 提案：SUB-16 連勝解鎖改由 server 發放

> 狀態：使用者核准 §10（全部照建議；#226 的工作階段記錄 2026-11-02 的回覆，2026-11-04 在另一個工作階段再次確認）。L1 由 #226 實作、#233 帶到目前的 main（migration 012 與測試）；**2026-11-10 已套用到 production**（`PRO-014LA`，紀錄 #234，回填 0 筆）；L2（client）待做。擋 `PRO-014H` cutover。

## 1. 結論

- **為什麼要做**：
  - SUB-16 是「連勝 45 天送 30 天 Pro，每個帳號一次」。
  - 目前由 client 在換日時自己寫 `isPro`、`proExpiresAt`（`pwa/js/dayCycle.js`）。
  - 切到 `server` source（`PRO-014H`）後，Pro 只看 server 的 `pro_entitlements`，client 的寫入不再有效，這個獎勵會**靜默消失**。
- **草稿 #154**（2026-09-01，另一個工作階段）已經做出可用的設計：
  - 無參數的 `grant_streak_unlock()` RPC，由 server 依 sessions 計算連續 45 個有效日；
  - 以資料列鎖與 `streak_unlock_granted_at` 保證每個帳號只領一次，期限固定 30 天；
  - client 只「詢問」。
  - 它在本機 Supabase 做過完整驗證，包括並行領取、權限、rollback。
- **但 #154 不能直接合併**（§4）：
  - 以 v1.25.2 為基礎，現在的 main 是 v1.41.7；
  - 違反之後才訂的 INFRA-105 規則；
  - 資料庫測試是 pgTAP 寫法，在 SQL Editor 失敗時看起來像通過；
  - 每個免費使用者每次開機都會呼叫 RPC；
  - 寫回 legacy profile 的方式在「已領過」時會錯誤地授予或取消 Pro。
- **建議**：
  - 保留 #154 的 SQL 主體，不重做已驗證的鎖與一次性邏輯。只加一段回填，並在回傳加一個只代表付費、不含試用的 `paid_active`（§5.1）；測試改成 ASSERT。
  - 拆成三步：
    1. **L1**（repo）：migration 012 與 ASSERT 測試，不改 client；
    2. **LA**（擁有者）：在 production 套用 012；
    3. **L2**（repo）：client 改走 RPC。
  - 與 013／014 相同：migration 先進 main、擁有者套用、client 最後上線。

## 2. 現況

- `processYesterdayStreak()` 中的 SUB-16（PRO-014P 之後）：`streakDays >= 45`、Pro 狀態已知為 `not-pro`、`!streakUnlockUsed` 時，client 寫入：
  - `isPro = true`
  - `proExpiresAt = now + 30 天`
  - `streakUnlockUsed = true`
  
  再經 `saveUser()` 同步到 `profiles`。訪客（沒有帳號）在 `legacy` 下也是 `not-pro`，同樣會在本機拿到。
- `legacy`（目前 production）下這樣能用，因為 Pro 就是看 profile（訪客則是看本機）。
- `server` 下：
  - 寫入沒有效果；
  - 更糟的是 `streakUnlockUsed` 仍會被設為 true，所以使用者不但拿不到獎勵，以後也拿不到。
- 已知的信任問題：profile 是 client 可寫的，任何人都能自己寫 `is_pro`。這正是 PRO-014 整條工作要移除的東西，SUB-16 是最後一個 client 授權 Pro 的地方（`tests/unit/proGateCallSites.test.js` 鎖住它是「僅剩的一處」）。

## 3. 草稿 #154 的設計

**migration `012_streak_unlock_server.sql`**：
- `pro_entitlements` 新增 `streak_unlock_granted_at`；
- `updated_at` trigger 納入新欄位；
- 新增 `grant_streak_unlock()`：`SECURITY DEFINER`、`search_path = ''`、只 `GRANT EXECUTE` 給 `authenticated`。

**`grant_streak_unlock()` 的流程**：
1. 沒有登入就丟出 `42501`。
2. 從 caller 的 sessions 依 `calcDailyStats()` 的規則計算每天是否有效：生產 XP ≥ 50、有一個有效的 A／S 任務、娛樂 ≤ 120 分鐘。再以「日期減列號」把連續的有效日分成一段一段。只要有一段 ≥ 45 天，就算符合資格。只計 `date <= current_date`。
3. 確保資料列存在（`INSERT … ON CONFLICT DO NOTHING`），再以 `SELECT … FOR UPDATE` 鎖住，把同一帳號的並行請求排成一列。
4. 依序回傳：
   - 已領過 → `already_granted`；
   - 目前已是 Pro → `active_entitlement`，不消耗；
   - 不符合 → `not_eligible`；
   - 否則發放：`is_pro = true`、`pro_expires_at = now() + 30 天`、`streak_unlock_granted_at = now()`，回傳 `granted`。

**client**：
- `db.grantStreakUnlock()` 嚴格驗證回傳格式。
- 領到時（`granted`／`already_granted`）把 `is_pro = is_active`、`pro_expires_at = expires_at` 寫回 legacy profile；`server` source 下則重新 refresh projection。
- `requestStreakUnlock()` 每次開機呼叫，並在之後顯示慶祝 modal。
- 換日函式裡的 SUB-16 整段刪除。

**#154 自己的驗證**（`docs/pro-014l-local-validation.md`，在它的分支上）：
- 本機 Supabase（Postgres 17、PostgREST、GoTrue）依序套用 001–012；
- pgTAP 24/24；
- 真實 Data API 下同帳號並行兩次，恰好一次 `granted`、一次 `already_granted`；
- 偽造參數被拒絕；
- rollback 後重套仍通過；
- Advisors 沒有新增項目。

## 4. 對照目前的 main（實測 2026-11-02）

在本機 PostgreSQL 16 先套用 production 已有、與這次相關的 migration：001、002、004、005_profiles_extra_cols、006、007、008、009、011、013、014（略過 003、005_leaderboard、010：與 `pro_entitlements`、sessions 無關）。再套用 #154 的 012：**全部成功**。獨立 review 以同樣的順序重跑，結果相同。

| 情境 | 結果 |
| --- | --- |
| 只有 3 天 sessions | `not_eligible`，但 `pro_entitlements` **新增了一列** |
| 45 個連續有效日，在 **100 天前**結束 | **`granted`** |
| 試用中（1 天前開始）＋45 天 | `active_entitlement`，不消耗 |
| 試用已結束（40 天前）＋45 天 | `granted`；再呼叫一次是 `already_granted` |
| 上一列發放後的 `my_pro_status()` | `is_active = true`、有到期日、`trial_ends_at = NULL`（014 正確地不回報試用） |
| 第 45 天的 Session 日期是 UTC 的明天 | `not_eligible`（`date <= current_date` 排除；見第 6 點，L2 下不會發生） |

由此得到的檢視結果：

1. **基礎太舊，不能直接 rebase 合併**：
   - #154 以 v1.25.2 為基礎。之後 PRO-014P 改寫了同一段換日（SUB-16 改為只在 `not-pro` 時執行），AUDIT-001 也改過 `dayCycle.js`。
   - 以 `git merge-tree` 檢查：
     - 文字衝突在 `dayCycle.js`、`storage.js`、`proGateCallSites.test.js` 與版本相關的檔案；
     - `app.js`、`appBootSequence.test.js` 可以自動合併；
     - `pro014pRollover.test.js`（#154 的基礎沒有這個檔）不會衝突；刪掉 SUB-16 區塊後其中 2 個測試會失敗，4 個都需要改寫（另外 2 個會變成什麼都沒檢查）。
2. **違反 INFRA-105**（這條規則在 #154 之後才訂）：
   - `requestStreakUnlock` 是既有 SHELL 模組 `dayCycle.js` 的**新 export**，由同為 SHELL 模組的 `app.js` import。
   - 新的 named export 必須放在新模組。
   - `db.grantStreakUnlock()` 是既有物件上的新方法，不會造成 link 錯誤；但新舊版本混用時呼叫會是 `TypeError`，需要以 `typeof` 檢查。
3. **資料庫測試是 pgTAP**：
   - PRO-014R 時發現：SQL Editor 裡 pgTAP 的失敗不會中止，乾跑看起來會像通過。
   - 要改成 ASSERT 寫法（同 `tests/database/pro014r.test.sql`：先確認 `plpgsql.check_asserts`、`%L`、`begin`／`rollback`）。
4. **資格是「歷史上任何一段 45 天」，不是「目前的連勝 45 天」**：
   - 這比現在寬鬆。個人頁的「連勝解鎖 Pro x/45」顯示的是目前的連勝。
   - 例如試用期間連續 45 天、之後連勝中斷的人，試用結束後任何一次呼叫都會拿到。現在的 client 只有在「連勝仍 ≥ 45 且已不是 Pro」的換日才給。
   - sessions 本來就是使用者可寫的資料（#154 也明說不是防作弊的邊界），所以寬鬆與否不改變安全性，差別只在產品語意（§10 第 2 點）。
5. **每個免費使用者每次開機都呼叫，而且會建立資料列**：
   - #154 的 client 只要「已登入、不是 Pro、沒領過」就在每次開機呼叫，server 每次掃描該帳號全部 sessions。
   - 不符合資格的人第一次呼叫時就在 `pro_entitlements` 建一列（上表第 1 列）。功能上無害，但每次開機都多一個 RPC。
   - 修正：client 只在本機連勝 ≥ 45 時才詢問。這只是決定「要不要問」，資格仍由 server 判斷。
6. **UTC 日期在 L2 下沒有影響**：
   - server 以 UTC 的 `current_date` 排除「未來」的 sessions（上表最後一列）。
   - 但 client 的連勝只在換日時評估「昨天」：第 45 個有效日要等它成為當地的「昨天」，連勝才會到 45。
   - 當地的昨天不會晚於 UTC 的今天：時區在 UTC+14 以內都成立，與 `newDayHour` 無關；跨時區的多台裝置也一樣（那一天在處理它的裝置上已是「昨天」）。前提是裝置時鐘正確。012 以 `(now() AT TIME ZONE 'UTC')::date` 為界，不用 `current_date`：`current_date` 跟著呼叫者的 `TimeZone`（PostgREST 可由 `Prefer: timezone` 改變），在 UTC+14 會多算一天（#233 的獨立 review 實測）。
   - 所以 L2 在本機連勝 ≥ 45 才詢問時，第 45 天一定已經算在內，與現在 production 發放的時間相同。
   - 只有 #154「每次開機都問」時才會遇到上表最後一列。**維持 #154 的條件，不改。**
7. **已用過 SUB-16 的帳號，server 不知道**：
   - `profiles.streak_unlock_used = true` 的帳號在 server 沒有紀錄。
   - client 會因為這個旗標不再詢問，但直接呼叫 RPC 可以再領一次。
   - 可用一次性回填補上：在 server 只會「拒絕」、不會「授予」任何東西，所以不違反「不得從 client 可寫欄位匯入」的規則。前提是 client 的寫回要依第 8 點修正。
8. **寫回 legacy profile 的方式會授予或取消 Pro**（獨立 review 實測）：
   - #154 在 `granted` 與 `already_granted` 都把 `is_pro = is_active`、`pro_expires_at = expires_at` 寫回 profile。
   - `is_active` 包含試用。一個回填過的帳號開始試用後呼叫，得到 `already_granted`、`is_active = true`、`expires_at = NULL`；寫回後 legacy 把它當成**終身付費**（`isPaidProUser()` 把沒有到期日視為終身）。
   - 沒有試用時 `is_active = false`，寫回 `is_pro = false`，會**取消**還在 30 天內的 legacy SUB-16。
   - 只要本機的 `streakUnlockUsed` 是 false、server 已有紀錄就會發生：例如另一台裝置在同步前先問；或直接呼叫 RPC。
   - 但也不能在 `already_granted` 時完全不寫（Codex 指出）：
     - server 已經發放、但回應遺失或寫回 profile 失敗時，重試得到的是 `already_granted`；
     - 另一台裝置也可能在第一台寫回之前先拿到 `already_granted`。
     
     只寫「已領過」的話，`legacy` 下這個人就永遠不是 Pro。
   - 修正：
     - L1 讓 RPC 多回傳 `paid_active`：`is_pro` 且未到期（沒有到期日即終身），**不含試用**；
     - L2 在 `granted` 與 `already_granted` 都依 `paid_active` 寫回：
       - 是付費中：寫 `is_pro = true`、`pro_expires_at = server 的 expires_at`；
       - 不是：只寫 `streak_unlock_used = true`；
     - 只延長、不縮短、不取消：profile 已是終身（`isPro === true` 且 `proExpiresAt` 為 null），或已是 Pro 且到期日更晚時不寫；永遠不寫 `is_pro = false`。注意免費的 profile 的 `pro_expires_at` 也是 null，只看到期日會讓幾乎所有人都不寫回；
     - 永遠不把 `is_active` 對應到 `is_pro`。
9. **保護卡造成的缺口**：
   - 保護卡把連勝恢復為中斷前的天數，但那天沒有有效 Session，server 會看到缺口。
   - 保護卡只有 Pro 能用，所以影響的是「Pro 期間用過保護卡、之後不是 Pro、連勝 ≥ 45」的人：client 顯示 45/45，server 回 `not_eligible`。
   - server 不知道保護卡的使用紀錄（只在 profile），列為已知限制。
10. **部署順序與訪客**：
    - client 若比 012 先上 production，RPC 不存在，獎勵就不會發放（#154 也寫了不可顛倒）。L2 之後 `legacy` 下的 SUB-16 也改走 RPC，所以這個順序對**目前的 production 使用者**也有影響。
    - **訪客**：RPC 需要登入，L2 刪掉換日裡的 SUB-16 後，`legacy` 下的訪客就**完全拿不到** SUB-16（現在可以在本機拿到）。這是 production 的行為改變（§10 第 4 點）。

## 5. 建議方案

### 5.1 L1：migration 012（回填＋`paid_active`）與測試（repo，一個 PR，不改 client）

- 以 #154 的 012 為基礎，**保留**：
  - 資格條件（含 `date <= current_date`，第 6 點）；
  - 資料列鎖、一次性、30 天、`active_entitlement` 不消耗；
  - 權限與 `search_path`；
  - 「不符合也建立資料列」：它是已驗證的鎖設計的一部分，L2 只讓候選人呼叫。
- **加一段回填**（第 7 點），可重複執行：

  ```sql
  INSERT INTO public.pro_entitlements AS e (user_id, streak_unlock_granted_at)
  SELECT p.user_id, now() FROM public.profiles p WHERE p.streak_unlock_used = true
  ON CONFLICT (user_id) DO UPDATE
    SET streak_unlock_granted_at = now()
    WHERE e.streak_unlock_granted_at IS NULL;
  ```

  （L1 實作時由 `COALESCE` 改為 `WHERE … IS NULL`：結果相同，但重跑時回報的筆數就是新標記的帳號。）

  - 只寫 `streak_unlock_granted_at`，不動 `is_pro`、`pro_expires_at`、`trial_started_at`。獨立 review 確認：新列是 `is_pro = false`、日期為 NULL；`my_pro_status()` 與 `start_trial()` 的結果不變；重跑不改任何值，回報的筆數是新標記的帳號。
  - 回填的 `streak_unlock_granted_at` 是 LA 的時間，不是實際領取的時間。
  - LA 之後、L2 普及前，舊版 client 仍會用 profile 發放。PRO-014H cutover 前要再跑一次。
- **回傳加 `paid_active`**（第 8 點）：
  - `RETURNS TABLE` 多一欄 `paid_active boolean`，值是 `e.is_pro AND (e.pro_expires_at IS NULL OR e.pro_expires_at > now())`。
  - 每個分支都回傳；`granted` 時一定是 true。
  - 012 還沒套用到任何地方，所以改回傳型別不需要 `DROP FUNCTION`。
  - `is_active` 保留（含試用），但 client 不用它決定寫回。
- **資格語意**：維持 #154 的「任何一段 45 天」（§10 第 2 點，建議）。如果你選「目前的連勝」，加一個條件：那一段的最後一天 ≥ `current_date - 1`，這會帶入時區的誤差。
- **測試**：
  - `tests/database/pro014l.test.sql` 改成 ASSERT 寫法，涵蓋：
    - 45／44 天、缺口、娛樂超過、未來日期；
    - 歷史上的一段 45 天、試用中、試用已結束、已領過；
    - 權限（anon 不可執行、authenticated 不可直接 UPDATE）；
    - `SECURITY DEFINER`／`search_path`；
    - 發放後 `my_pro_status()` 的回報；
    - `paid_active`：試用中為 false、發放後為 true、付費到期後為 false、終身為 true。
  - **回填**：回填在 012 內、測試資料建立之前就執行，所以測試要對一個 fixture 再跑一次回填的 SQL，確認它只寫標記、不改其他欄位，而且之後 RPC 回 `already_granted`。重跑時限定在 fixture 的 `user_id`：LA 第 5 步在 production 跑這個測試時，不應碰到真實帳號（雖然會 rollback，也會讓筆數的檢查失準）。
  - 帶入 #154 的 `tests/database/pro014l.rollback.sql` 作為 LA 的回滾腳本。
  - `tests/unit/` 加 SQL 契約測試（同 `proEntitlementsSql.test.js` 的形式）。
  - 在本機 PostgreSQL 依上面的順序實際執行。
- `docs/pro-014l-local-validation.md` 移到 main 作為依據，註明：
  - 它驗的是 #154 的版本；
  - L1 加了回填與 `paid_active`；
  - `scripts/pro014l-data-api-check.mjs` 需要本機 Supabase（Docker），留在 #154 的分支，不帶進 main。
- 不需要 bump（沒有改 `pwa/js`；`pwa/db/` 不在 INFRA-108 的檢查範圍）。

### 5.2 LA：在 production 套用 012（擁有者執行）

與 BUG-109A、PRO-014RA 相同的流程。每一段都給完整的 SQL，結果截圖給 agent 核對。

1. **套用前確認**：
   - `to_regprocedure('public.grant_streak_unlock()')` 是 NULL；
   - `pro_entitlements` 沒有 `streak_unlock_granted_at`；
   - 以 `pg_get_functiondef('public.set_pro_entitlement_updated_at()'::regprocedure)` 比對 production 與 011 相同，並存下來當回滾來源；
   - 記下 `select count(*) from profiles where streak_unlock_used`（回填的預期筆數）。
2. **乾跑**：`begin;`＋012＋測試＋`rollback;`。**一定要有開頭的 `begin;`**。
3. **正式套用 012**，與筆數比對放在同一個 transaction：`begin;` → `LOCK TABLE public.pro_entitlements IN EXCLUSIVE MODE;`（可先 `SET LOCAL lock_timeout = '10s'`）→ 把 `pro_entitlements` 中 `is_pro` 為 true 的筆數、有 `trial_started_at` 的筆數存進暫存表 → 012 → DO block 比對兩個筆數，不同就 `RAISE EXCEPTION`（整個套用中止，什麼都不留下）→ `commit;`。先鎖表：READ COMMITTED 下同一個 transaction 並不能擋住別的連線在計數與 012 的 `ALTER TABLE` 之間 commit 的 `start_trial()`（獨立 review 實測會讓筆數改變而誤報中止）；鎖住後讀取照常、寫入等到 commit。
4. **套用後檢查**：
   - 權限：anon 不可執行，authenticated 可執行；
   - `SECURITY DEFINER`、`search_path`、owner；
   - 新欄位存在；
   - 回填筆數與第 1 步相同；
   - `is_pro`／`trial_started_at` 的筆數已在第 3 步的同一個 transaction 內比對過（不同時整個套用會中止）；
   - **你的帳號 `my_pro_status()` 仍是 `true／NULL／NULL`**：核准名單沒有回歸。在 `begin;` 內 `set local request.jwt.claims`，以 DO block 讀取並檢查，不符就 `RAISE EXCEPTION`，最後 `rollback;`。成功的樣子是沒有錯誤，不依賴 SQL Editor 顯示哪一個結果。
5. **功能驗證**：再跑一次 L1 的 ASSERT 測試（開頭的 `begin;` 到結尾的 `rollback;` 原樣保留）。
   - 測試用的是自己建立、會被 rollback 的帳號，不會動到真實帳號或測試帳號。
   - 成功的樣子是沒有錯誤。
   - **不要**刪掉 `begin`／`rollback` 來「看結果」，否則測試資料與一次性的標記會真的寫進 production。
6. 以一個只改文件的 PR 記錄。

**回滾**（`tests/database/pro014l.rollback.sql`）：
1. `DROP FUNCTION public.grant_streak_unlock()`；
2. 以第 1 步存下的定義還原 trigger function；
3. `ALTER TABLE … DROP COLUMN streak_unlock_granted_at`（回填的標記一併消失）。

L2 上線前回滾不影響任何使用者。

### 5.3 L2：client 改走 RPC（repo，一個 PR，LA 完成後才合併）

- **新模組** `pwa/js/streakUnlock.js`（INFRA-105），放入 SHELL：
  - `requestStreakUnlock()`；
  - 同一個 owner 的並行請求合併成一個；
  - 慶祝 modal 的時機：沿用 #154 的 `setTimeout` 退路，因為詢問發生在 `showMainApp()` 之後。`granted` 時顯示；`already_granted`、`paid_active` 為 true、而本機原本不知道已領過（`streakUnlockUsed` 是 false）時也顯示，讓回應遺失後補上的人也看得到。
  - 同一個 owner 在同一個有效日，對 `not_eligible` 與 `active_entitlement` 只問一次（本機記住 owner 與日期）。否則保護卡缺口的人與只有 server 是 Pro 的人每次開機、每次同步都會呼叫。
- **`db.grantStreakUnlock()`**：
  - 嚴格驗證回傳（沿用 #154），另加：`paid_active` 是 boolean；`granted` 時 `paid_active` 一定是 true；`paid_active` 為 true 時 `is_active` 一定是 true。
  - **寫回規則**（第 8 點）：
    - `granted`、`already_granted`：
      - 寫 `streak_unlock_used = true`；
      - `paid_active` 為 true 時，另寫 `is_pro = true`、`pro_expires_at = server 的 expires_at`，但只延長、不縮短：profile 已是終身（`isPro === true` 且 `proExpiresAt` 為 null），或已是 Pro 且到期日更晚時不寫；
      - 並更新本機 user。透過 `saveUser()`，或同時更新 `state.user` 與待同步的 profile snapshot，避免之後以舊的 user 推送蓋掉（重試也能修復，但不要依賴它）。
    - `active_entitlement`、`not_eligible`：不寫。
    - 永遠不寫 `is_pro = false`，永遠不看 `is_active`。
    - 這樣回應遺失、寫回失敗或另一台裝置先問時，重試都能補上。
  - `server` source 下領到後 refresh projection。
  - 呼叫端以 `typeof db.grantStreakUnlock === 'function'` 檢查（新舊版本混用時）。
- **何時詢問**：本機 `streakDays >= 45`、`!streakUnlockUsed`、Pro 狀態不是 `pro`（`unknown` 也詢問，由 server 決定）。
- **在哪裡詢問**：只在遠端資料載入之後，與 PRO-014P 的補做相同的三處：
  1. `loadAndStart()`：在 `bootWithLocalState()` 之後，換日已更新連勝；並等 `_loadRemote()` 回傳的 `loaded?.backfilled`，離線時記錄的 Sessions 已上傳。BUG-106 時第二次開機不換日，背景同步也會略過，這次開機不會再有別的詢問，所以這裡必須問。
  2. cached-user 背景同步：在 `loadStateFromStorage({ authoritative: true })` 與 `await loaded?.backfilled` 之後，離線時記錄的 Sessions 已上傳。
  3. `_syncAfterReconnect()`：同上。
- **不在**開機的第一次 `bootWithLocalState()` 詢問。那時遠端資料還沒載入，`_loadRemote()` 推送待同步的 profile 可能蓋掉剛寫回的 Pro：使用者看到慶祝，卻要到下次開機才是 Pro。離線開機要等連線恢復才詢問，反正 sessions 也要先上傳。
- **刪除** `processYesterdayStreak()` 的 SUB-16 區塊。換日不再有任何 client 端的 Pro 寫入。
- **訪客**（§10 第 4 點）：
  - 建議接受訪客不再有 SUB-16。
  - 個人頁與設定頁的「連勝解鎖 Pro x/45」對訪客改為說明「需要登入帳號」，避免顯示拿不到的獎勵。判斷訪客用「讀取 session 成功且沒有 session」（`db.readGuestDevBackup()` 已用這個判斷）。
- **測試**：
  - `pro014pRollover.test.js` 的 4 個 SUB-16 測試，照設計改寫為「換日不再發放；改由 RPC 發放並依寫回規則寫入 profile」。
  - `proGateCallSites.test.js`：
    - `EXPECTED_GATES` 與 `ALLOWED` 的 `dayCycle.js` 項目更新；
    - 「僅剩一處 client 寫入」改為 0 處，profile 寫回只在 `storage.js`。
  - 寫回規則：
    - 回應遺失後重試（第一次 RPC 已發放但 client 拋出錯誤，第二次 `already_granted`、`paid_active = true`）→ profile 補上 Pro；
    - 寫回失敗後重試 → 同上；
    - 試用中、回填過的帳號（`already_granted`、`paid_active = false`）不會變成終身；
    - 付費已到期（`paid_active = false`）不會取消 profile 上仍有效的 Pro；
    - profile 已是終身或到期日更晚時不縮短；
    - 免費的 profile（`is_pro = false`、`pro_expires_at = NULL`）在 `granted` 時**會**寫回（不能被誤判為終身）。
  - 三個呼叫點（含 BUG-106）、離線後上傳再詢問、RPC 失敗、並行、`typeof` 檢查、modal、訪客的文字。
  - 版本 bump。
- **production 影響**：
  - `legacy` 下 SUB-16 改成需要網路與 012。離線時達到 45 天的人，會在下次連線同步後拿到。
  - 訪客不再有 SUB-16（若你接受）。
  - L2 之前的舊版 client 仍在換日時自己寫 profile，直到更新為止。

## 6. 為什麼不直接用 #154

- 直接 rebase 要同時解決：
  - 和 PRO-014P 的衝突；
  - INFRA-105；
  - pgTAP 轉 ASSERT；
  - 開機呼叫次數；
  - 寫回規則。
- 結果與重寫 client 的工作量相近，而且一個 PR 同時含 migration 與 client，main 在 production 套用前就不能合併它，migration 檔案只能在分支上等待。
- 拆成 L1／LA／L2 與 013、014 的做法一致：擁有者套用時，SQL 已經在 main、經過 review。
- #154 的 SQL 主體、回滾腳本與驗證紀錄都保留（§5.1）。

## 7. 與其他任務的關係

- **PRO-014P**：
  - 它讓 SUB-16 在狀態不明時略過、不消耗。
  - L2 把整段移出換日後，這一部分就不再需要。PRO-014P 補做的只有補卡與 offer，不受影響。
- **PRO-014H**：
  - L2 之前（以及更新前的舊版 client）用 client 寫入領到的 SUB-16，只存在 profile，`pro_entitlements` 沒有。cutover 時若有人還在 30 天內，他剩下的天數會消失。
  - cutover 前：
    1. 再跑一次回填；
    2. 找出 profile 顯示 SUB-16 還有效、但 server 的付費授權沒有涵蓋到同一天的帳號，由擁有者決定。依規則，profile 欄位不能直接當授權來源。這裡比對的是付費（`is_pro`），不是 `is_pro_active()`：試用會讓帳號看起來有效，但試用比 SUB-16 先結束時仍會少掉天數。

       ```sql
       select p.user_id, p.pro_expires_at from public.profiles p
       left join public.pro_entitlements e on e.user_id = p.user_id
       where p.streak_unlock_used and p.is_pro and p.pro_expires_at > now()
         and not coalesce(e.is_pro and (e.pro_expires_at is null or e.pro_expires_at >= p.pro_expires_at), false);
       ```

  - L2 的 legacy 寫回與 PRO-014C 的相容層一樣，要在 PRO-014H 一起移除。
- **核准名單**：LA 第 4 步確認你的帳號沒有回歸。

## 8. 風險與已接受的限制

- **sessions 是使用者可寫的資料**：
  - server 依 sessions 計算，能擋住「直接寫 Pro」，擋不住「偽造 45 天的 sessions」。
  - #154 的驗證紀錄寫明這是已接受的窄版風險；獎勵每個帳號只有一次，期限 30 天。
  - 直接呼叫 RPC（不經 client 的 45 天門檻）拿到的也不會比偽造 sessions 多。
- **保護卡的缺口**（§4 第 9 點）：client 可能顯示 45/45 而 server 不給。列為已知限制，不在這次處理。
- **舊版 client**：
  - L2 之前的版本仍在換日時自己寫 profile。`legacy` 下這仍然有效（與現在相同）。
  - `server` 下 client 寫入無效，所以 cutover 不會因舊版而授權錯誤。

## 9. 草稿 #154 怎麼處理

- 建議在 L1 合併後關閉，並留言說明被 L1／L2 取代、哪些內容被沿用。
- 它是用你的帳號開的，關閉前需要你同意。

## 10. 需要使用者決定

1. 拆成 **L1 → LA → L2**（建議），或照 #154 一個 PR。
2. **資格的語意**：
   - **server 維持「歷史上任何一段 45 天」，client 只在本機連勝 ≥ 45 時詢問**（建議）：誠實使用的效果與現在相同，SQL 不需要處理時區。
   - 或在 server 加「最近」的條件（連勝要延續到最近一兩天）。
3. 回填 `streak_unlock_used = true` 的帳號為已領過（建議），並在 PRO-014H 前再跑一次。
4. **訪客**：
   - 接受訪客不再有 SUB-16，並把訪客看到的進度條改成「需要登入帳號」（建議）：cutover 後訪客本來就沒有任何 Pro，保留只是把同一個改變延後，而且要在換日裡多留一處 client 寫入。兩個選項都用同一個訪客判斷（讀取 session 成功且沒有 session）。
   - 或在 PRO-014H 前保留訪客的本機發放。
5. L1 合併後關閉 #154（建議）。
