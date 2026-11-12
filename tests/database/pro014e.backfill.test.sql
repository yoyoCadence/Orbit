-- PRO-014E E1：018 把既有公開使用者的 name 整理成 display_name（§9 第 2 點 B）。
--
-- 這份測試先建立合成的公開使用者，再以 \ir 套用 018，檢查補上的名稱；018 可重複執行，
-- 所以 018 已經套用過的資料庫也能跑（合成帳號的 display_name 一開始是 NULL）。
-- 前置：已套用 001～016（018 可有可無）。本機：tests/database/support/supabase-standin.sql →
--   pwa/db 的 001～017（或到 018）依序套用。
-- 執行（\ir 以本檔的位置找 018）：
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/pro014e.backfill.test.sql
-- production 乾跑（需擁有者核准）：本檔整份照用（保留開頭的 begin; 與結尾的 rollback;），只把兩行
--   \ir 換成 018 的內容，並在 begin; 後面加 set local lock_timeout = '5s';。與 pro014e.test.sql 的
--   乾跑分開，各自一個 transaction。
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

-- 1. 案例：name、是否公開、預期的 display_name（NULL＝不補）
create temp table pro014e_bf (n int primary key, name text, is_public boolean, expected text) on commit drop;

insert into pro014e_bf values
  (1,  'Joey Chen', true, 'Joey Chen'),
  (2,  'abcdefghijklmnopqrstuvwxyz1234', true, 'abcdefghijklmnopqrst'),        -- 30 字 → 前 20 字
  (3,  '  padded  ', true, 'padded'),                                         -- 前後空白
  (4,  'a' || chr(12288) || 'b', true, 'a b'),                                -- 全形空白 → 半形
  (5,  chr(8203) || chr(8203), true, null),                                   -- 只有零寬字元 → 不補
  (6,  'abcdefghijklmnopqrs tuv', true, 'abcdefghijklmnopqrs'),               -- 第 20 字是空白 → 去掉
  (7,  'Private Name', false, null),                                          -- 不公開 → 不補
  (8,  chr(29579) || chr(23567) || chr(26126) || chr(8238) || 'x', true,
       chr(29579) || chr(23567) || chr(26126) || 'x'),                        -- 方向控制字元拿掉
  (9,  'a' || chr(9) || 'b', true, 'a b'),                                    -- tab → 半形空白
  (10, '   ', true, null),                                                    -- 只有空白 → 不補
  (11, chr(65279) || 'Bom' || chr(160) || 'Name', true, 'Bom Name'),          -- BOM 拿掉、不換行空白 → 半形
  (12, repeat(chr(128578), 25), true, repeat(chr(128578), 20)),               -- 25 個 emoji → 前 20 個
  (13, '  abcdefghijklmnopqrstu', true, 'abcdefghijklmnopqrst'),              -- 先去掉開頭空白才取 20 字
  (14, chr(65039) || ' Joey', true, 'Joey'),                                  -- 開頭的 VS16 與空白
  (15, 'Joey ' || chr(65039), true, 'Joey'),                                  -- 結尾的空白與 VS16
  (16, chr(65039), true, null),                                               -- 只有 variation selector
  (17, chr(917505) || chr(917536), true, null),                               -- 只有 tag
  (18, 'abcdefghijklmnopqrs ' || chr(65039), true, 'abcdefghijklmnopqrs'),    -- 結尾的空白藏在 VS16 前面
  (19, chr(10084) || chr(65039) || ' fan', true, chr(10084) || chr(65039) || ' fan');  -- 中間的 VS16 保留

-- 018 列出的每一段不允許的字元：兩端各放一個，空白類換成半形空白，其他拿掉
-- （這裡的兩份清單是規格，與 018 分開寫；018 的兩份清單若少了一段，這裡就會失敗）
do $$
declare
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
  spacelike int4range[] := array[
    int4range(9, 13, '[]')  /* U+0009–U+000D */,
    int4range(133, 133, '[]')  /* U+0085 */,
    int4range(160, 160, '[]')  /* U+00A0 */,
    int4range(5760, 5760, '[]')  /* U+1680 */,
    int4range(8192, 8202, '[]')  /* U+2000–U+200A */,
    int4range(8239, 8239, '[]')  /* U+202F */,
    int4range(8287, 8287, '[]')  /* U+205F */,
    int4range(12288, 12288, '[]')  /* U+3000 */
  ];
  r int4range;
  n int := 20;
  lo int;
  hi int;
  lo_out text;
  hi_out text;
begin
  foreach r in array forbidden loop
    lo := lower(r);
    hi := upper(r) - 1;
    lo_out := case when exists (select 1 from unnest(spacelike) s where s @> lo) then ' ' else '' end;
    hi_out := case when exists (select 1 from unnest(spacelike) s where s @> hi) then ' ' else '' end;
    insert into pro014e_bf values
      (n, 'r' || chr(lo) || 's' || chr(hi) || 't', true, 'r' || lo_out || 's' || hi_out || 't');
    n := n + 1;
  end loop;
  -- 空白類每一段的兩端都換成半形空白（不是拿掉）
  foreach r in array spacelike loop
    foreach lo in array array[lower(r), upper(r) - 1] loop
      insert into pro014e_bf values (n, 'x' || chr(lo) || 'y', true, 'x y');
      n := n + 1;
    end loop;
  end loop;
end $$;

-- 2. fixture：每個案例一個合成帳號（trigger 建立 profile）
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-00000e014b' || lpad(c.n::text, 2, '0'))::uuid,
       'pro014e-backfill-' || c.n || '@example.invalid', '{}'::jsonb
from pro014e_bf c;

update public.profiles p set name = c.name, is_public = c.is_public
from pro014e_bf c
where p.user_id = ('00000000-0000-4000-8000-00000e014b' || lpad(c.n::text, 2, '0'))::uuid;

-- 3. 套用 018（已套用過的資料庫，display_name 欄位已存在，合成帳號仍是 NULL）
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name') then
    update public.profiles set display_name = null
    where user_id::text like '00000000-0000-4000-8000-00000e014b__';
  end if;
end $$;

\ir ../../pwa/db/018_leaderboard_display_name.sql

-- 4. 補上的名稱
do $$
declare
  c record;
  got text;
begin
  for c in select * from pro014e_bf order by n loop
    select display_name into got from public.profiles
    where user_id = ('00000000-0000-4000-8000-00000e014b' || lpad(c.n::text, 2, '0'))::uuid;
    assert got is not distinct from c.expected,
      format('case %s (%s): expected %s, got %s', c.n, quote_literal(c.name),
             quote_nullable(c.expected), quote_nullable(got));
  end loop;
end $$;

-- 5. 再套用一次：只補 NULL，不覆蓋已有的公開名稱（本人改過的、或第一次補上的）
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
