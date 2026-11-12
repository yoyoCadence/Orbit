-- PRO-017 R1：邀請朋友解鎖 Pro（019）。
--
-- 前置：已套用 001～019（Supabase production 乾跑），或本機的
--   tests/database/support/supabase-standin.sql → pwa/db 的 001～019 依序套用。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro017.test.sql
-- production 乾跑（需擁有者核准）：begin; set local lock_timeout = '5s'; ＋ 019 的內容 ＋
--   本檔從第一個 do $$ 到最後的 rollback; 之前 ＋ rollback;
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 合成帳號（example.invalid）：A 邀請者、B／C／D 被邀請者、O 建立超過 7 天的帳號。
-- 同一個 transaction 裡 now() 不變，所以日期與期限都以 now() 比對。
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

-- 2. fixture：A 邀請者（30 天前建立，試用早已結束）、B／C／D 被邀請者（6 天前建立）、
--    O 8 天前建立
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('00000000-0000-4000-8000-00000017000a', 'pro017-a@example.invalid', '{}'::jsonb, now() - interval '30 days'),
  ('00000000-0000-4000-8000-00000017000b', 'pro017-b@example.invalid', '{}'::jsonb, now() - interval '6 days'),
  ('00000000-0000-4000-8000-00000017000c', 'pro017-c@example.invalid', '{}'::jsonb, now() - interval '6 days'),
  ('00000000-0000-4000-8000-00000017000d', 'pro017-d@example.invalid', '{}'::jsonb, now() - interval '6 days'),
  ('00000000-0000-4000-8000-00000017000f', 'pro017-o@example.invalid', '{}'::jsonb, now() - interval '8 days');

-- updated_at 故意設在過去，之後才看得出 trigger 有沒有更新它（INSERT 不觸發 trigger）
insert into public.pro_entitlements (user_id, trial_started_at, updated_at) values
  ('00000000-0000-4000-8000-00000017000a', now() - interval '40 days', now() - interval '1 day');

-- 3. 邀請碼：格式、同一個人每次相同、不同人不同；只讀得到自己的；client 不能寫
do $$
declare
  a text := '00000000-0000-4000-8000-00000017000a';
  b text := '00000000-0000-4000-8000-00000017000b';
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

-- 4. 綁定：格式、碼不存在、自己的碼、帳號太舊、成功、重複、client 不能讀寫 referrals
do $$
declare
  a text := '00000000-0000-4000-8000-00000017000a';
  b text := '00000000-0000-4000-8000-00000017000b';
  c text := '00000000-0000-4000-8000-00000017000c';
  d text := '00000000-0000-4000-8000-00000017000d';
  o text := '00000000-0000-4000-8000-00000017000f';
  code_a text := (select code from pro017_codes where who = 'a');
  code_b text := (select code from pro017_codes where who = 'b');
  unknown text;
  r text;
begin
  -- 一個格式正確、但不存在的碼
  select candidate into unknown
  from (values ('ZZZZZZZZ'), ('ZZZZZZZY'), ('ZZZZZZZX')) as v(candidate)
  where not exists (select 1 from public.referral_codes c2 where c2.code = v.candidate)
  limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral('nope') = 'invalid_code', 'a malformed code must be invalid_code';
  assert public.redeem_referral(null) = 'invalid_code', 'NULL must be invalid_code';
  assert public.redeem_referral('ABCD0EFG') = 'invalid_code', 'a code with 0 must be invalid_code';
  assert public.redeem_referral(unknown) = 'invalid_code', 'an unknown code must be invalid_code';
  assert public.redeem_referral(code_b) = 'own_code', 'redeeming one''s own code must be own_code';
  r := public.redeem_referral('  ' || lower(code_a) || ' ');
  assert r = 'redeemed', format('a lower-case code with spaces must redeem (got %s)', r);
  assert public.redeem_referral(code_a) = 'already_redeemed', 'redeeming twice must be already_redeemed';
  begin
    perform 1 from public.referrals;
    raise exception 'a client must not read referrals';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.referrals (invitee_id, inviter_id) values (b::uuid, a::uuid);
    raise exception 'a client must not write referrals';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral(code_a) = 'too_late', 'an account older than 7 days must be too_late';
  execute 'reset role';

  foreach r in array array[c, d] loop
    perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    assert public.redeem_referral(code_a) = 'redeemed', 'C and D must redeem A''s code';
    execute 'reset role';
  end loop;

  -- C 已經綁定 A，再綁 B 的碼也是 already_redeemed
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert public.redeem_referral(code_b) = 'already_redeemed', 'an invitee must not switch inviters';
  execute 'reset role';

  assert (select string_agg(right(invitee_id::text, 1), '' order by invitee_id) from public.referrals
          where inviter_id = a::uuid) = 'bcd', 'A must have exactly B, C and D as invitees';
  assert not exists (select 1 from public.referrals where invitee_id = o::uuid), 'O must not be bound';
