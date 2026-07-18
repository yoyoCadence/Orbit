import { readJSON, removeValue, writeJSON } from './storageBridge.js';

const SESSION_DELETION_LOG_PREFIX = 'session-deletion-log-v1';

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function getSessionDeletionLogKey(ownerId) {
  return `${SESSION_DELETION_LOG_PREFIX}:${encodeURIComponent(requireIdentifier(ownerId, 'ownerId'))}`;
}

function normalizeEntry(entry, fallbackId) {
  if (!entry || typeof entry !== 'object') return null;
  const sessionId = typeof entry.sessionId === 'string' && entry.sessionId.trim()
    ? entry.sessionId.trim()
    : fallbackId;
  if (!sessionId) return null;
  return {
    sessionId,
    deletedAt: typeof entry.deletedAt === 'string' && entry.deletedAt
      ? entry.deletedAt
      : null,
    retryCount: Number.isInteger(entry.retryCount) && entry.retryCount > 0
      ? entry.retryCount
      : 0,
    lastAttemptAt: typeof entry.lastAttemptAt === 'string' && entry.lastAttemptAt
      ? entry.lastAttemptAt
      : null,
    remoteConfirmedAt: typeof entry.remoteConfirmedAt === 'string' && entry.remoteConfirmedAt
      ? entry.remoteConfirmedAt
      : null,
    localSettledAt: typeof entry.localSettledAt === 'string' && entry.localSettledAt
      ? entry.localSettledAt
      : null,
    recovery: entry.recovery && typeof entry.recovery === 'object'
      ? {
          targetTotalXP: Number.isFinite(entry.recovery.targetTotalXP)
            ? Math.max(0, entry.recovery.targetTotalXP)
            : null,
          targetEnergyCurrent: Number.isFinite(entry.recovery.targetEnergyCurrent)
            ? Math.max(0, entry.recovery.targetEnergyCurrent)
            : null,
        }
      : null,
  };
}

function persistEntries(ownerId, entries) {
  const key = getSessionDeletionLogKey(ownerId);
  const persisted = Object.keys(entries).length
    ? writeJSON(key, entries)
    : removeValue(key);
  if (!persisted) {
    throw new Error(`Failed to persist Session deletion log for owner "${ownerId}"`);
  }
}

export function loadSessionDeletionLog(ownerId) {
  const raw = readJSON(getSessionDeletionLogKey(ownerId), {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  return Object.entries(raw).reduce((entries, [sessionId, entry]) => {
    const normalized = normalizeEntry(entry, sessionId);
    if (normalized) entries[normalized.sessionId] = normalized;
    return entries;
  }, {});
}

export function recordSessionDeletion(ownerId, sessionId, deletedAt, recovery = null) {
  const id = requireIdentifier(sessionId, 'sessionId');
  const entries = loadSessionDeletionLog(ownerId);
  if (entries[id]) return entries[id];

  const entry = {
    sessionId: id,
    deletedAt: typeof deletedAt === 'string' && deletedAt ? deletedAt : null,
    retryCount: 0,
    lastAttemptAt: null,
    remoteConfirmedAt: null,
    localSettledAt: null,
    recovery: recovery && typeof recovery === 'object'
      ? {
          targetTotalXP: Number.isFinite(recovery.targetTotalXP)
            ? Math.max(0, recovery.targetTotalXP)
            : null,
          targetEnergyCurrent: Number.isFinite(recovery.targetEnergyCurrent)
            ? Math.max(0, recovery.targetEnergyCurrent)
            : null,
        }
      : null,
  };
  entries[id] = entry;
  persistEntries(ownerId, entries);
  return entry;
}

export function recordSessionDeletionAttempt(ownerId, sessionId, attemptedAt) {
  const id = requireIdentifier(sessionId, 'sessionId');
  const entries = loadSessionDeletionLog(ownerId);
  const current = entries[id];
  if (!current) return null;

  entries[id] = {
    ...current,
    retryCount: current.retryCount + 1,
    lastAttemptAt: typeof attemptedAt === 'string' && attemptedAt ? attemptedAt : current.lastAttemptAt,
  };
  persistEntries(ownerId, entries);
  return entries[id];
}

export function recordSessionDeletionRemoteConfirmed(ownerId, sessionId, confirmedAt) {
  const id = requireIdentifier(sessionId, 'sessionId');
  const entries = loadSessionDeletionLog(ownerId);
  const current = entries[id];
  if (!current) return null;

  entries[id] = {
    ...current,
    remoteConfirmedAt: typeof confirmedAt === 'string' && confirmedAt
      ? confirmedAt
      : current.remoteConfirmedAt,
  };
  persistEntries(ownerId, entries);
  return entries[id];
}

export function recordSessionDeletionLocalSettled(ownerId, sessionId, settledAt) {
  const id = requireIdentifier(sessionId, 'sessionId');
  const entries = loadSessionDeletionLog(ownerId);
  const current = entries[id];
  if (!current) return null;

  entries[id] = {
    ...current,
    localSettledAt: typeof settledAt === 'string' && settledAt
      ? settledAt
      : current.localSettledAt,
  };
  persistEntries(ownerId, entries);
  return entries[id];
}

export function clearSessionDeletion(ownerId, sessionId) {
  const id = requireIdentifier(sessionId, 'sessionId');
  const entries = loadSessionDeletionLog(ownerId);
  if (!entries[id]) return false;
  delete entries[id];
  persistEntries(ownerId, entries);
  return true;
}

export function getDeletedSessionIds(ownerId) {
  return new Set(Object.keys(loadSessionDeletionLog(ownerId)));
}

export function filterDeletedSessions(sessions, deletionLogOrIds) {
  const deletedIds = deletionLogOrIds instanceof Set
    ? deletionLogOrIds
    : new Set(Object.keys(deletionLogOrIds || {}));
  return (Array.isArray(sessions) ? sessions : []).filter(session => (
    session?.id && !deletedIds.has(session.id)
  ));
}
