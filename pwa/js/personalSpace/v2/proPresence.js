// PRO-014F2 F2A (owner 2026-11-19; docs/pro-014f2-personal-space-pro-proposal.md):
// the Pro mark and, on the day Pro starts on this device, one neutral line.
// Display only. Status "unknown" (getProRolloverStatus) shows and records
// nothing. INFRA-105: a new module importing only existing exports.

import { getProRolloverStatus } from '../../proRollover.js';
import { hasStoredSession } from '../../sessionPresence.js';
import { effectiveToday } from '../../utils.js';

export const PRO_STARTED_LINE = 'companion.pro.started';

const SEEN_PREFIX = 'orbit_ps_pro_seen:';
const NONE = Object.freeze({ status: 'unknown', showMark: false, companionKey: null });

function seenKey(ownerId) {
  return `${SEEN_PREFIX}${encodeURIComponent(String(ownerId))}`;
}

function readSeen(ownerId) {
  try {
    const value = JSON.parse(localStorage.getItem(seenKey(ownerId)));
    if (value && (value.status === 'pro' || value.status === 'not-pro')) {
      return { status: value.status, changedOn: typeof value.changedOn === 'string' ? value.changedOn : null };
    }
  } catch {
    // unreadable: as if never seen
  }
  return null;
}

function writeSeen(ownerId, seen) {
  try {
    localStorage.setItem(seenKey(ownerId), JSON.stringify(seen));
  } catch {
    // storage full: at worst the line comes again another day
  }
}

/** What Personal Space shows about Pro now (pass it as coreState.proPresence). */
export function resolveProPresence(ownerId, { today, newDayHour = 5, status } = {}) {
  if (!ownerId || !hasStoredSession()) return NONE;
  const current = status ?? getProRolloverStatus(ownerId);
  if (current !== 'pro' && current !== 'not-pro') return NONE;

  const day = today || effectiveToday(newDayHour);
  const seen = readSeen(ownerId);
  let changedOn = seen?.changedOn ?? null;
  if (!seen) {
    // First record: nothing to compare with, so nothing is said.
    writeSeen(ownerId, { status: current, changedOn: null });
    changedOn = null;
  } else if (seen.status !== current) {
    changedOn = day;
    writeSeen(ownerId, { status: current, changedOn });
  }

  return Object.freeze({
    status: current,
    showMark: current === 'pro',
    companionKey: current === 'pro' && changedOn === day ? PRO_STARTED_LINE : null,
  });
}
