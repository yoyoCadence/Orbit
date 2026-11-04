-- PRO-014L：012 的回滾（沿用草稿 PR #154）。
-- 本機演練用；在 production 執行需另行核准（PRO-014LA）。
-- 第 2 步還原的是 011 的 set_pro_entitlement_updated_at()；在 production 回滾前，先確認它與
-- 套用 012 前存下的 production 定義相同。
-- 回填的一次性標記隨欄位一併刪除。回填時新增的資料列（is_pro = false、沒有日期）會留下：它們與
-- RPC 對不符資格者建立的資料列無法分辨，功能上等同沒有資料列（my_pro_status()、start_trial()
-- 的結果不變），所以不刪。被標記過的既有資料列，updated_at 維持標記時的時間。
-- 單一 transaction：任何一步失敗時整份都不生效（SQL Editor 也一樣）。
-- 第 2 步的函式本文與 011 逐字相同，回滾後 pg_get_functiondef() 與套用 012 前存下的定義一致。
begin;

drop function public.grant_streak_unlock();

CREATE OR REPLACE FUNCTION public.set_pro_entitlement_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(NEW.is_pro, NEW.pro_expires_at, NEW.trial_started_at)
     IS DISTINCT FROM ROW(OLD.is_pro, OLD.pro_expires_at, OLD.trial_started_at) THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.set_pro_entitlement_updated_at()
  from public, anon, authenticated;

alter table public.pro_entitlements
  drop column streak_unlock_granted_at;

do $$
begin
  if to_regprocedure('public.grant_streak_unlock()') is not null
    or exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pro_entitlements'
        and column_name = 'streak_unlock_granted_at'
    ) then
    raise exception 'PRO-014L rollback left streak-unlock objects behind';
  end if;
end;
$$;

commit;
