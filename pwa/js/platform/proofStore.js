// Local-only storage for proof photos (compressed JPEG data URLs).
// Keys: orbit_proof_<sessionId> — device-local by design, never synced to
// Supabase, and deliberately NOT cleared by storage.clearAll() on sign-out.

const PREFIX = 'orbit_proof_';
const ACHIEVEMENT_PHOTO_PREFIX = 'orbit_achievement_photo_';

function achievementPhotoKey(ownerId) {
  const normalizedOwnerId = typeof ownerId === 'string' ? ownerId.trim() : '';
  return normalizedOwnerId
    ? `${ACHIEVEMENT_PHOTO_PREFIX}${encodeURIComponent(normalizedOwnerId)}`
    : null;
}

function emptyAchievementPhoto(status = 'empty', sessionId = null) {
  return {
    status,
    sessionId,
    src: null,
    taskName: null,
    completedAt: null,
  };
}

function isSupportedProofDataUrl(value) {
  return typeof value === 'string'
    && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

export function getProof(sessionId) {
  return localStorage.getItem(PREFIX + sessionId);
}

export function saveProof(sessionId, dataUrl) {
  localStorage.setItem(PREFIX + sessionId, dataUrl);
}

/** Read the one proof Session selected for this local Personal Space owner. */
export function getAchievementPhotoSelection(ownerId) {
  const key = achievementPhotoKey(ownerId);
  if (!key) return null;
  const sessionId = localStorage.getItem(key);
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
}

export function setAchievementPhotoSelection(ownerId, sessionId) {
  const key = achievementPhotoKey(ownerId);
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!key || !normalizedSessionId) return false;
  localStorage.setItem(key, normalizedSessionId);
  return true;
}

export function clearAchievementPhotoSelection(ownerId) {
  const key = achievementPhotoKey(ownerId);
  if (!key) return false;
  localStorage.removeItem(key);
  return true;
}

/**
 * Resolve the local selection against the current owner's Sessions. A stale or
 * cleared proof intentionally becomes a placeholder instead of leaking another
 * local account's image into Personal Space.
 */
export function resolveAchievementPhoto(ownerId, sessions = []) {
  const sessionId = getAchievementPhotoSelection(ownerId);
  if (!sessionId) return emptyAchievementPhoto();

  const session = (Array.isArray(sessions) ? sessions : [])
    .find(entry => String(entry?.id || '') === sessionId);
  if (!session) return emptyAchievementPhoto('unavailable', sessionId);

  const src = getProof(sessionId);
  if (!isSupportedProofDataUrl(src)) {
    return {
      ...emptyAchievementPhoto('unavailable', sessionId),
      taskName: typeof session.taskName === 'string' ? session.taskName : null,
      completedAt: typeof session.completedAt === 'string' ? session.completedAt : null,
    };
  }

  return {
    status: 'selected',
    sessionId,
    src,
    taskName: typeof session.taskName === 'string' ? session.taskName : null,
    completedAt: typeof session.completedAt === 'string' ? session.completedAt : null,
  };
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
    if (key?.startsWith(PREFIX) || key?.startsWith(ACHIEVEMENT_PHOTO_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}
