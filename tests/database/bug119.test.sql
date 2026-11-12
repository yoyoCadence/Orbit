-- BUG-119：排行榜頭像的 Storage policy（017）。
--
-- 前置：已套用 002、003、004（或 013）與 017（Supabase production 乾跑），或本機的
-- tests/database/support/storage-standin.sql → 003 → 017（替身含 002 的 profiles RLS 與
-- 建立 profile 的 auth.users trigger）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/bug119.test.sql
-- production 乾跑（需擁有者核准）：begin; set local lock_timeout = '5s'; ＋ 017 的內容 ＋
--   本檔從第一個 do $$ 到最後的 rollback; 之前 ＋ rollback;
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 四個合成帳號（example.invalid）：X 想利用 010 的人、Y 公開、P 不公開、Z 旁人。它們的頭像只是
-- storage.objects 的資料列（沒有真的檔案），都會被 rollback。

begin;

-- 0. ASSERT 必須開啟，否則失敗時不會中止，整份測試會靜默通過
do $$
begin
  if not current_setting('plpgsql.check_asserts')::boolean then
    raise exception 'plpgsql.check_asserts is off; this test would pass silently';
  end if;
end $$;

-- 1. 結構：函式是 SECURITY DEFINER、search_path 為空、只給 authenticated；policy 不再讀 profiles.name
do $$
declare
  fn regprocedure := 'public.is_public_profile_folder(text)'::regprocedure;
  p record;
begin
  assert (select prosecdef from pg_proc where oid = fn), 'is_public_profile_folder must be SECURITY DEFINER';
  assert (select provolatile from pg_proc where oid = fn) = 's', 'is_public_profile_folder must be STABLE';
  assert (select proconfig from pg_proc where oid = fn) @> array['search_path=""'],
    'is_public_profile_folder must set an empty search_path';
  assert has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated must be able to execute it';
  assert not has_function_privilege('anon', fn, 'EXECUTE'), 'anon must not be able to execute it';

  select * into p from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'avatars_select_public_leaderboard_profiles';
  assert found, 'avatars_select_public_leaderboard_profiles must exist';
  assert p.cmd = 'SELECT' and p.roles = array['authenticated']::name[], 'the policy must be SELECT for authenticated';
  assert p.with_check is null, 'the policy must have USING only';
  assert p.qual like '%bucket_id = ''avatars''%', 'the policy must be limited to bucket avatars';
  assert p.qual like '%is_public_profile_folder(%', 'the policy must ask is_public_profile_folder()';
  assert p.qual not like '%profiles%' and p.qual not like '%p.name%',
    'the policy must not read profiles itself (BUG-119)';
end $$;

-- 2. fixture：四個帳號（trigger 建立 profile）與它們的頭像
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000b1191', 'bug119-x@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000b1192', 'bug119-y@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000b1193', 'bug119-p@example.invalid', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000b1194', 'bug119-z@example.invalid', '{}'::jsonb);

update public.profiles set name = 'bug119 X', is_public = false where user_id = '00000000-0000-4000-8000-0000000b1191';
update public.profiles set name = 'bug119 Y', is_public = true  where user_id = '00000000-0000-4000-8000-0000000b1192';
update public.profiles set name = 'bug119 P', is_public = false where user_id = '00000000-0000-4000-8000-0000000b1193';
update public.profiles set name = 'bug119 Z', is_public = false where user_id = '00000000-0000-4000-8000-0000000b1194';

insert into storage.objects (bucket_id, name) values
  ('avatars', '00000000-0000-4000-8000-0000000b1191/avatar.png'),
  ('avatars', '00000000-0000-4000-8000-0000000b1192/avatar.png'),
  ('avatars', '00000000-0000-4000-8000-0000000b1193/avatar.png');

do $$
begin
  assert (select count(*) from public.profiles where user_id::text like '00000000-0000-4000-8000-0000000b119_') = 4,
    'the auth.users trigger must create a profile for every synthetic account';
end $$;

-- 3. 旁人 Z：看得到公開的 Y，看不到不公開的 P 與 X（這是 010 原本要做、但從來沒生效的功能）
do $$
declare
  z text := '00000000-0000-4000-8000-0000000b1194';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects
    where bucket_id = 'avatars' and name = '00000000-0000-4000-8000-0000000b1192/avatar.png';
  assert n = 1, format('a bystander must see a public user''s avatar (saw %s)', n);
  select count(*) into n from storage.objects
    where bucket_id = 'avatars' and name in ('00000000-0000-4000-8000-0000000b1193/avatar.png',
                                             '00000000-0000-4000-8000-0000000b1191/avatar.png');
  assert n = 0, format('a bystander must not see private users'' avatars (saw %s)', n);
  execute 'reset role';
end $$;

-- 4. 攻擊者 X：010 的漏洞要把名稱改成「自己的 user_id/x」（至少 37 字），profiles.name 的
--    30 字上限（001）擋下；X 改成公開之後，看得到自己與公開的 Y，仍然看不到 P
do $$
declare
  x text := '00000000-0000-4000-8000-0000000b1191';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.profiles set name = x || '/x', is_public = true where user_id = x::uuid;
    raise exception 'a name of "<own user_id>/x" must be refused by the 30-character limit';
  exception when check_violation then
    null;
  end;
  update public.profiles set is_public = true where user_id = x::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'a user must be able to make their own profile public';
  select count(*) into n from storage.objects
    where bucket_id = 'avatars' and name = '00000000-0000-4000-8000-0000000b1193/avatar.png';
  assert n = 0, format('going public must not open a private user''s avatar (saw %s)', n);
  select count(*) into n from storage.objects
    where bucket_id = 'avatars' and name like '00000000-0000-4000-8000-0000000b119_/avatar.png';
  assert n = 2, format('the user must see only their own and the public user''s avatars (saw %s)', n);
  execute 'reset role';
end $$;

-- 5. 不公開的 P：看得到自己的（003 的 avatars_select）與公開的；anon 什麼都看不到、不能呼叫函式
do $$
declare
  p text := '00000000-0000-4000-8000-0000000b1193';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects
    where bucket_id = 'avatars' and name = p || '/avatar.png';
  assert n = 1, 'a private user must still see their own avatar';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  assert n = 0, format('anon must not see any avatar (saw %s)', n);
  begin
    perform public.is_public_profile_folder('00000000-0000-4000-8000-0000000b1192');
    raise exception 'anon must not be able to call is_public_profile_folder()';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;

-- 6. 函式只回答布林值：公開的 true，其他（不公開、不存在、不是 UUID、NULL）false
do $$
begin
  assert public.is_public_profile_folder('00000000-0000-4000-8000-0000000b1192'), 'a public profile folder must be true';
  assert not public.is_public_profile_folder('00000000-0000-4000-8000-0000000b1193'), 'a private profile folder must be false';
  assert not public.is_public_profile_folder('00000000-0000-4000-8000-00000000dead'), 'an unknown folder must be false';
  assert not public.is_public_profile_folder('not-a-uuid'), 'a non-UUID folder must be false';
  assert not public.is_public_profile_folder(null), 'NULL must be false';
end $$;

rollback;
