-- PRO-014L：SUB-16 連勝解鎖改由 server 發放（012）。
--
-- 前置：已套用 001、004、008、011、014 與 012，且存在 auth.users、auth.uid() 與
-- handle_new_user() trigger（Supabase 本機、production 皆可）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro014l.test.sql
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP：pgTAP 失敗不會中止，在只顯示最後
-- 結果的 Supabase SQL Editor 裡會看起來像通過）。成功的樣子是沒有錯誤。
-- 合成帳號用 example.invalid 網域；在 production 執行時一併被 rollback。
-- 第 2–7 節以執行者（postgres）呼叫：grant_streak_unlock() 是 SECURITY DEFINER，結果只取決於
-- auth.uid()；authenticated／anon 的權限由第 1 節斷言，第 8 節另以 authenticated 實際呼叫一次。

begin;

-- 0. ASSERT 必須開啟，否則失敗時不會中止，整份測試會靜默通過
do $$
begin
  if not current_setting('plpgsql.check_asserts')::boolean then
    raise exception 'plpgsql.check_asserts is off; this test would pass silently';
  end if;
end $$;

-- 1. 結構與權限
do $$
begin
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pro_entitlements'
      and column_name = 'streak_unlock_granted_at'
  ), 'pro_entitlements.streak_unlock_granted_at must exist';
  assert has_function_privilege('authenticated', 'public.grant_streak_unlock()', 'EXECUTE'),
    'authenticated must be able to execute grant_streak_unlock()';
  assert not has_function_privilege('anon', 'public.grant_streak_unlock()', 'EXECUTE'),
    'anon must not be able to execute grant_streak_unlock()';
  assert (select prosecdef from pg_proc where oid = 'public.grant_streak_unlock()'::regprocedure),
    'grant_streak_unlock() must be SECURITY DEFINER';
  assert (select proconfig from pg_proc where oid = 'public.grant_streak_unlock()'::regprocedure)
    = array['search_path=""'],
    'grant_streak_unlock() must have an empty search_path';
  assert not has_any_column_privilege('authenticated', 'public.pro_entitlements', 'UPDATE'),
    'authenticated must not update pro_entitlements (or any of its columns) directly';
  assert not has_any_column_privilege('authenticated', 'public.pro_entitlements', 'INSERT'),
    'authenticated must not insert into pro_entitlements (or any of its columns) directly';
  assert not has_function_privilege('authenticated', 'public.set_pro_entitlement_updated_at()', 'EXECUTE'),
    'the updated_at trigger function must stay revoked from authenticated';
end $$;

-- 2. 沒有登入：拒絕
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.grant_streak_unlock();
    assert false, 'grant_streak_unlock() without a caller must raise';
  exception when insufficient_privilege then
    null;  -- 42501：預期
  end;
end $$;

-- 3. 情境。每個帳號放一段有效日（每天一個 50 XP 的有效 A 任務），再以它的身份呼叫。
--    now() 在整個 transaction 內固定，所以期限可以精確比對。
create temporary table pro014l_cases (
  n int primary key,
  label text not null,
  run_days int not null,          -- 有效日的天數（0 = 沒有）
  run_end_offset int not null,    -- 最後一天 = current_date - run_end_offset
  gap_at int,                     -- 從最後一天往回第幾天不放（造成缺口）
  fun_at int,                     -- 從最後一天往回第幾天加 130 分鐘娛樂
  bad_at int,                     -- 從最後一天往回第幾天的任務改成 bad_kind
  bad_kind text,                  -- b_value／invalid／unproductive／xp49；b_all = 每天都是 B
  has_row boolean not null,
  is_pro boolean,
  pro_expires_at timestamptz,
  trial_started_at timestamptz,
  exp_status text not null,
  exp_active boolean not null,
  exp_paid boolean not null,
  user_id uuid not null default gen_random_uuid()
) on commit drop;

insert into pro014l_cases
  (n, label, run_days, run_end_offset, gap_at, fun_at, bad_at, bad_kind, has_row, is_pro, pro_expires_at, trial_started_at,
   exp_status, exp_active, exp_paid)
