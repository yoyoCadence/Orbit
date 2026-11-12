-- HW-112A：本機演練用的 Supabase（auth＋Storage）最小替身。只在本機的空資料庫執行，
-- 不要在 Supabase（本機或 production）執行。
--
-- 這個雲端環境拉不到 Supabase 的 Docker image（registry 被網路政策擋下），所以
-- `supabase start` 不能用。Storage 的 tenant migrations（production 為 0079
-- lifecycle-writer-coordination，2026-11-11 以只讀查詢確認）中，016 的 policy 與
-- tests/database/hw112.test.sql 用到的部分照抄在下面：
--   - storage.buckets／storage.objects 中 policy 與測試會讀寫的欄位；
--   - 兩張表都開 RLS（0002、0007）；
--   - storage.foldername()（0060 的版本）；
--   - storage.protect_delete()：沒有 storage.allow_delete_query = 'true' 就擋下 DELETE（0055）；
--   - anon／authenticated／service_role 的權限（0002、0046；0073 收回 TRUNCATE、REFERENCES、TRIGGER）。
-- 沒有照抄、不影響 policy 判斷的部分：buckets 的 type、versioning_status、lifecycle 欄位，
-- objects 的 archived_at、is_delete_marker、is_versioned；名稱長度、updated_at、版本與 lifecycle
-- 的 trigger（0011、0037、0068、0074、0079）；(bucket_id, name) 在 0079 是三個部分索引
-- （0065–0067），這裡用一個唯一索引代替。這些差異由 HW-112B 在 production 以同一份測試乾跑補上。
-- 另外加上 production 的頭像 policy：003 由測試步驟直接套用 pwa/db/003_storage.sql；010 的
-- 公開排行榜頭像 policy 依 production 的定義照抄在下面，連同它的子查詢會受影響的
-- profiles RLS（002：只看得到自己那一列）。
-- 檔案大小與 MIME 類型由 Storage API 檢查，不在資料庫裡，本機測不到；HW-112B 套用後以測試帳號實測。
--
-- 用法（本機的空資料庫，例如 createdb hw112）：
--   psql -v ON_ERROR_STOP=1 -d hw112 -f tests/database/support/storage-standin.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f pwa/db/003_storage.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f pwa/db/016_proof_storage.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f tests/database/hw112.test.sql
--   BUG-119：替身 → 003 → pwa/db/017_avatar_public_policy_fix.sql → tests/database/bug119.test.sql

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    raise exception 'storage schema already exists: this stand-in is only for an empty local database';
  end if;
end $$;

-- ── roles（Supabase 的基本角色）────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ── auth：auth.uid() 讀 request.jwt.claims 的 sub（同 Supabase）──
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ── storage ──────────────────────────────────────────────────────
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
create unique index bname on storage.buckets (name);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
create unique index bucketid_objname on storage.objects (bucket_id, name);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
revoke truncate, references, trigger on storage.buckets, storage.objects from anon, authenticated, service_role;

-- 0060 的 storage.foldername()：除了最後一段以外的路徑。
create function storage.foldername(name text) returns text[]
  language plpgsql immutable as $function$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$function$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- 0055：只有 Storage API（設定 storage.allow_delete_query）可以 DELETE。
create function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;
create trigger protect_buckets_delete before delete on storage.buckets
  for each statement execute function storage.protect_delete();
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();

-- ── 010 的公開排行榜頭像 policy（production 的定義）──────────────
-- profiles 的 RLS 同 002：本人只看得到、只改得到自己那一列。010 的子查詢在呼叫者的
-- 權限下執行，所以也只看得到自己那一列；名稱的 30 字上限同 001（BUG-119 的影響範圍
-- 取決於這兩點）。
create table public.profiles (
  user_id uuid primary key,
  name text not null check (char_length(name) <= 30),   -- 001：名稱最多 30 字
  is_public boolean default false,
  avatar_url text
);
grant select, insert, update, delete on public.profiles to authenticated;
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "profiles_update" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles_delete" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

create policy "avatars_select_public_leaderboard_profiles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
      from profiles p
      where p.user_id::text = (storage.foldername(name))[1]
        and p.is_public = true
    )
  );

-- ── auth.users 與建立 profile 的 trigger（BUG-119 的測試以它建立合成帳號）──
-- production 由 004／013 的 handle_new_user() 在 auth.users INSERT 後建立 profile；
-- 這裡只建立測試會用到的欄位與行為。
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.standin_handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 30));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function auth.standin_handle_new_user();
