# PRO-014I production migration validation

## Deployment record

- Executed: 2026-08-30 (Asia/Taipei), after explicit user approval in the rollout session.
- Target: Orbit production project `oenuhbjadvpspppaelnz`, `ap-southeast-1`, Postgres 17.6.
- Migration history: `20260830001920_pro_014i_apply_011_leaderboard_pro`.
- Source: unchanged `pwa/db/011_leaderboard_pro.sql`.
- Source SHA-256: `34eb3fc40d454ef08a01c8bf60e3fbb84d8abed6ad4369a645bae31a8e7b5bf2`.
- Client deployment／PR merge／entitlement-source cutover: not performed.

## Preflight and seed decision

The project was `ACTIVE_HEALTHY`; all five target functions/table names were absent and the migration history was empty. The current Supabase changelog and Data API security documentation were reviewed before deployment. The 2026 Data API default-privilege change does not require broadening schema exposure here because 011 explicitly grants only the required table and function privileges while enabling RLS.

Production had three legacy profile rows carrying client-writable `is_pro` and `trial_started_at` values. These are not a trusted payment or approval source, so none were copied. No separate approved paid-user list exists in the repository or migration input; the approved production seed for this rollout was therefore zero rows. The client remains on the `legacy` source until its separately gated deployment/cutover sequence.

## Verification evidence

| Check | Production result |
| --- | --- |
| Objects | `pro_entitlements`, four public functions, trigger helper, and the update trigger exist; migration is recorded |
| Seed／test residue | `pro_entitlements` contains 0 rows after the rolled-back verification transaction |
| RLS | Enabled; the only policy is authenticated owner-only `SELECT` using `(select auth.uid()) = user_id` |
| Table grants | `authenticated` has `SELECT` only; `anon` has no access; authenticated `INSERT`／`UPDATE`／`DELETE` are absent |
| Function grants | `authenticated` can execute `start_trial()` and `my_pro_status()` only; `anon` cannot; internal helpers are not client-callable |
| Function hardening | Both client RPCs are `SECURITY DEFINER` with empty `search_path` and caller-derived `auth.uid()` behavior |
| Authenticated behavior | A rolled-back transaction impersonating two existing authenticated roles proved trial idempotency, active status for the owner, and zero-row visibility／inactive status for the other account |
| Data API | Anonymous POST to both RPCs and anonymous table SELECT each returned HTTP 401; schema exposure was not broadened |
| Advisors | Security and Performance Advisors were run after migration |

The authenticated behavioral test ran inside an explicit transaction and ended with `ROLLBACK`; a postflight count confirmed no entitlement rows remained.

## Advisor findings

The new `start_trial()` and `my_pro_status()` functions produce the expected generic advisor warning for authenticated-callable `SECURITY DEFINER` functions. Their exposure is intentional and constrained by the verified empty `search_path`, caller-derived identity, least-privilege grants, owner scope, and Data API denial for anonymous callers.

The production advisors also reported pre-existing findings not created by 011:

- `public.leaderboard_view` is a public security-definer view. It exposes only the existing `is_public = true` leaderboard projection, but the advisor records it as an error and it needs a separate design review before modification.
- `public.handle_new_user()` is a trigger function that remains directly executable by `anon` and `authenticated`; revoking those direct EXECUTE grants is a separate auth/schema hardening change requiring approval.
- Leaked-password protection is disabled, and existing profile/task/session/energy RLS policies plus one sessions foreign key have performance recommendations.

No unrelated production schema or Auth setting was changed as part of PRO-014I.

## Rollback readiness

The six-step rollback order documented at the end of 011 was executed successfully in the isolated PRO-014D environment. It was reviewed against the production dependency set after deployment and remains applicable. It was not executed in production.

If rollback is required, a Supabase project owner/admin with production database migration access may execute the reviewed sequence only under an incident-approved rollback decision. Before client deployment, the database objects can be removed directly in the documented order; after client deployment, the client must first be reverted to a compatible path before removing the RPCs/table. No production rollback should be used as an acceptance test.
