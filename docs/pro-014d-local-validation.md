# PRO-014D local Supabase validation

## Scope and safety boundary

- Executed on 2026-08-29～2026-08-30 (Asia/Taipei).
- Used an isolated local Supabase project only. No preview branch was created, no paid Supabase resource was used, and no command was linked to or executed against production.
- The exact input under test was `pwa/db/011_leaderboard_pro.sql` from `feat/pro-014c-trial-rpc`.
- Local CLI credentials and user access tokens were used only in process memory. No secret or `service_role` value was written to the repository or frontend.

## Environment

| Component | Version |
| --- | --- |
| Docker Desktop | 4.88.1 |
| Docker Engine | 29.7.2 |
| WSL | 2.7.12.0 |
| Supabase CLI | 2.116.0 |
| Supabase Postgres | 17.6.1.165 |
| PostgREST | 16.1 |
| GoTrue | 2.196.0 |
| Kong | 2.8.1 |

The local stack kept only Postgres, Auth, PostgREST, and Kong running for the acceptance path. The generated temporary project was `orbit-pro014d-c9c8ca8` under the Windows temporary directory.

## Evidence matrix

| Acceptance area | Evidence | Result |
| --- | --- | --- |
| Real SQL parse and apply | Piped the unchanged 011 file into the local Postgres container with `psql -v ON_ERROR_STOP=1`; all function, table, trigger, policy, revoke, and grant statements completed | Pass |
| RLS and privileges | `tests/database/pro014d.test.sql` checks RLS enabled, the single owner policy, least-privilege table grants, internal helper denial, and direct INSERT／UPDATE／DELETE denial | 34/34 pass |
| Owner isolation | pgTAP switches to `authenticated` with two owner identities; the Data API check creates two real local Auth accounts and verifies A still sees exactly one row after B starts a trial | Pass |
| RPC and edge cases | Lifetime, expired paid, active trial, future trial, null entitlement, missing row, and repeated `start_trial()` are exercised | Pass |
| Data API exposure | `scripts/pro014d-data-api-check.mjs` calls the real local Auth and PostgREST endpoints: authenticated RPC succeeds, anon RPC returns 401, direct entitlement insert returns 403 | Pass |
| Approved-list seed rehearsal | The checked-in pgTAP fixture contains two synthetic UUIDs and only `user_id`, `is_pro`, and `pro_expires_at`; source-to-target reconciliation is 2:2 and `trial_started_at` remains null | Pass |
| Seed authorization record | Source: `tests/database/pro014d.test.sql`; approver: user authorization to execute PRO-014D in the Codex thread; authorization date: 2026-08-29; execution scope: local only | Recorded |
| Rollback | `tests/database/pro014d.rollback.sql` executed the six documented drops in order and asserted no entitlement object remained; the unchanged 011 was then reapplied and all 34 pgTAP assertions passed again | Pass |
| Database lint | `supabase db lint --local --schema public --level warning --fail-on error` | No schema errors |
| Security／Performance Advisors | `supabase db advisors --local --type all --level info --fail-on error` | No issues |
| Repository regression | `npm run lint`; explicit ESLint for the new Node script; `npm run test`; `npm run test:e2e -- --workers=1`; `git diff --check` | 54 files／975 tests and E2E 41/41 pass |

## Data API result

The checked-in Node probe produced the following non-secret summary:

```json
{
  "signupTokensIssued": true,
  "repeatedTrialSameTimestamp": true,
  "rpcStatusActive": true,
  "ownerRowCountBefore": 1,
  "otherRowCountBefore": 0,
  "ownerRowCountAfterOtherTrial": 1,
  "anonymousRpcHttpStatus": 401,
  "directInsertHttpStatus": 403
}
```

## Hosted-environment boundary

The local project exposes the `public` schema through PostgREST and the migration does not alter the exposed-schema configuration. Production may have a different Data API exposure setting, especially after Supabase's 2026 opt-in exposure change. `PRO-014I` must inspect the production setting before applying 011 and confirm `my_pro_status()`／`start_trial()` are reachable without broadening table or schema exposure.

This is not a reason to repeat PRO-014D on a paid branch: the migration, RLS, grants, real Auth／Data API path, advisors, seed rehearsal, and rollback were all exercised against the isolated local Supabase stack. It is a production-specific preflight item for the separately approved `PRO-014I` rollout.
