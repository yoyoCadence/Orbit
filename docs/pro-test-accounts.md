# Pro 測試帳號

用來在 app 裡測試不同的等級與 Pro 狀態。開發者面板的「模擬等級」與「模擬 Pro」已由 PRO-014Q Q6 移除：它們把假值寫進真實的 user，經由每一條保存 user 的路徑外流（見 [`pro-014q-dev-backup-owner-scope.md`](pro-014q-dev-backup-owner-scope.md)）。測試帳號的資料本來就是真的，沒有外流的問題。

## 為什麼在 production

原規格寫在 preview Supabase 專案建立，但這個 preview 專案並不存在：PRO-014D 用的是本機 Docker 的 Supabase，app 的連線也寫死在 production（`pwa/js/config.js`）。專案擁有者在 2026-10-31 同意改在 production 建立 5 個專屬帳號。

- 正式網址與手機都能直接測，`PRO-014H` 的實機驗證本來就要在 production 做。
- 排行榜只顯示 `is_public = true` 的帳號，預設是 false，測試帳號不會出現。
- Pro 由 SQL 寫入 server 端的 `pro_entitlements`，與未來正式授權付費走同一條路。

## 帳號

Email 是專案擁有者的 Gmail 加上 `+` 後綴（Gmail 會寄到同一個信箱）。**完整 email 與密碼只存在擁有者的密碼管理器，不寫進 repo，也不要貼給 agent。**

| 後綴 | 狀態 | Lv（`total_xp`） | `server_pro_active` |
|---|---|---|---|
| `+orbit-free` | 免費：試用 60 天前開始，已過期 | 1（0） | false |
| `+orbit-trial` | 試用中：昨天開始，剩 14 天 | 5（142） | true |
| `+orbit-paid` | 付費，30 天後到期 | 10（477） | true |
| `+orbit-lifetime` | 終身 Pro（`pro_expires_at` 為 NULL） | 20（1672） | true |
| `+orbit-expired` | 付費已過期：`is_pro = true` 但昨天到期，**不是 Pro** | 30（3655） | false |

所有帳號都設定了 `trial_started_at`，app 不會再為它們呼叫 `start_trial()`。

## 重設（每次測試前）

試用與到期日都相對於執行當下計算，例如試用帳號 14 天後就會過期。測試前在 Supabase SQL Editor 執行下面的 SQL，5 個帳號會回到上表的狀態。可以重複執行，不會改到其他帳號。

- SQL Editor 可能警告「creates a table without enabling RLS」。這是誤報：它把 `insert into … select` 誤認成會建表的 `SELECT … INTO`。按「Run and enable RLS」即可，多加的那一行對已開啟 RLS 的 `pro_entitlements` 沒有作用。
- 執行前，先在所有裝置上登出這些帳號。若某台裝置留有未同步的舊 profile，之後可能把等級蓋回去；登入後數值不對時，重跑 SQL 再重新登入。

```sql
-- PRO-014Q Q6：設定（或重設）五個測試帳號的等級與 Pro 狀態。可重複執行，每次都回到下列狀態。
-- 帳號以 email 的 local-part 結尾辨識（例如 你的名字+orbit-free@gmail.com），不需要在這裡寫完整 email。
-- profiles（legacy source 讀）與 pro_entitlements（server source 讀）寫成一致，兩種模式行為相同。
-- 所有帳號都設定 trial_started_at，app 就不會再呼叫 start_trial() 送出新的試用。
with spec(suffix, total_xp, is_pro, pro_expires_at, trial_started_at) as (values
  ('+orbit-free',     0,    false, null::timestamptz,         now() - interval '60 days'),  -- 免費：試用已過期，Lv.1
  ('+orbit-trial',    142,  false, null::timestamptz,         now() - interval '1 day'),    -- 試用中：剩 14 天，Lv.5
  ('+orbit-paid',     477,  true,  now() + interval '30 days', now() - interval '60 days'), -- 付費（30 天後到期），Lv.10
  ('+orbit-lifetime', 1672, true,  null::timestamptz,         now() - interval '60 days'),  -- 終身，Lv.20
  ('+orbit-expired',  3655, true,  now() - interval '1 day',  now() - interval '60 days')   -- 付費已過期（不是 Pro），Lv.30
), u as (
  select s.*, a.id as user_id
  from spec s
  join auth.users a on split_part(lower(a.email), '@', 1) like '%' || s.suffix
), p as (
  update public.profiles pr
     set total_xp = u.total_xp,
         is_pro = u.is_pro,
         pro_expires_at = u.pro_expires_at,
         trial_started_at = u.trial_started_at
    from u
   where pr.user_id = u.user_id
  returning pr.user_id
)
insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at)
select user_id, is_pro, pro_expires_at, trial_started_at from u
on conflict (user_id) do update
  set is_pro = excluded.is_pro,
      pro_expires_at = excluded.pro_expires_at,
      trial_started_at = excluded.trial_started_at;

-- 驗證：預期 free=false、trial=true、paid=true、lifetime=true、expired=false，且每列 profile_matches=true
select split_part(a.email, '@', 1) as account,
       pr.total_xp,
       e.is_pro, e.pro_expires_at, e.trial_started_at,
       public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at) as server_pro_active,
       (pr.is_pro, pr.pro_expires_at, pr.trial_started_at)
         is not distinct from (e.is_pro, e.pro_expires_at, e.trial_started_at) as profile_matches
  from auth.users a
  join public.profiles pr on pr.user_id = a.id
  left join public.pro_entitlements e on e.user_id = a.id
 where split_part(lower(a.email), '@', 1) like '%+orbit-%'
 order by pr.total_xp;
```

## 第一次建立帳號

1. Supabase Dashboard → production → **Authentication → Users → Add user → Create new user**，勾選 **Auto Confirm User**。
2. 每個帳號在 app 用「或用電子郵件登入」的表單登入一次（不是 Google 按鈕，`+` 後綴不是另一個 Google 帳號），在設定頁填名稱（例如「測試-付費」），然後登出。
3. 執行上面的 SQL，確認結果表 5 列、`server_pro_active` 依序為 false、true、true、true、false，`profile_matches` 全部為 true。

## 不要做的事

- 不要用這些帳號記錄真實資料，也不要把它們設成公開（`is_public`）。
- 不要把完整 email 或密碼寫進 repo、issue 或 PR。
- 不再使用時，在 Dashboard 刪除帳號即可，相關的 profile、任務與 Session 會一併刪除（`ON DELETE CASCADE`）。
