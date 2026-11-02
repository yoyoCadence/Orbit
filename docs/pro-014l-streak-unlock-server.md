# PRO-014L 提案：SUB-16 連勝解鎖改由 server 發放

> 狀態：提案（2026-11-02），只寫文件、不改程式碼、不動資料庫。屬 RPC／schema 變更，依 AGENTS.md §3 需使用者核准（§10）後才實作。擋 `PRO-014H` cutover。

## 1. 結論

- **為什麼要做**：
  - SUB-16 是「連勝 45 天送 30 天 Pro，每個帳號一次」。
  - 目前由 client 在換日時自己寫 `isPro`、`proExpiresAt`（`pwa/js/dayCycle.js`）。
  - 切到 `server` source（`PRO-014H`）後，Pro 只看 server 的 `pro_entitlements`，client 的寫入不再有效，這個獎勵會**靜默消失**。
- **草稿 #154**（2026-09-01，另一個工作階段）已經做出可用的設計：
  - 無參數的 `grant_streak_unlock()` RPC，由 server 依 sessions 計算連續 45 個有效日；
  - 以資料列鎖與 `streak_unlock_granted_at` 保證每個帳號只領一次，期限固定 30 天；
  - client 只「詢問」，`legacy` 下把 server 的結果寫回 profile。
  - 它在本機 Supabase 做過完整驗證，包括並行領取、權限、rollback。
- **但 #154 不能直接合併**（§4）：
  - 以 v1.25.2 為基礎，現在的 main 是 v1.41.6；
  - 違反之後才訂的 INFRA-105 規則；
  - 資料庫測試是 pgTAP 寫法，在 SQL Editor 失敗時看起來像通過；
  - 每個免費使用者每次開機都會呼叫 RPC。
- **建議**：
  - 保留 #154 的 SQL 核心，不重做已驗證的鎖與一次性邏輯，只改 2 處小地方，並把測試改成 ASSERT（§5.1）。
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
  
  再經 `saveUser()` 同步到 `profiles`。
- `legacy`（目前 production）下這樣能用，因為 Pro 就是看 profile。
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
- 領到時（`granted`／`already_granted`）把 server 的結果寫回 legacy profile；`server` source 下則重新 refresh projection。
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

在本機 PostgreSQL 16 依 production 的順序套用 001、004、005、006、007、008、009、011、013、014，再套用 #154 的 012：**全部成功**。接著實測：

| 情境 | 結果 |
| --- | --- |
| 只有 3 天 sessions | `not_eligible`，但 `pro_entitlements` **新增了一列** |
| 45 個連續有效日，在 **100 天前**結束 | **`granted`** |
| 試用中（1 天前開始）＋45 天 | `active_entitlement`，不消耗 |
| 試用已結束（40 天前）＋45 天 | `granted`；再呼叫一次是 `already_granted` |
| 上一列發放後的 `my_pro_status()` | `is_active = true`、有到期日、`trial_ends_at = NULL`（014 正確地不回報試用） |
| 到 UTC 今天為 44 天，第 45 天是 UTC 明天（UTC+8 早上 05:00–08:00 的「今天」） | `not_eligible`（那一天的 sessions 被 `date <= current_date` 排除） |

由此得到的檢視結果：

1. **基礎太舊，不能直接 rebase 合併**：
   - #154 以 v1.25.2 為基礎。之後的 PRO-014P 改寫了同一段換日（SUB-16 改為只在 `not-pro` 時執行），AUDIT-001 也改過 `dayCycle.js`。
   - 衝突在 `dayCycle.js`、`app.js`、`storage.js`，以及 `appBootSequence`、`proGateCallSites`、`pro014pRollover` 的測試。
2. **違反 INFRA-105**（這條規則在 #154 之後才訂）：
   - `requestStreakUnlock` 是既有 SHELL 模組 `dayCycle.js` 的**新 export**，由同為 SHELL 模組的 `app.js` import。
   - 新的 named export 必須放在新模組。`db.grantStreakUnlock()` 是既有物件上的新方法，不受影響。
3. **資料庫測試是 pgTAP**：
   - PRO-014R 時發現：SQL Editor 裡 pgTAP 的失敗不會中止，乾跑看起來會像通過。
   - 要改成 ASSERT 寫法（同 `tests/database/pro014r.test.sql`：先確認 `plpgsql.check_asserts`、`%L`、`begin`／`rollback`）。
4. **資格是「歷史上任何一段 45 天」，不是「目前的連勝 45 天」**：
   - 這比現在寬鬆。個人頁的「連勝解鎖 Pro x/45」顯示的是目前的連勝。
   - 例如試用期間連續 45 天、之後連勝中斷的人，試用結束後任何一次呼叫都會拿到。現在的 client 只有在「連勝仍 ≥ 45 且已不是 Pro」的換日才給。
   - sessions 本來就是使用者可寫的資料（#154 也明說不是防作弊的邊界），所以寬鬆與否不改變安全性，差別只在產品語意（§10 第 2 點）。
