-- ============================================================
-- 011_leaderboard_pro.sql  (PRO-014A — server-owned entitlement foundation)
-- Pro entitlement 目前可由使用者自寫（profiles_update 不限欄位），
-- 因此先建立 client 不可寫的 server-owned entitlement；client cutover、
-- display_name、排行榜與 Personal Space 呈現由後續任務處理。
-- 安全原則：authenticated 只能讀自己的 entitlement，不能直接寫入；
--   只有受控 RPC 可開始一次試用，付費授權仍由受信任後端處理。
-- 執行日期：PENDING REVIEW（尚未於 Supabase 執行）
-- ============================================================

-- ── 1. 單一來源的 Pro 生效規則（STABLE function）───────────────
-- server read RPC 使用這支，避免後續 SQL / JS 規則分叉。
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
REVOKE ALL ON FUNCTION public.is_pro_active(boolean, timestamptz, timestamptz) FROM authenticated;

-- ── 2. Server-owned entitlement table ───────────────────────
-- authenticated 只能「讀自己的」；沒有任何 write policy → insert/update/delete
-- 一律被 RLS 拒絕，只有 service_role（繞過 RLS）或下方 SECURITY DEFINER RPC 能寫。
CREATE TABLE public.pro_entitlements (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pro           boolean     NOT NULL DEFAULT false,
  pro_expires_at   timestamptz,            -- NULL = 永久（僅在 is_pro 時有意義）
  trial_started_at timestamptz,            -- 由 start_trial() 設定，一次性
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro_entitlements_select_own" ON public.pro_entitlements
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
-- 刻意不建立 INSERT / UPDATE / DELETE policy → authenticated 無法自行取得 Pro。

-- 雙層防護：table privileges + RLS。service_role 兩者皆繞過。
REVOKE ALL ON TABLE public.pro_entitlements FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.pro_entitlements TO authenticated;

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
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pro_entitlements AS e (user_id, trial_started_at)
    VALUES ((select auth.uid()), now())
  ON CONFLICT (user_id) DO UPDATE
    SET trial_started_at = COALESCE(e.trial_started_at, EXCLUDED.trial_started_at),
        updated_at = CASE
          WHEN e.trial_started_at IS NULL THEN now()
          ELSE e.updated_at
        END
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
     FROM public.pro_entitlements e
     WHERE e.user_id = (select auth.uid())),
    false);
$$;
REVOKE ALL ON FUNCTION public.my_pro_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_status() TO authenticated;

-- ── Rollback ────────────────────────────────────────────────
-- Client cutover 前可直接依序執行：
-- 1. DROP FUNCTION public.my_pro_status();
-- 2. DROP FUNCTION public.start_trial();
-- 3. DROP FUNCTION public.is_pro_active(boolean, timestamptz, timestamptz);
-- 4. DROP TABLE public.pro_entitlements;
