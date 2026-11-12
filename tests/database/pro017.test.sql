-- PRO-017 R1：邀請朋友解鎖 Pro（019）。
--
-- 前置：已套用 001～019（Supabase production 乾跑），或本機的
--   tests/database/support/supabase-standin.sql → pwa/db 的 001～019 依序套用。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro017.test.sql
-- production 乾跑（需擁有者核准）：begin; set local lock_timeout = '5s'; ＋ 019 的內容 ＋
--   本檔從第一個 do $$ 到最後的 rollback; 之前 ＋ rollback;
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 合成帳號（example.invalid），user_id 結尾兩碼：
--   a0 A 邀請者；被邀請者 b1 B、c1 C、d1 D、f1 F、11–15 H1–H5、e1 Y（太年輕）、02 P；
--   01 O（建立 7 天又 1 分鐘，不能綁定）、03 Q（created_at 是 NULL，不能綁定）。
-- 同一個 transaction 裡 now() 不變，所以日期與期限都以 now() 比對；T 表示 UTC 的今天。
-- 領取時連線的 TimeZone 設成 UTC+14 與 UTC−12：不管現在 UTC 幾點，兩者至少一個的日期與 UTC
-- 不同，用連線的日期（current_date、created_at::date）算就會錯。
-- 兩個連線同時領取的測試在 tests/database/support/pro017-concurrency.sh（只在本機執行）。

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
declare
  fn regprocedure;
  t text;
  privilege text;
begin
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pro_entitlements'
      and column_name = 'referral_reward_granted_at'
  ), 'pro_entitlements.referral_reward_granted_at must exist';

  foreach t in array array['public.referral_codes', 'public.referrals'] loop
    assert (select relrowsecurity from pg_class where oid = t::regclass), format('%s must have RLS enabled', t);
    foreach privilege in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      assert not has_table_privilege('authenticated', t, privilege),
        format('authenticated must not have %s on %s', privilege, t);
    end loop;
    foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      assert not has_table_privilege('anon', t, privilege), format('anon must not have %s on %s', privilege, t);
    end loop;
  end loop;
  assert has_table_privilege('authenticated', 'public.referral_codes', 'SELECT'),
    'authenticated must be able to read referral_codes (own row, by RLS)';
  assert not has_table_privilege('authenticated', 'public.referrals', 'SELECT'),
    'authenticated must not be able to read referrals';

  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'referral_codes') = 1
    and exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'referral_codes'
                  and policyname = 'referral_codes_select_own' and cmd = 'SELECT'
                  and roles = array['authenticated']::name[]),
    'referral_codes must have exactly one SELECT policy for authenticated';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referrals'),
    'referrals must have no policy';

  foreach fn in array array[
    'public.get_my_referral_code()'::regprocedure,
    'public.redeem_referral(text)'::regprocedure,
    'public.claim_referral_reward()'::regprocedure
  ] loop
    assert (select prosecdef from pg_proc where oid = fn), format('%s must be SECURITY DEFINER', fn);
    assert (select proconfig from pg_proc where oid = fn) @> array['search_path=""'],
      format('%s must set an empty search_path', fn);
    assert has_function_privilege('authenticated', fn, 'EXECUTE'), format('authenticated must be able to execute %s', fn);
    assert not has_function_privilege('anon', fn, 'EXECUTE'), format('anon must not be able to execute %s', fn);
    assert (select proacl from pg_proc where oid = fn) is not null, format('%s must have explicit grants', fn);
    assert not exists (select 1 from aclexplode((select proacl from pg_proc where oid = fn)) a where a.grantee = 0),
      format('PUBLIC must not be able to execute %s', fn);
  end loop;
  assert pg_get_function_result('public.claim_referral_reward()'::regprocedure) =
    'TABLE(status text, granted boolean, achieved_count integer, required_count integer, is_active boolean, '
    'expires_at timestamp with time zone, granted_at timestamp with time zone, paid_active boolean)',
    'claim_referral_reward() must return the documented columns';
end $$;

