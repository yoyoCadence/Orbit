// PRO-014P: the day rollover must not read "Pro status unknown" as "not Pro".
// BUG-115: the streak-shield offer belongs to the account that earned it.
//
// Proposal: docs/pro-014p-day-rollover-entitlement.md (option D, approved
// 2026-11-01). The streak itself does not depend on Pro and is always
// evaluated. Only the Pro effects of the rollover (the monthly shield refill
// and the shield offer) wait for an answer: while the status is unknown they
// are recorded here, and the first rollover or refresh that knows the status
// applies them once. SUB-16 is skipped while unknown (dayCycle.js); PRO-014L
// moves it out of the rollover entirely.
//
// INFRA-105: a new module, so the existing SHELL modules import only these new
// exports and never a new export of one another.

import { state } from './state.js';
import { storage } from './storage.js';
import { effectiveToday } from './utils.js';
import { FLAG_SHIELD_PENDING } from './flags.js';
import {
  SNAPSHOT_TTL_MS,
  hasLostProEntitlementWrite,
  isProFromSnapshot,
  isServerProEntitlementEnabled,
  readProEntitlementSnapshot,
} from './platform/proEntitlement.js';

/** `{ ownerId, prevStreak }`: Pro effects of an `unknown` rollover, applied later. */
export const PRO_ROLLOVER_PENDING_KEY = 'orbit_pro_rollover_pending';

export const PRO_STATUS_UNKNOWN_MESSAGE = '目前無法確認 Pro 狀態，連線後再試一次';

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * `pro`, `not-pro`, or `unknown` from the `server` source's snapshot.
 *
 * `pro` is exactly `isProFromSnapshot()`, so the two can never disagree; this
 * only splits its "no" into the answers the server gave (`not-pro`) and the
 * ones the snapshot cannot give (`unknown`).
 */
export function getProStatusFromSnapshot(ownerId, nowMs = Date.now()) {
  if (!ownerId) return 'unknown';                                  // guest or signed out
  if (hasLostProEntitlementWrite()) return 'unknown';              // storage unreliable
  const snapshot = readProEntitlementSnapshot();
  if (!snapshot || snapshot.ownerId !== ownerId) return 'unknown'; // never fetched, or another account's
  if (nowMs - snapshot.fetchedAtMs >= SNAPSHOT_TTL_MS) return 'unknown';  // stale
  if (snapshot.fetchedAtMs > nowMs + SNAPSHOT_TTL_MS) return 'unknown';   // clock moved backwards
  if (isProFromSnapshot(ownerId, nowMs)) return 'pro';
  if (!snapshot.isActive) return 'not-pro';                        // the server said no

  // Active when fetched, past its end now. If it ended after the fetch, a
  // renewal since then would not be in the snapshot: only a refresh can tell.
  const ends = [snapshot.expiresAt, snapshot.trialEndsAt]
    .map(parseTimestamp)
    .filter(value => value !== null);
  const endMs = ends.length ? Math.max(...ends) : Number.POSITIVE_INFINITY;
  return endMs > snapshot.fetchedAtMs ? 'unknown' : 'not-pro';
}

/** The rollover's Pro status. `legacy` always knows it; `server` may not. */
export function getProRolloverStatus(ownerId, nowMs = Date.now()) {
  if (!isServerProEntitlementEnabled()) return storage.isProUser() ? 'pro' : 'not-pro';
  return getProStatusFromSnapshot(ownerId, nowMs);
}

// ─── Shield offer (BUG-115) ───────────────────────────────────────────────────

/**
 * The pending shield offer for `ownerId`, or null.
 *
 * An offer carries the owner that earned it and is invisible to anyone else.
 * One written before BUG-115 has no owner and cannot be attributed, so it stays
 * usable while signed in; `storage.clearAll()` drops it on sign-out.
 */
