// PRO-014L2: SUB-16 (45-day streak → 30 days of Pro) is granted by the server.
//
// Proposal: docs/pro-014l-streak-unlock-server.md §5.3 (approved). The day
// rollover no longer writes Pro; the client only asks grant_streak_unlock()
// (migration 012), which recomputes eligibility from the caller's own sessions
// and records the one-time grant. db.grantStreakUnlock() writes the answer back.
//
// When to ask: signed in, after the remote load and its Session backfills (so
// the server sees the days this device recorded offline), only while the local
// streak is at least 45 days, the unlock is not recorded here, and the account
// is not known to be Pro. A refusal (not_eligible, active_entitlement) is
// remembered for the owner's current day, so a device that keeps reaching the
// threshold does not call on every sync. A not_eligible answered while this
// device still has Sessions waiting to upload is not remembered: the server
// has not seen those days yet, and the sync that uploads them asks again.
//
// INFRA-105: a new module. The existing SHELL modules import only its new
// exports; it imports only existing exports of the others.

import { state } from './state.js';
import { db, getPendingSyncSummary } from './storage.js';
import { eToday, showStreakUnlockModal } from './dayCycle.js';
import { getProRolloverStatus } from './proRollover.js';

export const STREAK_UNLOCK_DAYS = 45;
/** `{ ownerId, day }`: the last refused ask, so the next one waits a day. */
export const STREAK_UNLOCK_ASKED_KEY = 'orbit_streak_unlock_asked';

const inFlight = new Map();   // ownerId → the pending ask

function readAsked() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STREAK_UNLOCK_ASKED_KEY));
    return parsed && typeof parsed.ownerId === 'string' && typeof parsed.day === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeAsked(ownerId, day) {
  try { localStorage.setItem(STREAK_UNLOCK_ASKED_KEY, JSON.stringify({ ownerId, day })); } catch { /* best effort */ }
}

/** Sessions recorded here that the server has not received yet. */
function hasPendingSessions(ownerId) {
  try {
    return getPendingSyncSummary(ownerId).sessions > 0;
  } catch {
    return true;   // unknown: do not remember the refusal
  }
}

/** Whether this device should ask the server now (no network involved). */
export function shouldAskStreakUnlock(ownerId) {
  const user = state.user;
  if (!ownerId || !user || user.id !== ownerId) return false;
  if ((user.streakDays ?? 0) < STREAK_UNLOCK_DAYS) return false;
  if (user.streakUnlockUsed) return false;
  if (getProRolloverStatus(ownerId) === 'pro') return false;   // `unknown` still asks: the server decides
  const asked = readAsked();
  return !(asked && asked.ownerId === ownerId && asked.day === eToday());
}

/**
 * Ask the server for SUB-16 when shouldAskStreakUnlock() allows it.
 *
 * Concurrent asks for the same owner share one request. Failures (offline, an
 * unexpected answer) leave nothing behind, so the next sync asks again.
 *
 * @param {string} ownerId
 * @param {{ isCurrent?: () => boolean, onChange?: () => void, delayMs?: number }} [options]
 * @returns {Promise<string|null>} the server's status, or null when not asked or failed
 */
export function requestStreakUnlock(ownerId, { isCurrent = () => true, onChange = () => {}, delayMs = 800 } = {}) {
  if (!shouldAskStreakUnlock(ownerId)) return Promise.resolve(null);
  if (inFlight.has(ownerId)) return inFlight.get(ownerId);
  if (typeof db.grantStreakUnlock !== 'function') return Promise.resolve(null);   // mixed versions

  const ask = (async () => {
    const day = eToday();
    const answer = await db.grantStreakUnlock(ownerId, () => state.user);
    if (!answer.ok || !answer.result || !isCurrent() || state.user?.id !== ownerId) return null;
    const { status } = answer.result;
    if (status === 'not_eligible' || status === 'active_entitlement') {
      if (status === 'active_entitlement' || !hasPendingSessions(ownerId)) writeAsked(ownerId, day);
      return status;
    }
    onChange();
    if (status === 'granted' || answer.recovered) {
      setTimeout(() => { if (isCurrent()) showStreakUnlockModal(); }, delayMs);
    }
    return status;
  })().catch(error => {
    console.warn('Streak unlock request failed:', error);
    return null;
  }).finally(() => inFlight.delete(ownerId));

  inFlight.set(ownerId, ask);
  return ask;
}
