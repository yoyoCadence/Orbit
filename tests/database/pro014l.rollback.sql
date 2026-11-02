-- PRO-014L：012 的回滾（沿用草稿 PR #154）。
-- 本機演練用；在 production 執行需另行核准（PRO-014LA）。
-- 第 2 步還原的是 011 的 set_pro_entitlement_updated_at()；在 production 回滾前，先確認它與
-- 套用 012 前存下的 production 定義相同。
-- 回填的一次性標記隨欄位一併刪除。
drop function public.grant_streak_unlock();

create or replace function public.set_pro_entitlement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.is_pro, new.pro_expires_at, new.trial_started_at)
     is distinct from row(old.is_pro, old.pro_expires_at, old.trial_started_at) then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
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
