-- ============================================================
-- 002_rls_policies.sql
-- 開啟 RLS 並定義所有資料表的 policy
-- 規則：只授權給 authenticated role，anon 完全無存取權
-- 執行日期：2026-04-09
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── tasks ───────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── sessions ────────────────────────────────────────────────
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select" ON sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "sessions_insert" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_delete" ON sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── energy ──────────────────────────────────────────────────
ALTER TABLE energy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "energy_select" ON energy
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "energy_insert" ON energy
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "energy_update" ON energy
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "energy_delete" ON energy
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
