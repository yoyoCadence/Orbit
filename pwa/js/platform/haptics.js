export function supportsHaptics() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function triggerHaptic(pattern = 12) {
  if (!supportsHaptics()) return false;
  navigator.vibrate(pattern);
  return true;
}

export function pulseSuccess() {
  return triggerHaptic([12, 18, 24]);
}