-- 2. fixture。綁定時被邀請者要在 7 天內建立，所以先以 6 天前建立；綁定後（第 4 節結尾）再把
--    B／C／D／F／H 的建立時間改成 8 天前，模擬時間經過（領取時帳號要存在滿 7 天）。
insert into auth.users (id, email, raw_user_meta_data, created_at)
select ('00000000-0000-4000-8000-0000001700' || u.suffix)::uuid,
       'pro017-' || u.suffix || '@example.invalid', '{}'::jsonb, u.created_at
from (values
  ('a0', now() - interval '30 days'),
  ('b1', now() - interval '6 days'), ('c1', now() - interval '6 days'), ('d1', now() - interval '6 days'),
  ('f1', now() - interval '6 days'),
  ('11', now() - interval '6 days'), ('12', now() - interval '6 days'), ('13', now() - interval '6 days'),
  ('14', now() - interval '6 days'), ('15', now() - interval '6 days'),
  ('e1', now() - interval '6 days'),
  ('02', now() - interval '6 days 23 hours'),
  ('01', now() - interval '7 days 1 minute'),
  ('03', null::timestamptz)
) as u(suffix, created_at);

-- updated_at 故意設在過去（INSERT 不觸發 trigger）
insert into public.pro_entitlements (user_id, trial_started_at, updated_at) values
  ('00000000-0000-4000-8000-0000001700a0', now() - interval '40 days', now() - interval '1 day');

-- 3. 邀請碼：格式、同一個人每次相同、不同人不同；只讀得到自己的；client 不能寫
do $$
declare
  a text := '00000000-0000-4000-8000-0000001700a0';
  b text := '00000000-0000-4000-8000-0000001700b1';
  code_a text;
  code_b text;
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code_a := public.get_my_referral_code();
  assert code_a ~ '^[A-HJ-NP-Z2-9]{8}$', format('a code must be 8 characters without 0/O/1/I (got %s)', code_a);
  assert public.get_my_referral_code() = code_a, 'the same user must always get the same code';
  select count(*) into n from public.referral_codes;
  assert n = 1, format('a user must see only their own code row (saw %s)', n);
  begin
    insert into public.referral_codes (user_id, code) values (a::uuid, 'ABCDEFGH');
    raise exception 'a client must not insert referral_codes';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.referral_codes set code = 'ABCDEFGH' where user_id = a::uuid;
    raise exception 'a client must not update referral_codes';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.referral_codes where user_id = a::uuid;
    raise exception 'a client must not delete referral_codes';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code_b := public.get_my_referral_code();
  assert code_b <> code_a, 'two users must get different codes';
  assert not exists (select 1 from public.referral_codes where user_id = a::uuid), 'B must not read A''s code row';
  execute 'reset role';

  create temp table pro017_codes (who text primary key, code text not null) on commit drop;
  insert into pro017_codes values ('a', code_a), ('b', code_b);
end $$;

-- 4. 綁定：格式、碼不存在、自己的碼、正規化（全形、全形空白、tab 與換行、小寫）、重複、帳號太舊
--    （連不存在的碼也回 too_late，不能試探）、created_at 是 NULL、7 天內的邊界；client 不能讀寫 referrals
do $$
declare
  code_a text := (select code from pro017_codes where who = 'a');
  code_b text := (select code from pro017_codes where who = 'b');
  fullwidth_a text;
  unknown text;
  r text;
  who text;
