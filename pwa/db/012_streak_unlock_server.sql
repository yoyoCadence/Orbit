-- ============================================================
-- 012_streak_unlock_server.sql（PRO-014L：SUB-16 連勝解鎖改由 server 發放）
--
-- 提案：docs/pro-014l-streak-unlock-server.md（使用者 2026-11-02 核准 §10）。
-- 以草稿 PR #154 的 012 為基礎，資格條件、資料列鎖、一次性、30 天、試用中不消耗
-- 都沿用（驗證紀錄見 docs/pro-014l-local-validation.md）。與 #154 的差異只有兩項：
--   1. 回傳多一欄 paid_active：is_pro 且未到期（沒有到期日即終身），不含試用。
--      client 依它把付費寫回 legacy profile；is_active 含試用，不能拿來寫 is_pro。
--   2. 一次性回填：profiles.streak_unlock_used = true 的帳號標記為已領過。只寫
--      streak_unlock_granted_at，不授予任何東西，所以不違反「不得從 client 可寫
--      欄位匯入授權」的規則（011 的註解）。
--
-- client 只「詢問」：不傳入連勝、日期或期限。RPC 依 caller 自己的 sessions 計算。
-- sessions 仍是使用者可寫的產品資料，這裡移除的是「client 直接寫 Pro」，不是防作弊。
--
-- 套用順序：本 migration 先套用到 production（PRO-014LA，專案擁有者執行），client
-- （PRO-014L2）之後才上線；顛倒的話 RPC 不存在，獎勵不會發放。
-- 測試：tests/database/pro014l.test.sql（ASSERT，單一 transaction，結尾 rollback）。
-- 回滾：tests/database/pro014l.rollback.sql。
-- 執行日期：尚未套用到 production（PRO-014LA）
-- ============================================================

-- ── 1. 一次性標記 ─────────────────────────────────────────────
ALTER TABLE public.pro_entitlements
  ADD COLUMN IF NOT EXISTS streak_unlock_granted_at timestamptz;

-- updated_at trigger 也要看新欄位（011 的版本只看三個 entitlement 欄位）。
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

-- ── 2. grant_streak_unlock() ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_streak_unlock()
RETURNS TABLE (
  status text,
  granted boolean,
  is_active boolean,
  expires_at timestamptz,
  granted_at timestamptz,
  paid_active boolean
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

  -- 與 calcDailyStats() 相同：生產 XP ≥ 50、至少一個有效的 A／S 任務、娛樂 ≤ 120
  -- 分鐘。「日期減列號」把相鄰的有效日分成同一段；任何一段 ≥ 45 天即符合。
  -- 只計到 server 的今天：client 只在本機連勝 ≥ 45 時才詢問，那時第 45 天已是
  -- 當地的「昨天」，不會晚於 UTC 的今天（提案 §4 第 6 點）。
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

  -- 確保有唯一的鎖定對象，再把同一帳號的所有判斷排成一列；鎖到 RPC 的
  -- transaction 結束為止。
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
      entitlement.streak_unlock_granted_at,
      entitlement.is_pro
        AND (entitlement.pro_expires_at IS NULL OR entitlement.pro_expires_at > now());
    RETURN;
  END IF;

  -- 與原本的 client 行為相同：已是 Pro 的帳號不消耗這唯一一次；那段存取結束後、
  -- 仍符合資格時可以再領。
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
      NULL::timestamptz,
      entitlement.is_pro
        AND (entitlement.pro_expires_at IS NULL OR entitlement.pro_expires_at > now());
    RETURN;
  END IF;

  IF NOT has_eligible_streak THEN
    RETURN QUERY SELECT
      'not_eligible'::text,
      false,
      false,
      entitlement.pro_expires_at,
      NULL::timestamptz,
      false;
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
    entitlement.streak_unlock_granted_at,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_streak_unlock()
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_streak_unlock()
  TO authenticated;

-- ── 3. 回填：已用 legacy SUB-16 的帳號標記為已領過 ──────────
-- 只寫標記，不動 is_pro／pro_expires_at／trial_started_at。標記的時間是套用的時間，
-- 不是實際領取的時間。可重複執行；PRO-014H cutover 前要再跑一次（L2 普及前，
-- 舊版 client 仍以 profile 發放）。
INSERT INTO public.pro_entitlements AS e (user_id, streak_unlock_granted_at)
SELECT p.user_id, now()
FROM public.profiles p
WHERE p.streak_unlock_used = true
ON CONFLICT (user_id) DO UPDATE
  SET streak_unlock_granted_at = COALESCE(e.streak_unlock_granted_at, now());

-- ── Rollback（tests/database/pro014l.rollback.sql；production 執行需另行核准）──
-- 1. DROP FUNCTION public.grant_streak_unlock();
-- 2. 以 011 的定義（或套用前存下的 production 定義）還原 set_pro_entitlement_updated_at()。
-- 3. ALTER TABLE public.pro_entitlements DROP COLUMN streak_unlock_granted_at;