5. **每個免費使用者每次開機都呼叫，而且會建立資料列**：
   - #154 的 client 只要「不是 Pro、沒領過」就呼叫，server 每次掃描該帳號全部 sessions。
   - 不符合資格的人第一次呼叫時就在 `pro_entitlements` 建一列（上表第 1 列）。功能上無害，但每次開機都多一個 RPC。
   - 修正：client 只在本機連勝 ≥ 45 時才詢問。這只是決定「要不要問」，資格仍由 server 判斷。
6. **UTC 日期造成延後**（上表最後一列）：
   - `current_date` 是 server 的 UTC 日期，sessions 的 `date` 是使用者以 `newDayHour` 劃分的當地日期。
   - 在台灣，05:00–08:00 之間當天的 sessions 不算，第 45 天會延後到 08:00 之後的開機才領到。
   - 改成 `date <= current_date + 1` 即可，可多偽造的只有一天（sessions 本來就可偽造）。
7. **已用過 SUB-16 的帳號，server 不知道**：
   - `profiles.streak_unlock_used = true` 的帳號在 server 沒有紀錄。
   - client 會因為這個旗標不再詢問，但直接呼叫 RPC 可以再領一次。
   - 可用一次性回填補上：只會「拒絕」、不會「授予」任何東西，所以不違反「不得從 client 可寫欄位匯入」的規則。
8. **保護卡造成的缺口**：
   - 保護卡把連勝恢復為中斷前的天數，但那天沒有有效 Session，server 會看到缺口。
   - 保護卡只有 Pro 能用，所以影響的是「Pro 期間用過保護卡、之後不是 Pro、連勝 ≥ 45」的人：client 顯示 45/45，server 回 `not_eligible`。
   - server 不知道保護卡的使用紀錄（只在 profile），列為已知限制。
9. **部署順序**：
   - client 若比 012 先上 production，RPC 不存在，獎勵就不會發放（#154 也寫了不可顛倒）。
   - 而且 L2 之後 `legacy` 下的 SUB-16 也改走 RPC，所以這個順序對**目前的 production 使用者**也有影響。

## 5. 建議方案

### 5.1 L1：migration 012 與測試（repo，一個 PR，不改 client）

- 以 #154 的 012 為基礎，**保留**：
  - 資料列鎖；
  - 一次性；
  - 30 天；
  - `active_entitlement` 不消耗；
  - 權限與 `search_path`。
- **只改 2 處**（第 3 點是維持不變的決定）：
  1. `s.date <= current_date` 改為 `s.date <= current_date + 1`（§4 第 6 點）。
  2. 一次性回填（§4 第 7 點），可重複執行：

     ```sql
     INSERT INTO public.pro_entitlements AS e (user_id, streak_unlock_granted_at)
     SELECT p.user_id, now() FROM public.profiles p WHERE p.streak_unlock_used = true
     ON CONFLICT (user_id) DO UPDATE
       SET streak_unlock_granted_at = COALESCE(e.streak_unlock_granted_at, now());
     ```

     回填只寫 `streak_unlock_granted_at`，不動 `is_pro`、`pro_expires_at`、`trial_started_at`。
  3. 資格維持 #154 的「任何一段 45 天」（§10 第 2 點，建議）。如果你選「目前的連勝」，加一個條件：那一段的最後一天 ≥ `current_date - 1`，這會帶入時區的誤差。
- **不改**「不符合也建立資料列」：它是已驗證的鎖設計的一部分。L2 只在本機連勝 ≥ 45 時才詢問，實際上只有候選人會呼叫。
- **測試**：
  - `tests/database/pro014l.test.sql` 改成 ASSERT 寫法，涵蓋：
    - 45／44 天、缺口、娛樂超過、未來日期（+1 天可、+2 天不可）；
    - 歷史上的一段 45 天、試用中、試用已結束、已領過、回填過的帳號；
    - 權限（anon 不可執行、authenticated 不可直接 UPDATE）；
    - `SECURITY DEFINER`／`search_path`；
    - 發放後 `my_pro_status()` 的回報。
  - `tests/unit/` 加 SQL 契約測試（同 `proEntitlementsSql.test.js` 的形式）。
  - 在本機 PostgreSQL 依 production 的順序（含 013、014）實際執行。
- 不需要 bump（沒有改 `pwa/js`；`pwa/db/` 不在 INFRA-108 的檢查範圍）。

### 5.2 LA：在 production 套用 012（擁有者執行）

與 BUG-109A、PRO-014RA 相同的流程：

1. **套用前確認**：
   - `to_regprocedure('public.grant_streak_unlock()')` 是 NULL；
   - `pro_entitlements` 沒有 `streak_unlock_granted_at`；
   - 存下 `pg_get_functiondef('public.set_pro_entitlement_updated_at()'::regprocedure)` 當回滾來源；
   - 記下 `select count(*) from profiles where streak_unlock_used`（回填的預期筆數）。
