-- ============================================================
-- 010_leaderboard_avatars.sql
-- 排行榜頭像：leaderboard_view 暴露公開使用者 avatar path，
-- 並允許 authenticated users 讀取公開排行榜使用者的 avatar object。
-- 執行日期：2026-04-26
-- ============================================================

-- ── 1. leaderboard_view: add avatar_url ─────────────────────
-- PostgreSQL does not allow CREATE OR REPLACE VIEW to insert a column in the
-- middle of an existing view. Keep the original leaderboard_view column order
-- and append avatar_url at the end.
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  p.user_id,
  p.name,
  p.total_xp,
  p.streak_days,
  p.mode,
  p.created_at,
  COALESCE(w.week_xp, 0) AS week_xp,
  p.avatar_url
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

GRANT SELECT ON leaderboard_view TO authenticated;

-- ── 2. Public leaderboard avatar read policy ────────────────
-- Existing avatars_select policy only allows a user to read their own folder.
-- This additive policy lets authenticated users read avatar objects for users
-- who explicitly opted into the public leaderboard.
CREATE POLICY "avatars_select_public_leaderboard_profiles" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.is_public = true
    )
  );