begin
  select string_agg(chr(ascii(ch) + 65248), '') into fullwidth_a from regexp_split_to_table(code_a, '') as ch;
  select candidate into unknown
  from (values ('ZZZZZZZZ'), ('ZZZZZZZY'), ('ZZZZZZZX')) as v(candidate)
  where not exists (select 1 from public.referral_codes c2 where c2.code = v.candidate)
  limit 1;

  -- B：各種錯誤，再以全形的碼綁定 A
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000001700b1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral('nope') = 'invalid_code', 'a malformed code must be invalid_code';
  assert public.redeem_referral(null) = 'invalid_code', 'NULL must be invalid_code';
  assert public.redeem_referral('ABCD0EFG') = 'invalid_code', 'a code with 0 must be invalid_code';
  assert public.redeem_referral(unknown) = 'invalid_code', 'an unknown code must be invalid_code';
  assert public.redeem_referral(code_b) = 'own_code', 'redeeming one''s own code must be own_code';
  r := public.redeem_referral(fullwidth_a);
  assert r = 'redeemed', format('a full-width code must redeem (got %s)', r);
  assert public.redeem_referral(code_a) = 'already_redeemed', 'redeeming twice must be already_redeemed';
  begin
    perform 1 from public.referrals;
    raise exception 'a client must not read referrals';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.referrals (invitee_id, inviter_id)
      values ('00000000-0000-4000-8000-0000001700b1', '00000000-0000-4000-8000-0000001700a0');
    raise exception 'a client must not write referrals';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- C：全形空白開頭；D：小寫加 tab 與換行；其他人：原樣
  foreach who in array array['c1', 'd1', 'f1', '11', '12', '13', '14', '15', 'e1', '02'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000001700' || who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    r := public.redeem_referral(case who
      when 'c1' then chr(12288) || code_a
      when 'd1' then lower(code_a) || chr(9) || chr(10)
      else code_a end);
    assert r = 'redeemed', format('%s must redeem A''s code (got %s)', who, r);
    execute 'reset role';
  end loop;

  -- C 已經綁定 A，再綁 B 的碼也是 already_redeemed
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000001700c1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral(code_b) = 'already_redeemed', 'an invitee must not switch inviters';
  execute 'reset role';

  -- O（7 天又 1 分鐘）：太晚，而且不存在的碼也回 too_late；Q（created_at 是 NULL）：太晚
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000170001', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral(code_a) = 'too_late', 'an account older than 7 days must be too_late';
  assert public.redeem_referral(unknown) = 'too_late', 'a too-old account must not learn whether a code exists';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000170003', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral(code_a) = 'too_late', 'an account without created_at must be too_late';
  execute 'reset role';

  assert (select count(*) from public.referrals where inviter_id = '00000000-0000-4000-8000-0000001700a0') = 11,
    'A must have exactly the 11 bound invitees';
  assert not exists (select 1 from public.referrals where invitee_id in
    ('00000000-0000-4000-8000-000000170001', '00000000-0000-4000-8000-000000170003')), 'O and Q must not be bound';
end $$;

-- 時間經過：B／C／D／F／H 的帳號改成 8 天前建立（Y 仍是 6 天前）
update auth.users set created_at = now() - interval '8 days'
where id in (select ('00000000-0000-4000-8000-0000001700' || x)::uuid
             from unnest(array['b1', 'c1', 'd1', 'f1', '11', '12', '13', '14', '15']) as x);

-- 5. 被邀請者的 sessions（T = UTC 的今天）。一般的有效日：A 級任務、生產 XP 50、30 分鐘。
--    B：T-6..T（7 天）；T-3 另有娛樂剛好 120 分鐘（仍有效）→ 達成。
--    F：T-8..T-2（7 天，第一天就是建立當天）→ 達成。
--    C：T-9（建立前，不算）、T-6..T-1、T+1（未來，不算）→ 6 天。
--    D：T-6..T，但 T-3 娛樂 121 分鐘 → 6 天。
--    H1–H5：T-6..T，但 T-3 各自只違反一個條件 → 6 天：
--      H1 生產 XP 49；H2 只有 B 級任務；H3 A 級任務但結果 invalid；H4 不算生產力；
--      H5 base_xp 60 但 final_xp 40。
--    Y：T-6..T（7 天），但帳號只存在 6 天 → 不算。
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select ('00000000-0000-4000-8000-0000001700' || f.who)::uuid, 'pro017 task',
       (now() at time zone 'UTC')::date + f.day_offset,
       now(), now(), f.minutes, f.result, f.base_xp, f.final_xp, 10, 0, f.impact,
       case when f.impact = 'entertainment' then 'entertainment' else 'growth' end,
       f.value, 1.0, f.productive
