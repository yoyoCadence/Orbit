-- INFRA-110：leaderboard_view 只給已登入的使用者讀（015）。
--
-- 前置：已套用 005、010 與 015（Supabase 本機、preview 與 production 乾跑皆可）。
-- 執行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/infra110.test.sql
-- 乾跑：begin; ＋ 015 的內容 ＋ 本檔從 do $$ 開始的部分 ＋ rollback;（SQL Editor 也可以）
-- 全部在單一 transaction 內，結尾 rollback，不留下任何變更。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。

begin;

-- 0. ASSERT 必須開啟，否則失敗時不會中止，整份測試會靜默通過
do $$
begin
  if not current_setting('plpgsql.check_asserts')::boolean then
    raise exception 'plpgsql.check_asserts is off; this test would pass silently';
  end if;
end $$;

-- 1. 權限：authenticated 只能讀；anon 與 PUBLIC 什麼都不能做
do $$
declare
  privilege text;
begin
  assert has_table_privilege('authenticated', 'public.leaderboard_view', 'SELECT'),
    'authenticated must be able to read leaderboard_view';
  foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    assert not has_table_privilege('anon', 'public.leaderboard_view', privilege),
      format('anon must not have %s on leaderboard_view', privilege);
    if privilege <> 'SELECT' then
      assert not has_table_privilege('authenticated', 'public.leaderboard_view', privilege),
        format('authenticated must not have %s on leaderboard_view', privilege);
    end if;
  end loop;
  assert not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'leaderboard_view'
       and grantee in ('PUBLIC', 'anon')
  ), 'leaderboard_view must have no grant to PUBLIC or anon';
end $$;

-- 2. 行為：以 anon 讀取被拒，以 authenticated 讀取成功
set local role anon;
do $$
begin
  begin
    perform 1 from public.leaderboard_view limit 1;
    raise exception 'anon could read leaderboard_view';
  exception when insufficient_privilege then
    null; -- expected: permission denied
  end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  perform count(*) from public.leaderboard_view;
end $$;
reset role;

-- 3. view 本身不變：欄位與順序與 010 相同（client 依賴這些欄位）
do $$
begin
  assert (
    select array_agg(column_name::text order by ordinal_position)
      from information_schema.columns
     where table_schema = 'public' and table_name = 'leaderboard_view'
  ) = array['user_id', 'name', 'total_xp', 'streak_days', 'mode', 'created_at', 'week_xp', 'avatar_url'],
    'leaderboard_view columns must stay as defined by 010';
end $$;

rollback;
