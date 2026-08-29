-- PRO-014D local-only rollback rehearsal. The order mirrors the rollback block
-- in pwa/db/011_leaderboard_pro.sql and must never be run against production as
-- part of acceptance testing.
drop function public.my_pro_status();
drop function public.start_trial();
drop table public.pro_entitlements;
drop function public.set_pro_entitlement_updated_at();
drop function public.is_pro_active(boolean, timestamptz, timestamptz);
drop function public.pro_trial_duration();

do $$
begin
  if to_regprocedure('public.my_pro_status()') is not null
    or to_regprocedure('public.start_trial()') is not null
    or to_regclass('public.pro_entitlements') is not null
    or to_regprocedure('public.set_pro_entitlement_updated_at()') is not null
    or to_regprocedure('public.is_pro_active(boolean,timestamp with time zone,timestamp with time zone)') is not null
    or to_regprocedure('public.pro_trial_duration()') is not null then
    raise exception 'PRO-014D rollback left entitlement objects behind';
  end if;
end;
$$;
