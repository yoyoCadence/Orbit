# BUG-109 Signup Trigger Name Truncation

- Status: **Migration committed, not applied** (`pwa/db/013_signup_profile_name.sql`)
- Applies to: Orbit production Supabase (`public.handle_new_user()`)
- Owner action required: production apply is done by the project owner (`BUG-109A`)

## Problem

`public.handle_new_user()` (from `004_triggers.sql`) runs `AFTER INSERT ON auth.users`
and writes the new profile name as:

```sql
COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
```

`profiles.name` has `CHECK (char_length(name) <= 30)`. Any name source longer than
30 characters raises `profiles_name_check`, which aborts the `auth.users` insert. Supabase
Auth then returns `500 Database error saving new user` and the person cannot sign up.

Affected signups:

| Path | Name source | Fails when |
|---|---|---|
| Email + password | email local-part | local-part > 30 characters (RFC allows up to 64) |
| Google OAuth | `raw_user_meta_data->>'name'` | display name > 30 characters |

## Fix

`013_signup_profile_name.sql` re-creates the same function with one change: the name
expression is wrapped in `left(..., 30)`. `left()` and `char_length()` both count
characters, so multibyte names are cut on character boundaries.

Unchanged: the trigger binding, the constraint, `SECURITY DEFINER`, `SET search_path = public`,
and the `energy` row insert. A static contract test (`tests/unit/signupTriggerSql.test.js`)
asserts the 013 body equals the 004 body apart from the `left(..., 30)` wrapper.

Out of scope (separate approval): revoking direct `EXECUTE` on `handle_new_user()` from
`anon`／`authenticated`, noted by the PRO-014I advisors.

## Verification done in this repo

Run on a scratch PostgreSQL 16.15 cluster with a stub `auth.users` table, `001_schema.sql`,
and `004_triggers.sql`:

| Step | Result |
|---|---|
| `tests/database/bug109.test.sql` before 013 | Fails at the 64-character local-part insert with `new row for relation "profiles" violates check constraint "profiles_name_check"` (same cause as production) |
| Apply 013, rerun the test | All 6 checks pass: 64- and 31-character local-parts, long OAuth name, 40-character CJK name, unchanged short name, constraint still present |
| Row count after the test | 0 in `auth.users` and `public.profiles` (the test rolls back) |

The stub schema is not Supabase. The test must still pass on a Supabase preview or local
stack before production (step 3 below).

## Production apply runbook (`BUG-109A`)

1. **Compare the live function with 004.** `CREATE OR REPLACE` overwrites anything that
   was changed in production without being committed.

   ```sql
   SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
   ```

   Continue only if the body matches `004_triggers.sql`. If it differs, stop and fold the
   difference into 013 first.
2. **Record the current definition** (output of step 1) as the rollback source.
3. **Run the test on a non-production stack** with 001, 004 and 013 applied:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/bug109.test.sql`.
4. **Apply 013 in production** (SQL editor or migration tooling).
5. **Verify in production** without leaving data: run `tests/database/bug109.test.sql`
   (it rolls back), or sign up once with a 31+ character email local-part and delete
   that test account and its rows afterwards.
6. **Rollback if needed:** re-run the function definition recorded in step 2. No data
   migration is involved, so rollback is the function body only.
