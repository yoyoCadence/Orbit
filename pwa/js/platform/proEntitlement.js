// Owner-scoped Pro entitlement snapshot (PRO-014B).
//
// The legacy Pro gate reads `is_pro` / `pro_expires_at` / `trial_started_at`
// off the profile row. Those fields are client-writable *and server-persisted*,
// so granting yourself Pro from the console syncs to every one of your devices
// and would feed the leaderboard read model in PRO-014E/F. This module narrows
// the blast radius to one device by building the decision from a server
// response (`my_pro_status()`, an owner-scoped SECURITY DEFINER RPC) instead,
// while keeping the synchronous read shape `storage.isProUser()` needs.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────────
// This is a UI entitlement projection, NOT a security boundary. The snapshot is
// plain localStorage JSON, so a well-formed forgery written by hand is accepted
// exactly like a real one — and even signing it would not change that, because
// the device owner can edit `isProUser()` itself in an unminified static PWA.
//
// So the security control lives on the server: anything genuinely valuable
// behind Pro — data, an API, a computation — must check `is_pro_active` itself
// (RLS policy, or inside the RPC) and must never trust this module or any Pro
// state sent by the client. Showing and hiding UI is all this is for.
//
// What it does buy, over the profile fields it replaces: a forged grant no
// longer round-trips to the server, so it cannot sync to the user's other
// devices or leak into the leaderboard read model.
//
// PRO-014G (docs/pro-014-entitlement-integrity.md) would raise the local
// forgery bar with a signed receipt. It is optional hardening, deliberately not
// a prerequisite — see that doc for why.
//
// Within that boundary everything fails closed. A snapshot grants Pro only
// when all of the following hold: the server said `is_active`, the snapshot
// belongs to the current owner, the entitlement has not expired, the snapshot
// is inside its offline grace window, and no storage write or clear has been
// lost. Anything unexpected reads as "not Pro" rather than "assume Pro".
//
// NOT ENABLED IN PRODUCTION YET. Migration 011 has not been applied to any
// database, so the RPC does not exist yet and every call would fail closed —
// which would strip Pro from current paying users. REPO_PRO_ENTITLEMENT_SOURCE
// is therefore `legacy`. Flipping it is its own task (PRO-014H) whose sole
// prerequisite is PRO-014J — which itself covers PRO-014C, PRO-014D and
// PRO-014I, and additionally proves C's client is deployed and passed a
// production smoke test — plus explicit approval under AGENTS.md §3.
// Finishing any earlier task alone does not license the change.

import { FLAG_PRO_ENTITLEMENT, FLAG_PRO_ENTITLEMENT_SOURCE } from '../flags.js';

export const PRO_ENTITLEMENT_SOURCE = Object.freeze({
  LEGACY: 'legacy',
  SERVER: 'server',
});

/**
 * The deployed source of truth for the Pro decision, controlled by this repo —
 * NOT by anything on the user's device.
 *
 * Cutover is a code change here, reviewed and deployed like any other. That is
 * deliberate: when this reads `server`, no localStorage value can move it back
 * to `legacy`, so a user cannot re-enable the client-writable profile path by
 * editing a key. The only override a device may apply is the strictly stricter
 * direction (legacy → server, for local verification), never the reverse.
 */
export const REPO_PRO_ENTITLEMENT_SOURCE = PRO_ENTITLEMENT_SOURCE.LEGACY;

// How long a snapshot stays usable without a successful refresh. This is the
// offline grace window: a subscriber who opens the app on a plane keeps Pro for
// the rest of the day, but a snapshot can never outlive it, so a revoked or
// lapsed entitlement cannot linger indefinitely on the device.
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes the PostgREST response for `my_pro_status()`.
 *
 * The RPC is `RETURNS TABLE`, so PostgREST answers with a single-row array.
 * That shape is asserted rather than coerced: a bare object, an empty array,
 * or more than one row means the contract is not what this client was written
 * against, and guessing which reading is right is exactly how a gate leaks.
 *
 * @returns {{isActive: boolean, expiresAt: string|null, trialEndsAt: string|null}|null}
 *   null when the response cannot be trusted.
 */
