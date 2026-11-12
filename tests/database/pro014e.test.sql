-- PRO-014E E1：排行榜的公開名稱與 get_leaderboard()（018）。
--
-- 前置：已套用 001～016 與 018（Supabase production 乾跑），或本機的
--   tests/database/support/supabase-standin.sql → pwa/db 的 001～018 依序套用。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro014e.test.sql
-- production 乾跑（需擁有者核准）：begin; set local lock_timeout = '5s'; ＋ 018 的內容 ＋
--   本檔從第一個 do $$ 到最後的 rollback; 之前 ＋ rollback;
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 合成帳號（example.invalid）的公開名稱都以「zz pro014e」開頭；production 裡真的公開使用者也會
-- 出現在 get_leaderboard() 的結果，所以只比對這些名稱的資料列與整體的不變條件。
-- 特殊字元一律以 chr() 寫出，檔案裡沒有看不見的字元。

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
  fn regprocedure := 'public.get_leaderboard()'::regprocedure;
  cols text;
begin
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'display_name' and data_type = 'text' and is_nullable = 'YES'
  ), 'profiles.display_name must be a nullable text column';
  assert exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_display_name_check' and contype = 'c'
  ), 'profiles_display_name_check must exist';

  assert (select prosecdef from pg_proc where oid = fn), 'get_leaderboard() must be SECURITY DEFINER';
  assert (select provolatile from pg_proc where oid = fn) = 's', 'get_leaderboard() must be STABLE';
  assert (select proconfig from pg_proc where oid = fn) @> array['search_path=""'],
    'get_leaderboard() must set an empty search_path';
  -- 回傳的欄位剛好是這九個（新增欄位必須明確改這裡）
  assert pg_get_function_result(fn) =
    'TABLE(display_name text, avatar_path text, total_xp integer, week_xp bigint, streak_days integer, '
    'mode text, joined_on date, is_me boolean, is_pro boolean)',
    format('get_leaderboard() must return exactly the nine columns (got %s)', pg_get_function_result(fn));

  assert has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated must be able to execute get_leaderboard()';
  assert not has_function_privilege('anon', fn, 'EXECUTE'), 'anon must not be able to execute get_leaderboard()';
  -- proacl 為 NULL 代表預設權限（PUBLIC 可以執行），所以先確認它不是 NULL
  assert (select proacl from pg_proc where oid = fn) is not null, 'get_leaderboard() must have explicit grants';
  assert not exists (
    select 1 from aclexplode((select proacl from pg_proc where oid = fn)) a where a.grantee = 0
  ), 'PUBLIC must not be able to execute get_leaderboard()';

  -- 舊的 view：欄位名稱、順序與型別與 010 相同；權限與 015 相同
  select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'leaderboard_view';
  assert cols = 'user_id uuid, name text, total_xp integer, streak_days integer, mode text, '
    'created_at timestamp with time zone, week_xp bigint, avatar_url text',
    format('leaderboard_view columns must not change (got %s)', cols);
  assert has_table_privilege('authenticated', 'public.leaderboard_view', 'SELECT'),
    'authenticated must still be able to read leaderboard_view';
  assert not has_table_privilege('anon', 'public.leaderboard_view', 'SELECT'),
    'anon must still not be able to read leaderboard_view';
end $$;

-- 2. fixture：六個帳號（trigger 建立 profile），名稱是 email 前段
--    A 公開、有公開名稱、試用中；B 公開、profile 的 is_pro 是 true 但沒有 entitlement；
--    C 公開、沒有公開名稱；D 不公開、有公開名稱；E 公開、付費已過期；F 公開、終身付費
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000e014e0a', 'pro014e-a@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000e014e0b', 'pro014e-b@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000e014e0c', 'pro014e-c@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000e014e0d', 'pro014e-d@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000e014e0e', 'pro014e-e@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000e014e0f', 'pro014e-f@example.invalid', '{}'::jsonb);

update public.profiles set is_public = true, display_name = 'zz pro014e A',
  avatar_url = '00000000-0000-4000-8000-00000e014e0a/avatar-1.png',
  total_xp = 100, streak_days = 3, mode = 'normal', created_at = '2026-01-02 23:30:00+00'
  where user_id = '00000000-0000-4000-8000-00000e014e0a';
