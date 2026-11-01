-- ============================================================
-- 014_my_pro_status_trial_cap.sql  (PRO-014R＋PRO-014N — 試用日期不再限制付費帳號)
-- 問題：011 的 my_pro_status() 只要帳號開始過試用就回傳 trial_ends_at，付費帳號也一樣。
--   client（pwa/js/platform/proEntitlement.js）以 expires_at 與 trial_ends_at 中較晚的
--   一個當 Pro 的上限；終身付費的 expires_at 為 NULL，上限只剩過去的試用日，server 說
--   active、client 卻判為非 Pro。試用期間購買終身方案則被顯示為試用。app 啟動時會替
--   profile 沒有 trialStartedAt 的帳號呼叫 start_trial()，終身資料列因此也會被補上試用。
-- 修正：只改 trial_ends_at 的回報條件 —— 試用只在還能延長付費以外的存取時才回報。
--   付費已涵蓋整段試用（終身，或 pro_expires_at >= 試用結束）時回傳 NULL。
--   回傳欄位、型別、SECURITY DEFINER、search_path 都不變，因此可用 CREATE OR REPLACE，
--   client 不需改邏輯。提案與實測：docs/pro-014r-my-pro-status-trial-cap.md（#217，
--   使用者 2026-11-01 核准方案 A）。
-- 語意：trial_ends_at 為 NULL 代表「沒有會延長存取的試用」，**不是**「從未試用」。
--   需要「是否開始過試用」的程式，請讀 start_trial() 的回傳或 pro_entitlements，不要
--   以 trial_ends_at IS NULL 判斷（PRO-014H 停止寫回 profile 的 trialStartedAt 時尤其注意）。
-- 套用前檢查：production 的函式必須與 011 一致，否則 CREATE OR REPLACE 會覆蓋未入庫的差異。
--     SELECT pg_get_functiondef('public.my_pro_status()'::regprocedure);
--   回滾即重新執行 011 的 my_pro_status() 定義（只改函式，不涉及資料）。
-- 測試：tests/database/pro014r.test.sql（ASSERT，失敗即中止；可在同一個 transaction
--   內與本檔一起乾跑後 ROLLBACK）。
-- 執行日期：2026-11-01（專案擁有者於 production 套用，PRO-014RA；套用前確認與 011 相同、以 transaction 乾跑，套用後檢查權限並以 5 個測試帳號驗證）
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_pro_status()
RETURNS TABLE (
  is_active boolean,
  expires_at timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(
      public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at),
      false
    ) AS is_active,
    CASE
      WHEN e.is_pro = true THEN e.pro_expires_at
      ELSE NULL
    END AS expires_at,
    CASE
      WHEN e.trial_started_at IS NULL OR e.trial_started_at > now() THEN NULL
      -- 試用只在還能延長付費以外的存取時才回報；終身或撐得比試用久的付費
      -- 已涵蓋整段試用，回報試用日期反而會讓 client 把它當成上限。
      WHEN e.is_pro = true
        AND (e.pro_expires_at IS NULL
             OR e.pro_expires_at >= e.trial_started_at + public.pro_trial_duration())
        THEN NULL
      ELSE e.trial_started_at + public.pro_trial_duration()
    END AS trial_ends_at
  FROM (SELECT auth.uid() AS user_id) AS caller
  LEFT JOIN public.pro_entitlements e ON e.user_id = caller.user_id;
$$;

-- 函式已存在時 CREATE OR REPLACE 會保留權限；仍重述一次（可重複執行），避免在函式
-- 不存在時（例如 011 被回滾過）由預設權限讓 anon 取得執行權。
REVOKE ALL ON FUNCTION public.my_pro_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_status() TO authenticated;
