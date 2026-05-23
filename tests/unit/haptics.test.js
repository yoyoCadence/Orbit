import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, pulseSuccess, supportsHaptics, triggerHaptic } from '../../pwa/js/platform/haptics.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('platform haptics', () => {
  it('returns false when vibrate is unavailable', () => {
    vi.stubGlobal('navigator', {});

    expect(supportsHaptics()).toBe(false);
    expect(triggerHaptic()).toBe(false);
  });

  it('triggers named vibration patterns', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    expect(haptic('levelUp')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.levelUp);
  });

  it('falls back to tap for unknown event names', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    haptic('missing-event');
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.tap);
  });

  it('keeps pulseSuccess mapped to taskComplete', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    pulseSuccess();
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.taskComplete);
  });
});
