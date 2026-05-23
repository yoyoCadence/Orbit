// Time-of-day atmosphere layer.
// Reads local hour and maps it to one of four bands, then sets
// data-time-band on <html> so CSS can apply subtle tints/adjustments.

export const TIME_BANDS = /** @type {const} */ ({
  morning: { label: '晨間', hours: [5,  10] },
  day:     { label: '白天', hours: [10, 17] },
  evening: { label: '傍晚', hours: [17, 21] },
  night:   { label: '深夜', hours: [21, 24] }, // 0–5 also maps to night
});

/** Returns the current time band key based on local hour. */
export function getTimeBand(hour = new Date().getHours()) {
  if (hour >= 5  && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** Applies the current time band to <html> as a data attribute. */
export function applyTimeBand() {
  const band = getTimeBand();
  document.documentElement.dataset.timeBand = band;
  return band;
}
