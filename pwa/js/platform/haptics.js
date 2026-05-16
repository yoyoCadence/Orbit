export const HAPTIC_PATTERNS = {
  tap: 8,
  taskComplete: [12, 18, 28],
  focusStart: 10,
  focusMilestone: [10, 24, 16],
  warning: [24, 28, 24],
  levelUp: [18, 30, 18, 30, 36],
  unlock: [16, 22, 42],
  purchase: [10, 18, 24],
};

export function supportsHaptics() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function triggerHaptic(pattern = HAPTIC_PATTERNS.tap) {
  if (!supportsHaptics()) return false;
  navigator.vibrate(pattern);
  return true;
}

export function haptic(eventName = 'tap') {
  return triggerHaptic(HAPTIC_PATTERNS[eventName] ?? HAPTIC_PATTERNS.tap);
}

export function pulseSuccess() {
  return haptic('taskComplete');
}
