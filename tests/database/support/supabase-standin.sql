-- PRO-014E：本機演練用的 Supabase 最小替身，讓 pwa/db 的 migration 能依序套用在空的
-- PostgreSQL（這個雲端環境拉不到 Supabase 的 Docker image，`supabase start` 不能用）。
-- 只在本機的空資料庫執行，不要在 Supabase（本機或 production）執行。
--
-- 內容（與 tests/database/support/storage-standin.sql 相同的部分照抄，差別是這裡不建立
-- public.profiles，由 001 建立）：
--   - anon／authenticated／service_role 三個角色；
--   - public schema 的預設權限：Supabase 讓 postgres 建立的資料表、sequence 與函式都自動
--     給這三個角色全部權限（PostgreSQL 本身另外讓 PUBLIC 執行函式）。migration 裡的
--     REVOKE／GRANT 就是針對這個預設，替身要有它，權限的測試才有意義；
--   - auth.users（004／013 的 trigger 掛在它上面；只有 migration 與測試用到的欄位）與
--     auth.uid()（讀 request.jwt.claims 的 sub，同 Supabase）；
--   - storage.buckets／storage.objects、storage.foldername()、storage.protect_delete()
--     （003、010、016 的 policy 需要；細節見 storage-standin.sql 的說明）。
--
-- 用法（本機的空資料庫）：
--   createdb pro014e
--   psql -v ON_ERROR_STOP=1 -d pro014e -f tests/database/support/supabase-standin.sql
--   for f in pwa/db/0*.sql; do psql -v ON_ERROR_STOP=1 -d pro014e -f "$f" || break; done
--   psql -v ON_ERROR_STOP=1 -d pro014e -c 'set plpgsql.check_asserts = on' -f tests/database/pro014e.test.sql
--   （tests/database 的其他測試也能在這條鏈上跑：infra110、pro014r、pro014l、bug109、bug119、hw112。）
-- （005 有兩個檔案，依檔名排序套用：005_leaderboard.sql 先、005_profiles_extra_cols.sql 後，
--   兩者都用 IF NOT EXISTS，順序不影響結果。）

\set ON_ERROR_STOP on

do $$
begin
  if exists (select 1 from pg_namespace where nspname in ('auth', 'storage')) then
    raise exception 'auth or storage schema already exists: this stand-in is only for an empty local database';
  end if;
end $$;

-- ── roles ────────────────────────────────────────────────────────
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

-- ── public schema 的預設權限（同 Supabase）──────────────────────
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ── auth ────────────────────────────────────────────────────────
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- ── storage（同 storage-standin.sql）────────────────────────────
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
