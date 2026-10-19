// AI-203B: the Companion's bounded `remind` only appears inside a fixed local
// window each day, so it never hangs over the home screen for the whole day.
// Pure time helpers plus a watcher that re-renders when the window opens or
// closes while a page stays open.

export const REMIND_WINDOW_START_HOUR = 12;
export const REMIND_WINDOW_END_HOUR = 14;

/** Whether `now` falls inside the local [12:00, 14:00) reminder window. */
export function isWithinRemindWindow(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const hour = now.getHours();
  return hour >= REMIND_WINDOW_START_HOUR && hour < REMIND_WINDOW_END_HOUR;
}

function nextBoundary(now) {
  for (const hour of [REMIND_WINDOW_START_HOUR, REMIND_WINDOW_END_HOUR]) {
    const boundary = new Date(now.getTime());
    boundary.setHours(hour, 0, 0, 0);
    if (boundary > now) return boundary;
  }
  return null;
}

/**
 * Call `onChange` when the reminder window opens or closes while the caller
 * stays mounted: a timer covers the next boundary today, and a visibility
 * check covers timers that a sleeping device delayed. Returns a cleanup that
 * cancels both; `onChange` may run that cleanup itself by re-rendering.
 */
export function watchRemindWindow(onChange, {
  now = () => new Date(),
  doc = globalThis.document,
} = {}) {
  let inside = isWithinRemindWindow(now());
  let timer = null;
  let disposed = false;

  function check() {
    if (disposed) return;
    const current = isWithinRemindWindow(now());
    if (current === inside) return;
    inside = current;
    onChange();
  }

  function arm() {
    if (disposed) return;
    clearTimeout(timer);
    const current = now();
    const boundary = nextBoundary(current);
    if (!boundary) return;
    timer = setTimeout(() => {
      check();
      arm();
    }, boundary.getTime() - current.getTime() + 1000);
  }

  function onVisibility() {
    if (doc?.hidden) return;
    check();
    arm();
  }

  arm();
  doc?.addEventListener?.('visibilitychange', onVisibility);
  return () => {
    disposed = true;
    clearTimeout(timer);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  };
}
