-- ============================================================
-- 001_schema.sql
-- 建立四張核心資料表
-- 執行日期：2026-04-09
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (char_length(name) <= 30),
  avatar_url           text,
  total_xp             int NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  streak_days          int NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_streak_date     date,
  last_weekly_bonus_date date,
  morning_state        text NOT NULL DEFAULT 'normal'
                       CHECK (morning_state IN ('good', 'normal', 'tired')),
  mode                 text NOT NULL DEFAULT 'normal'
                       CHECK (mode IN ('normal', 'advanced')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── tasks ───────────────────────────────────────────────────
CREATE TABLE tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (char_length(name) <= 30),
  category              text NOT NULL CHECK (category IN ('instant', 'focus')),
  impact_type           text NOT NULL CHECK (impact_type IN ('task', 'recovery', 'entertainment')),
  task_nature           text NOT NULL CHECK (task_nature IN ('growth', 'maintenance', 'obligation', 'recovery', 'entertainment')),
  value                 text NOT NULL CHECK (value IN ('S', 'A', 'B', 'D')),
  difficulty            numeric NOT NULL CHECK (difficulty IN (0.4, 0.7, 1.0)),
  resistance            numeric NOT NULL CHECK (resistance IN (1.0, 1.2, 1.4)),
  emoji                 text,
  daily_xp_cap          int NOT NULL DEFAULT 100 CHECK (daily_xp_cap >= 0),
  cooldown_minutes      int NOT NULL DEFAULT 0 CHECK (cooldown_minutes >= 0),
  min_effective_minutes int NOT NULL DEFAULT 0 CHECK (min_effective_minutes >= 0),
  is_default            boolean NOT NULL DEFAULT false,
  reason                text,
  success_criteria      text,
  value_confidence      int NOT NULL DEFAULT 100 CHECK (value_confidence BETWEEN 0 AND 100),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_id_idx ON tasks(user_id);

-- ── sessions ────────────────────────────────────────────────
CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  task_id          uuid REFERENCES tasks(id) ON DELETE SET NULL,
  task_name        text NOT NULL,
  task_emoji       text,
  date             date NOT NULL,
  started_at       timestamptz NOT NULL,
  completed_at     timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  result           text NOT NULL CHECK (result IN ('instant', 'complete', 'partial', 'invalid')),
  base_xp          int NOT NULL DEFAULT 0 CHECK (base_xp >= 0),
  final_xp         int NOT NULL DEFAULT 0 CHECK (final_xp >= 0),
  energy_cost      int NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
  energy_gain      int NOT NULL DEFAULT 0 CHECK (energy_gain >= 0),
  impact_type      text NOT NULL CHECK (impact_type IN ('task', 'recovery', 'entertainment')),
  task_nature      text NOT NULL CHECK (task_nature IN ('growth', 'maintenance', 'obligation', 'recovery', 'entertainment')),
  value            text NOT NULL CHECK (value IN ('S', 'A', 'B', 'D')),
  resistance       numeric NOT NULL CHECK (resistance IN (1.0, 1.2, 1.4)),
  is_productive_xp boolean NOT NULL DEFAULT false
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_date_idx    ON sessions(user_id, date);

-- ── energy ──────────────────────────────────────────────────
CREATE TABLE energy (
  user_id         uuid PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  current_energy  int NOT NULL DEFAULT 100 CHECK (current_energy BETWEEN 0 AND 100),
  max_energy      int NOT NULL DEFAULT 100 CHECK (max_energy BETWEEN 0 AND 100),
  last_reset_date date
);
