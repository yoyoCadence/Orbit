// AI-203B: the Companion's bounded `remind` only appears inside a fixed local
// window each day, so it never hangs over the home screen for the whole day.
// Pure time helpers plus a watcher that re-renders when the window opens or
// closes while a page stays open. PS-251B: the same re-render when the time
// band changes, so the room's lighting and the view outside the window change
// on time.

import { getTimeBand, TIME_BANDS } from '../../timeBand.js';

export const REMIND_WINDOW_START_HOUR = 12;
export const REMIND_WINDOW_END_HOUR = 14;

/** Whether `now` falls inside the local [12:00, 14:00) reminder window. */
export function isWithinRemindWindow(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const hour = now.getHours();
  return hour >= REMIND_WINDOW_START_HOUR && hour < REMIND_WINDOW_END_HOUR;
}

// The hours at which the reminder window or the time band (05, 10, 17, 21)
// changes, in order.
const BOUNDARY_HOURS = [...new Set([
  REMIND_WINDOW_START_HOUR,
  REMIND_WINDOW_END_HOUR,
  ...Object.values(TIME_BANDS).map(band => band.hours[0]),
])].sort((left, right) => left - right);

function nextBoundary(now) {
  for (const hour of BOUNDARY_HOURS) {
    const boundary = new Date(now.getTime());
    boundary.setHours(hour, 0, 0, 0);
    if (boundary > now) return boundary;
  }
  // Past today's last boundary: a page left open overnight takes tomorrow's.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, BOUNDARY_HOURS[0]);
}

// What a re-render depends on: inside the reminder window, and the time band.
function stateAt(now) {
  return `${isWithinRemindWindow(now)}|${getTimeBand(now.getHours())}`;
}

/**
 * Call `onChange` when the reminder window opens or closes, or the time band
 * changes (PS-251B), while the caller stays mounted: a timer covers the next
 * boundary, and a visibility check covers timers that a sleeping device
 * delayed. Returns a cleanup that cancels both; `onChange` may run that
 * cleanup itself by re-rendering.
 */
export function watchRemindWindow(onChange, {
  now = () => new Date(),
  doc = globalThis.document,
} = {}) {
  let state = stateAt(now());
  let timer = null;
  let disposed = false;

  function check() {
    if (disposed) return;
    const current = stateAt(now());
    if (current === state) return;
    state = current;
    onChange();
  }

  function arm() {
    if (disposed) return;
    clearTimeout(timer);
    const current = now();
    const boundary = nextBoundary(current);
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

// The window opening or closing is not something the user did, so the
// re-render it causes must keep their place: these controls are matched to
// their twins in the new markup by attribute value and position.
const CONTROL_ATTRIBUTES = [
  'data-orbit-open-world',
  'data-orbit-project',
  'data-orbit-companion',
  'data-orbit-main-quest',
  'data-v2-mode',
  'data-v2-open-detail',
  'data-v2-close-detail',
  'data-v2-main-quest',
  'data-v2-appearance',
];

function controlsMatching(root, { name, value }) {
  return [...root.querySelectorAll(`[${name}]`)].filter(element => element.getAttribute(name) === value);
}

/** Describe a control inside `root` so `findControl()` can locate its twin after a re-render. */
export function describeControl(root, element) {
  if (!root || !element || element === root || !root.contains(element)) return null;
  const heading = element.matches('[data-v2-detail] h2')
    ? element.closest('[data-v2-detail]')
    : null;
  const target = heading || element;
  const name = heading ? 'data-v2-detail' : CONTROL_ATTRIBUTES.find(attribute => element.hasAttribute(attribute));
  if (!name) return null;
  const key = { name, value: target.getAttribute(name), heading: Boolean(heading) };
  return { ...key, index: controlsMatching(root, key).indexOf(target) };
}

/** Find the control a `describeControl()` key described, or null. */
export function findControl(root, key) {
  if (!root || !key) return null;
  const target = controlsMatching(root, key)[key.index] || null;
  return key.heading ? target?.querySelector('h2') || null : target;
}