export function normalizeProStatusRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;

  const row = rows[0];
  if (!row || typeof row !== 'object') return null;
  if (typeof row.is_active !== 'boolean') return null;

  // Every column the RPC declares must be present. An absent `expires_at`
  // used to normalize to null, which reads as "no expiry" — so a truncated or
  // unexpected response granted *lifetime* Pro. A missing column means the
  // response is not the contract, and that fails closed like any other shape
  // mismatch.
  if (!('expires_at' in row) || !('trial_ends_at' in row)) return null;

  const expiresAt = normalizeTimestamp(row.expires_at);
  const trialEndsAt = normalizeTimestamp(row.trial_ends_at);
  if (expiresAt === undefined || trialEndsAt === undefined) return null;

  return { isActive: row.is_active, expiresAt, trialEndsAt };
}

// Only an explicit null means "no such date" — that is what the RPC returns for
// lifetime Pro and for a user who never started a trial. Anything else must
// parse as a real instant; `undefined` signals "invalid" to the caller, which
// treats it as a malformed row.
function normalizeTimestamp(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function buildProEntitlementSnapshot(ownerId, normalized, nowMs = Date.now()) {
  if (!ownerId || !normalized) return null;
  return {
    ownerId,
    isActive: normalized.isActive,
    expiresAt: normalized.expiresAt,
    trialEndsAt: normalized.trialEndsAt,
    fetchedAtMs: nowMs,
  };
}

export function readProEntitlementSnapshot() {
  try {
    const raw = localStorage.getItem(FLAG_PRO_ENTITLEMENT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ownerId !== 'string' || !parsed.ownerId) return null;
    if (typeof parsed.isActive !== 'boolean') return null;
    if (typeof parsed.fetchedAtMs !== 'number' || !Number.isFinite(parsed.fetchedAtMs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Set when a write or a clear did not land. While it is set, whatever sits in
// localStorage cannot be trusted to reflect the last server answer: a failed
// clear leaves a stale *active* snapshot readable, and a failed write leaves the
// previous one in place. Both must read as "not Pro" until a refresh succeeds,
// so this latch overrides every read. It is deliberately in-memory: a storage
// layer that just failed is not where you record that storage failed.
let storageWriteLost = false;

/** Test seam: a fresh module state without reaching into the latch directly. */
export function resetProEntitlementStorageState() {
  storageWriteLost = false;
}

export function hasLostProEntitlementWrite() {
  return storageWriteLost;
}

export function writeProEntitlementSnapshot(snapshot) {
  if (!snapshot) return false;
  try {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT, JSON.stringify(snapshot));
    storageWriteLost = false;
    return true;
  } catch {
    storageWriteLost = true;
    // The in-memory latch only protects this runtime. Whatever is still on disk
    // is now a snapshot the server has already superseded, and a reload would
    // read it back and grant Pro from it. Removing it is what actually makes the
    // failure survive a reload — and a quota failure is precisely the case where
    // removing something is likely to succeed.
    try {
      localStorage.removeItem(FLAG_PRO_ENTITLEMENT);
    } catch {
      // Both writing and removing failed. The snapshot on disk outlives this
      // runtime; SNAPSHOT_TTL_MS is the remaining backstop, so it can grant Pro
      // for at most the rest of the grace window rather than indefinitely.
    }
    return false;
  }
}

export function clearProEntitlementSnapshot() {
  try {
    localStorage.removeItem(FLAG_PRO_ENTITLEMENT);
    storageWriteLost = false;
    return true;
  } catch {
    storageWriteLost = true;
    return false;
  }
}

/**
 * The synchronous Pro decision. Every branch that is not a fully valid,
 * in-window, owner-matched, unexpired snapshot returns false.
 */
export function isProFromSnapshot(ownerId, nowMs = Date.now()) {
  if (!ownerId) return false;                              // signed out / guest
  if (storageWriteLost) return false;                      // storage state unreliable

  const snapshot = readProEntitlementSnapshot();
  if (!snapshot) return false;                             // never fetched, or unreadable
  if (snapshot.ownerId !== ownerId) return false;          // account switched
  if (!snapshot.isActive) return false;                    // server said no
  if (nowMs - snapshot.fetchedAtMs >= SNAPSHOT_TTL_MS) return false;  // stale
  if (snapshot.fetchedAtMs > nowMs + SNAPSHOT_TTL_MS) return false;   // clock moved backwards

  return nowMs < entitlementExpiryMs(snapshot);
}

// The server decides *whether* the entitlement is active; these dates decide
// *until when*. Both absent on an active entitlement means lifetime Pro, which
// is the only case that has no ceiling of its own.
function entitlementExpiryMs(snapshot) {
  const candidates = [snapshot.expiresAt, snapshot.trialEndsAt]
    .map(value => (typeof value === 'string' ? Date.parse(value) : NaN))
    .filter(value => !Number.isNaN(value));

  return candidates.length ? Math.max(...candidates) : Number.POSITIVE_INFINITY;
}

/**
 * Applies one `my_pro_status()` response.
 *
 * An `error` in the response is authoritative: the RPC is missing, the caller
 * is not permitted, or the row cannot be read. Any stale snapshot is dropped.
 * A thrown network failure is a different thing entirely and is handled by the
 * caller, which leaves the snapshot alone so the offline grace window applies.
 */
export function applyProStatusResponse({ ownerId, rows, error, nowMs = Date.now() }) {
  if (!ownerId || error) {
    clearProEntitlementSnapshot();
    return false;
  }

  const snapshot = buildProEntitlementSnapshot(ownerId, normalizeProStatusRows(rows), nowMs);
  if (!snapshot) {
    clearProEntitlementSnapshot();
    return false;
  }

  // A lost write means the stored snapshot no longer reflects this answer, so
  // the answer is not usable — even when the server said the user is active.
  if (!writeProEntitlementSnapshot(snapshot)) return false;
  return isProFromSnapshot(ownerId, nowMs);
}

/**
 * Resolves the effective source.
 *
 * The repo constant is the floor and it can only be raised. Once this repo
 * deploys `server`, a device cannot fall back to `legacy` — that would hand the
 * client-writable profile fields their authority back, which is the whole thing
 * this task exists to remove. While the repo still says `legacy`, a device may
 * opt *into* `server` so the cutover can be verified locally before PRO-014H;
 * that direction only ever removes trust, never restores it.
 */
export function getProEntitlementSource() {
  return resolveProEntitlementSource(REPO_PRO_ENTITLEMENT_SOURCE, readLocalSourceOverride());
}

/**
 * The resolution rule as a pure function of both inputs.
 *
 * Split out from `getProEntitlementSource()` so the post-cutover branch —
 * repo `server` with a device trying to store `legacy` — can be executed
 * directly. Testing it only through the module constant would exercise
 * whichever branch this repo happens to be deployed on today and silently
 * stop covering the other one.
 */
export function resolveProEntitlementSource(repoSource, storedOverride) {
  if (repoSource === PRO_ENTITLEMENT_SOURCE.SERVER) {
    return PRO_ENTITLEMENT_SOURCE.SERVER;         // deployed cutover: not downgradable
  }
  return storedOverride === PRO_ENTITLEMENT_SOURCE.SERVER
    ? PRO_ENTITLEMENT_SOURCE.SERVER               // device opted into the stricter path
    : PRO_ENTITLEMENT_SOURCE.LEGACY;
}

function readLocalSourceOverride() {
  try {
    return localStorage.getItem(FLAG_PRO_ENTITLEMENT_SOURCE);
  } catch {
    return null;
  }
}

/**
 * Local-only escalation to `server`, for verifying the cutover on a device.
 * There is deliberately no way to write `legacy` here: downgrading is not a
 * setting, it is a deployment decision made by REPO_PRO_ENTITLEMENT_SOURCE.
 */
export function enableServerProEntitlementLocally() {
  localStorage.setItem(FLAG_PRO_ENTITLEMENT_SOURCE, PRO_ENTITLEMENT_SOURCE.SERVER);
  return getProEntitlementSource();
}

/** Drops the local escalation. Never lowers the repo-deployed source. */
export function clearLocalProEntitlementOverride() {
  try {
    localStorage.removeItem(FLAG_PRO_ENTITLEMENT_SOURCE);
  } catch {
    // Nothing to fail closed about: the repo constant still governs, and it is
    // the stricter of the two whenever it says `server`.
  }
  return getProEntitlementSource();
}

export function isServerProEntitlementEnabled() {
  return getProEntitlementSource() === PRO_ENTITLEMENT_SOURCE.SERVER;
}
