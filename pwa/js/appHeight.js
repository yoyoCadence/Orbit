// BUG-117: the height of the app shell (`--app-height`).
//
// app.js has always set it to the visible viewport height plus the bottom safe
// area (`--sab`). Under the old black-translucent status bar the iOS home-screen
// app measured short by that inset, and adding it filled the screen.
//
// With the status bar at `default` the iOS home-screen app starts below an
// opaque status bar, its top safe area is 0, and the viewport already reaches
// the bottom edge (other projects measured innerHeight = screen − status bar).
// Adding the inset there would push the bottom nav's home-indicator padding
// off screen (body hides overflow). Everywhere else nothing changes, including
// an icon added before the change that iOS still opens translucent (top inset
// above 0).
//
// INFRA-105: a new module; app.js imports only this new export.

/**
 * @param {{ viewportHeight: number, safeBottom: number, safeTop: number, iosHomeScreen: boolean }} metrics
 * @returns {number} the shell height in CSS pixels
 */
export function appShellHeight({ viewportHeight, safeBottom, safeTop, iosHomeScreen }) {
  const belowOpaqueStatusBar = iosHomeScreen && safeTop === 0;
  return Math.round(viewportHeight + (belowOpaqueStatusBar ? 0 : safeBottom));
}
