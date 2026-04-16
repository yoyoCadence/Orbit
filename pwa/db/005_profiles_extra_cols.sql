-- ============================================================
-- 005_profiles_extra_cols.sql
-- 補上 profiles 表缺少的欄位：
--   title_template  — 稱號主題（rpg / ghost_slayer / workplace / custom）
--   custom_title    — 自訂稱號文字
--   is_public       — 是否公開於排行榜
--   new_day_hour    — 新的一天開始時間（預設 05:00）
-- 執行日期：2026-04-16
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS title_template  text    NOT NULL DEFAULT 'rpg',
  ADD COLUMN IF NOT EXISTS custom_title    text,
  ADD COLUMN IF NOT EXISTS is_public       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS new_day_hour    int     NOT NULL DEFAULT 5
    CHECK (new_day_hour BETWEEN 0 AND 23);
