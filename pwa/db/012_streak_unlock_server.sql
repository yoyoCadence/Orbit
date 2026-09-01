-- ============================================================
-- 012_streak_unlock_server.sql  (PRO-014L — server-authorized streak reward)
--
-- The client may ask whether the current account has earned the reward, but it
-- cannot supply a streak count, award timestamp, or expiry. The RPC derives
-- effective days from the caller's sessions and grants 30 days of Pro at most
-- once per account.
--
-- Scope note: sessions are still user-authored product records. This migration
-- removes the client-side entitlement write; it does not make session history
-- an anti-fraud boundary.
-- Execution date: PENDING REVIEW (not applied to production)
-- ============================================================

ALTER TABLE public.pro_entitlements
  ADD COLUMN IF NOT EXISTS streak_unlock_granted_at timestamptz;

-- Keep the existing updated_at trigger aware of the new entitlement field.
CREATE OR REPLACE FUNCTION public.set_pro_entitlement_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(
       NEW.is_pro,
       NEW.pro_expires_at,
       NEW.trial_started_at,
       NEW.streak_unlock_granted_at
     ) IS DISTINCT FROM ROW(
       OLD.is_pro,
       OLD.pro_expires_at,
       OLD.trial_started_at,
       OLD.streak_unlock_granted_at
     ) THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pro_entitlement_updated_at()
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_streak_unlock()
RETURNS TABLE (
  status text,
  granted boolean,
  is_active boolean,
  expires_at timestamptz,
  granted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (select auth.uid());
  has_eligible_streak boolean := false;
  entitlement public.pro_entitlements%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Match calcDailyStats(): >= 50 productive XP, at least one valid A/S task,
  -- and no more than 120 entertainment minutes. Numbered date islands turn
  -- adjacent effective dates into consecutive streak groups.
  SELECT EXISTS (
    WITH daily_stats AS (
      SELECT
        s.date,
        COALESCE(
          SUM(s.final_xp) FILTER (WHERE s.is_productive_xp = true),
          0
        ) AS productive_xp,
        COALESCE(
          BOOL_OR(
            s.impact_type = 'task'
            AND s.value IN ('A', 'S')
            AND s.result <> 'invalid'
          ),
          false
        ) AS has_a_or_s_task,
        COALESCE(
          SUM(s.duration_minutes) FILTER (WHERE s.impact_type = 'entertainment'),
          0
        ) AS entertainment_minutes
      FROM public.sessions s
      WHERE s.user_id = caller_id
        AND s.date <= current_date
      GROUP BY s.date
    ),
    effective_dates AS (
      SELECT date
      FROM daily_stats
      WHERE productive_xp >= 50
        AND has_a_or_s_task = true
        AND entertainment_minutes <= 120
    ),
    numbered_dates AS (
      SELECT
        date,
        date - (ROW_NUMBER() OVER (ORDER BY date))::integer AS streak_group
      FROM effective_dates
    )
    SELECT 1
    FROM numbered_dates
    GROUP BY streak_group
    HAVING COUNT(*) >= 45
  ) INTO has_eligible_streak;

  -- Establish exactly one lock target, then serialize all claim decisions for
  -- this account. The RPC transaction owns the lock until its result returns.
  INSERT INTO public.pro_entitlements (user_id)
    VALUES (caller_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT e.*
  INTO entitlement
  FROM public.pro_entitlements e
  WHERE e.user_id = caller_id
  FOR UPDATE;

  IF entitlement.streak_unlock_granted_at IS NOT NULL THEN
    RETURN QUERY SELECT
      'already_granted'::text,
      false,
      public.is_pro_active(
        entitlement.is_pro,
        entitlement.pro_expires_at,
        entitlement.trial_started_at
      ),
      entitlement.pro_expires_at,
      entitlement.streak_unlock_granted_at;
    RETURN;
  END IF;

  -- Preserve the previous client behavior: an account that is already Pro
  -- does not consume its one streak reward. It can claim after that access
  -- ends, provided the session-derived streak remains eligible.
  IF public.is_pro_active(
    entitlement.is_pro,
    entitlement.pro_expires_at,
    entitlement.trial_started_at
  ) THEN
    RETURN QUERY SELECT
      'active_entitlement'::text,
      false,
      true,
      entitlement.pro_expires_at,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT has_eligible_streak THEN
    RETURN QUERY SELECT
      'not_eligible'::text,
      false,
      false,
      entitlement.pro_expires_at,
      NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE public.pro_entitlements e
  SET
    is_pro = true,
    pro_expires_at = now() + interval '30 days',
    streak_unlock_granted_at = now()
  WHERE e.user_id = caller_id
  RETURNING e.* INTO entitlement;

  RETURN QUERY SELECT
    'granted'::text,
    true,
    true,
    entitlement.pro_expires_at,
    entitlement.streak_unlock_granted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_streak_unlock()
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_streak_unlock()
  TO authenticated;

-- ── Rollback (production execution requires separate approval) ───────────────
-- 1. DROP FUNCTION public.grant_streak_unlock();
-- 2. Restore set_pro_entitlement_updated_at() from 011_leaderboard_pro.sql.
-- 3. ALTER TABLE public.pro_entitlements DROP COLUMN streak_unlock_granted_at;
