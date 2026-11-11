-- HW-112A：佐證照片的私有 bucket `proofs` 與四個 policy（016）。
--
-- 前置：已套用 003 與 016。兩種跑法：
--   - 本機：空資料庫先跑 tests/database/support/storage-standin.sql（Storage 的最小替身），
--     步驟寫在該檔開頭；
--   - production 乾跑（HW-112B，需擁有者核准）：begin; ＋ 016 的內容 ＋ 本檔從第一個 do $$
--     到最後的 rollback; 之前 ＋ rollback;（真的 Storage schema，所有寫入都被 rollback）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/hw112.test.sql
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 合成的兩個帳號只存在於 request.jwt.claims（不建立 auth.users），測試的檔案只是
-- storage.objects 的資料列（沒有真的檔案），都會被 rollback。
-- 以 set local role authenticated／anon 加上 request.jwt.claims 模擬 Storage API：它也是以
-- 呼叫者的角色存取 storage.objects，由 RLS 決定能做什麼；DELETE 另外要
-- storage.allow_delete_query = 'true'（Storage API 會設定，storage.protect_delete）。
-- 檔案大小與 MIME 類型由 Storage API 檢查，不在資料庫裡：HW-112B 套用後以測試帳號實測。

begin;

-- 0. ASSERT 必須開啟，否則失敗時不會中止，整份測試會靜默通過
do $$
begin
  if not current_setting('plpgsql.check_asserts')::boolean then
    raise exception 'plpgsql.check_asserts is off; this test would pass silently';
  end if;
end $$;

-- 1. bucket：私有、200 KB、只收 JPEG
do $$
declare
  b record;
begin
  select * into b from storage.buckets where id = 'proofs';
  assert found, 'bucket proofs must exist';
  assert b.name = 'proofs', 'bucket proofs must be named proofs';
  assert b.public = false, 'bucket proofs must be private';
  assert b.file_size_limit = 204800, 'bucket proofs must limit files to 200 KB';
  assert b.allowed_mime_types = array['image/jpeg'], 'bucket proofs must accept only image/jpeg';
end $$;

-- 2. policy：RLS 開著；四個 proofs_* 都只給 authenticated、各用對的子句；
--    其他 policy 都限定在別的 bucket（permissive policy 是 OR 起來的）
do $$
declare
  r record;
  body text;