values
  ( 1, '45 days ending today',            45,    0, null, null, null, null,           false, null,  null,                          null,                          'granted',            true,  true),
  ( 2, '44 days',                          44,    0, null, null, null, null,           false, null,  null,                          null,                          'not_eligible',       false, false),
  ( 3, '45 dates split by a gap',          46,    0, 23,   null, null, null,           false, null,  null,                          null,                          'not_eligible',       false, false),
  ( 4, '45 days, one with 130 min fun',    45,    0, null, 20,   null, null,           false, null,  null,                          null,                          'not_eligible',       false, false),
  ( 5, '45th day dated tomorrow',          45,   -1, null, null, null, null,           false, null,  null,                          null,                          'not_eligible',       false, false),
  ( 6, '45 days ending 100 days ago',      45,  100, null, null, null, null,           false, null,  null,                          null,                          'granted',            true,  true),
  ( 7, 'active trial + 45',                45,    0, null, null, null, null,           true,  false, null,                          now() - interval '1 day',      'active_entitlement', true,  false),
  ( 8, 'expired trial + 45',               45,    0, null, null, null, null,           true,  false, null,                          now() - interval '40 days',    'granted',            true,  true),
  ( 9, 'lifetime paid + 45',               45,    0, null, null, null, null,           true,  true,  null,                          null,                          'active_entitlement', true,  true),
  (10, 'paid +10d + 45',                   45,    0, null, null, null, null,           true,  true,  now() + interval '10 days',    null,                          'active_entitlement', true,  true),
  (11, 'paid expired + 45',                45,    0, null, null, null, null,           true,  true,  now() - interval '1 day',      null,                          'granted',            true,  true),
  (12, 'no sessions at all',                0,    0, null, null, null, null,           false, null,  null,                          null,                          'not_eligible',       false, false),
  (13, 'one day only a B task',            45,    0, null, null, 20,   'b_value',      false, null,  null,                          null,                          'not_eligible',       false, false),
  (14, 'one day the A task is invalid',    45,    0, null, null, 20,   'invalid',      false, null,  null,                          null,                          'not_eligible',       false, false),
  (15, 'one day XP not productive',        45,    0, null, null, 20,   'unproductive', false, null,  null,                          null,                          'not_eligible',       false, false),
  (16, 'one day 49 XP',                    45,    0, null, null, 20,   'xp49',         false, null,  null,                          null,                          'not_eligible',       false, false),
  (17, '45 days of B tasks',               45,    0, null, null, null, 'b_all',        false, null,  null,                          null,                          'not_eligible',       false, false);

insert into auth.users (id, email, raw_user_meta_data)
select user_id, format('pro014l-%s@example.invalid', n), '{}'::jsonb from pro014l_cases;

do $$
begin
  assert (select count(*) from public.profiles p join pro014l_cases c on c.user_id = p.user_id)
    = (select count(*) from pro014l_cases),
    'handle_new_user() must create a profile for every synthetic account';
end $$;

insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at)
select user_id, is_pro, pro_expires_at, trial_started_at from pro014l_cases where has_row;

insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select c.user_id, 'pro014l effective task', (current_date - c.run_end_offset - g)::date,
       now(), now(), 30,
       case when coalesce(c.bad_at = g and c.bad_kind = 'invalid', false) then 'invalid' else 'complete' end,
       50,
       case when coalesce(c.bad_at = g and c.bad_kind = 'xp49', false) then 49 else 50 end,
       10, 0, 'task', 'growth',
       case when c.bad_kind = 'b_all' or coalesce(c.bad_at = g and c.bad_kind = 'b_value', false) then 'B' else 'A' end,
       1.0,
       not coalesce(c.bad_at = g and c.bad_kind = 'unproductive', false)
from pro014l_cases c
cross join lateral generate_series(0, c.run_days - 1) as g
where c.run_days > 0 and (c.gap_at is null or g <> c.gap_at);

insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select c.user_id, 'pro014l entertainment', (current_date - c.run_end_offset - c.fun_at)::date,
       now(), now(), 130, 'complete', 0, 0, 0, 0, 'entertainment', 'entertainment', 'D', 1.0, false
from pro014l_cases c
where c.fun_at is not null;

do $$
declare
  c record;
  r record;
  e record;
begin
  for c in select * from pro014l_cases order by n loop
    perform set_config('request.jwt.claim.sub', c.user_id::text, true);
    select * into r from public.grant_streak_unlock();
    assert r.status = c.exp_status,
      format('case %s (%s): status %L, expected %L', c.n, c.label, r.status, c.exp_status);
    assert r.granted = (c.exp_status = 'granted'),
      format('case %s (%s): granted %L', c.n, c.label, r.granted);
    assert r.is_active = c.exp_active,
      format('case %s (%s): is_active %L, expected %L', c.n, c.label, r.is_active, c.exp_active);
    assert r.paid_active = c.exp_paid,
      format('case %s (%s): paid_active %L, expected %L', c.n, c.label, r.paid_active, c.exp_paid);

    select * into e from public.pro_entitlements where user_id = c.user_id;
    if c.exp_status = 'granted' then
      assert r.expires_at = now() + interval '30 days' and e.pro_expires_at = r.expires_at,
        format('case %s (%s): expires_at %L', c.n, c.label, r.expires_at);
      assert r.granted_at = now() and e.streak_unlock_granted_at = now() and e.is_pro,
        format('case %s (%s): grant not recorded', c.n, c.label);
      assert e.trial_started_at is not distinct from c.trial_started_at,
        format('case %s (%s): the grant must not touch the trial start', c.n, c.label);
    else
      assert r.granted_at is null and e.streak_unlock_granted_at is null,
        format('case %s (%s): the once-only marker must stay empty', c.n, c.label);
      assert e.is_pro is not distinct from coalesce(c.is_pro, false)
         and e.pro_expires_at is not distinct from c.pro_expires_at
         and e.trial_started_at is not distinct from c.trial_started_at,
        format('case %s (%s): a refusal must not change the entitlement', c.n, c.label);
    end if;
  end loop;
