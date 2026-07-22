-- ============================================================
-- 011_leaderboard_pro.sql
-- SUB-14 排行榜 Pro 強化：
--   (1) profiles 新增 display_name（全站自訂顯示名稱，Pro 專屬）
--   (2) leaderboard_view 追加 is_pro_active 與（Pro 生效才暴露的）display_name
-- 安全原則：不新增任何寬鬆 policy；display_name 由既有 profiles RLS 保護，
--          排行榜只在「公開且 Pro 生效」時暴露自訂名稱。
-- 執行日期：PENDING REVIEW（尚未於 Supabase 執行）
-- ============================================================

-- ── 1. profiles.display_name ────────────────────────────────
-- 全站自訂顯示名稱。長度上限 20 作為伺服器端防濫用底線；client 另會 trim +
-- 於渲染時 escape。NULL / 空字串 = 未設定，一律回退至 profiles.name。
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(display_name) <= 20);

COMMENT ON COLUMN profiles.display_name IS
  'SUB-14 Pro 自訂顯示名稱（全站）；NULL/空 = 回退 name。僅在 Pro 生效時對外顯示。';

-- ── 2. leaderboard_view ─────────────────────────────────────
-- 沿用原有欄位順序，於尾端追加 is_pro_active 與 display_name（CREATE OR REPLACE
-- VIEW 不允許在既有欄位中間插入欄位）。is_pro_active 於伺服器端精確複製 client 的
-- isProUser()：付費（未過期或永久）或 15 天試用期內。display_name 只在 Pro 生效
-- 時暴露；Pro 失效後自動回退，非 Pro 使用者一律 NULL（不外洩）。
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  base.user_id,
  base.name,
  base.total_xp,
  base.streak_days,
  base.mode,
  base.created_at,
  base.week_xp,
  base.avatar_url,
  base.is_pro_active,
  CASE WHEN base.is_pro_active THEN NULLIF(btrim(base.display_name), '') END AS display_name
FROM (
  SELECT
    p.user_id,
    p.name,
    p.total_xp,
    p.streak_days,
    p.mode,
    p.created_at,
    COALESCE(w.week_xp, 0) AS week_xp,
    p.avatar_url,
    p.display_name,
    (
      (p.is_pro = true AND (p.pro_expires_at IS NULL OR p.pro_expires_at > now()))
      OR (p.trial_started_at IS NOT NULL AND p.trial_started_at > now() - INTERVAL '15 days')
    ) AS is_pro_active
  FROM profiles p
  LEFT JOIN (
    SELECT
      user_id,
      SUM(final_xp) AS week_xp
    FROM sessions
    WHERE date >= CURRENT_DATE - INTERVAL '6 days'
      AND is_productive_xp = true
    GROUP BY user_id
  ) w ON w.user_id = p.user_id
  WHERE p.is_public = true
) base;

-- Views 沿用底層 table RLS；重新授權 SELECT 給 authenticated（與 005/010 一致）。
GRANT SELECT ON leaderboard_view TO authenticated;

-- ── Rollback（如需回退）────────────────────────────────────
-- 1. 還原為 010 版 leaderboard_view（不含 is_pro_active / display_name）。
-- 2. ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;
--    （移除欄位前，client 需先停止讀寫 display_name。）
