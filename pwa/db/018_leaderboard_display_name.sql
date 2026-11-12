-- ============================================================
-- 018_leaderboard_display_name.sql
-- PRO-014E E1：排行榜的公開名稱（profiles.display_name）與安全讀取（get_leaderboard()）。
-- 提案：docs/pro-014e-leaderboard-read-model-proposal.md（擁有者 2026-11-11 核准：§9 照建議，
--   第 2 點改為 B——既有公開使用者的 name 複製成 display_name，繼續出現在排行榜）。
--
-- 問題：排行榜顯示 profiles.name，而 name 是註冊時自動帶入的 email @ 前段或 Google 的全名
--   （004／013 的 handle_new_user()）。leaderboard_view 還回傳每個公開使用者的 user_id 與
--   完整的加入時間；view 以擁有者的權限執行，之後有人加欄位就會直接公開。
--
-- 本檔：
--   1. profiles.display_name：使用者自己選的公開名稱（規則見下方 CHECK）。RLS 不變，沿用
--      002 的四個 owner-only policy，只有本人能寫自己的公開名稱。
--   2. 既有公開使用者（§9 第 2 點 B）：把 name 整理成符合規則的 display_name（只補 NULL）。
--   3. get_leaderboard()：SECURITY DEFINER RPC，只回傳排行榜要的九個欄位；is_me 取代
--      user_id；is_pro 由 server 判定（pro_entitlements，含試用，§9 第 5 點）。
--   4. leaderboard_view（§9 第 4 點 A）：name 欄位改為 COALESCE(display_name, '匿名')，
--      E3 移除 view 之前，舊版 client 也不再看到 email 前段或真名。CREATE OR REPLACE VIEW
--      保留 015 的權限，其他欄位與 010 完全相同。
--   client（E2）之後才改用 RPC 與公開名稱，本檔不改 client。
--
-- 可重複執行：欄位與 constraint 先檢查、函式與 view 用 CREATE OR REPLACE、補名稱只補 NULL。
--
-- 測試（單一 transaction，結尾 rollback）：
--   - tests/database/pro014e.test.sql：結構、權限、RPC 的欄位與資料列、名稱規則；
--   - tests/database/pro014e.backfill.test.sql：先建立合成的公開使用者，再以 \ir 套用本檔，
--     檢查補上的名稱（本檔可重複執行，所以已套用過的資料庫也能跑）。
--   本機：tests/database/support/supabase-standin.sql → pwa/db 的 001～018 依序 → 兩份測試。
--   production（EA，擁有者核准每一步）：begin; set local lock_timeout = '5s'; ＋ 本檔 ＋
--   兩份測試的內容（backfill 測試的 \ir 換成本檔）＋ rollback; 乾跑，再套用。
--   ALTER TABLE profiles 與 CREATE OR REPLACE VIEW 會鎖住 profiles／leaderboard_view 直到 commit。
-- 套用前檢查（只讀）：
--   - leaderboard_view 的定義與 010 相同：SELECT pg_get_viewdef('public.leaderboard_view'::regclass);
--   - public.get_leaderboard 還不存在、profiles 還沒有 display_name；
--   - 公開使用者的數量，與 name 整理後會變成 NULL（從新排行榜消失）的數量。
-- 套用後檢查：display_name 有值的公開使用者數量、get_leaderboard() 的權限
--   （anon 與 PUBLIC 不能執行）、leaderboard_view 的權限與 015 相同；以兩個測試帳號呼叫 RPC。
--
-- 回滾（執行時另行核准）：
--   1. 先把 client 退回讀 leaderboard_view 的版本（E2 之後才需要）；
--   2. DROP FUNCTION public.get_leaderboard();
--   3. 重新執行 010 的 CREATE OR REPLACE VIEW（name 改回 p.name；權限保留）；
--   4. **不刪 display_name 欄位**：E2 的 client 會寫它，欄位也存著使用者自己選的名稱。
-- ============================================================

-- ── 1. 公開名稱 ─────────────────────────────────────────────────
-- 規則（client 在 E2 以完全相同的規則先檢查）：
--   - 1–20 字；
--   - 不含控制字元、不可見或方向控制字元，以及空白類字元中除了半形空白以外的全部
--     （不換行空白、全形空白、各種寬度的空白、零寬字元、U+202E 等方向控制、
--     Hangul／Braille 的空白字元、BOM、軟連字號）；
--   - 前後不能是半形空白。
-- 只允許半形空白當作空白，前後檢查就不必依賴 locale（PostgreSQL 的 \s 依 locale 而定）。
-- 名稱只要有一個看得到的字元，就不會是全部空白或看不見的名稱。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_display_name_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_check CHECK (
        display_name IS NULL OR (
          char_length(display_name) BETWEEN 1 AND 20
          AND display_name !~ '[\u0001-\u001f\u007f-\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufeff\uffa0\ufff0-\ufffb]'
          AND display_name !~ '^ | $'
        )
      );
  END IF;
