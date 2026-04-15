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
