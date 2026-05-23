// PWA App Badge adapter.
// Uses the navigator.setAppBadge API where available (Android Chrome, desktop PWA).
// All calls are silent no-ops on unsupported platforms.

export function supportsBadge() {
  return typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
}

/** Set the badge count. Pass 0 to clear, or omit for a dot badge. */
export async function setBadge(count) {
  if (!supportsBadge()) return;
  try {
    if (count === 0) {
      await navigator.clearAppBadge();
    } else {
      await navigator.setAppBadge(count);
    }
  } catch {
    // Badge permission may be denied silently; ignore.
  }
}

export async function clearBadge() {
  return setBadge(0);
}

// ── Local notification reminder shell ─────────────────────────────────────────
// Placeholder: schedules a one-off Notification after `delayMs`.
// No push server involved — requires Notification permission.

export function scheduleLocalReminder({ title, body, delayMs } = {}) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  setTimeout(() => {
    try { new Notification(title || 'Orbit', { body: body || '' }); } catch { /* ignore */ }
  }, delayMs ?? 0);
}
