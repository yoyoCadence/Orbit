# PRO-014J production client deployment validation

## Deployment record

- Executed: 2026-08-31 (Asia/Taipei).
- Production app: `https://yoyocadence.github.io/Orbit/`.
- Supabase project: `oenuhbjadvpspppaelnz`.
- Final client release: v1.25.2.
- Final merge: PR [#152](https://github.com/yoyoCadence/Orbit/pull/152), merge commit `55edfaf122e3dc1ded38a90b3ad012caba9bb5e2`.
- GitHub Pages deployment run: `33389923432`, successful.
- Entitlement source remained `legacy`; no Auth setting, schema, migration, or production cutover was changed during this validation.

## Validation path

The smoke test used a new short-email account because BUG-109 already records the separate long-email signup trigger constraint. The flow exercised the deployed PWA under an active v1.25.2 Service Worker:

1. Sign up and allow the client to call the server-owned `start_trial()` RPC.
2. Complete setup with a new display name.
3. Verify the main UI, default tasks, trial presentation, and deployed version.
4. Sign out, reload the production app, and sign in again with the same account.
5. Inspect the real network request list and Cache Storage after the second login.
6. Sign out globally, delete the exact synthetic account, and verify every related table is empty for that user ID.

## Results

| Check | Production result |
| --- | --- |
| Deployment | `sw.js` contains `orbit-v1.25.2` and the same-origin guard; `version.js` reports `v1.25.2` |
| First signup | Auth signup returned 200; profile and entitlement were created; `start_trial()` returned 200 |
| Setup preservation | Display name became `Smoke152`; the existing trial start was not reset by setup |
| Default data | Exactly 13 task rows existed after setup |
| Trial UI | Settings displayed `免費試用中`, 15 days remaining, and version v1.25.2 |
| Second login | After reopening the app, login returned to the existing settings route instead of setup; all 13 tasks and the existing profile were present |
| Network freshness | Second-login GETs for `profiles`, `tasks`, `sessions`, and `energy` each reached Supabase and returned HTTP 200 |
| Trial idempotency | The first v1.25.0 production smoke called `start_trial()` repeatedly for the same account and received the same timestamp; the final v1.25.2 request log contained the signup-time call only, and the second login did not call it again |
| Service Worker cache | The active controller was `/Orbit/sw.js`; only `orbit-v1.25.2` existed, with 104 entries and 0 cross-origin URLs after the second login |
| CI | PR #152 lint, test, E2E, and build-check all succeeded |

The profile timestamp is serialized at millisecond precision while the entitlement row retains PostgreSQL microseconds, so their displayed values differ by less than one millisecond. Both values were created in the same signup flow, and the profile value remained unchanged through setup and the second login; there was no reset or extension.

## Cleanup

The browser performed a global sign-out before cleanup. The synthetic account was then deleted by exact UUID plus exact email match. Post-cleanup counts were verified as zero for:

- `auth.users`
- `auth.sessions`
- `public.profiles`
- `public.tasks`
- `public.sessions`
- `public.energy`
- `public.pro_entitlements`

No test account, session, profile, task, energy, or entitlement row remains.

## Follow-up findings

- BUG-108 is complete: cross-origin Supabase Data API responses are no longer stored in the PWA cache, and the second-login setup regression is gone.
- PRO-014J is complete: the gated client deployment and production smoke are complete without switching the entitlement source.
- BUG-109 remains in Backlog for the long-email signup trigger constraint and requires separately approved Auth/schema work.
- BUG-110 was discovered during cleanup: after successful signup, signing out in the same page session leaves the auth submit button disabled until reload. This is a separate client UI-state bug and does not change the production acceptance result for the reopen-and-login path.
- The same-origin rule intentionally stops caching every cross-origin response, including Supabase Storage and the CDN-delivered jsPDF/html2canvas dependencies used by `export.js`. Any future offline support for those resources needs an explicit allowlist and failure strategy rather than restoring generic cross-origin cache-first behavior.