update public.profiles set is_public = true, display_name = 'zz pro014e B', is_pro = true, mode = 'advanced'
  where user_id = '00000000-0000-4000-8000-00000e014e0b';
update public.profiles set is_public = true, display_name = null
  where user_id = '00000000-0000-4000-8000-00000e014e0c';
update public.profiles set is_public = false, display_name = 'zz pro014e D'
  where user_id = '00000000-0000-4000-8000-00000e014e0d';
update public.profiles set is_public = true, display_name = 'zz pro014e E'
  where user_id = '00000000-0000-4000-8000-00000e014e0e';
update public.profiles set is_public = true, display_name = 'zz pro014e F'
  where user_id = '00000000-0000-4000-8000-00000e014e0f';

insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at) values
  ('00000000-0000-4000-8000-00000e014e0a', false, null, now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000e014e0e', true, now() - interval '1 day', null),
  ('00000000-0000-4000-8000-00000e014e0f', true, null, null);

-- A 的 sessions：UTC 今天 50 與 6 天前 30 算進本週；7 天前 1000 與不算生產力的 999 不算
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select '00000000-0000-4000-8000-00000e014e0a', 'pro014e task', (now() at time zone 'UTC')::date - d.days_ago,
       now(), now(), 30, 'complete', d.xp, d.xp, 10, 0, 'task', 'growth', 'A', 1.0, d.productive
from (values (0, 50, true), (6, 30, true), (7, 1000, true), (0, 999, false)) as d(days_ago, xp, productive);

-- 3. 公開名稱的規則：CHECK 擋下的名稱與允許的名稱（以 postgres 改 D 的公開名稱）
do $$
declare
  d uuid := '00000000-0000-4000-8000-00000e014e0d';
  bad text;
  good text;
begin
  foreach bad in array array[
    '',                                  -- 空字串
    repeat('a', 21),                     -- 21 字
    ' a', 'a ',                          -- 前後半形空白
    'a' || chr(9) || 'b',                -- tab
    'a' || chr(10),                      -- 換行
    'a' || chr(127),                     -- DEL
    'a' || chr(133) || 'b',              -- U+0085
    'a' || chr(160) || 'b',              -- 不換行空白
    chr(173) || 'a',                     -- 軟連字號
    'a' || chr(1564) || 'b',             -- U+061C 方向標記
    chr(4447), chr(65440), chr(12644),   -- Hangul 的空白字元
    chr(8194),                           -- en space
    'a' || chr(8203) || 'b',             -- 零寬空白
    'a' || chr(8205) || 'b',             -- 零寬連接（ZWJ）
    chr(8238) || 'abc',                  -- U+202E 由右至左覆寫
    'a' || chr(8239) || 'b',             -- 窄不換行空白
    'a' || chr(8288),                    -- word joiner
    chr(10240),                          -- Braille 空白
    chr(12288), 'a' || chr(12288) || 'b',-- 全形空白
    chr(65279) || 'a'                    -- BOM
  ] loop
    begin
      update public.profiles set display_name = bad where user_id = d;
      raise exception 'display_name % must be refused', quote_literal(bad);
    exception when check_violation then
      null;
    end;
  end loop;

  foreach good in array array[
    'a', repeat(chr(28204), 20), 'Joey Chen', 'a  b', 'O''Brien',
    chr(29579) || chr(23567) || chr(26126),   -- 中文名字
    chr(128578),                              -- emoji
    chr(10084) || chr(65039),                 -- emoji 加 variation selector
    repeat(chr(128578), 20)                   -- 20 個 emoji 是 20 字
  ] loop
    update public.profiles set display_name = good where user_id = d;
  end loop;

  update public.profiles set display_name = 'zz pro014e D' where user_id = d;
end $$;

-- 4. get_leaderboard()：以 A 的身分呼叫（連線的 TimeZone 故意不是 UTC）
do $$
declare
  a text := '00000000-0000-4000-8000-00000e014e0a';
  r record;
  expected int;
  n int;
  names text;
begin
  -- 呼叫者看到的列數必須等於所有「公開且有公開名稱」的人（不多不少），先以 postgres 數
  select count(*) into expected from public.profiles where is_public and display_name is not null;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('timezone', 'Asia/Taipei', true);
  execute 'set local role authenticated';

  select count(*) into n from public.get_leaderboard();
  assert n = expected, format('the RPC must list every public user with a public name (%s vs %s)', n, expected);
  select string_agg(l.display_name, ',' order by l.display_name) into names
  from public.get_leaderboard() l where l.display_name like 'zz pro014e %';
  assert names = 'zz pro014e A,zz pro014e B,zz pro014e E,zz pro014e F',
    format('only public users with a public name must be listed (got %s)', names);
  assert not exists (select 1 from public.get_leaderboard() l where l.display_name is null),
    'no row may have a NULL display_name';
  assert (select count(*) from public.get_leaderboard() l where l.is_me) = 1, 'exactly one row must be is_me';
  assert (select l.display_name from public.get_leaderboard() l where l.is_me) = 'zz pro014e A',
    'is_me must be the caller''s row';
  assert not exists (select 1 from public.get_leaderboard() l where l.display_name like 'pro014e-%'),
    'email prefixes must not appear';

  select * into r from public.get_leaderboard() l where l.display_name = 'zz pro014e A';
  assert r.avatar_path = a || '/avatar-1.png', 'avatar_path must be the stored path';
  assert r.total_xp = 100 and r.streak_days = 3 and r.mode = 'normal', 'A''s totals must be returned';
  assert r.week_xp = 80, format('week_xp must count the last 7 UTC days of productive XP only (got %s)', r.week_xp);
  assert r.joined_on = date '2026-01-02', format('joined_on must be the UTC date (got %s)', r.joined_on);
  assert r.is_pro, 'an active trial must count as Pro';

  select * into r from public.get_leaderboard() l where l.display_name = 'zz pro014e B';
  assert r.week_xp = 0 and r.mode = 'advanced' and not r.is_me, 'B''s row must be returned as is';
  assert not r.is_pro, 'profiles.is_pro must not make anyone Pro (no entitlement)';
  assert not (select l.is_pro from public.get_leaderboard() l where l.display_name = 'zz pro014e E'),
    'expired paid Pro must be false';
  assert (select l.is_pro from public.get_leaderboard() l where l.display_name = 'zz pro014e F'),
    'lifetime paid Pro must be true';
  execute 'reset role';
end $$;

-- 5. 沒有 sub 的 authenticated 拿不到任何資料；anon 不能呼叫
do $$
declare
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.get_leaderboard();
  assert n = 0, format('a caller without a user id must get no rows (got %s)', n);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform * from public.get_leaderboard();
    raise exception 'anon must not be able to call get_leaderboard()';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;

-- 6. 舊的 leaderboard_view：name 是公開名稱，沒有公開名稱的人顯示「匿名」，不再是 email 前段
do $$
declare
  a text := '00000000-0000-4000-8000-00000e014e0a';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert (select name from public.leaderboard_view where user_id = a::uuid) = 'zz pro014e A',
    'the view must show the public name';
  assert (select name from public.leaderboard_view where user_id = '00000000-0000-4000-8000-00000e014e0c') = '匿名',
    'a public user without a public name must show as 匿名';
  assert not exists (select 1 from public.leaderboard_view where user_id = '00000000-0000-4000-8000-00000e014e0d'),
    'a private user must not be in the view';
  assert not exists (select 1 from public.leaderboard_view where name like 'pro014e-%'),
    'email prefixes must not appear in the view';
  execute 'reset role';
end $$;

-- 7. 寫入：本人能改自己的公開名稱（002 的 RLS），改不到別人的；不符合規則的被擋下
do $$
declare
  a text := '00000000-0000-4000-8000-00000e014e0a';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.profiles set display_name = 'zz pro014e A2' where user_id = a::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'a user must be able to set their own public name';
  update public.profiles set display_name = 'zz pro014e hijack' where user_id = '00000000-0000-4000-8000-00000e014e0b';
  get diagnostics n = row_count;
  assert n = 0, 'a user must not be able to change someone else''s public name';
  begin
    update public.profiles set display_name = chr(12288) || 'x' where user_id = a::uuid;
    raise exception 'an invalid public name from a client must be refused';
  exception when check_violation then
    null;
  end;
  execute 'reset role';
  assert (select display_name from public.profiles where user_id = '00000000-0000-4000-8000-00000e014e0b') = 'zz pro014e B',
    'B''s public name must be unchanged';
end $$;

rollback;
