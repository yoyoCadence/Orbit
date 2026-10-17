// Home-page location hint (HW-107).
// Renders only when the owner opted in and saved at least one place; otherwise
// the slot stays hidden and no position is ever requested. Suggestions are
// plain rules over existing task fields — no new task data is introduced.

import {
  getCoarsePosition,
  loadPlaceContext,
  resolvePlaceLabel,
  supportsGeolocation,
} from '../platform/placeContext.js';
import { escHtml } from '../utils.js';

export const PLACE_TEXT = Object.freeze({ home: '📍 在家', work: '📍 在公司', outside: '📍 在外面' });

const PLACE_TASK_RULES = {
  home:    task => ['maintenance', 'recovery'].includes(task.taskNature),
  work:    task => task.impactType === 'task' && ['growth', 'obligation'].includes(task.taskNature),
  outside: task => task.category === 'instant',
};

/** Up to `limit` tasks that fit the place; entertainment is never suggested. */
export function suggestTasksForPlace(label, tasks = [], limit = 3) {
  const rule = PLACE_TASK_RULES[label];
  if (!rule) return [];
  return (Array.isArray(tasks) ? tasks : [])
    .filter(task => task && task.impactType !== 'entertainment' && rule(task))
    .slice(0, limit);
}

// Home re-renders often; one coarse fix per 10 minutes is plenty for a label.
const CACHE_MS = 10 * 60 * 1000;
let _cache = null;

export function resetPlaceHintCache() {
  _cache = null;
}

/**
 * Fills `slot` with the current place and matching tasks.
 * @returns {Promise<string|null>} the label shown, or null when nothing rendered.
 */
export async function mountPlaceHint(slot, { ownerId, tasks = [], now = Date.now } = {}) {
  if (!slot) return null;
  const context = loadPlaceContext(ownerId);
  if (!context.enabled || !Object.keys(context.places).length || !supportsGeolocation()) return null;

  let label;
  if (_cache && _cache.ownerId === ownerId && now() - _cache.at < CACHE_MS) {
    label = _cache.label;
  } else {
    try {
      label = resolvePlaceLabel(await getCoarsePosition(), context.places);
    } catch {
      return null;   // denied, timed out, or unavailable: show nothing
    }
    _cache = { ownerId, label, at: now() };
  }

  // Home may have re-rendered while the fix was pending.
  if (!slot.isConnected) return null;
  const picks = suggestTasksForPlace(label, tasks);
  slot.innerHTML = `${PLACE_TEXT[label]}${picks.length
    ? ` · 適合：${picks.map(task => escHtml(task.name)).join('、')}`
    : ''}`;
  slot.hidden = false;
  return label;
}
