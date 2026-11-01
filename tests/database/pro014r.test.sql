-- PRO-014R：my_pro_status() 不再用試用日期限制付費帳號（014）。
--
-- 前置：已套用 001、004、011 與 014，且存在 auth.users 與 auth.uid()（Supabase 本機、
-- preview 與 production 乾跑皆可）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro014r.test.sql
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP：pgTAP 失敗不會中止，在只顯示最後
-- 結果的 Supabase SQL Editor 裡會看起來像通過）。
-- 合成帳號用 example.invalid 網域；在 production 乾跑時一併被 rollback。

begin;

-- 1. 權限與屬性：014 不得放寬 011 的保護
do $$
begin
  assert has_function_privilege('authenticated', 'public.my_pro_status()', 'EXECUTE'),
    'authenticated must be able to execute my_pro_status()';
  assert not has_function_privilege('anon', 'public.my_pro_status()', 'EXECUTE'),
    'anon must not be able to execute my_pro_status()';
  assert (select prosecdef from pg_proc where oid = 'public.my_pro_status()'::regprocedure),
    'my_pro_status() must stay SECURITY DEFINER';
  assert (select proconfig from pg_proc where oid = 'public.my_pro_status()'::regprocedure)
    = array['search_path=""'],
    'my_pro_status() must keep an empty search_path';
end $$;

-- 2. 情境：is_pro / pro_expires_at / trial_started_at，以及預期的 RPC 回應。
--    now() 在整個 transaction 內固定，所以預期值可以精確比對。
create temporary table pro014r_cases (
  n int primary key,
  label text not null,
  has_row boolean not null,
  is_pro boolean,
  pro_expires_at timestamptz,
  trial_started_at timestamptz,
  exp_active boolean not null,
  exp_expires_at timestamptz,
  exp_trial_ends_at timestamptz,
  user_id uuid not null default gen_random_uuid()
) on commit drop;

with t as (select now() as n, public.pro_trial_duration() as d)
insert into pro014r_cases
  (n, label, has_row, is_pro, pro_expires_at, trial_started_at, exp_active, exp_expires_at, exp_trial_ends_at)
select v.* from t, lateral (values
  ( 1, 'free, never trialled',          false, null,  null::timestamptz,              null::timestamptz,           false, null::timestamptz,              null::timestamptz),
  ( 2, 'trial active',                  true,  false, null,                           t.n - interval '1 day',      true,  null,                           t.n - interval '1 day' + t.d),
  ( 3, 'free, trial expired',           true,  false, null,                           t.n - interval '60 days',    false, null,                           t.n - interval '60 days' + t.d),
  ( 4, 'paid +30d, old trial',          true,  true,  t.n + interval '30 days',       t.n - interval '60 days',    true,  t.n + interval '30 days',       null),
  ( 5, 'lifetime, old trial',           true,  true,  null,                           t.n - interval '60 days',    true,  null,                           null),
  ( 6, 'lifetime, never trialled',      true,  true,  null,                           null,                        true,  null,                           null),
  ( 7, 'lifetime bought during trial',  true,  true,  null,                           t.n - interval '1 day',      true,  null,                           null),
  ( 8, 'paid +30d during trial',        true,  true,  t.n + interval '30 days',       t.n - interval '1 day',      true,  t.n + interval '30 days',       null),
  ( 9, 'paid expired, old trial',       true,  true,  t.n - interval '1 day',         t.n - interval '60 days',    false, t.n - interval '1 day',         null),
  (10, 'paid expired, trial active',    true,  true,  t.n - interval '1 day',         t.n - interval '1 day',      true,  t.n - interval '1 day',         t.n - interval '1 day' + t.d),
  (11, 'paid +2h, trial active',        true,  true,  t.n + interval '2 hours',       t.n - interval '1 day',      true,  t.n + interval '2 hours',       t.n - interval '1 day' + t.d),
  (12, 'future trial',                  true,  false, null,                           t.n + interval '1 day',      false, null,                           null),
  (13, 'paid ends exactly at trial end', true, true,  t.n - interval '1 day' + t.d,   t.n - interval '1 day',      true,  t.n - interval '1 day' + t.d,   null),
  (14, 'paid ends 1us before trial end', true, true,  t.n - interval '1 day' + t.d - interval '1 microsecond',
                                                                                      t.n - interval '1 day',      true,  t.n - interval '1 day' + t.d - interval '1 microsecond',
                                                                                                                                                             t.n - interval '1 day' + t.d),
  (15, 'not paid but has an expiry',    true,  false, t.n + interval '30 days',       t.n - interval '60 days',    false, null,                           t.n - interval '60 days' + t.d)
) as v(n, label, has_row, is_pro, pro_expires_at, trial_started_at, exp_active, exp_expires_at, exp_trial_ends_at);

insert into auth.users (id, email, raw_user_meta_data)
select user_id, format('pro014r-%s@example.invalid', n), '{}'::jsonb from pro014r_cases;

insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at)
select user_id, is_pro, pro_expires_at, trial_started_at from pro014r_cases where has_row;

do $$
declare
  c record;
  r record;
begin
  for c in select * from pro014r_cases order by n loop
    perform set_config('request.jwt.claim.sub', c.user_id::text, true);
    select * into r from public.my_pro_status();
    assert r.is_active = c.exp_active,
      format('case %s (%s): is_active %s, expected %s', c.n, c.label, r.is_active, c.exp_active);
    assert r.expires_at is not distinct from c.exp_expires_at,
      format('case %s (%s): expires_at %s, expected %s', c.n, c.label, r.expires_at, c.exp_expires_at);
    assert r.trial_ends_at is not distinct from c.exp_trial_ends_at,
      format('case %s (%s): trial_ends_at %s, expected %s', c.n, c.label, r.trial_ends_at, c.exp_trial_ends_at);
  end loop;
end $$;

-- 3. app 會替 profile 沒有 trialStartedAt 的帳號呼叫 start_trial()；終身資料列被補上試用
--    起點之後，仍不得回報試用日期（否則 15 天後 client 會判為非 Pro）。
do $$
declare
  v_id uuid := gen_random_uuid();
  r record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'pro014r-backfill@example.invalid', '{}'::jsonb);
  insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at)
  values (v_id, true, null, null);

  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform public.start_trial();
  assert (select trial_started_at from public.pro_entitlements where user_id = v_id) is not null,
    'start_trial() back-fills the trial start on an existing lifetime row';

  select * into r from public.my_pro_status();
  assert r.is_active and r.expires_at is null and r.trial_ends_at is null,
    format('lifetime row after start_trial(): %s / %s / %s, expected true / null / null',
      r.is_active, r.expires_at, r.trial_ends_at);
end $$;

rollback;
