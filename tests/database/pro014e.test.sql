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
update public.profiles set is_public = true, display_name = 'zz pro014e B', is_pro = true, mode = 'advanced',
  avatar_url = '00000000-0000-4000-8000-00000e014e0b/avatar-2.png'
  where user_id = '00000000-0000-4000-8000-00000e014e0b';
update public.profiles set is_public = true, display_name = null
  where user_id = '00000000-0000-4000-8000-00000e014e0c';
update public.profiles set is_public = false, display_name = 'zz pro014e D'
  where user_id = '00000000-0000-4000-8000-00000e014e0d';
-- E 與 F 的 avatar_url 不在自己的資料夾：含有自己 user_id 的任意網址、別人的路徑（RPC 必須回傳 NULL）
update public.profiles set is_public = true, display_name = 'zz pro014e E',
  avatar_url = 'https://example.invalid/00000000-0000-4000-8000-00000e014e0e/track.png'
  where user_id = '00000000-0000-4000-8000-00000e014e0e';
update public.profiles set is_public = true, display_name = 'zz pro014e F',
  avatar_url = '00000000-0000-4000-8000-00000e014e0a/avatar-1.png'
  where user_id = '00000000-0000-4000-8000-00000e014e0f';

insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at) values
  ('00000000-0000-4000-8000-00000e014e0a', false, null, now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000e014e0e', true, now() - interval '1 day', null),
  ('00000000-0000-4000-8000-00000e014e0f', true, null, null);

-- A 的 sessions：UTC 今天 50 與 6 天前 30 算進本週；7 天前 1000 與不算生產力的 999 不算。
-- base_xp 故意比 final_xp 少 10，確認加總的是 final_xp。
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select '00000000-0000-4000-8000-00000e014e0a', 'pro014e task', (now() at time zone 'UTC')::date - d.days_ago,
       now(), now(), 30, 'complete', d.xp - 10, d.xp, 10, 0, 'task', 'growth', 'A', 1.0, d.productive
from (values (0, 50, true), (6, 30, true), (7, 1000, true), (0, 999, false)) as d(days_ago, xp, productive);

-- 3. 公開名稱的規則：CHECK 擋下的名稱與允許的名稱（以 postgres 改 D 的公開名稱）
--    a. 018 列出的每一個不允許的字元都被擋下，每一段兩端外面的鄰居（不在任何一段裡）允許；
--       variation selector 與 tag 每一段的兩端不能在開頭、不能藏起結尾的空白；
--    b. 長度、前後空白、variation selector 與 tag 的邊界；
--    c. 允許的名稱（中文、emoji、emoji 加 variation selector、英格蘭旗、20 個 emoji）。
do $$
declare
  d uuid := '00000000-0000-4000-8000-00000e014e0d';
  forbidden int4range[] := array[
    int4range(1, 31, '[]')  /* U+0001–U+001F */,
    int4range(127, 160, '[]')  /* U+007F–U+00A0 */,
    int4range(173, 173, '[]')  /* U+00AD */,
    int4range(847, 847, '[]')  /* U+034F */,
    int4range(1564, 1564, '[]')  /* U+061C */,
    int4range(4447, 4447, '[]')  /* U+115F */,
    int4range(4448, 4448, '[]')  /* U+1160 */,
    int4range(5760, 5760, '[]')  /* U+1680 */,
    int4range(6068, 6068, '[]')  /* U+17B4 */,
    int4range(6069, 6069, '[]')  /* U+17B5 */,
    int4range(6155, 6159, '[]')  /* U+180B–U+180F */,
    int4range(8192, 8207, '[]')  /* U+2000–U+200F */,
    int4range(8232, 8239, '[]')  /* U+2028–U+202F */,
    int4range(8287, 8303, '[]')  /* U+205F–U+206F */,
    int4range(10240, 10240, '[]')  /* U+2800 */,
    int4range(12288, 12288, '[]')  /* U+3000 */,
    int4range(12644, 12644, '[]')  /* U+3164 */,
    int4range(65279, 65279, '[]')  /* U+FEFF */,
    int4range(65440, 65440, '[]')  /* U+FFA0 */,
    int4range(65520, 65531, '[]')  /* U+FFF0–U+FFFB */,
    int4range(78896, 78911, '[]')  /* U+13430–U+1343F */,
    int4range(94180, 94180, '[]')  /* U+16FE4 */,
    int4range(113824, 113827, '[]')  /* U+1BCA0–U+1BCA3 */,
    int4range(119129, 119129, '[]')  /* U+1D159 */,
    int4range(119155, 119162, '[]')  /* U+1D173–U+1D17A */,
    int4range(917632, 917759, '[]')  /* U+E0080–U+E00FF */,
    int4range(918000, 921599, '[]')  /* U+E01F0–U+E0FFF */
  ];
  r int4range;
  cp int;
  candidate text;
  refused int := 0;
begin
  foreach r in array forbidden loop
    for cp in lower(r) .. upper(r) - 1 loop
      begin
        update public.profiles set display_name = 'a' || chr(cp) || 'b' where user_id = d;
        raise exception 'U+% must be refused', to_hex(cp);
      exception when check_violation then
        refused := refused + 1;
      end;
    end loop;
    foreach cp in array array[lower(r) - 1, upper(r)] loop
      continue when cp < 1 or exists (select 1 from unnest(forbidden) f where f @> cp);
      update public.profiles set display_name = 'a' || chr(cp) || 'b' where user_id = d;
    end loop;
  end loop;
  assert refused = 3894, format('every forbidden code point must be probed (%s)', refused);

  -- variation selector 與 tag 的每一段的兩端：不能在開頭，也不能藏起結尾的空白
  foreach cp in array array[65024, 65039, 917504, 917631, 917760, 917999] loop  -- FE00 FE0F E0000 E007F E0100 E01EF
    begin
      update public.profiles set display_name = chr(cp) || 'a' where user_id = d;
      raise exception 'a name starting with U+% must be refused', to_hex(cp);
    exception when check_violation then null;
    end;
    begin
      update public.profiles set display_name = 'a ' || chr(cp) where user_id = d;
      raise exception 'a trailing space hidden by U+% must be refused', to_hex(cp);
    exception when check_violation then null;
    end;
  end loop;

  foreach candidate in array array[
    '',                                         -- 空字串
    repeat('a', 21),                            -- 21 字
    ' a', 'a ', '  ',                           -- 前後半形空白
    chr(65039),                                 -- 只有 variation selector
    chr(917760),                                -- 只有 U+E0100
    chr(917505) || chr(917536),                 -- 只有 tag
    chr(65039) || ' a',                         -- 以 variation selector 藏起開頭的空白
    'a ' || chr(65039),                         -- 以 variation selector 藏起結尾的空白
    'a ' || chr(917631),                        -- 以 tag 藏起結尾的空白
    'a ' || chr(65039) || chr(917631)           -- 以兩個字元藏起結尾的空白
  ] loop
    begin
      update public.profiles set display_name = candidate where user_id = d;
      raise exception 'display_name % must be refused', quote_literal(candidate);
    exception when check_violation then
      null;
    end;
  end loop;

  foreach candidate in array array[
    'a', repeat(chr(28204), 20), 'Joey Chen', 'a  b', 'O''Brien',
    chr(29579) || chr(23567) || chr(26126),     -- 中文名字
    chr(128578),                                -- emoji
    chr(10084) || chr(65039),                   -- emoji 加 variation selector（結尾是 VS16）
    chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631),
                                                -- 英格蘭旗（黑旗＋tag）
    repeat(chr(128578), 20)                     -- 20 個 emoji 是 20 字
  ] loop
    update public.profiles set display_name = candidate where user_id = d;
  end loop;

  update public.profiles set display_name = 'zz pro014e D' where user_id = d;
