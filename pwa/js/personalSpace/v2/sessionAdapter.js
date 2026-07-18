import { REWARD_EPOCH } from './config.js';

export const VALID_SESSION_RESULTS = Object.freeze([
  'complete',
  'completed',
  'instant',
  'partial',
]);

const INVALID_SESSION_RESULTS = new Set([
  'invalid',
  'cancelled',
  'canceled',
  'deleted',
  'reversed',
]);

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateFromTimestamp(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

/** Prefer Orbit's explicit local calendar date over a timestamp-derived date. */
export function getSessionDate(session = {}) {
  return text(session.date) ||
    dateFromTimestamp(session.completedAt ?? session.completed_at) ||
    dateFromTimestamp(session.startedAt ?? session.started_at);
}

export function getSessionOccurredAt(session = {}) {
  return text(session.completedAt ?? session.completed_at) ||
    text(session.startedAt ?? session.started_at) ||
    (getSessionDate(session) ? `${getSessionDate(session)}T00:00:00.000Z` : '');
}

export function isSessionDeleted(session = {}) {
  const result = text(session.result).toLowerCase();
  const deletedMarker =
    session.deletedAt ??
    session.deleted_at ??
    session.reversedAt ??
    session.reversed_at ??
    session.isDeleted ??
    session.is_deleted ??
    session.tombstone;
  return Boolean(deletedMarker) ||
    result === 'deleted' ||
    result === 'reversed';
}

export function isSessionOnOrAfterEpoch(session = {}, rewardEpoch = REWARD_EPOCH) {
  const epochMs = Date.parse(rewardEpoch);
  if (!Number.isFinite(epochMs)) return true;

  const completedAt = text(session.completedAt ?? session.completed_at);
  const completedMs = Date.parse(completedAt);
  if (Number.isFinite(completedMs)) return completedMs >= epochMs;

  const epochDate = dateFromTimestamp(rewardEpoch);
  const sessionDate = getSessionDate(session);
  return Boolean(epochDate && sessionDate && sessionDate >= epochDate);
}

export function isValidRewardSession(session = {}, options = {}) {
  const id = text(session.id ?? session.sessionId ?? session.session_id);
  const result = text(session.result).toLowerCase();
  if (!id || !getSessionDate(session) || isSessionDeleted(session)) return false;
  if (!result || INVALID_SESSION_RESULTS.has(result)) return false;
  if (!VALID_SESSION_RESULTS.includes(result)) return false;
  return isSessionOnOrAfterEpoch(session, options.rewardEpoch ?? REWARD_EPOCH);
}

export function isDailyMainQuestCandidate(session = {}, options = {}) {
  if (!isValidRewardSession(session, options)) return false;
  const result = text(session.result).toLowerCase();
  const impactType = text(session.impactType ?? session.impact_type, 'task').toLowerCase();
  const value = text(session.value).toUpperCase();
  const durationMinutes = finiteNumber(
    session.durationMinutes ?? session.duration_minutes,
    0,
  );
  return (result === 'complete' || result === 'completed') &&
    impactType === 'task' &&
    (value === 'A' || value === 'S') &&
    durationMinutes >= 25;
}

/** Convert local or remote Session records to the reward engine's canonical shape. */
export function adaptSession(session = {}, options = {}) {
  const tags = Array.isArray(session.tags)
    ? session.tags.map(tag => text(tag).toLowerCase()).filter(Boolean)
    : [];
  const canonical = {
    id: text(session.id ?? session.sessionId ?? session.session_id),
    taskId: text(session.taskId ?? session.task_id),
    date: getSessionDate(session),
    occurredAt: getSessionOccurredAt(session),
    result: text(session.result).toLowerCase(),
    durationMinutes: Math.max(0, finiteNumber(
      session.durationMinutes ?? session.duration_minutes,
      0,
    )),
    impactType: text(session.impactType ?? session.impact_type, 'task').toLowerCase(),
    taskNature: text(session.taskNature ?? session.task_nature, 'growth').toLowerCase(),
    category: text(session.category).toLowerCase(),
    value: text(session.value).toUpperCase(),
    resistance: finiteNumber(session.resistance, 1),
    hiddenStat: text(
      session.hiddenStat ??
      session.hidden_stat ??
      session.hiddenStatKey ??
      session.metadata?.hiddenStat,
    ).toLowerCase(),
    hasProof: Boolean(
      session.hasProof ??
      session.proofId ??
      session.proof_id ??
      session.proofPhoto ??
      session.proof_photo,
    ),
    tags,
    deletedAt: text(
      session.deletedAt ??
      session.deleted_at ??
      session.reversedAt ??
      session.reversed_at,
    ),
    original: session,
  };
  canonical.isDeleted = isSessionDeleted(session);
  canonical.isValid = isValidRewardSession(session, options);
  const explicitProductive = session.isProductiveXP ?? session.is_productive_xp;
  canonical.isProductive = explicitProductive == null
    ? canonical.isValid && canonical.impactType === 'task' && canonical.value !== 'D'
    : canonical.isValid && Boolean(explicitProductive);
  canonical.isDailyMainQuestCandidate = isDailyMainQuestCandidate(session, options);
  return canonical;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function compareDuplicateSessions(left, right, options) {
  const safetyRank = session => {
    if (isSessionDeleted(session)) return 0;
    return isValidRewardSession(session, options) ? 2 : 1;
  };
  const rankOrder = safetyRank(left) - safetyRank(right);
  if (rankOrder) return rankOrder;

  const leftMs = Date.parse(getSessionOccurredAt(left));
  const rightMs = Date.parse(getSessionOccurredAt(right));
  if (Number.isFinite(leftMs) !== Number.isFinite(rightMs)) {
    return Number.isFinite(leftMs) ? -1 : 1;
  }
  if (Number.isFinite(leftMs) && leftMs !== rightMs) return leftMs - rightMs;
  return stableSerialize(left).localeCompare(stableSerialize(right));
}

/**
 * Collapse replayed/conflicting records by immutable Session id. Corrupt
 * conflicts fail closed (deleted/invalid beats rewardable), then use the
 * earliest occurrence and a stable payload ordering so input order is inert.
 */
export function dedupeSessionsById(sessions = [], options = {}) {
  if (!Array.isArray(sessions)) return [];
  const byId = new Map();
  for (const session of sessions) {
    const id = text(session?.id ?? session?.sessionId ?? session?.session_id);
    if (!id) continue;
    const current = byId.get(id);
    if (!current || compareDuplicateSessions(session, current, options) < 0) {
      byId.set(id, session);
    }
  }
  return [...byId.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([, session]) => session);
}

export function adaptSessions(sessions = [], options = {}) {
  return dedupeSessionsById(sessions, options)
    .map(session => adaptSession(session, options));
}

/** Stable earliest-first order: completion time, start time/date fallback, then id. */
export function compareSessionsEarliest(left, right) {
  const leftSession = left?.occurredAt ? left : adaptSession(left);
  const rightSession = right?.occurredAt ? right : adaptSession(right);
  const leftMs = Date.parse(leftSession.occurredAt);
  const rightMs = Date.parse(rightSession.occurredAt);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
    return leftMs - rightMs;
  }
  if (leftSession.date !== rightSession.date) {
    return leftSession.date.localeCompare(rightSession.date);
  }
  return leftSession.id.localeCompare(rightSession.id);
}

export const normalizeRewardSession = adaptSession;
