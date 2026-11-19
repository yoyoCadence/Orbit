// HW-112D (a): this account's photos on this device that the proof sync is done
// with but that are not surely in the cloud: waiting will not change them. They
// are photos the bucket does not take as is (an older version's PNG/WebP, which
// the sync re-encodes and may or may not have sent; one over 200 KB, which it
// skips). BUG-118's "check sync" names them so they can be saved by hand before
// the old icon goes.
//
// A module of its own (INFRA-105): it imports only exports its dependencies
// already had.

import { getProof } from './proofStore.js';
import { pendingProofUploads } from './proofSync.js';
import { uploadedLocalProofIds } from './proofLocal.js';
import { sessionsNotOnServer } from './sessionsNotOnServer.js';

// proofSync's "this account's existing photos were queued" marker (private
// there; tests/unit/proofUnsure.test.js checks against the one it writes).
const BACKFILL_DONE_PREFIX = 'orbit_proofsync_backfilled:';

function backfillDone(ownerId) {
  try {
    return localStorage.getItem(`${BACKFILL_DONE_PREFIX}${encodeURIComponent(String(ownerId))}`) === '1';
  } catch {
    return false;
  }
}

function hasLocalProof(sessionId) {
  try {
    return Boolean(getProof(sessionId));
  } catch {
    return false;
  }
}

/**
 * This account's local photos that will stay "not surely uploaded": every photo
 * was queued once (backfill), this one is no longer queued, and it is not one
 * the bucket surely took. Before the backfill nothing is said (they are still
 * waiting). `sessions` must be this account's own. Newest first.
 * @returns {{ sessionId: string, date: string, taskName: string }[]}
 */
export function unsureProofPhotos(ownerId, sessions) {
  if (!ownerId || !Array.isArray(sessions) || !backfillDone(ownerId)) return [];
  const pending = new Set(pendingProofUploads(ownerId));
  const uploaded = new Set(uploadedLocalProofIds(ownerId, sessions));
  // HW-112D (c): a session the server has not confirmed is still waiting.
  const notOnServer = sessionsNotOnServer(ownerId, sessions);
  const seen = new Set();
  const unsure = [];
  for (const session of sessions) {
    const sessionId = String(session?.id ?? '');
    if (!sessionId || seen.has(sessionId)) continue;
    seen.add(sessionId);
    if (pending.has(sessionId) || uploaded.has(sessionId) || notOnServer.has(sessionId)
      || !hasLocalProof(sessionId)) continue;
    unsure.push({
      sessionId,
      date: typeof session.date === 'string' ? session.date : '',
      taskName: typeof session.taskName === 'string' ? session.taskName : '',
    });
  }
  return unsure.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
