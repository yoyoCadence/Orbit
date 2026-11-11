// PRO-014H: refresh the Pro projection when the app comes back to the front.
//
// On the `server` source Pro comes from a snapshot that holds for
// SNAPSHOT_TTL_MS (24 h). It is refreshed at boot, on reconnect and after a
// trial or SUB-16 grant. A PWA kept in memory, or a tab left open, can outlive
// it without any of those, and a paying user would then see the free tier
// while online. So when the page becomes visible again, app.js refreshes once
// the last answer for this owner is an hour old (or missing, e.g. a first
// launch after the update made offline).
//
// INFRA-105: a new module. app.js imports only its new exports; it imports
// only existing exports of proEntitlement.js.

import { isServerProEntitlementEnabled, readProEntitlementSnapshot } from './platform/proEntitlement.js';

export const PRO_RESUME_REFRESH_MS = 60 * 60 * 1000;

/**
 * Whether returning to the app should refresh the projection now.
 * @param {string|null} ownerId the signed-in account (null for guests)
 * @param {{ nowMs?: number, online?: boolean }} [options]
 */
export function needsProRefreshOnResume(ownerId, { nowMs = Date.now(), online = true } = {}) {
  if (!ownerId || !online || !isServerProEntitlementEnabled()) return false;
  const snapshot = readProEntitlementSnapshot();
  if (!snapshot || snapshot.ownerId !== ownerId) return true;
  const age = nowMs - snapshot.fetchedAtMs;
  return age >= PRO_RESUME_REFRESH_MS || age < 0;   // old, or the clock moved back
}
