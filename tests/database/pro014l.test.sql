begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_column(
  'public', 'pro_entitlements', 'streak_unlock_granted_at',
  'once-only streak marker exists on the server-owned table'
);
select ok(
  has_function_privilege('authenticated', 'public.grant_streak_unlock()', 'EXECUTE'),
  'authenticated can request streak evaluation'
);
select ok(
  not has_function_privilege('anon', 'public.grant_streak_unlock()', 'EXECUTE'),
  'anon cannot call streak evaluation'
);
select ok(
  not has_table_privilege('authenticated', 'public.pro_entitlements', 'UPDATE'),
  'authenticated still cannot update entitlement rows directly'
);

insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-000000000001', 'pro014l-eligible@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'pro014l-short@example.test'),
  ('20000000-0000-4000-8000-000000000003', 'pro014l-gap@example.test'),
  ('20000000-0000-4000-8000-000000000004', 'pro014l-entertainment@example.test'),
  ('20000000-0000-4000-8000-000000000005', 'pro014l-active@example.test'),
  ('20000000-0000-4000-8000-000000000006', 'pro014l-future@example.test');

-- One qualifying A task with 50 productive XP per date.
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select
  fixture.user_id,
  'Effective task',
  day.date,
  day.date::timestamptz + interval '09:00',
  day.date::timestamptz + interval '09:30',
  30,
  'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 45, 0),
    ('20000000-0000-4000-8000-000000000002'::uuid, 44, 0),
    ('20000000-0000-4000-8000-000000000004'::uuid, 45, 0),
    ('20000000-0000-4000-8000-000000000005'::uuid, 45, 0),
    ('20000000-0000-4000-8000-000000000006'::uuid, 45, -60)
) as fixture(user_id, day_count, start_offset)
cross join lateral (
  select (current_date - fixture.start_offset - n)::date as date
  from generate_series(0, fixture.day_count - 1) as n
) as day;

-- 45 effective dates split into two islands by a one-day hole.
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
)
select
  '20000000-0000-4000-8000-000000000003',
  'Gapped task',
  d,
  d::timestamptz + interval '09:00',
  d::timestamptz + interval '09:30',
  30,
  'complete', 50, 50, 10, 0, 'task', 'growth', 'A', 1.0, true
from (
  select (current_date - n)::date as d
  from generate_series(0, 45) as n
  where n <> 22
) dates;

-- One 121-minute entertainment record invalidates a date in an otherwise
-- qualifying 45-day set, leaving no 45-day island.
insert into public.sessions (
  user_id, task_name, date, started_at, completed_at, duration_minutes,
  result, base_xp, final_xp, energy_cost, energy_gain, impact_type,
  task_nature, value, resistance, is_productive_xp
) values (
  '20000000-0000-4000-8000-000000000004',
  'Long entertainment', current_date - 20,
  (current_date - 20)::timestamptz + interval '18:00',
  (current_date - 20)::timestamptz + interval '20:01',
  121, 'complete', 0, 0, 0, 0, 'entertainment', 'entertainment', 'D', 1.0, false
);

insert into public.pro_entitlements (user_id, trial_started_at)
values ('20000000-0000-4000-8000-000000000005', now() - interval '1 day');

set local role authenticated;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select is(
  (select status from public.grant_streak_unlock()),
  'granted',
  '45 consecutive effective dates receive the reward'
);
select is(
  (select is_pro from public.pro_entitlements),
  true,
  'the reward activates server-owned Pro'
);
select ok(
  (select pro_expires_at between now() + interval '29 days 23 hours'
                             and now() + interval '30 days 1 hour'
   from public.pro_entitlements),
  'expiry is server-derived at approximately 30 days'
);
select ok(
  (select streak_unlock_granted_at is not null from public.pro_entitlements),
  'the once-only marker is recorded'
);
select is(
  (select status from public.grant_streak_unlock()),
  'already_granted',
  'a repeated claim is idempotently rejected'
);
select is(
  (select count(*)::integer from public.pro_entitlements),
  1,
  'RLS still exposes only the caller entitlement row'
);
select throws_ok(
  $$update public.pro_entitlements set streak_unlock_granted_at = null$$,
  '42501',
  'permission denied for table pro_entitlements',
  'the caller cannot clear the once-only marker'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select status from public.grant_streak_unlock()), 'not_eligible', '44 dates are insufficient');
select is(
  (select streak_unlock_granted_at is null from public.pro_entitlements),
  true,
  'an ineligible request does not consume the reward'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select is((select status from public.grant_streak_unlock()), 'not_eligible', 'a gap breaks the date island');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select is(
  (select status from public.grant_streak_unlock()),
  'not_eligible',
  'a day over 120 entertainment minutes is not effective'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);
select is(
  (select status from public.grant_streak_unlock()),
  'active_entitlement',
  'an active entitlement defers rather than consumes the streak reward'
);
select is(
  (select streak_unlock_granted_at is null from public.pro_entitlements),
  true,
  'deferral leaves the once-only marker empty'
);
select is(
  (select trial_started_at is not null from public.pro_entitlements),
  true,
  'deferral preserves the existing trial'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000006', true);
select is((select status from public.grant_streak_unlock()), 'not_eligible', 'future-dated sessions are ignored');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.grant_streak_unlock()$$,
  '42501',
  'authentication required',
  'missing auth identity fails closed'
);

select is(
  (select count(*)::integer
   from public.pro_entitlements
   where user_id::text like '20000000-%'
     and streak_unlock_granted_at is not null),
  1,
  'only the eligible account consumed a reward'
);
select is(
  (select count(*)::integer
   from public.pro_entitlements
   where user_id::text like '20000000-%'
     and is_pro = true),
  1,
  'only the eligible account received paid-style Pro state'
);
select ok(
  (select updated_at >= streak_unlock_granted_at
   from public.pro_entitlements
   where user_id = '20000000-0000-4000-8000-000000000001'),
  'updated_at covers the streak grant field change'
);
select is(
  (select count(*)::integer
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'grant_streak_unlock_%'
     and parameter_mode = 'IN'),
  0,
  'the RPC accepts no client-supplied inputs'
);

select * from finish();
rollback;
