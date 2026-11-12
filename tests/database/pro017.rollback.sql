-- PRO-017 R1：019 的回滾。
-- 本機演練用；在 production 執行需另行核准。先把 client 退回不呼叫三個 RPC 的版本。
-- 已發放的 Pro 保留（pro_entitlements 的 is_pro／pro_expires_at 不動），一次性標記隨欄位一併刪除，
-- 邀請碼與邀請關係隨兩張表刪除（要保留就先匯出）。
-- 第 3 步還原的是 012 的 set_pro_entitlement_updated_at()；在 production 回滾前，先確認它與套用 019
-- 前存下的 production 定義相同。
-- 單一 transaction：任何一步失敗時整份都不生效（SQL Editor 也一樣）。
begin;

drop function public.claim_referral_reward();
drop function public.redeem_referral(text);
drop function public.get_my_referral_code();

drop table public.referrals;
drop table public.referral_codes;

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

alter table public.pro_entitlements
  drop column referral_reward_granted_at;

do $$
begin
  if to_regprocedure('public.get_my_referral_code()') is not null
    or to_regprocedure('public.redeem_referral(text)') is not null
    or to_regprocedure('public.claim_referral_reward()') is not null
    or to_regclass('public.referral_codes') is not null
    or to_regclass('public.referrals') is not null
    or exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pro_entitlements'
        and column_name = 'referral_reward_granted_at'
    ) then
    raise exception 'PRO-017 rollback is incomplete';
  end if;
end $$;

commit;
