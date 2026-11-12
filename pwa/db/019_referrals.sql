-- ============================================================
-- 019_referrals.sql
-- PRO-017 R1：邀請朋友解鎖 Pro（SUB-17），全部由 server 判定。
-- 提案：docs/pro-017-invite-unlock-proposal.md（擁有者 2026-11-11 核准：§9 全部照建議）：
--   - 邀請者：3 位被邀請者各自有 7 個有效日 → 30 天 Pro；每個帳號一生一次；
--   - 被邀請者：第一版不給額外獎勵；
--   - 有效日只算被邀請者帳號建立當天（UTC）到今天（UTC）之間的日期，而且被邀請者的帳號要已經存在
--     滿 7 天（提案 §6 的「每個假帳號至少要存在 7 天」；只看日期的話，在 UTC 23:59 建立的帳號
--     5 天多就能湊到 7 個日期）；
--   - 被邀請者帳號建立後 7 天內可以綁定；不能邀請自己；一個人只能被邀請一次；
--   - 邀請者只看已達成的人數；
--   - 邀請者目前已是 Pro（付費、試用或 SUB-16）時同 SUB-16：先不發、不消耗，之後不是 Pro 時再領；
--     終身付費永遠不會走到發放（不會被改成 30 天後到期）。
--   「確認 email」在 RA 時由擁有者在 Supabase Auth 開啟（不在本檔）。
--
-- 內容：
--   1. pro_entitlements.referral_reward_granted_at：一次性的標記（同 012 的 streak_unlock_granted_at），
--      set_pro_entitlement_updated_at() 把它算進去。
--   2. referral_codes（每人一個 8 碼邀請碼）與 referrals（被邀請者 → 邀請者）：server-owned。
--   3. 三個 RPC（SECURITY DEFINER、search_path = ''、只給 authenticated）：
--      get_my_referral_code()、redeem_referral(p_code)、claim_referral_reward()。
--
-- 權限（CLAUDE.md 的 server-owned table 例外條款；同 011 的 pro_entitlements）：
--   - 兩張表都開 RLS，並 REVOKE ALL FROM public, anon, authenticated（只收回寫入的話，Supabase 的
--     預設權限仍讓 anon 能 SELECT、authenticated 能 TRUNCATE）。
--   - referral_codes：只 GRANT SELECT 給 authenticated，只建立「讀自己的」SELECT policy。
--   - referrals：client 完全不能讀寫（不 GRANT、不建立任何 policy）；需要的資訊都由 RPC 回傳
--     （被邀請者那一列含有 inviter_id，不給 client）。
--   - **刻意不建立 INSERT／UPDATE／DELETE policy＝拒絕 client write**；所有寫入只經由下面的
--     SECURITY DEFINER RPC（或 service_role）。table privileges 與 RLS 兩層都擋。
--
-- client 只「詢問」：不傳入人數、日期或期限。sessions 是使用者可寫的產品資料（日期也是 client
-- 寫的），這裡做到的是「只算帳號建立之後的日期、帳號要存在滿 7 天」，提高造假的成本，不是防作弊。
--
-- 本檔**不含 BEGIN／COMMIT**：乾跑時包在外層的 begin; … rollback; 內。SQL Editor 一次送出整份時
-- 是單一 transaction；以 psql 套用時用 -1（--single-transaction）。
-- 測試：tests/database/pro017.test.sql（單一 transaction，結尾 rollback）；
--   兩個連線同時領取：tests/database/support/pro017-concurrency.sh（只在本機的資料庫執行）。
--   本機：tests/database/support/supabase-standin.sql → pwa/db 的 001～019 依序 → 測試。
--   production（RA，擁有者核准每一步）：begin; set local lock_timeout = '5s'; ＋ 本檔 ＋ 測試的內容 ＋
--   rollback; 乾跑（同一個 transaction 裡也跑 pro014l.test.sql 從 begin; 之後的內容，包括它的
--   set local timezone = 'UTC';，確認 SUB-16 不受影響；測試會改 auth.users 的 created_at，需要
--   postgres 對 auth.users 的 UPDATE 權限，Supabase 預設有），
--   再以 begin; set local lock_timeout = '5s'; ＋ 本檔 ＋ commit; 套用。鎖：ALTER TABLE
--   pro_entitlements 鎖住它；建立指向 auth.users 的外鍵會以 ShareRowExclusiveLock 鎖住 auth.users，
--   註冊與登入的寫入要等到 commit，所以整個 transaction 要短。
-- 套用前檢查（只讀）：set_pro_entitlement_updated_at() 與 012 相同
--   （SELECT pg_get_functiondef('public.set_pro_entitlement_updated_at()'::regprocedure);），
--   referral_codes／referrals 與三個 RPC 還不存在。
-- 回滾：tests/database/pro017.rollback.sql（production 執行需另行核准；client 先退回不呼叫的版本；
--   已發放的 Pro 保留）。回滾後再套用，一次性標記與邀請碼都會重來（獎勵可以再領一次、分享出去的
--   碼失效）。
-- ============================================================

