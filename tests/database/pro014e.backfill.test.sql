-- PRO-014E E1：018 把既有公開使用者的 name 整理成 display_name（§9 第 2 點 B）。
--
-- 這份測試先建立合成的公開使用者，再以 \ir 套用 018，檢查補上的名稱；018 可重複執行，
-- 所以 018 已經套用過的資料庫也能跑（合成帳號的 display_name 一開始是 NULL）。
-- 前置：已套用 001～016（018 可有可無）。本機：tests/database/support/supabase-standin.sql →
--   pwa/db 的 001～016（或到 018）依序套用。
-- 執行（要在 repo 根目錄或任何地方都可以，\ir 以本檔的位置找 018）：
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro014e.backfill.test.sql
-- production 乾跑（需擁有者核准）：本檔的內容，把兩行 \ir 換成 018 的內容，開頭加
--   set local lock_timeout = '5s';（放在 begin; 後面）。
-- 全部在單一 transaction 內，結尾 rollback，不留下任何資料。**一定要保留開頭的 begin;**。
-- 任一 ASSERT 失敗即中止並回報（純 SQL，不依賴 pgTAP）。成功的樣子是沒有錯誤。
-- 特殊字元一律以 chr() 寫出，檔案裡沒有看不見的字元。

begin;

-- 0. ASSERT 必須開啟，否則失敗時不會中止，整份測試會靜默通過
do $$
begin
  if not current_setting('plpgsql.check_asserts')::boolean then
    raise exception 'plpgsql.check_asserts is off; this test would pass silently';
  end if;
end $$;

-- 1. fixture：十二個帳號（trigger 建立 profile），name 各種情況
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-00000e014b' || lpad(g::text, 2, '0'))::uuid,
       'pro014e-backfill-' || g || '@example.invalid', '{}'::jsonb
from generate_series(1, 12) g;

update public.profiles p set name = c.name, is_public = c.is_public
from (values
  (1,  'Joey Chen', true),
  (2,  'abcdefghijklmnopqrstuvwxyz1234', true),                         -- 30 字 → 前 20 字
  (3,  '  padded  ', true),                                             -- 前後空白
  (4,  'a' || chr(12288) || 'b', true),                                 -- 全形空白 → 半形
  (5,  chr(8203) || chr(8203), true),                                   -- 只有零寬字元 → 不補
  (6,  'abcdefghijklmnopqrs tuv', true),                                -- 第 20 字是空白 → 去掉
  (7,  'Private Name', false),                                          -- 不公開 → 不補
  (8,  chr(29579) || chr(23567) || chr(26126) || chr(8238) || 'x', true), -- 方向控制字元拿掉
  (9,  'a' || chr(9) || 'b', true),                                     -- tab → 半形空白
  (10, '   ', true),                                                    -- 只有空白 → 不補
  (11, chr(65279) || 'Bom' || chr(160) || 'Name', true),                -- BOM 拿掉、不換行空白 → 半形
  (12, repeat(chr(128578), 25), true)                                   -- 25 個 emoji → 前 20 個
) as c(n, name, is_public)
where p.user_id = ('00000000-0000-4000-8000-00000e014b' || lpad(c.n::text, 2, '0'))::uuid;

-- 2. 套用 018（已套用過的資料庫，display_name 欄位已存在，合成帳號仍是 NULL）
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name') then
    update public.profiles set display_name = null
    where user_id::text like '00000000-0000-4000-8000-00000e014b__';
  end if;
end $$;

\ir ../../pwa/db/018_leaderboard_display_name.sql

-- 3. 補上的名稱
do $$
declare
  expected text[] := array[
    'Joey Chen',
    'abcdefghijklmnopqrst',
    'padded',
    'a b',
    null,
    'abcdefghijklmnopqrs',
    null,
    chr(29579) || chr(23567) || chr(26126) || 'x',
    'a b',
    null,
    'Bom Name',
    repeat(chr(128578), 20)
  ];
  got text;
begin
  for g in 1..12 loop
    select display_name into got from public.profiles
    where user_id = ('00000000-0000-4000-8000-00000e014b' || lpad(g::text, 2, '0'))::uuid;
    assert got is not distinct from expected[g],
      format('case %s: expected %s, got %s', g, quote_nullable(expected[g]), quote_nullable(got));
  end loop;
end $$;

-- 4. 再套用一次：只補 NULL，不覆蓋已有的公開名稱（本人改過的、或第一次補上的）
update public.profiles set display_name = 'custom name'
where user_id = '00000000-0000-4000-8000-00000e014b01';

\ir ../../pwa/db/018_leaderboard_display_name.sql

do $$
begin
  assert (select display_name from public.profiles where user_id = '00000000-0000-4000-8000-00000e014b01') = 'custom name',
    're-running 018 must not overwrite an existing public name';
  assert (select display_name from public.profiles where user_id = '00000000-0000-4000-8000-00000e014b02') = 'abcdefghijklmnopqrst',
    're-running 018 must keep the names it filled';
  assert (select display_name from public.profiles where user_id = '00000000-0000-4000-8000-00000e014b07') is null,
    're-running 018 must not fill a private user''s public name';
end $$;

rollback;