end $$;

-- 4. 已領過：再呼叫一次是 already_granted，期限與標記不變；my_pro_status() 是有到期日的付費
do $$
declare
  c record;
  r record;
  s record;
begin
  for c in select * from pro014l_cases where exp_status = 'granted' order by n loop
    perform set_config('request.jwt.claim.sub', c.user_id::text, true);
    select * into r from public.grant_streak_unlock();
    assert r.status = 'already_granted' and not r.granted and r.is_active and r.paid_active
       and r.expires_at = now() + interval '30 days' and r.granted_at = now(),
      format('case %s (%s) second call: %L', c.n, c.label, r);

    select * into s from public.my_pro_status();
    assert s.is_active and s.expires_at = now() + interval '30 days' and s.trial_ends_at is null,
      format('case %s (%s) my_pro_status after grant: %L', c.n, c.label, s);
  end loop;
end $$;

-- 5. 回填（012 的第 3 節）。migration 內的回填在這些帳號建立之前就跑完了，所以這裡對
--    fixture 再跑一次同一段 SQL，**限定在 fixture 的 user_id**（在 production 執行時不碰
--    真實帳號）。
create temporary table pro014l_backfill (
  n int primary key,
  label text not null,
  has_row boolean not null,
  trial_started_at timestamptz,
  user_id uuid not null default gen_random_uuid()
) on commit drop;

insert into pro014l_backfill (n, label, has_row, trial_started_at) values
  (1, 'used, no entitlement row',          false, null),
  (2, 'used, trial row (trial active)',    true,  now() - interval '1 day');

insert into auth.users (id, email, raw_user_meta_data)
select user_id, format('pro014l-backfill-%s@example.invalid', n), '{}'::jsonb from pro014l_backfill;

insert into public.pro_entitlements (user_id, trial_started_at)
select user_id, trial_started_at from pro014l_backfill where has_row;

update public.profiles p set streak_unlock_used = true
from pro014l_backfill b where b.user_id = p.user_id;

-- 45 天的有效日，讓「已領過」與「符合資格」同時成立
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select b.user_id, 'pro014l effective task', (current_date - g)::date,
       now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
from pro014l_backfill b
cross join lateral generate_series(0, 44) as g;

-- 與 012 第 3 節相同的 SQL，只多了 fixture 的限定條件（跑兩次，確認可重複執行；
-- tests/unit/streakUnlockSql.test.js 檢查兩者除了這個條件之外完全相同）。第一次標記 2 筆，第二次 0 筆：
-- 已標記的不再更新，重跑回報的筆數就是新標記的帳號。
do $$
declare
  n bigint;
begin
  insert into public.pro_entitlements as e (user_id, streak_unlock_granted_at)
  select p.user_id, now()
  from public.profiles p
  where p.streak_unlock_used = true
    and p.user_id in (select user_id from pro014l_backfill)
  on conflict (user_id) do update
    set streak_unlock_granted_at = now()
    where e.streak_unlock_granted_at is null;
  get diagnostics n = row_count;
  assert n = 2, format('backfill rerun marked: %s rows, expected 2', n);
end $$;

do $$
declare
  n bigint;
begin
  insert into public.pro_entitlements as e (user_id, streak_unlock_granted_at)
  select p.user_id, now()
  from public.profiles p
  where p.streak_unlock_used = true
    and p.user_id in (select user_id from pro014l_backfill)
  on conflict (user_id) do update
    set streak_unlock_granted_at = now()
    where e.streak_unlock_granted_at is null;
  get diagnostics n = row_count;
  assert n = 0, format('second backfill rerun marked: %s rows, expected 0', n);
end $$;

do $$
declare
  b record;
  e record;
  r record;
  s record;