from (
  -- 一般的有效日
  select x.who, d.day_offset, 30 as minutes, 'complete' as result, 50 as base_xp, 50 as final_xp,
         'task' as impact, 'A' as value, true as productive
  from (values ('b1', -6, 0), ('f1', -8, -2), ('c1', -6, -1), ('d1', -6, 0), ('e1', -6, 0),
               ('11', -6, 0), ('12', -6, 0), ('13', -6, 0), ('14', -6, 0), ('15', -6, 0)) as x(who, first_day, last_day)
  cross join lateral generate_series(x.first_day, x.last_day) as d(day_offset)
  where not (x.who in ('11', '12', '13', '14', '15') and d.day_offset = -3)
  union all
  -- 特別的日子
  select * from (values
    ('b1', -3, 120, 'complete', 0, 0, 'entertainment', 'B', false),   -- 娛樂剛好 120 分鐘
    ('c1', -9, 30, 'complete', 50, 50, 'task', 'A', true),            -- 建立前
    ('c1', 1, 30, 'complete', 50, 50, 'task', 'A', true),             -- 未來
    ('d1', -3, 121, 'complete', 0, 0, 'entertainment', 'B', false),   -- 娛樂 121 分鐘
    ('11', -3, 30, 'complete', 49, 49, 'task', 'A', true),            -- 生產 XP 49
    ('12', -3, 30, 'complete', 50, 50, 'task', 'B', true),            -- 只有 B 級任務
    ('13', -3, 30, 'invalid', 50, 50, 'task', 'A', true),             -- A 級但 invalid
    ('14', -3, 30, 'complete', 50, 50, 'task', 'A', false),           -- 不算生產力
    ('15', -3, 30, 'complete', 60, 40, 'task', 'A', true)             -- base 60、final 40
  ) as sp(who, day_offset, minutes, result, base_xp, final_xp, impact, value, productive)
) as f;

-- 6. B 與 F 達成（2 位）：不發放。A 的付費已過期：paid_active 是 false。兩個時區都一樣。
update public.pro_entitlements set is_pro = true, pro_expires_at = now() - interval '1 day'
where user_id = '00000000-0000-4000-8000-0000001700a0';
do $$
declare
  tz text;
  r record;
begin
  foreach tz in array array['Etc/GMT-14', 'Etc/GMT+12'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000001700a0', 'role', 'authenticated')::text, true);
    perform set_config('timezone', tz, true);
    execute 'set local role authenticated';
    select * into r from public.claim_referral_reward();
    execute 'reset role';
    assert r.status = 'not_eligible' and not r.granted, format('two achievers must not be eligible (got %s under %s)', r.status, tz);
    assert r.achieved_count = 2 and r.required_count = 3,
      format('only B and F must count (achieved %s, required %s under %s)', r.achieved_count, r.required_count, tz);
    assert not r.is_active and r.granted_at is null and not r.paid_active,
      'nothing must be granted, and expired paid Pro is not paid_active';
  end loop;
  assert (select referral_reward_granted_at from public.pro_entitlements
          where user_id = '00000000-0000-4000-8000-0000001700a0') is null, 'the flag must stay NULL';
end $$;

-- 7. C 補上今天 → 3 位達成
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
) values (
  '00000000-0000-4000-8000-0000001700c1', 'pro017 task', (now() at time zone 'UTC')::date,
  now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
);

-- 8. 已是 Pro（付費中、終身、試用中）時不發放、不消耗；付費已過期時發放一次；第二次不延長
do $$
declare
  a uuid := '00000000-0000-4000-8000-0000001700a0';
  r record;
  e public.pro_entitlements%rowtype;