2. **乾跑**：`begin;`＋012＋測試＋`rollback;`。
3. **正式套用 012**。
4. **套用後檢查**：
   - 權限：anon 不可執行，authenticated 可執行；
   - `SECURITY DEFINER`、`search_path`、owner；
   - 新欄位存在；
   - 回填筆數與第 1 步相同；
   - **你的帳號 `my_pro_status()` 仍是 `true／NULL／NULL`**：核准名單沒有回歸。
5. **功能驗證**：在 transaction 內替 `+orbit-free` 測試帳號放入 45 天的 sessions，以它的身份呼叫 RPC，預期 `granted`；再呼叫一次預期 `already_granted`；最後 `rollback`，不留下任何資料。
6. 以一個只改文件的 PR 記錄。

**回滾**：
1. `DROP FUNCTION public.grant_streak_unlock()`；
2. 以第 1 步存下的定義還原 trigger function；
3. `ALTER TABLE … DROP COLUMN streak_unlock_granted_at`。

L2 上線前回滾不影響任何使用者。

### 5.3 L2：client 改走 RPC（repo，一個 PR，LA 完成後才合併）

- 新模組 `pwa/js/streakUnlock.js`（INFRA-105），放入 SHELL：`requestStreakUnlock()` 與慶祝 modal 的時機（沿用 #154 的 `setTimeout` 退路）。
- `db.grantStreakUnlock()` 沿用 #154：嚴格驗證回傳；領到時把 server 的結果寫回 legacy profile；`server` 下 refresh projection。是 `db` 上的新方法，不是新 export。
- **何時詢問**：本機 `streakDays >= 45`、`!streakUnlockUsed`、Pro 狀態不是 `pro`（`unknown` 也詢問，由 server 決定）。
- **在哪裡詢問**：
  - `bootWithLocalState()` 換日之後；
  - cached-user 背景同步與連線恢復同步之後（同 PRO-014P 的補做位置）。
  
  這樣開機時 session 還沒準備好也會在同步後重試。同一個 owner 的並行請求合併成一個。
- **刪除** `processYesterdayStreak()` 的 SUB-16 區塊。換日不再有任何 client 端的 Pro 寫入。
- **測試**：
  - PRO-014P 的 2 個 SUB-16 特性測試照設計改寫為「`legacy` 下改由 RPC 發放並寫回 profile」；
  - `proGateCallSites` 的「僅剩一處 client 寫入」改為 0 處，profile 寫回只在 `storage.js`；
  - 開機、同步、離線、RPC 失敗、並行、modal 各有測試；
  - 版本 bump。
- **production 影響**：`legacy` 下 SUB-16 改成需要網路與 012。離線時達到 45 天的人，會在下次連線開機時拿到。

## 6. 為什麼不直接用 #154

- 直接 rebase 要同時解決：
  - 和 PRO-014P 的衝突；
  - INFRA-105；
  - pgTAP 轉 ASSERT；
  - 開機呼叫次數。
- 結果與重寫 client 的工作量相近，而且一個 PR 同時含 migration 與 client，main 在 production 套用前就不能合併它，migration 檔案只能在分支上等待。
- 拆成 L1／LA／L2 與 013、014 的做法一致：擁有者套用時，SQL 已經在 main、經過 review。
- #154 的 SQL 核心與驗證紀錄都保留：L1 沿用 012 的主體，`docs/pro-014l-local-validation.md` 移到 main 作為依據，並註明 L1 改了哪 2 處。

## 7. 與其他任務的關係

- **PRO-014P**：
  - 它讓 SUB-16 在狀態不明時略過、不消耗。
  - L2 把整段移出換日後，這一部分就不再需要。PRO-014P 補做的只有補卡與 offer，不受影響。
- **PRO-014H**：
  - L2 上線前用 client 寫入領到的 SUB-16，只存在 profile，`pro_entitlements` 沒有。
  - cutover 時若有人在 30 天內領過，他剩下的天數會消失。
  - cutover 前要查 `profiles` 中 `streak_unlock_used = true` 且 `pro_expires_at > now()` 的帳號，由擁有者決定。依規則，profile 欄位不能直接當授權來源。
  - L2 上線超過 30 天後才 cutover，就不會有這種帳號。
- **核准名單**：LA 第 4 步確認你的帳號沒有回歸。

## 8. 風險與已接受的限制

- **sessions 是使用者可寫的資料**：
  - server 依 sessions 計算，能擋住「直接寫 Pro」，擋不住「偽造 45 天的 sessions」。
  - #154 的驗證紀錄寫明這是已接受的窄版風險；獎勵每個帳號只有一次，期限 30 天。
- **保護卡的缺口**（§4 第 8 點）：client 可能顯示 45/45 而 server 不給。列為已知限制，不在這次處理。
- **UTC 與時區**：改為 `+1` 後，UTC+14 以內的時區都不會延後。UTC 以西的使用者本來就不受影響。
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
3. 未來日期容許 `current_date + 1`（建議），或維持 `current_date`（台灣早上 05:00–08:00 會延後）。
4. 回填 `streak_unlock_used = true` 的帳號為已領過（建議）。
5. L1 合併後關閉 #154（建議）。