end $$;

-- 4. get_leaderboard()：以 A 的身分呼叫。連線的 TimeZone 故意設成 UTC+14 與 UTC−12：
--    無論現在 UTC 幾點，兩者至少有一個的「今天」與 UTC 不同，用連線的日期算就會錯。
do $$
declare
  a text := '00000000-0000-4000-8000-00000e014e0a';
  r record;
  expected int;
  n int;
  names text;
  tz text;
begin
  -- 呼叫者看到的列數必須等於所有「公開且有公開名稱」的人（不多不少），先以 postgres 數
  select count(*) into expected from public.profiles where is_public and display_name is not null;

  foreach tz in array array['Etc/GMT-14', 'Etc/GMT+12'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('timezone', tz, true);
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
    assert r.week_xp = 80,
      format('week_xp must count final_xp of the last 7 UTC days, productive only (got %s under %s)', r.week_xp, tz);
    assert r.joined_on = date '2026-01-02', format('joined_on must be the UTC date (got %s under %s)', r.joined_on, tz);
    assert r.is_pro, 'an active trial must count as Pro';

    select * into r from public.get_leaderboard() l where l.display_name = 'zz pro014e B';
    assert r.week_xp = 0 and r.mode = 'advanced' and not r.is_me, 'B''s row must be returned as is';
    assert r.avatar_path = '00000000-0000-4000-8000-00000e014e0b/avatar-2.png',
      'another user''s avatar_path must be returned when it is in their own folder';
    assert not r.is_pro, 'profiles.is_pro must not make anyone Pro (no entitlement)';
    select * into r from public.get_leaderboard() l where l.display_name = 'zz pro014e E';
    assert not r.is_pro, 'expired paid Pro must be false';
    assert r.avatar_path is null, 'an avatar_url outside the user''s folder (a URL) must not be returned';
    select * into r from public.get_leaderboard() l where l.display_name = 'zz pro014e F';
    assert r.is_pro, 'lifetime paid Pro must be true';
    assert r.avatar_path is null, 'an avatar_url in someone else''s folder must not be returned';
    execute 'reset role';
  end loop;
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

-- 6b. view 的其他欄位與 010 相同：以 UTC（Supabase 的預設）比對 A 與 B 的每一個欄位
do $$
declare
  a text := '00000000-0000-4000-8000-00000e014e0a';
  v record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('timezone', 'UTC', true);
  execute 'set local role authenticated';
  select * into v from public.leaderboard_view where user_id = a::uuid;
  assert v.total_xp = 100 and v.streak_days = 3 and v.mode = 'normal' and v.week_xp = 80
     and v.created_at = '2026-01-02 23:30:00+00' and v.avatar_url = a || '/avatar-1.png',
    format('A''s view row must match 010 (got %s)', row_to_json(v));
  select * into v from public.leaderboard_view where user_id = '00000000-0000-4000-8000-00000e014e0b';
  assert v.name = 'zz pro014e B' and v.total_xp = 0 and v.week_xp = 0 and v.mode = 'advanced'
     and v.avatar_url = '00000000-0000-4000-8000-00000e014e0b/avatar-2.png',
    format('B''s view row must match 010 (got %s)', row_to_json(v));
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
