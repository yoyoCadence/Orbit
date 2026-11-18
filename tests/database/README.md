# 資料庫測試（tests/database）

`pwa/db/` 的 migration 都有對應的資料庫測試。測試是純 SQL（`ASSERT`，失敗即中止）或 pgTAP（`pro014d`），每份都在單一 transaction 裡、結尾 rollback。CI 目前**不跑**這些測試（提案見 `tasks.md` 的 INFRA-116），改 migration 或測試時請在本機跑。

## 在本機跑全部

需要 PostgreSQL 16 與 `createdb`／`dropdb` 權限，資料庫要是 UTF8。

```bash
tests/database/run.sh                                  # 全部 *.test.sql
tests/database/run.sh tests/database/pro017.test.sql   # 指定幾份
```

`run.sh` 為每份測試建立新的資料庫（`orbit_test_*`），依序套用 `support/supabase-standin.sql` 與 `pwa/db/0*.sql`，再以 `plpgsql.check_asserts = on` 執行測試，最後刪掉資料庫。輸出每份 `PASS`／`FAIL`／`SKIP`，有失敗時結束碼是 1。沒有安裝 pgtap 擴充套件時，`pro014d` 會 `SKIP`（Ubuntu：`apt-get install postgresql-16-pgtap`）。

只能對本機、可以丟棄的叢集執行，**不要指向 Supabase**。

### Claude Code 的雲端容器

容器裡有 PostgreSQL 16，但重新開始後常常沒有啟動（或留下舊的 pid 檔）：

```bash
pg_ctlcluster 16 main start
su postgres -c "$PWD/tests/database/run.sh"
```

（以 `postgres` 執行；repo 的檔案要讓 `postgres` 讀得到，`/home/user` 底下預設可以，scratchpad 底下不行。）

## 其他工具

- `support/supabase-standin.sql`：Supabase 的最小替身（角色、預設權限、`auth`、`storage`、`extensions` schema），只在本機的空資料庫使用。
- `support/storage-standin.sql`：只有 Storage 的替身（`hw112` 的另一種跑法）。
- `support/pro017-concurrency.sh`：兩個連線同時領取邀請獎勵（`pro017`），只在本機執行。
- `support/name-rule-parity.mjs`：排行榜公開名稱的規則，client（`pwa/js/leaderboardPublic.js`）與 server（018 的 CHECK）以大量隨機名稱比對：

  ```bash
  node tests/database/support/name-rule-parity.mjs | psql -X -q -v ON_ERROR_STOP=1 -d postgres
  node tests/database/support/name-rule-parity.mjs --mutate | psql ...   # 故意改壞，必須失敗
  ```

  改了任何一邊的規則都要跑。

## production 乾跑

各測試檔開頭寫了 production 乾跑的切法（需擁有者核准、經 Supabase MCP 執行、單一 transaction 結尾 rollback）。送出含反斜線逸出的 SQL 時，工具的輸入會把 `\uXXXX`、`\t`、`\n` 轉成字元本身，做法見 `tasks.md` Done 的「2026-11-13 production 套用」。
