begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

select has_table('public', 'pro_entitlements', 'entitlement table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.pro_entitlements'::regclass),
  true,
  'RLS is enabled'
);
select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'pro_entitlements'
      and policyname = 'pro_entitlements_select_own'),
  1,
  'exactly one owner-select policy exists'
);

select ok(has_table_privilege('authenticated', 'public.pro_entitlements', 'SELECT'), 'authenticated can select');
select ok(not has_table_privilege('authenticated', 'public.pro_entitlements', 'INSERT'), 'authenticated cannot insert');
select ok(not has_table_privilege('authenticated', 'public.pro_entitlements', 'UPDATE'), 'authenticated cannot update');
select ok(not has_table_privilege('authenticated', 'public.pro_entitlements', 'DELETE'), 'authenticated cannot delete');
select ok(not has_table_privilege('anon', 'public.pro_entitlements', 'SELECT'), 'anon cannot select');

select ok(has_function_privilege('authenticated', 'public.start_trial()', 'EXECUTE'), 'authenticated can start trial');
select ok(not has_function_privilege('anon', 'public.start_trial()', 'EXECUTE'), 'anon cannot start trial');
select ok(has_function_privilege('authenticated', 'public.my_pro_status()', 'EXECUTE'), 'authenticated can read status');
select ok(not has_function_privilege('anon', 'public.my_pro_status()', 'EXECUTE'), 'anon cannot read status');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.is_pro_active(boolean,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'internal active helper is not client-callable'
);

select is(public.is_pro_active(true, null, null), true, 'lifetime Pro is active');
select is(public.is_pro_active(true, now() - interval '1 second', null), false, 'expired paid Pro is inactive');
select is(public.is_pro_active(false, null, now() - interval '1 day'), true, 'current trial is active');
select is(public.is_pro_active(false, null, now() + interval '1 day'), false, 'future trial is inactive');
select is(public.is_pro_active(null, null, null), false, 'null entitlement fails closed');

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'pro014d-owner@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'pro014d-other@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'pro014d-trial@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'pro014d-expired@example.test'),
  ('10000000-0000-4000-8000-000000000005', 'pro014d-future@example.test'),
  ('10000000-0000-4000-8000-000000000006', 'pro014d-empty@example.test'),
  ('10000000-0000-4000-8000-000000000007', 'pro014d-seed-a@example.test'),
  ('10000000-0000-4000-8000-000000000008', 'pro014d-seed-b@example.test');

insert into public.pro_entitlements (user_id, is_pro, pro_expires_at, trial_started_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', true, null, null, '2020-01-01 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000002', false, null, null, now()),
  ('10000000-0000-4000-8000-000000000004', true, now() - interval '1 day', null, now()),
  ('10000000-0000-4000-8000-000000000005', false, null, now() + interval '1 day', now());

update public.pro_entitlements
set is_pro = false
where user_id = '10000000-0000-4000-8000-000000000001';
select ok(
  (select updated_at > '2020-01-01 00:00:00+00'::timestamptz
   from public.pro_entitlements
   where user_id = '10000000-0000-4000-8000-000000000001'),
  'material updates refresh updated_at'
);

create temporary table pro014d_updated_at_before as
select updated_at
from public.pro_entitlements
where user_id = '10000000-0000-4000-8000-000000000001';
update public.pro_entitlements
set is_pro = false
where user_id = '10000000-0000-4000-8000-000000000001';
select is(
  (select updated_at from public.pro_entitlements
   where user_id = '10000000-0000-4000-8000-000000000001'),
  (select updated_at from pro014d_updated_at_before),
  'idempotent updates preserve updated_at'
);

-- Local administrator-approved seed fixture.
-- Source: this checked-in fixture; approver: PRO-014D user authorization in the
-- Codex thread on 2026-08-29; the shape deliberately contains no legacy profile fields.
create temporary table pro014d_approved_seed (
  user_id uuid primary key,
  is_pro boolean not null,
  pro_expires_at timestamptz
);
insert into pro014d_approved_seed values
  ('10000000-0000-4000-8000-000000000007', true, '2027-01-01 00:00:00+00'),
  ('10000000-0000-4000-8000-000000000008', true, null);
insert into public.pro_entitlements (user_id, is_pro, pro_expires_at)
select user_id, is_pro, pro_expires_at from pro014d_approved_seed;
select is(
  (select count(*)::integer from public.pro_entitlements e
   join pro014d_approved_seed s using (user_id)),
  2,
  'approved seed source and entitlement rows reconcile 2-to-2'
);
select is(
  (select count(*)::integer from public.pro_entitlements e
   join pro014d_approved_seed s using (user_id)
   where e.trial_started_at is not null),
  0,
  'seed does not import legacy trial state'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.pro_entitlements), 1, 'owner sees exactly one entitlement row');
select is(
  (select user_id from public.pro_entitlements),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'owner cannot read another account row'
);
select is((select is_active from public.my_pro_status()), false, 'owner status reflects its inactive row');
select throws_ok(
  $$insert into public.pro_entitlements (user_id) values ('10000000-0000-4000-8000-000000000006')$$,
  '42501',
  'permission denied for table pro_entitlements',
  'authenticated direct insert is rejected'
);
select throws_ok(
  $$update public.pro_entitlements set is_pro = true where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table pro_entitlements',
  'authenticated direct update is rejected'
);
select throws_ok(
  $$delete from public.pro_entitlements where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table pro_entitlements',
  'authenticated direct delete is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is(
  (select public.start_trial() = public.start_trial()),
  true,
  'repeated start_trial calls return the same timestamp'
);
select is(
  (select count(*)::integer from public.pro_entitlements
   where user_id = '10000000-0000-4000-8000-000000000003'),
  1,
  'trial RPC creates exactly one owner row'
);
select is((select is_active from public.my_pro_status()), true, 'new trial is active');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select is((select is_active from public.my_pro_status()), false, 'expired entitlement status is inactive');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select is((select is_active from public.my_pro_status()), false, 'future trial status is inactive');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
select is((select is_active from public.my_pro_status()), false, 'missing entitlement row fails closed');

reset role;
select * from finish();
rollback;
