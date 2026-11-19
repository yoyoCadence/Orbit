// HW-112D (c): which of an account's sessions the server has not confirmed yet.
// storage.js flags them (`_syncPending` on the stored copies) and keeps them in
// its pending sidecar until the insert is confirmed; a session created during
// this run is only in the sidecar (the in-memory copy has no flag). A photo of
// such a session is never "surely uploaded" for the proof code: its session
// row may not reach the server for a while, and a cloud copy without a row can
// be swept (proofSweep.js), so this device keeps its own.
//
// A module of its own (INFRA-105). The sidecar key is storage.js's (private
// there; tests/unit/proofSweep.test.js checks it against the real storage.js).

const SESSION_PENDING_PREFIX = 'yoyo_sessionSyncPending:';

/** @returns {Set<string>} session ids not confirmed on the server. */
export function sessionsNotOnServer(ownerId, sessions = []) {
  const ids = new Set();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (session?._syncPending === true && session.id) ids.add(String(session.id));
  }
  if (!ownerId) return ids;
  try {
    const snapshot = JSON.parse(localStorage.getItem(`${SESSION_PENDING_PREFIX}${encodeURIComponent(String(ownerId))}`));
    if (snapshot?.ownerId === ownerId && Array.isArray(snapshot.value)) {
      for (const session of snapshot.value) if (session?.id) ids.add(String(session.id));
    }
  } catch {
    // unreadable: only the flags count
  }
  return ids;
}
