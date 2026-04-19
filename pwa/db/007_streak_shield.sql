-- 007_streak_shield.sql
-- SUB-09: Add streak shield fields to profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS streak_shield_count      SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS streak_shield_reset_month CHAR(7)  NOT NULL DEFAULT '';
