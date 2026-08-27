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
// ── KNOWN GAP: the snapshot is not integrity-verified ────────────────────────
// The snapshot is plain localStorage JSON. A well-formed forgery written by
// hand is accepted exactly like a real one — the trust anchor has been moved
// off the profile row, not removed. Closing that needs a server-signed
// entitlement receipt the client can verify, which changes the RPC contract;
// it is proposed in docs/pro-014-entitlement-integrity.md and tracked as
// PRO-014G, pending approval under AGENTS.md §3.
//
// This gate is therefore a UI affordance, not a security boundary. Anything
// genuinely valuable behind Pro must be enforced server-side (RLS, or an RPC
// that checks `is_pro_active` itself) and must never rely on this module.
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
// is therefore `legacy`; PRO-014D is the gate that must pass before it moves.

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
 * opt *into* `server` so the cutover can be verified locally before PRO-014D;
 * that direction only ever removes trust, never restores it.
 */
export function getProEntitlementSource() {
  if (REPO_PRO_ENTITLEMENT_SOURCE === PRO_ENTITLEMENT_SOURCE.SERVER) {
    return PRO_ENTITLEMENT_SOURCE.SERVER;
  }
  return readLocalSourceOverride() === PRO_ENTITLEMENT_SOURCE.SERVER
    ? PRO_ENTITLEMENT_SOURCE.SERVER
    : REPO_PRO_ENTITLEMENT_SOURCE;
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
