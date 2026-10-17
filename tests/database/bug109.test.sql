-- BUG-109：signup trigger 對超過 30 字元的名稱來源不再讓註冊失敗。
--
-- 前置：已套用 001_schema.sql、004_triggers.sql 與 013_signup_profile_name.sql，
-- 且存在 auth.users（Supabase 本機／preview 專案皆有）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/bug109.test.sql
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。

begin;

-- 1. 31～64 字元的 email local-part 可以註冊，profile 名稱截為前 30 字元
do $$
declare
  v_id   uuid := gen_random_uuid();
  v_local text := repeat('a', 64);
  v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, v_local || '@example.com', '{}'::jsonb);

  select name into v_name from public.profiles where user_id = v_id;
  assert v_name = repeat('a', 30), format('long local-part should truncate to 30, got %L', v_name);
  assert exists (select 1 from public.energy where user_id = v_id), 'energy row is still created';
end $$;

-- 2. 剛好 31 字元（原本第一個會失敗的長度）
do $$
declare
  v_id uuid := gen_random_uuid();
  v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, repeat('b', 31) || '@example.com', '{}'::jsonb);

  select name into v_name from public.profiles where user_id = v_id;
  assert char_length(v_name) = 30, format('31-char local-part should become 30 chars, got %s', char_length(v_name));
end $$;

-- 3. OAuth metadata 名稱超過 30 字元（Google 顯示名稱）也截斷，且優先於 email
do $$
declare
  v_id uuid := gen_random_uuid();
  v_meta text := 'Alexandria Ocasio-Cortez Montgomery-Smith';
  v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'short@example.com', jsonb_build_object('name', v_meta));

  select name into v_name from public.profiles where user_id = v_id;
  assert v_name = left(v_meta, 30), format('long metadata name should truncate, got %L', v_name);
end $$;

-- 4. 多位元組名稱以字元截斷，符合 char_length 限制
do $$
declare
  v_id uuid := gen_random_uuid();
  v_meta text := repeat('成長', 20);   -- 40 個字元
  v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'cjk@example.com', jsonb_build_object('name', v_meta));

  select name into v_name from public.profiles where user_id = v_id;
  assert char_length(v_name) = 30 and v_name = left(v_meta, 30),
    format('multibyte name should keep 30 whole characters, got %L', v_name);
end $$;

-- 5. 30 字元以內的既有行為不變
do $$
declare
  v_id uuid := gen_random_uuid();
  v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'yoyo@example.com', '{}'::jsonb);

  select name into v_name from public.profiles where user_id = v_id;
  assert v_name = 'yoyo', format('short local-part must be unchanged, got %L', v_name);
end $$;

-- 6. constraint 沒有被放寬
do $$
begin
  assert exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length(name) <= 30%'
  ), 'profiles name length constraint must remain';
end $$;

rollback;
