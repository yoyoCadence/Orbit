-- HW-112A：本機演練用的 Supabase（auth＋Storage）最小替身。只在本機的空資料庫執行，
-- 不要在 Supabase（本機或 production）執行。
--
-- 這個雲端環境拉不到 Supabase 的 Docker image（registry 被網路政策擋下），所以
-- `supabase start` 不能用。016 與 tests/database/hw112.test.sql 用到的只有下面這些，
-- 依 Supabase Storage 的 tenant migrations（production 為 0079
-- lifecycle-writer-coordination，2026-11-11 以只讀查詢確認）照抄：
--   - storage.buckets／storage.objects 的欄位（0002、0013、0014 等）與 (bucket_id, name) 唯一；
--   - 兩張表都開 RLS（0002、0007）；
--   - storage.foldername()（0060 的版本）；
--   - storage.protect_delete()：沒有 storage.allow_delete_query = 'true' 就擋下 DELETE（0055）；
--   - anon／authenticated／service_role 的權限（0002、0046）。
-- 再加上 production 的頭像 policy：003 由測試步驟直接套用 pwa/db/003_storage.sql；
-- 010 的公開排行榜頭像 policy 依 production 的定義照抄在下面（010 其餘是 view，與 Storage 無關）。
-- 檔案大小與 MIME 類型由 Storage API 檢查，不在資料庫裡，本機測不到；HW-112B 套用後以測試帳號實測。
--
-- 用法（本機的空資料庫，例如 createdb hw112）：
--   psql -v ON_ERROR_STOP=1 -d hw112 -f tests/database/support/storage-standin.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f pwa/db/003_storage.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f pwa/db/016_proof_storage.sql
--   psql -v ON_ERROR_STOP=1 -d hw112 -f tests/database/hw112.test.sql

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
create table public.profiles (
  user_id uuid primary key,
  name text,
  is_public boolean default false,
  avatar_url text
);
grant select on public.profiles to authenticated;

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