END $$;

-- ── 2. 既有公開使用者的公開名稱（§9 第 2 點 B）──────────────────
-- name 最多 30 字、沒有 display_name 的規則，所以先整理：
--   空白類字元（tab、換行、不換行空白、全形空白等）換成半形空白 → 拿掉其他不允許的字元 → 去掉前後半形空白 → 取前 20 字 →
--   再去掉前後半形空白。整理完是空字串的不補（留 NULL，E2 會請他設定）。
-- 只補 is_public 且 display_name 為 NULL 的人；不公開的人在 E2 開啟排行榜時自己輸入。
UPDATE public.profiles p
SET display_name = c.candidate
FROM (
  SELECT
    user_id,
    btrim(left(btrim(
      regexp_replace(
        regexp_replace(name, '[\u0009-\u000d\u0085\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]', ' ', 'g'),
        '[\u0001-\u001f\u007f-\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufeff\uffa0\ufff0-\ufffb]',
        '', 'g'),
      ' '), 20), ' ') AS candidate
  FROM public.profiles
  WHERE is_public = true AND display_name IS NULL
) c
WHERE p.user_id = c.user_id
  AND c.candidate <> '';

-- ── 3. 排行榜 RPC ───────────────────────────────────────────────
-- 排行榜要讀別人的 profile 與 sessions 的加總，RLS 不允許，所以是 SECURITY DEFINER；
-- 只回傳下面九個欄位（新增欄位必須寫在這裡）。search_path 為空，名稱都加 schema。
-- is_pro_active() 在 011 對 authenticated 收回了執行權；這裡以擁有者的權限呼叫，不需要
-- 重新開放。is_pro 只是顯示用（PRO-014F），任何有價值的 Pro 功能仍由 server 自己檢查。
-- 日期一律以 UTC 計算（不受呼叫者連線的 TimeZone 影響）：本週 XP 是 UTC 的今天往前 7 天，與
-- leaderboard_view 在 Supabase 的預設（UTC）下相同；joined_on 是加入時間的 UTC 日期。
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  display_name text,
  avatar_path  text,
  total_xp     int,
  week_xp      bigint,
  streak_days  int,
  mode         text,
  joined_on    date,
  is_me        boolean,
  is_pro       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.display_name,
    p.avatar_url,
    p.total_xp,
    COALESCE(w.week_xp, 0),
    p.streak_days,
    p.mode,
    (p.created_at AT TIME ZONE 'UTC')::date,
    p.user_id = caller.user_id,
    COALESCE(public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at), false)
  FROM (SELECT auth.uid() AS user_id) AS caller
  JOIN public.profiles p
    ON caller.user_id IS NOT NULL
   AND p.is_public = true
   AND p.display_name IS NOT NULL
  LEFT JOIN (
    SELECT s.user_id, SUM(s.final_xp) AS week_xp
    FROM public.sessions s
    WHERE s.date >= (now() AT TIME ZONE 'UTC')::date - 6
      AND s.is_productive_xp = true
    GROUP BY s.user_id
  ) w ON w.user_id = p.user_id
  LEFT JOIN public.pro_entitlements e ON e.user_id = p.user_id;
$$;

-- Supabase 的預設權限讓 anon 與 PUBLIC 都能執行新函式，所以明確收回；只給 authenticated。
REVOKE ALL ON FUNCTION public.get_leaderboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;

-- ── 4. 舊的 leaderboard_view（§9 第 4 點 A）─────────────────────
-- 與 010 相同，只有 name 改成公開名稱（沒有公開名稱的人顯示「匿名」）。欄位名稱、順序與
-- 型別不變，所以可以 CREATE OR REPLACE，015 的權限保留（不要 DROP 重建，見 015 的注意）。
CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT
  p.user_id,
  COALESCE(p.display_name, '匿名') AS name,
  p.total_xp,
  p.streak_days,
  p.mode,
  p.created_at,
  COALESCE(w.week_xp, 0) AS week_xp,
  p.avatar_url
FROM public.profiles p
LEFT JOIN (
  SELECT
    user_id,
    SUM(final_xp) AS week_xp
  FROM public.sessions
  WHERE date >= CURRENT_DATE - INTERVAL '6 days'
    AND is_productive_xp = true
  GROUP BY user_id
) w ON w.user_id = p.user_id
WHERE p.is_public = true;
