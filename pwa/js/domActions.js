// INFRA-113: the Content-Security-Policy in index.html allows no inline code,
// so buttons no longer carry `onclick="…"`. A clickable element names an action
// instead: `data-action="navigate" data-action-arg="home"`. One listener on the
// document runs it, so markup added later (page templates, banners) works too.
//
// Only the actions listed here run: markup that ends up in the page some other
// way cannot use `data-action` to call an arbitrary window function. The window
// functions are looked up when clicked, so the modules defining them may load
// in any order.

const ACTIONS = Object.freeze({
  // Auth screen
  switchAuthTab: tab => window.switchAuthTab(tab),
  loginWithGoogle: () => window.loginWithGoogle(),
  togglePasswordVisibility: () => window.togglePasswordVisibility(),
  showForgotPassword: () => window.showForgotPassword(),
  continueAsGuest: () => window.continueAsGuest(),
  // Navigation (bottom bar, header avatar, trial banner)
  navigate: page => window.navigate(page),
  dismissTrialBanner: () => window._dismissTrialBanner(),
  // Focus timer
  minimizeFocus: () => window.minimizeFocus(),
  togglePauseFocus: () => window.togglePauseFocus(),
  endFocus: () => window.endFocus(),
  skipFocus: () => window.skipFocus(),
  restoreFocus: () => window.restoreFocus(),
  // Level-up overlay
  closeLevelUp: () => window.closeLevelUp(),
  // Review page
  reviewSetMode: mode => window._reviewSetMode(mode),
  reviewPrevMonth: () => window._reviewPrevMonth(),
  reviewNextMonth: () => window._reviewNextMonth(),
  // Profile streak shield
  reshowShieldBanner: () => window.reshowShieldBanner(),
  showShieldInfo: (_arg, element) => window.showShieldInfo(element),
});

/**
 * Run the action of the innermost `[data-action]` element the click is in.
 * Only the innermost runs, as `event.stopPropagation()` in a nested inline
 * handler used to ensure (the shield info button inside the shield row).
 */
export function handleActionClick(event) {
  const element = typeof event.target?.closest === 'function' ? event.target.closest('[data-action]') : null;
  if (!element) return;
  const action = Object.hasOwn(ACTIONS, element.dataset.action) ? ACTIONS[element.dataset.action] : null;
  if (!action) return;
  action(element.dataset.actionArg, element, event);
}

export const DOM_ACTION_NAMES = Object.freeze(Object.keys(ACTIONS));

document.addEventListener('click', handleActionClick);
