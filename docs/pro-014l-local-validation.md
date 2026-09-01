# PRO-014L local Supabase validation

## 範圍與安全邊界

- 執行日期：2026-09-01（Asia/Taipei）。
- 只使用隔離的 localhost Supabase project；沒有建立付費 branch、沒有連結 hosted project，也沒有讀寫 production。
- 驗證輸入為 [`pwa/db/012_streak_unlock_server.sql`](../pwa/db/012_streak_unlock_server.sql) 與本分支 client。
- `REPO_PRO_ENTITLEMENT_SOURCE` 維持 `legacy`；未執行 `PRO-014H` cutover。

## 環境

| 元件 | 版本 |
| --- | --- |
| Docker Engine | 29.7.2 |
| Supabase CLI | 2.116.0 |
| Supabase Postgres | 17.6.1.165（PostgreSQL 17.6） |
| PostgREST | 16.1 |
| GoTrue | 2.196.0 |
| Kong | 2.8.1 |

本機 project id 為 `orbit-pro014l-migration-258071e6`，API／DB 使用專用的 54421／54422 port；僅啟動 Postgres、Auth、PostgREST 與 Kong。所有 access token 與本機 key 只存在程序記憶體，未寫入 repo 或 frontend。

## 驗收結果

| 驗收面向 | 證據 | 結果 |
| --- | --- | --- |
| SQL 實際套用 | 依 repo 順序套用 001–012，migration 012 的 column、trigger function、RPC、revoke／grant 全部由 PostgreSQL 成功解析 | Pass |
| 有效日判定 | [`tests/database/pro014l.test.sql`](../tests/database/pro014l.test.sql) 覆蓋 45 天、44 天、日期缺口、娛樂超過 120 分鐘、未來日期 | 24/24 pass |
| 一次性與期限 | 首次回 `granted`，重複回 `already_granted`；expiry 約為 server `now() + 30 days`，marker 僅一筆 | Pass |
| 既有 entitlement | active trial 回 `active_entitlement`，不消耗 streak marker、不覆寫 trial | Pass |
| 權限邊界 | authenticated 只能執行無參數 RPC，不能直接 UPDATE entitlement；缺少 auth identity fail closed | Pass |
| 真實 Data API | [`scripts/pro014l-data-api-check.mjs`](../scripts/pro014l-data-api-check.mjs) 透過 local Auth／PostgREST 建立兩帳號與 45 天 sessions | Pass |
| 並行 claim | 同帳號兩個並行 RPC 恰為一次 `granted`、一次 `already_granted`；expiry 與 granted_at 完全一致 | Pass |
| 偽造輸入 | anon RPC 回 401；傳入 streak／expiry 偽造參數回 404；直接清除 marker 回 400 | Pass |
| Rollback | 移除 RPC、還原 011 trigger helper、移除 marker column；檢查無殘留後重套 012，pgTAP 再次 24/24 | Pass |
| DB lint | `supabase db lint --local --schema public --level warning --fail-on error` | 無 schema errors |
| Advisors delta | rollback 012 前 19 項；重套 012 後仍 19 項 | 012 新增 0 項 |
| Repository regression | `npm run lint`、`TZ=UTC npm test`、`npm run test:e2e -- --workers=1`、資產基準重建、`git diff --check` | 57 files／1004 tests、E2E 41/41，Pass |

Advisors 的 19 項是既有 baseline：舊 RLS 的 `auth.uid()` init-plan 提示、`sessions.task_id` 未索引、未使用 index，以及既有 `leaderboard_view` security-definer error。依 scope control 不在 PRO-014L 順手修改；完整 remediation 可參考 [Supabase database linter 文件](https://supabase.com/docs/guides/database/database-linter)。

## Client contract

- `dayCycle.js` 不再寫 `isPro` 或自行計算 expiry。
- `db.grantStreakUnlock(userId)` 呼叫 `supabase.rpc('grant_streak_unlock')`，不傳 streak、日期或期限。
- RPC 回傳必須是嚴格單列 contract；未知 status、矛盾 boolean、缺少／無效 timestamp 都不採用。
- `legacy` source 只鏡射 server 回傳值；`server` source 會刷新 `my_pro_status()` projection。
- RPC／網路失敗不阻斷 boot，也不顯示成功 modal；只有真正的新 `granted` 顯示一次慶祝。

## 已接受風險與後續閘門

這次修正的信任邊界是「client 不能直接決定 Pro」。RPC 會自行重算 sessions，但 sessions 仍是使用者可新增、修改與回填的產品資料，因此不構成 anti-fraud 證明。現階段只有單一使用者，使用者已核准接受此窄版風險。

production rollout 不在本次核准範圍。正確順序是：另行取得高風險變更核准 → 先套用並驗證 migration 012 → 再合併／部署本 client → 最後才另案考慮 `PRO-014H` entitlement source cutover。若 012 尚未存在就先部署 client，連勝判定只會非致命失敗，但獎勵不會發放，因此不得顛倒順序。
