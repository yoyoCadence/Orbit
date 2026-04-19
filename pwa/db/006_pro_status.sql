-- Migration 006: Pro status fields on profiles
-- Adds is_pro, pro_expires_at, trial_started_at to support SUB-01 Pro state management.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_pro            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS trial_started_at  timestamptz;

COMMENT ON COLUMN profiles.is_pro           IS 'Whether the user currently has Pro access';
COMMENT ON COLUMN profiles.pro_expires_at   IS 'NULL = lifetime Pro; set = Pro valid until this timestamp';
COMMENT ON COLUMN profiles.trial_started_at IS 'When the 15-day free trial began (NULL = never started)';
