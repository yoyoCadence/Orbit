-- ============================================================
-- 011_leaderboard_pro.sql  (REVISED — server-owned entitlement)
-- SUB-14 排行榜 Pro 強化。回應 PR #132 review：
--   Pro entitlement 目前可由使用者自寫（profiles_update 不限欄位），
--   因此改為 client 不可寫的 server-owned entitlement，再由排行榜讀取。
-- 安全原則：不放寬任何 policy；authenticated 不得寫 entitlement；
--   自訂名稱僅在「公開且 Pro 生效」時經 view 暴露。
-- 執行日期：PENDING REVIEW（尚未於 Supabase 執行）
-- ============================================================

-- ── 1. 單一來源的 Pro 生效規則（STABLE function）───────────────
-- view 與 client 的 my_pro_status() 都用這支，避免 SQL / JS 規則分叉。
-- Fail closed：整體 COALESCE(..., false) 保證回傳非 NULL boolean（無 entitlement
-- row 時也是 false）；trial 加 <= now() 上界，未來時間戳不得判為 Pro。
CREATE OR REPLACE FUNCTION public.is_pro_active(
  p_is_pro boolean, p_pro_expires_at timestamptz, p_trial_started_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (p_is_pro = true AND (p_pro_expires_at IS NULL OR p_pro_expires_at > now()))
    OR (p_trial_started_at IS NOT NULL
        AND p_trial_started_at <= now()
        AND p_trial_started_at > now() - INTERVAL '15 days'),
    false);
$$;
REVOKE ALL ON FUNCTION public.is_pro_active(boolean, timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_pro_active(boolean, timestamptz, timestamptz) TO authenticated;

-- ── 2. Server-owned entitlement table ───────────────────────
-- authenticated 只能「讀自己的」；沒有任何 write policy → insert/update/delete
-- 一律被 RLS 拒絕，只有 service_role（繞過 RLS）或下方 SECURITY DEFINER RPC 能寫。
CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pro           boolean     NOT NULL DEFAULT false,
  pro_expires_at   timestamptz,            -- NULL = 永久（僅在 is_pro 時有意義）
  trial_started_at timestamptz,            -- 由 start_trial() 設定，一次性
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entitlements_select" ON public.entitlements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- 刻意不建立 INSERT / UPDATE / DELETE policy → authenticated 無法自行取得 Pro。

-- 雙層防護：table privileges + RLS。service_role 兩者皆繞過。
REVOKE ALL ON public.entitlements FROM anon, authenticated;
GRANT SELECT ON public.entitlements TO authenticated;

-- 刻意「不」backfill：profiles.is_pro / pro_expires_at / trial_started_at 在本
-- migration 前可由 authenticated 自寫，照搬會把偽造的 lifetime Pro / 未來 trial
-- 洗成 server-owned entitlement，與 hardening 目的衝突。使用安全預設（無 row =
-- 非 Pro）；試用由 start_trial() 按需建立；已知合法付費 Pro 由管理員以 service_role
-- 依人工核准清單另行 seed。pre-production 既有 trial 於 cutover 後由使用者重開一次。

-- ── 3. 受控 trial：once-only，伺服器寫時間 ────────────────────
-- client 只能「開始試用」，不能傳入時間、也不能重開；付費 Pro 仍須由受信任
-- 後端 / service_role 寫入（見文件「待決定：付費 Pro 授予路徑」）。
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE started timestamptz;
BEGIN
  INSERT INTO public.entitlements AS e (user_id, trial_started_at)
    VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET trial_started_at = COALESCE(e.trial_started_at, EXCLUDED.trial_started_at),
        updated_at = now()
  RETURNING e.trial_started_at INTO started;
  RETURN started;
END;
$$;
REVOKE ALL ON FUNCTION public.start_trial() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;

-- current-user 讀自己的 server-authoritative Pro 狀態（供 client isProUser()）。
CREATE OR REPLACE FUNCTION public.my_pro_status()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at)
     FROM public.entitlements e WHERE e.user_id = auth.uid()),
    false);
$$;
REVOKE ALL ON FUNCTION public.my_pro_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_status() TO authenticated;

-- ── 4. profiles.display_name（使用者內容，可自寫；Pro 閘在 view）─
-- 長度 ≤ 20，拒絕控制字元 / 換行（emoji 允許）；client 另會 trim 並於渲染 escape。
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name text
  CHECK (
    display_name IS NULL
    OR (char_length(display_name) <= 20 AND display_name !~ '[[:cntrl:]]')
  );

COMMENT ON COLUMN profiles.display_name IS
  'SUB-14 Pro 全站自訂顯示名稱；NULL/空 = 回退 name。僅在 Pro 生效時對外顯示。';

-- ── 5. leaderboard_view：is_pro_active 讀 entitlements ───────
-- security_barrier 防止外部條件在過濾前被下推而 leak（reviewer 建議）。
-- 安全邊界＝顯式欄位清單 + WHERE is_public = true（見文件；view 為 security
-- definer，本來就不沿用底層 RLS，這正是排行榜能跨使用者彙整公開資料的原因）。
CREATE OR REPLACE VIEW leaderboard_view
WITH (security_barrier = true) AS
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
    p.user_id, p.name, p.total_xp, p.streak_days, p.mode, p.created_at,
    COALESCE(w.week_xp, 0) AS week_xp, p.avatar_url, p.display_name,
    public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at) AS is_pro_active
  FROM profiles p
  LEFT JOIN entitlements e ON e.user_id = p.user_id
  LEFT JOIN (
    SELECT user_id, SUM(final_xp) AS week_xp
    FROM sessions
    WHERE date >= CURRENT_DATE - INTERVAL '6 days' AND is_productive_xp = true
    GROUP BY user_id
  ) w ON w.user_id = p.user_id
  WHERE p.is_public = true
) base;

GRANT SELECT ON leaderboard_view TO authenticated;

-- ── Rollback ────────────────────────────────────────────────
-- 1. 還原 010 版 leaderboard_view。
-- 2. DROP FUNCTION my_pro_status(); DROP FUNCTION start_trial();
--    DROP FUNCTION is_pro_active(boolean, timestamptz, timestamptz);
-- 3. DROP TABLE entitlements;
-- 4. ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;
--    （client 需先停止讀寫 display_name / entitlements。）