end $$;

-- 5. 被邀請者的 sessions。有效日：生產 XP 50、一個 A 級任務、沒有娛樂。
--    B：建立當天到今天，7 個有效日（達成）。
--    C：建立前一天到昨天（建立前那天不算）＋明天（未來不算）→ 6 個。
--    D：建立當天到今天，7 天，但其中一天娛樂 121 分鐘 → 6 個。
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select f.user_id::uuid, 'pro017 task', (now() at time zone 'UTC')::date - f.days_ago,
       now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
from (
  select '00000000-0000-4000-8000-00000017000b' as user_id, g as days_ago from generate_series(0, 6) g
  union all
  select '00000000-0000-4000-8000-00000017000c', g from generate_series(1, 7) g
  union all
  select '00000000-0000-4000-8000-00000017000c', -1
  union all
  select '00000000-0000-4000-8000-00000017000d', g from generate_series(0, 6) g
) as f;

insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
) values (
  '00000000-0000-4000-8000-00000017000d', 'pro017 game', (now() at time zone 'UTC')::date - 3,
  now(), now(), 121, 'complete', 0, 0, 0, 0, 'entertainment', 'entertainment', 'B', 1.0, false
);

-- 6. 只有 B 達成：不發放
do $$
declare
  a text := '00000000-0000-4000-8000-00000017000a';
  r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  assert r.status = 'not_eligible' and not r.granted, format('one achiever must not be eligible (got %s)', r.status);
  assert r.achieved_count = 1 and r.required_count = 3,
    format('only B must count (achieved %s, required %s)', r.achieved_count, r.required_count);
  assert not r.is_active and r.granted_at is null and not r.paid_active, 'nothing must be granted';
  execute 'reset role';
  assert (select referral_reward_granted_at from public.pro_entitlements where user_id = a::uuid) is null,
    'the flag must stay NULL';
end $$;

-- 7. C 補上今天、D 拿掉娛樂 → 3 位都達成
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
) values (
  '00000000-0000-4000-8000-00000017000c', 'pro017 task', (now() at time zone 'UTC')::date,
  now(), now(), 30, 'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
);
delete from public.sessions
where user_id = '00000000-0000-4000-8000-00000017000d' and task_name = 'pro017 game';

-- 8. 已是 Pro（付費中、終身）時不發放、不消耗；不是 Pro 時發放一次
do $$
declare
  a text := '00000000-0000-4000-8000-00000017000a';
  r record;
  e public.pro_entitlements%rowtype;
begin
  -- 付費中（5 天後到期）
  update public.pro_entitlements set is_pro = true, pro_expires_at = now() + interval '5 days' where user_id = a::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'active_entitlement' and not r.granted and r.achieved_count = 3,
    format('an active paid user must not be granted (got %s, %s)', r.status, r.achieved_count);
  select * into e from public.pro_entitlements where user_id = a::uuid;
  assert e.referral_reward_granted_at is null and e.pro_expires_at = now() + interval '5 days',
    'an active paid user must keep the reward and their expiry';

  -- 終身付費
  update public.pro_entitlements set pro_expires_at = null where user_id = a::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'active_entitlement' and r.paid_active, 'a lifetime user must not be granted';
  select * into e from public.pro_entitlements where user_id = a::uuid;
  assert e.pro_expires_at is null and e.referral_reward_granted_at is null,
    'a lifetime user must stay lifetime and keep the reward';

  -- 不是 Pro（付費已關閉、試用早已結束）
  update public.pro_entitlements set is_pro = false, pro_expires_at = null where user_id = a::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'granted' and r.granted and r.is_active and r.paid_active and r.achieved_count = 3,
    format('three achievers must grant the reward (got %s)', r.status);
  assert r.expires_at = now() + interval '30 days' and r.granted_at = now(), 'the reward must be 30 days from now';
  select * into e from public.pro_entitlements where user_id = a::uuid;
  assert e.is_pro and e.pro_expires_at = now() + interval '30 days' and e.referral_reward_granted_at = now(),
    'the entitlement row must hold the reward';

  -- 第二次：已領過，不延長
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.claim_referral_reward();
  execute 'reset role';
  assert r.status = 'already_granted' and not r.granted and r.granted_at = now(),
    format('a second claim must be already_granted (got %s)', r.status);
  assert (select pro_expires_at from public.pro_entitlements where user_id = a::uuid) = now() + interval '30 days',
    'a second claim must not extend the reward';
end $$;

-- 9. updated_at trigger 看得到新欄位：只改 referral_reward_granted_at 也會更新 updated_at
--    （O 的資料列以過去的 updated_at 建立；INSERT 不觸發 trigger）
do $$
declare
  o uuid := '00000000-0000-4000-8000-00000017000f';
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
  b text := '00000000-0000-4000-8000-00000017000b';
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