begin
  for b in select * from pro014l_backfill order by n loop
    select * into e from public.pro_entitlements where user_id = b.user_id;
    assert e.streak_unlock_granted_at = now(),
      format('backfill %s (%s): marker %L', b.n, b.label, e.streak_unlock_granted_at);
    assert not e.is_pro and e.pro_expires_at is null
       and e.trial_started_at is not distinct from b.trial_started_at,
      format('backfill %s (%s): the backfill must only set the marker: %L', b.n, b.label, e);

    perform set_config('request.jwt.claim.sub', b.user_id::text, true);
    select * into r from public.grant_streak_unlock();
    -- 回填只會拒絕：已領過、沒有授予。試用中的帳號 is_active 為 true，但 paid_active
    -- 一定是 false，client 不會把它寫成終身付費。
    assert r.status = 'already_granted' and not r.granted and not r.paid_active,
      format('backfill %s (%s): %L', b.n, b.label, r);
    assert r.is_active = (b.trial_started_at is not null),
      format('backfill %s (%s): is_active %L', b.n, b.label, r.is_active);

    select * into s from public.my_pro_status();
    assert s.is_active = (b.trial_started_at is not null),
      format('backfill %s (%s): my_pro_status changed: %L', b.n, b.label, s);
  end loop;
end $$;

-- 6. 一次性標記的變更會更新 updated_at（trigger 納入新欄位）
do $$
declare
  v_id uuid := gen_random_uuid();
  before_ts timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'pro014l-trigger@example.invalid', '{}'::jsonb);
  insert into public.pro_entitlements (user_id, updated_at) values (v_id, now() - interval '1 day');
  select updated_at into before_ts from public.pro_entitlements where user_id = v_id;
  update public.pro_entitlements set streak_unlock_granted_at = now() where user_id = v_id;
  assert (select updated_at from public.pro_entitlements where user_id = v_id) = now()
     and before_ts < now(),
    'changing streak_unlock_granted_at must refresh updated_at';
end $$;

-- 7. 付費已到期時 paid_active 為 false（L2 依它寫回 legacy profile，到期的不能寫成 Pro）
do $$
declare
  v_a uuid := gen_random_uuid();  -- 30 天前領過、已到期
  v_b uuid := gen_random_uuid();  -- 付費到期、試用中
  v_c uuid := gen_random_uuid();  -- 終身＋已領過（擁有者回填後的樣子）
  r record;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'pro014l-expired-grant@example.invalid', '{}'::jsonb),
    (v_b, 'pro014l-expired-paid-trial@example.invalid', '{}'::jsonb),
    (v_c, 'pro014l-lifetime-marked@example.invalid', '{}'::jsonb);
  insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at, streak_unlock_granted_at) values
    (v_a, true, now() - interval '10 days', null,                     now() - interval '40 days'),
    (v_b, true, now() - interval '1 day',   now() - interval '1 day', null),
    (v_c, true, null,                       null,                     now());

  perform set_config('request.jwt.claim.sub', v_a::text, true);
  select * into r from public.grant_streak_unlock();
  assert r.status = 'already_granted' and not r.is_active and not r.paid_active,
    format('expired grant: %L', r);

  perform set_config('request.jwt.claim.sub', v_b::text, true);
  select * into r from public.grant_streak_unlock();
  assert r.status = 'active_entitlement' and r.is_active and not r.paid_active,
    format('expired paid during a trial: %L', r);

  perform set_config('request.jwt.claim.sub', v_c::text, true);
  select * into r from public.grant_streak_unlock();
  assert r.status = 'already_granted' and r.is_active and r.paid_active and r.expires_at is null,
    format('lifetime with marker: %L', r);
end $$;

-- 8. 以 authenticated 的身份呼叫（真正的權限路徑：EXECUTE 只授予 authenticated）。
--    呼叫後還原成原本的角色（不用 reset role：SQL Editor 可能是由另一個角色 SET ROLE 而來）。
do $$
declare
  v_id uuid := gen_random_uuid();
  v_prev text := current_user;
  r record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'pro014l-role@example.invalid', '{}'::jsonb);
  insert into public.sessions (
    user_id, task_name, date, started_at, completed_at, duration_minutes,
    result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
    task_nature, value, resistance, is_productive_xp
  )
  select v_id, 'pro014l effective task', (current_date - g)::date,
         now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
  from generate_series(0, 44) as g;

  perform set_config('request.jwt.claim.sub', v_id::text, true);
  execute 'set local role authenticated';
  select * into r from public.grant_streak_unlock();
  execute format('set local role %I', v_prev);
  assert current_user = v_prev, format('role not restored: %s', current_user);
  assert r.status = 'granted' and r.paid_active,
    format('call as authenticated: %L', r);
end $$;

rollback;
