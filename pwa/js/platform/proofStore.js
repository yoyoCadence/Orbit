// Local-only storage for proof photos (compressed JPEG data URLs).
// Keys: orbit_proof_<sessionId> — device-local by design, never synced to
// Supabase, and deliberately NOT cleared by storage.clearAll() on sign-out.

const PREFIX = 'orbit_proof_';

export function getProof(sessionId) {
  return localStorage.getItem(PREFIX + sessionId);
}

export function saveProof(sessionId, dataUrl) {
  localStorage.setItem(PREFIX + sessionId, dataUrl);
}

/** Count and total size (KB) of all stored proof photos. */
export function proofStats() {
  let count = 0, bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      count++;
      bytes += (localStorage.getItem(key) || '').length;
    }
  }
  return { count, kb: Math.round(bytes / 1024) };
}

export function clearAllProofs() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
