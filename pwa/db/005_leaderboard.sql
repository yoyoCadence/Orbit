-- ============================================================
-- 005_leaderboard.sql
-- 排行榜：新增 is_public 欄位 + leaderboard_view
-- 執行日期：2026-04-11
-- ============================================================

-- ── 1. Add is_public to profiles ────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ── 2. leaderboard_view ─────────────────────────────────────
-- 只暴露排行榜需要的欄位，不洩漏 email 或敏感資料
-- week_xp = 最近 7 天 productiveXP 總和（滾動週）
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  p.user_id,
  p.name,
  p.total_xp,
  p.streak_days,
  p.mode,
  p.created_at,
  COALESCE(w.week_xp, 0) AS week_xp
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
WHERE p.is_public = true;

-- ── 3. RLS for leaderboard_view ─────────────────────────────
-- Views inherit table RLS by default in Supabase.
-- Grant SELECT to authenticated so users can read the leaderboard.
GRANT SELECT ON leaderboard_view TO authenticated;
