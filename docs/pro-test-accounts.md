# Pro 測試帳號

用來在 app 裡測試不同的等級與 Pro 狀態。開發者面板的「模擬等級」與「模擬 Pro」已由 PRO-014Q Q6 移除：它們把假值寫進真實的 user，經由每一條保存 user 的路徑外流（見 [`pro-014q-dev-backup-owner-scope.md`](pro-014q-dev-backup-owner-scope.md)）。測試帳號的資料本來就是真的，沒有外流的問題。

## 為什麼在 production

原規格寫在 preview Supabase 專案建立，但這個 preview 專案並不存在：PRO-014D 用的是本機 Docker 的 Supabase，app 的連線也寫死在 production（`pwa/js/config.js`）。專案擁有者在 2026-10-31 同意改在 production 建立 5 個專屬帳號。

- 正式網址與手機都能直接測，`PRO-014H` 的實機驗證本來就要在 production 做。
- 排行榜只顯示 `is_public = true` 的帳號，預設是 false，測試帳號不會出現。
- Pro 由 SQL 寫入 server 端的 `pro_entitlements`，與未來正式授權付費走同一條路。

## 帳號

**怎麼找到它們（不需要記 email）**

- 規則：`<擁有者的主要 Gmail 帳號名>+orbit-<角色>@gmail.com`。主要 Gmail 就是擁有者自己登入 Orbit 用的那個 Google 帳號；`+` 後綴的信都寄到同一個信箱。
- 列出全部：Supabase Dashboard → production → **Authentication → Users**，在搜尋框輸入 `+orbit-`，應剛好 5 個。
- 登入方式：Orbit 登入頁「**或用電子郵件登入**」的表單（不是 Google 按鈕），密碼在擁有者的密碼管理器。
- 建立與狀態：2026-10-31 由擁有者以 Dashboard「Add user」（Auto Confirm）建立，各自完成設定頁，再以下方 SQL 設定等級與 Pro。2026-11-01 套用 014 後，以 `server` source 的規則驗證 5 個帳號全部正確（見 `docs/pro-014r-my-pro-status-trial-cap.md`）。
- **agent 能做與不能做**：agent 沒有密碼，也沒有 Supabase 權限，不能登入這些帳號或直接改資料；需要時請擁有者在 SQL Editor 執行本文件的 SQL，或在 app 裡登入測試。

Email 是專案擁有者的 Gmail 加上 `+` 後綴（Gmail 會寄到同一個信箱）。**完整 email 與密碼只存在擁有者的密碼管理器，不寫進 repo，也不要貼給 agent。**

| 後綴 | 狀態 | Lv（`total_xp`） | `server_pro_active` |
|---|---|---|---|
| `+orbit-free` | 免費：試用 60 天前開始，已過期 | 1（0） | false |
| `+orbit-trial` | 試用中：昨天開始，剩 14 天 | 5（142） | true |
| `+orbit-paid` | 付費，30 天後到期 | 10（477） | true |
| `+orbit-lifetime` | 終身 Pro（`pro_expires_at` 為 NULL） | 20（1672） | true |
| `+orbit-expired` | 付費已過期：`is_pro = true` 但昨天到期，**不是 Pro** | 30（3655） | false |

所有帳號都設定了 `trial_started_at`，app 不會再為它們呼叫 `start_trial()`。

**`legacy` 與 `server` 的判定一致**：`profiles` 與 `pro_entitlements` 寫成一致，`legacy` source、server 的 `is_pro_active()`，以及 `server` source 的 client 規則，對 5 個帳號的判定都和上表相同。終身帳號在 2026-11-01 之前會被 `server` source 誤判為非 Pro（`PRO-014R`）；migration 014 已於該日套用到 production，驗證時 `+orbit-lifetime` 顯示為終身。

## 重設（每次測試前）

試用與到期日都相對於執行當下計算，例如試用帳號 14 天後就會過期。測試前在 Supabase SQL Editor 執行下面的 SQL，5 個帳號會回到上表的狀態。可以重複執行。

- **先把 SQL 第 3 行的 `your-name@gmail.com` 換成擁有者的 Gmail 帳號**（在 SQL Editor 裡換，或存成 Supabase 的私人 snippet；換好的版本不要存進 repo）。沒換就執行會直接中止。
- 只依**完整 email** 比對，而且剛好找到 5 個帳號才寫入，否則整段中止、不改任何資料。repo 是公開的，若只比對 `+orbit-…` 後綴，任何人註冊 `xxx+orbit-lifetime@gmail.com` 就會在下次執行時被給 Pro（2026-10-31 的獨立 review 找到，此版已修正）。

- SQL Editor 可能警告「creates a table without enabling RLS」。這指的是 DO 區塊裡的暫存表 `orbit_test_accounts`：它只存在於這次執行，交易結束就刪除，不是 `public` 下的資料表。選「Run without RLS」即可；就算選了「Run and enable RLS」也安全，最壞情況是整段中止、不改任何資料。
- 執行前，先在所有裝置上登出這些帳號。若某台裝置留有未同步的舊 profile，之後可能把等級蓋回去；登入後數值不對時，重跑 SQL 再重新登入。

