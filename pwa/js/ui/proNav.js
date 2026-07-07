// Single entry point for "upgrade to Pro" navigation.
// Sets the highlight flag, optionally navigates to the settings page, then
// scrolls to the Pro card. window._scrollToProCard is bound while settings
// renders, so cross-page callers wait 300ms for that render to happen;
// callers already on the settings page skip navigation and scroll sooner.

import { FLAG_PRO_HIGHLIGHT } from '../flags.js';

export function goToProCard({ navigate = true, delayMs = 300 } = {}) {
  sessionStorage.setItem(FLAG_PRO_HIGHLIGHT, '1');
  if (navigate) window.navigate('settings');
  setTimeout(() => window._scrollToProCard?.(), delayMs);
}
