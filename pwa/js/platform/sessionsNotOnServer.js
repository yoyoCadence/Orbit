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

// #263 review: a photo uploaded while its session was not on the server may
// have had its cloud copy swept (on another device) before the session got
// there. Such photos are remembered here and queued for upload again once
// their session is on the server (proofSync.js); an upload of a copy still in
// the cloud is "already exists", harmless. Until then they are not "surely
// uploaded" (proofLocal.js), so this device keeps its copy.
const RECHECK_PREFIX = 'orbit_proofsync_recheck:';

function recheckKey(ownerId) {
  return `${RECHECK_PREFIX}${encodeURIComponent(String(ownerId))}`;
}

/** Photos to upload again once their session is on the server. */
export function photosAwaitingSessionSync(ownerId) {
  if (!ownerId) return [];
  try {
    const ids = JSON.parse(localStorage.getItem(recheckKey(ownerId)));
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

/** @returns {boolean} whether the list was saved. */
export function setPhotosAwaitingSessionSync(ownerId, ids) {
  if (!ownerId) return false;
  try {
    const unique = [...new Set(ids)];
    if (unique.length) localStorage.setItem(recheckKey(ownerId), JSON.stringify(unique));
    else localStorage.removeItem(recheckKey(ownerId));
    return true;
  } catch {
    return false;
  }
}