begin
  assert (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
    'RLS must be enabled on storage.objects';

  assert (select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects' and policyname like 'proofs\_%') = 4,
    'there must be exactly four proofs_* policies';

  for r in
    select policyname, cmd, roles, permissive, qual, with_check from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'proofs\_%'
  loop
    assert r.roles = array['authenticated']::name[], format('%s must apply to authenticated only', r.policyname);
    assert r.permissive = 'PERMISSIVE', format('%s must be permissive', r.policyname);
    body := coalesce(r.qual, '') || ' ' || coalesce(r.with_check, '');
    assert body like '%bucket_id = ''proofs''%', format('%s must be limited to bucket proofs', r.policyname);
    assert body like '%foldername(name)%', format('%s must check the first folder of the object name', r.policyname);
    assert body like '%auth.uid()%', format('%s must compare with auth.uid()', r.policyname);
    case r.policyname
      when 'proofs_select' then
        assert r.cmd = 'SELECT' and r.qual is not null and r.with_check is null, 'proofs_select: SELECT with USING only';
      when 'proofs_insert' then
        assert r.cmd = 'INSERT' and r.qual is null and r.with_check is not null, 'proofs_insert: INSERT with WITH CHECK only';
      when 'proofs_update' then
        assert r.cmd = 'UPDATE' and r.qual is not null and r.with_check is not null, 'proofs_update: UPDATE with USING and WITH CHECK';
      when 'proofs_delete' then
        assert r.cmd = 'DELETE' and r.qual is not null and r.with_check is null, 'proofs_delete: DELETE with USING only';
      else
        raise exception 'unexpected policy %', r.policyname;
    end case;
  end loop;

  for r in
    select policyname, concat_ws(' ', qual, with_check) as body from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname not like 'proofs\_%'
  loop
    assert r.body ~ '^\(*bucket_id = ''[a-z0-9_-]+''::text',
      format('policy %s must start by limiting itself to one bucket', r.policyname);
    assert r.body not like '%''proofs''%', format('policy %s must not mention bucket proofs', r.policyname);
  end loop;
end $$;

-- 3. 上傳：只能放進自己的資料夾，名稱必須是 {user_id}/{小寫 UUID}.jpg
do $$
declare
  a text := '00000000-0000-4000-8000-00000000a112';
  b text := '00000000-0000-4000-8000-00000000b112';
  s text := 'aaaaaaaa-1111-4111-8111-111111111111';
  bad text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into storage.objects (bucket_id, name) values ('proofs', a || '/' || s || '.jpg');

  foreach bad in array array[
    b || '/' || s || '.jpg',                 -- 別人的資料夾
    a || '/' || upper(s) || '.jpg',          -- 大寫（client 的 UUID 是小寫）
    a || '/' || s || '.png',                 -- 別的副檔名
    a || '/' || s || '.jpg.png',
    a || '/sub/' || s || '.jpg',             -- 子資料夾
    a || '/not-a-session-id.jpg',            -- 不是 UUID
    s || '.jpg',                             -- 沒有資料夾
    a || 'x/' || s || '.jpg'                 -- 資料夾只有前綴相同
  ] loop
    begin
      insert into storage.objects (bucket_id, name) values ('proofs', bad);
      raise exception 'upload of % must be refused', bad;
    exception when insufficient_privilege then
      null;   -- new row violates row-level security policy
    end;
  end loop;

  execute 'reset role';
end $$;

-- 4. 讀取：本人看得到自己的；另一個帳號與 anon 都看不到
do $$
declare
  a text := '00000000-0000-4000-8000-00000000a112';
  b text := '00000000-0000-4000-8000-00000000b112';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = 'proofs' and name like a || '/%';
  assert n = 1, format('the owner must see their proof (saw %s)', n);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = 'proofs' and name like a || '/%';
  assert n = 0, format('another account must not see the proof (saw %s)', n);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from storage.objects where bucket_id = 'proofs';
  assert n = 0, format('anon must not see any proof (saw %s)', n);
  begin
    insert into storage.objects (bucket_id, name)
      values ('proofs', a || '/bbbbbbbb-2222-4222-8222-222222222222.jpg');
    raise exception 'anon upload must be refused';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;

-- 5. 修改：別人改不到；本人不能把檔案搬到別人的資料夾或不合規則的名稱；本人可以改自己的
do $$
declare
  a text := '00000000-0000-4000-8000-00000000a112';
  b text := '00000000-0000-4000-8000-00000000b112';
  s text := 'aaaaaaaa-1111-4111-8111-111111111111';
  s2 text := 'cccccccc-3333-4333-8333-333333333333';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update storage.objects set name = b || '/' || s || '.jpg'
    where bucket_id = 'proofs' and name = a || '/' || s || '.jpg';
  get diagnostics n = row_count;
  assert n = 0, 'another account must not be able to update the proof';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update storage.objects set name = b || '/' || s || '.jpg'
      where bucket_id = 'proofs' and name = a || '/' || s || '.jpg';
    raise exception 'moving a proof into another folder must be refused';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update storage.objects set name = a || '/' || s || '.png'
      where bucket_id = 'proofs' and name = a || '/' || s || '.jpg';
    raise exception 'renaming a proof to a non-matching name must be refused';
  exception when insufficient_privilege then
    null;
  end;
  update storage.objects set name = a || '/' || s2 || '.jpg', metadata = '{"size": 1}'
    where bucket_id = 'proofs' and name = a || '/' || s || '.jpg';
  get diagnostics n = row_count;
  assert n = 1, 'the owner must be able to update their proof';
  execute 'reset role';
end $$;

-- 6. 刪除（Storage API 會設定 storage.allow_delete_query）：別人刪不到；本人可以刪
do $$
declare
  a text := '00000000-0000-4000-8000-00000000a112';
  b text := '00000000-0000-4000-8000-00000000b112';
  s2 text := 'cccccccc-3333-4333-8333-333333333333';
  n int;
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from storage.objects where bucket_id = 'proofs' and name = a || '/' || s2 || '.jpg';
  get diagnostics n = row_count;
  assert n = 0, 'another account must not be able to delete the proof';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  delete from storage.objects where bucket_id = 'proofs';
  get diagnostics n = row_count;
  assert n = 0, 'anon must not be able to delete any proof';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from storage.objects where bucket_id = 'proofs' and name = a || '/' || s2 || '.jpg';
  get diagnostics n = row_count;
  assert n = 1, 'the owner must be able to delete their proof';
  execute 'reset role';
end $$;

rollback;