export function readShieldOffer(ownerId) {
  let parsed;
  try {
    const raw = localStorage.getItem(FLAG_SHIELD_PENDING);
    if (raw === null) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.ownerId === 'string' && parsed.ownerId !== ownerId) return null;
  return parsed;
}

export function writeShieldOffer(ownerId, prevStreak) {
  try {
    localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ ownerId, prevStreak }));
    return true;
  } catch (error) {
    console.warn('Shield offer could not be saved:', error);
    return false;
  }
}

export function clearShieldOffer() {
  try { localStorage.removeItem(FLAG_SHIELD_PENDING); } catch { /* nothing else to do */ }
}

// ─── Pending Pro effects of an unknown rollover ───────────────────────────────

export function readPendingProRollover() {
  try {
    const raw = localStorage.getItem(PRO_ROLLOVER_PENDING_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ownerId !== 'string' || !parsed.ownerId) return null;
    const prevStreak = Number.isFinite(parsed.prevStreak) ? parsed.prevStreak : null;
    return { ownerId: parsed.ownerId, prevStreak };
  } catch {
    return null;
  }
}

/**
 * Records that a rollover ran without a known Pro status. Written on every such
 * rollover, since the monthly refill depends on it too. For the same owner a
 * later reset that could earn an offer (a streak of 2 or more) replaces the
 * earlier one, as the offer itself has one slot; any other rollover keeps it.
 * A record of another owner is replaced whole, so its streak never carries over.
 */
export function recordPendingProRollover(ownerId, prevStreak = null) {
  if (!ownerId) return false;
  const existing = readPendingProRollover();
  const carried = existing?.ownerId === ownerId ? existing.prevStreak : null;
  const earnsOffer = Number.isFinite(prevStreak) && prevStreak >= 2;
  try {
    localStorage.setItem(PRO_ROLLOVER_PENDING_KEY, JSON.stringify({
      ownerId,
      prevStreak: earnsOffer ? prevStreak : carried,
    }));
    return true;
  } catch (error) {
    console.warn('Pending Pro rollover could not be saved:', error);
    return false;
  }
}

function clearPendingProRollover() {
  try {
    localStorage.removeItem(PRO_ROLLOVER_PENDING_KEY);
    return localStorage.getItem(PRO_ROLLOVER_PENDING_KEY) === null;
  } catch {
    return false;
  }
}

/**
 * The rollover's Pro effects, the one place they are decided: the monthly
 * refill, then the offer (which needs a shield after that refill). Nothing for
 * `not-pro`. Returns whether `user` changed.
 */
export function applyProOnlyRolloverEffects(user, status, { prevStreak = null, todayStr } = {}) {
  if (!user || status !== 'pro') return false;
  let changed = false;
  const month = todayStr.slice(0, 7);
  if ((user.streakShieldResetMonth || '') !== month) {
    user.streakShieldCount = 2;
    user.streakShieldResetMonth = month;
    changed = true;
  }
  if (Number.isFinite(prevStreak) && prevStreak >= 2 && (user.streakShieldCount || 0) > 0) {
    writeShieldOffer(user.id, prevStreak);
  }
  return changed;
}

/**
 * Applies the recorded Pro effects once the status is known, at most once: the
 * record is removed before anything is applied, so a failure leaves the effect
 * missing rather than granted twice. A record of another owner is left for
 * that owner. Returns whether the record was resolved (`not-pro` resolves it
 * with nothing to apply).
 */
export function resolvePendingProRollover({ nowMs = Date.now() } = {}) {
  const user = state.user;
  if (!user?.id) return false;
  const pending = readPendingProRollover();
  if (!pending || pending.ownerId !== user.id) return false;
  const status = getProRolloverStatus(user.id, nowMs);
  if (status === 'unknown') return false;
  if (!clearPendingProRollover()) return false;
  const todayStr = effectiveToday(user.newDayHour ?? 5);
  if (applyProOnlyRolloverEffects(user, status, { prevStreak: pending.prevStreak, todayStr })) {
    storage.saveUser(user);
  }
  return true;
}
