// Owner-scoped Pro entitlement snapshot (PRO-014B).
//
// The legacy Pro gate reads `is_pro` / `pro_expires_at` / `trial_started_at`
// off the profile row — fields the client itself is allowed to write, so a
// user can grant themselves Pro from the console. This module replaces that
// trust anchor with a snapshot built only from a verified server response
// (`my_pro_status()`, an owner-scoped SECURITY DEFINER RPC), while keeping the
// synchronous read shape the existing `storage.isProUser()` call sites need.
//
// Everything here fails closed. A snapshot grants Pro only when all of the
// following hold: the server said `is_active`, the snapshot belongs to the
// current owner, the entitlement itself has not expired, and the snapshot is
// still inside its offline grace window. Anything unexpected — a malformed
// response, an RPC error, a different owner, no snapshot at all — reads as
// "not Pro" rather than "assume Pro".
//
// NOT ENABLED IN PRODUCTION YET. Migration 011 has not been applied to any
// database, so the RPC does not exist yet and every call would fail closed —
// which would strip Pro from current paying users. The source flag therefore
// defaults to `legacy`; PRO-014D is the gate that must pass before `server`
// is switched on.

import { FLAG_PRO_ENTITLEMENT, FLAG_PRO_ENTITLEMENT_SOURCE } from '../flags.js';

export const PRO_ENTITLEMENT_SOURCE = Object.freeze({
  LEGACY: 'legacy',
  SERVER: 'server',
});

export const DEFAULT_PRO_ENTITLEMENT_SOURCE = PRO_ENTITLEMENT_SOURCE.LEGACY;

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

  const expiresAt = normalizeTimestamp(row.expires_at);
  const trialEndsAt = normalizeTimestamp(row.trial_ends_at);
  if (expiresAt === undefined || trialEndsAt === undefined) return null;

  return { isActive: row.is_active, expiresAt, trialEndsAt };
}

// null and absent both mean "no such date" (lifetime Pro has no expiry, a user
// who never started a trial has no trial end). Anything else must parse as a
// real instant; `undefined` is returned for "invalid", which the caller treats
// as a malformed row rather than as a missing date.
function normalizeTimestamp(value) {
  if (value === null || value === undefined) return null;
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

export function writeProEntitlementSnapshot(snapshot) {
  if (!snapshot) return false;
  try {
    localStorage.setItem(FLAG_PRO_ENTITLEMENT, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearProEntitlementSnapshot() {
  try {
    localStorage.removeItem(FLAG_PRO_ENTITLEMENT);
  } catch {
    // A storage failure must not leave the caller believing Pro is still granted;
    // every read re-validates, so a snapshot that cannot be removed still expires.
  }
}

/**
 * The synchronous Pro decision. Every branch that is not a fully valid,
 * in-window, owner-matched, unexpired snapshot returns false.
 */
export function isProFromSnapshot(ownerId, nowMs = Date.now()) {
  if (!ownerId) return false;                              // signed out / guest

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

  writeProEntitlementSnapshot(snapshot);
  return isProFromSnapshot(ownerId, nowMs);
}

export function getProEntitlementSource() {
  try {
    const stored = localStorage.getItem(FLAG_PRO_ENTITLEMENT_SOURCE);
    return Object.values(PRO_ENTITLEMENT_SOURCE).includes(stored)
      ? stored
      : DEFAULT_PRO_ENTITLEMENT_SOURCE;
  } catch {
    return DEFAULT_PRO_ENTITLEMENT_SOURCE;
  }
}

export function setProEntitlementSource(source) {
  if (!Object.values(PRO_ENTITLEMENT_SOURCE).includes(source)) {
    throw new TypeError(`Unsupported Pro entitlement source: ${source}`);
  }
  localStorage.setItem(FLAG_PRO_ENTITLEMENT_SOURCE, source);
  return source;
}

export function isServerProEntitlementEnabled() {
  return getProEntitlementSource() === PRO_ENTITLEMENT_SOURCE.SERVER;
}
