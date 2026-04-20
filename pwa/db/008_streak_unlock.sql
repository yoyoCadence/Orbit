-- 008_streak_unlock.sql
-- SUB-16: Add streak_unlock_used flag to profiles
-- Tracks whether the user has already received the 60-day streak → 30-day free Pro reward.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS streak_unlock_used BOOLEAN NOT NULL DEFAULT FALSE;