begin
  -- 付費中（5 天後到期）
  update public.pro_entitlements set is_pro = true, pro_expires_at = now() + interval '5 days' where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'active_entitlement' and not r.granted and r.achieved_count = 3,
    format('an active paid user must not be granted (got %s, %s)', r.status, r.achieved_count);
  select * into e from public.pro_entitlements where user_id = a;
  assert e.referral_reward_granted_at is null and e.pro_expires_at = now() + interval '5 days',
    'an active paid user must keep the reward and their expiry';

  -- 終身付費
  update public.pro_entitlements set pro_expires_at = null where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'active_entitlement' and r.paid_active, 'a lifetime user must not be granted';
  select * into e from public.pro_entitlements where user_id = a;
  assert e.pro_expires_at is null and e.referral_reward_granted_at is null,
    'a lifetime user must stay lifetime and keep the reward';

  -- 試用中（沒有付費）
  update public.pro_entitlements set is_pro = false, pro_expires_at = null, trial_started_at = now() - interval '1 day'
  where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'active_entitlement' and r.is_active and not r.paid_active and not r.granted,
    format('a user on trial must not be granted (got %s)', r.status);
  select * into e from public.pro_entitlements where user_id = a;
  assert e.referral_reward_granted_at is null and not e.is_pro and e.pro_expires_at is null,
    'a user on trial must keep the reward and their entitlement';

  -- 付費已過期、試用早已結束 → 發放（UTC−12 下）
  update public.pro_entitlements set is_pro = true, pro_expires_at = now() - interval '1 day',
    trial_started_at = now() - interval '40 days' where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('timezone', 'Etc/GMT+12', true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'granted' and r.granted and r.is_active and r.paid_active and r.achieved_count = 3,
    format('three achievers must grant the reward (got %s)', r.status);
  assert r.expires_at = now() + interval '30 days' and r.granted_at = now(), 'the reward must be 30 days from now';
  select * into e from public.pro_entitlements where user_id = a;
  assert e.is_pro and e.pro_expires_at = now() + interval '30 days' and e.referral_reward_granted_at = now(),
    'the entitlement row must hold the reward';

  -- 第二次（UTC+14 下）：已領過，不延長
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('timezone', 'Etc/GMT-14', true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'already_granted' and not r.granted and r.granted_at = now() and r.paid_active
     and r.achieved_count = 3,
    format('a second claim must be already_granted (got %s)', r.status);
  assert (select pro_expires_at from public.pro_entitlements where user_id = a) = now() + interval '30 days',
    'a second claim must not extend the reward';
end $$;

-- 9. updated_at trigger 看得到新欄位：只改 referral_reward_granted_at 也會更新 updated_at
--    （O 的資料列以過去的 updated_at 建立；INSERT 不觸發 trigger）
do $$
declare
  o uuid := '00000000-0000-4000-8000-000000170001';
begin
  insert into public.pro_entitlements (user_id, updated_at) values (o, now() - interval '1 day');
  update public.pro_entitlements set is_pro = false where user_id = o;
  assert (select updated_at from public.pro_entitlements where user_id = o) = now() - interval '1 day',
    'an update that changes nothing must keep updated_at';
  update public.pro_entitlements set referral_reward_granted_at = now() - interval '2 days' where user_id = o;
  assert (select updated_at from public.pro_entitlements where user_id = o) = now(),
    'changing referral_reward_granted_at must update updated_at';
end $$;

-- 10. 沒邀請任何人的 B：0 人、不發放；沒有 sub 與 anon 都不能呼叫
do $$
declare
  b text := '00000000-0000-4000-8000-0000001700b1';
  r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  assert r.status <> 'granted' and r.achieved_count = 0, 'a user with no invitees must have 0 achievers';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_my_referral_code();
    raise exception 'a caller without a user id must be refused';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.redeem_referral('ABCDEFGH');
    raise exception 'a caller without a user id must be refused';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.claim_referral_reward();
    raise exception 'a caller without a user id must be refused';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.get_my_referral_code();
    raise exception 'anon must not call get_my_referral_code()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.redeem_referral('ABCDEFGH');
    raise exception 'anon must not call redeem_referral()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.claim_referral_reward();
    raise exception 'anon must not call claim_referral_reward()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.referral_codes;
    raise exception 'anon must not read referral_codes';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

rollback;