-- ── 1. 一次性標記 ─────────────────────────────────────────────
ALTER TABLE public.pro_entitlements
  ADD COLUMN IF NOT EXISTS referral_reward_granted_at timestamptz;

-- updated_at trigger 也要看新欄位（012 的版本看四個欄位）。
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
       NEW.streak_unlock_granted_at,
       NEW.referral_reward_granted_at
     ) IS DISTINCT FROM ROW(
       OLD.is_pro,
       OLD.pro_expires_at,
       OLD.trial_started_at,
       OLD.streak_unlock_granted_at,
       OLD.referral_reward_granted_at
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

-- ── 2. 兩張 server-owned 表 ───────────────────────────────────
-- 邀請碼：8 碼，字元避開容易看錯的 0／O、1／I（32 個字元）。
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 邀請關係：一個人只能被邀請一次（invitee_id 是主鍵），不能邀請自己。
CREATE TABLE IF NOT EXISTS public.referrals (
  invitee_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_not_self CHECK (invitee_id <> inviter_id)
);
CREATE INDEX IF NOT EXISTS referrals_inviter_id_idx ON public.referrals (inviter_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_codes FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.referrals FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.referral_codes TO authenticated;

-- referral_codes：只讀自己的。刻意不建立 INSERT／UPDATE／DELETE policy＝拒絕 client write。
DROP POLICY IF EXISTS "referral_codes_select_own" ON public.referral_codes;
CREATE POLICY "referral_codes_select_own" ON public.referral_codes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- referrals：刻意不建立任何 policy、不給任何權限＝client 完全不能讀寫。

-- ── 3. get_my_referral_code() ─────────────────────────────────
-- 沒有就建立。亂數取自 gen_random_uuid()（v4）的 16 個 byte 中完全隨機的 8 個（第 0–5、10–11
-- 個；第 6 個 byte 含版本位元、第 8 個含 variant 位元），每個 byte 取 32 的餘數對應一個字元。邀請碼不是秘密（本來就要
-- 分享），猜中別人的碼只會把自己綁到那個人，所以不需要密碼學等級的亂數。碼撞到時重試。
-- 同一個人同時呼叫兩次：INSERT 的 ON CONFLICT 讓第二次等第一次 commit，再讀到同一個碼。
CREATE OR REPLACE FUNCTION public.get_my_referral_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  candidate text;
  existing text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT c.code INTO existing FROM public.referral_codes c WHERE c.user_id = caller_id;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  FOR attempt IN 1..10 LOOP
    random_bytes := uuid_send(gen_random_uuid());
    candidate := '';
    FOR i IN 0..7 LOOP
      candidate := candidate || substr(
        alphabet,
        get_byte(random_bytes, CASE WHEN i < 6 THEN i ELSE i + 4 END) % 32 + 1,
        1);
    END LOOP;

    INSERT INTO public.referral_codes (user_id, code)
      VALUES (caller_id, candidate)
    ON CONFLICT DO NOTHING;

    SELECT c.code INTO existing FROM public.referral_codes c WHERE c.user_id = caller_id;
    IF existing IS NOT NULL THEN
      RETURN existing;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'could not allocate a referral code';
END;
$$;

-- ── 4. redeem_referral(p_code) ────────────────────────────────
-- 回傳狀態（client 依它決定要不要清掉本機的邀請碼）：
--   redeemed          成功綁定；
--   invalid_code      格式不對或沒有這個碼；
--   own_code          自己的碼；
--   already_redeemed  已經綁定過（不論是不是同一個邀請者）；
--   too_late          帳號建立超過 7 天。
-- 帳號建立時間讀 auth.users.created_at（server 寫的）；profiles.created_at 本人改得到，不能用。
-- 「7 天」寫成 168 小時：interval '7 days' 依連線的 TimeZone 計算，遇到日光節約時間會差一小時，
-- 而 PostgREST 可以由 Prefer: timezone 改變它。帳號年齡（claim_referral_reward()）也一樣。
-- 碼先做 NFKC 正規化（中文輸入法的全形字母與數字、全形空白變成半形），再去掉前後的空白、tab、
-- 換行、零寬空白（U+200B）與 BOM（U+FEFF），不分大小寫。
-- 檢查順序：已經綁定、帳號太舊的人先回答，不去查碼，所以不能拿來試探某個碼存不存在。
CREATE OR REPLACE FUNCTION public.redeem_referral(p_code text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (select auth.uid());
  normalized text := upper(btrim(normalize(coalesce(p_code, ''), NFKC), E' \t\r\n' || chr(8203) || chr(65279)));
  inviter uuid;
  caller_created_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF normalized !~ '^[A-HJ-NP-Z2-9]{8}$' THEN
    RETURN 'invalid_code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.invitee_id = caller_id) THEN
    RETURN 'already_redeemed';
  END IF;

  SELECT u.created_at INTO caller_created_at FROM auth.users u WHERE u.id = caller_id;
  IF caller_created_at IS NULL OR caller_created_at < now() - interval '168 hours' THEN
    RETURN 'too_late';
  END IF;

  SELECT c.user_id INTO inviter FROM public.referral_codes c WHERE c.code = normalized;
  IF inviter IS NULL THEN
    RETURN 'invalid_code';
  END IF;
  IF inviter = caller_id THEN
    RETURN 'own_code';
  END IF;

  -- 同一個人同時綁兩個碼：主鍵讓第二個等第一個 commit，再什麼都不做。
  INSERT INTO public.referrals (invitee_id, inviter_id)
    VALUES (caller_id, inviter)
  ON CONFLICT (invitee_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'already_redeemed';
  END IF;

  RETURN 'redeemed';
END;
$$;

-- ── 5. claim_referral_reward() ────────────────────────────────
-- 回傳：status（granted／already_granted／active_entitlement／not_eligible）、granted、
-- achieved_count（已有 7 個有效日的被邀請者人數）、required_count（3）、is_active、expires_at、
-- granted_at、paid_active（同 012：is_pro 且未到期，不含試用）。
-- 有效日與 012（calcDailyStats()）相同：生產 XP ≥ 50、至少一個有效的 A／S 任務、娛樂 ≤ 120 分鐘；
-- 只算被邀請者帳號建立當天（UTC）到 UTC 的今天之間的日期（以 now() 換算，不用 current_date），
-- 而且被邀請者的帳號要已經存在滿 7 天。
-- 一次性與鎖同 012：先確保有 entitlement 列，FOR UPDATE 讓同一帳號的呼叫排隊（第一道），發放的
-- UPDATE 只在標記仍是 NULL 時生效（第二道）。
CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS TABLE (
  status text,
  granted boolean,
  achieved_count integer,
  required_count integer,
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
  required constant integer := 3;
  achieved integer := 0;
  entitlement public.pro_entitlements%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  WITH invitees AS (
    SELECT r.invitee_id, (u.created_at AT TIME ZONE 'UTC')::date AS created_on
    FROM public.referrals r
    JOIN auth.users u ON u.id = r.invitee_id
    WHERE r.inviter_id = caller_id
      AND u.created_at <= now() - interval '168 hours'
  ),
  daily_stats AS (
    SELECT
      s.user_id,
      s.date,
      COALESCE(SUM(s.final_xp) FILTER (WHERE s.is_productive_xp = true), 0) AS productive_xp,
      COALESCE(
        BOOL_OR(s.impact_type = 'task' AND s.value IN ('A', 'S') AND s.result <> 'invalid'),
        false
      ) AS has_a_or_s_task,
      COALESCE(SUM(s.duration_minutes) FILTER (WHERE s.impact_type = 'entertainment'), 0)
        AS entertainment_minutes
    FROM public.sessions s
    JOIN invitees i ON i.invitee_id = s.user_id
    WHERE s.date >= i.created_on
      AND s.date <= (now() AT TIME ZONE 'UTC')::date
    GROUP BY s.user_id, s.date
  )
  SELECT count(*)::integer INTO achieved
  FROM (
    SELECT d.user_id
    FROM daily_stats d
    WHERE d.productive_xp >= 50
      AND d.has_a_or_s_task = true
      AND d.entertainment_minutes <= 120
    GROUP BY d.user_id
    HAVING count(*) >= 7
  ) AS achieved_invitees;

  INSERT INTO public.pro_entitlements (user_id)
    VALUES (caller_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT e.*
  INTO entitlement
  FROM public.pro_entitlements e
  WHERE e.user_id = caller_id
  FOR UPDATE;

  IF entitlement.referral_reward_granted_at IS NOT NULL THEN
    RETURN QUERY SELECT
      'already_granted'::text,
      false,
      achieved,
      required,
      public.is_pro_active(entitlement.is_pro, entitlement.pro_expires_at, entitlement.trial_started_at),
      entitlement.pro_expires_at,
      entitlement.referral_reward_granted_at,
      entitlement.is_pro
        AND (entitlement.pro_expires_at IS NULL OR entitlement.pro_expires_at > now());
    RETURN;
  END IF;

  -- 已是 Pro 的帳號不消耗這唯一一次（同 SUB-16）；終身付費永遠停在這裡。
  IF public.is_pro_active(entitlement.is_pro, entitlement.pro_expires_at, entitlement.trial_started_at) THEN
    RETURN QUERY SELECT
      'active_entitlement'::text,
      false,
      achieved,
      required,
      true,
      entitlement.pro_expires_at,
      NULL::timestamptz,
      entitlement.is_pro
        AND (entitlement.pro_expires_at IS NULL OR entitlement.pro_expires_at > now());
    RETURN;
  END IF;

  IF achieved < required THEN
    RETURN QUERY SELECT
      'not_eligible'::text,
      false,
      achieved,
      required,
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
    referral_reward_granted_at = now()
  WHERE e.user_id = caller_id
    AND e.referral_reward_granted_at IS NULL
  RETURNING e.* INTO entitlement;

  -- FOR UPDATE 已讓同一帳號的呼叫排隊，這裡不會發生；第二道防線：標記已存在時不再發放。
  IF NOT FOUND THEN
    SELECT e.* INTO entitlement FROM public.pro_entitlements e WHERE e.user_id = caller_id;
    RETURN QUERY SELECT
      'already_granted'::text,
      false,
      achieved,
      required,
      public.is_pro_active(entitlement.is_pro, entitlement.pro_expires_at, entitlement.trial_started_at),
      entitlement.pro_expires_at,
      entitlement.referral_reward_granted_at,
      entitlement.is_pro
        AND (entitlement.pro_expires_at IS NULL OR entitlement.pro_expires_at > now());
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'granted'::text,
    true,
    achieved,
    required,
    true,
    entitlement.pro_expires_at,
    entitlement.referral_reward_granted_at,
    true;
END;
$$;

-- Supabase 的預設權限讓 anon 與 PUBLIC 都能執行新函式，所以明確收回；只給 authenticated。
REVOKE ALL ON FUNCTION public.get_my_referral_code() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_referral_reward() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward() TO authenticated;
