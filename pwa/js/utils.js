// Shared utility functions

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Returns today's local calendar date as YYYY-MM-DD (fixes UTC offset bug). */
export function today() {
  return new Date().toLocaleDateString('sv'); // 'sv' locale → YYYY-MM-DD
}

/**
 * Returns the "effective" date for session recording.
 * If the current hour is before newDayHour (default 5am), it's still
 * considered the previous calendar day (e.g. staying up past midnight).
 */
export function effectiveToday(newDayHour = 5) {
  const now = new Date();
  if (now.getHours() < newDayHour) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('sv');
  }
  return now.toLocaleDateString('sv');
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const todayStr = today();
  if (dateStr === todayStr) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toLocaleDateString('sv')) return '昨天';
  return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
}

export function getSessionTimestamp(session = {}) {
  const fallbackDate = session.date ? `${session.date}T00:00:00` : '';
  const raw = session.completedAt || session.startedAt || fallbackDate;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

export function sortSessionsNewestFirst(sessions = []) {
  return [...sessions].sort((a, b) => {
    const byTime = getSessionTimestamp(b) - getSessionTimestamp(a);
    if (byTime !== 0) return byTime;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function mergeSessionsById(remoteSessions = [], localSessions = []) {
  const byId = new Map();

  localSessions.forEach(session => {
    if (session?.id) byId.set(session.id, { ...session });
  });

  remoteSessions.forEach(session => {
    if (!session?.id) return;
    const local = byId.get(session.id) || {};
    const merged = {
      ...local,
      ...session,
      note: local.note ?? session.note,
      taskIconImg: local.taskIconImg ?? session.taskIconImg ?? null,
    };
    delete merged._syncPending;
    byId.set(session.id, merged);
  });

  return sortSessionsNewestFirst([...byId.values()]);
}