```sql
-- PRO-014Q Q6：設定（或重設）5 個測試帳號的等級與 Pro 狀態。可重複執行。
-- 1. 把下一行的 your-name@gmail.com 換成「你的 Gmail 帳號」（不含 +後綴）。換好的版本不要存進 repo。
select set_config('orbit.test_owner', lower('your-name@gmail.com'), false);

-- 2. 只依完整 email 比對，而且剛好找到 5 個帳號才寫入；否則整段中止，不改任何資料。
--    （repo 是公開的，只比對後綴的話，任何人註冊 xxx+orbit-lifetime@gmail.com 就會被給 Pro。）
do $$
declare
  v_owner text := current_setting('orbit.test_owner', true);
  v_local text;
  v_domain text;
  v_found int;
begin
  if v_owner is null or v_owner = 'your-name@gmail.com' or position('@' in v_owner) = 0 then
    raise exception '請先把第 3 行的 your-name@gmail.com 換成你的 Gmail 帳號';
  end if;
  v_local := split_part(v_owner, '@', 1);
  v_domain := split_part(v_owner, '@', 2);

  create temporary table orbit_test_accounts (
    user_id uuid, total_xp int, is_pro boolean, pro_expires_at timestamptz, trial_started_at timestamptz
  ) on commit drop;

  insert into orbit_test_accounts
  select a.id, s.total_xp, s.is_pro, s.pro_expires_at, s.trial_started_at
    from (values
      ('+orbit-free',     0,    false, null::timestamptz,          now() - interval '60 days'),  -- 免費：試用已過期，Lv.1
      ('+orbit-trial',    142,  false, null::timestamptz,          now() - interval '1 day'),    -- 試用中：剩 14 天，Lv.5
      ('+orbit-paid',     477,  true,  now() + interval '30 days', now() - interval '60 days'),  -- 付費（30 天後到期），Lv.10
      ('+orbit-lifetime', 1672, true,  null::timestamptz,          now() - interval '60 days'),  -- 終身，Lv.20
      ('+orbit-expired',  3655, true,  now() - interval '1 day',   now() - interval '60 days')   -- 付費已過期（不是 Pro），Lv.30
    ) as s(suffix, total_xp, is_pro, pro_expires_at, trial_started_at)
    join auth.users a on lower(a.email) = v_local || s.suffix || '@' || v_domain;

  select count(*) into v_found from orbit_test_accounts;
  if v_found <> 5 then
    raise exception '找到 % 個測試帳號（應為 5 個），已中止，沒有改任何資料', v_found;
  end if;

  -- profiles（legacy source 讀）與 pro_entitlements（server source 讀）寫成一致。
  -- 所有帳號都有 trial_started_at，app 就不會再呼叫 start_trial()。
  update public.profiles pr
     set total_xp = t.total_xp,
         is_pro = t.is_pro,
         pro_expires_at = t.pro_expires_at,
         trial_started_at = t.trial_started_at
    from orbit_test_accounts t
   where pr.user_id = t.user_id;

  insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at)
  select user_id, is_pro, pro_expires_at, trial_started_at from orbit_test_accounts
  on conflict (user_id) do update
    set is_pro = excluded.is_pro,
        pro_expires_at = excluded.pro_expires_at,
        trial_started_at = excluded.trial_started_at;
end $$;

-- 3. 驗證：預期 5 列，server_pro_active 依序 false、true、true、true、false，profile_matches 全部 true。
select split_part(a.email, '@', 1) as account,
       pr.total_xp,
       e.is_pro, e.pro_expires_at, e.trial_started_at,
       public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at) as server_pro_active,
       (pr.is_pro, pr.pro_expires_at, pr.trial_started_at)
         is not distinct from (e.is_pro, e.pro_expires_at, e.trial_started_at) as profile_matches
  from auth.users a
  join public.profiles pr on pr.user_id = a.id
  left join public.pro_entitlements e on e.user_id = a.id
 where lower(a.email) in (
   select split_part(current_setting('orbit.test_owner'), '@', 1) || suffix || '@'
          || split_part(current_setting('orbit.test_owner'), '@', 2)
     from unnest(array['+orbit-free', '+orbit-trial', '+orbit-paid', '+orbit-lifetime', '+orbit-expired']) as suffix
 )
 order by pr.total_xp;
```

## 第一次建立帳號

1. Supabase Dashboard → production → **Authentication → Users → Add user → Create new user**，勾選 **Auto Confirm User**。
2. 每個帳號在 app 用「或用電子郵件登入」的表單登入一次（不是 Google 按鈕，`+` 後綴不是另一個 Google 帳號），在設定頁填名稱（例如「測試-付費」），然後登出。
3. 執行上面的 SQL（先換掉第 3 行的 placeholder），確認結果表 5 列、`server_pro_active` 依序為 false、true、true、true、false，`profile_matches` 全部為 true。

## 不要做的事

- 不要用這些帳號記錄真實資料，也不要把它們設成公開（`is_public`）。
- 不要把完整 email 或密碼寫進 repo、issue 或 PR。
- 不再使用時，在 Dashboard 刪除帳號即可，相關的 profile、任務與 Session 會一併刪除（`ON DELETE CASCADE`）。
