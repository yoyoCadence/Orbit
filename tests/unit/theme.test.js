/**
 * @vitest-environment jsdom
 *
 * theme.test.js — TEST-004: pwa/js/theme.js. The theme and UI skin, Pro's
 * random theme of the day, the background image, and the Liquid Glass
 * reflection that follows the pointer or the device's tilt.
 *
 * storage.js and today() are mocked; the reflection keeps module state, so
 * each of its tests imports a fresh copy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  saveTheme: vi.fn(),
  saveUiSkin: vi.fn(),
  saveBgImage: vi.fn(),
  getRandomThemeEnabled: vi.fn(() => true),
  isProUser: vi.fn(() => true),
  getRandomThemeDate: vi.fn(() => null),
  saveRandomThemeDate: vi.fn(),
}));

vi.mock('../../pwa/js/storage.js', () => ({ storage }));
vi.mock('../../pwa/js/utils.js', () => ({ today: () => '2026-11-26' }));

const THEMES = [
  'dark-purple', 'aurora-blue', 'emerald', 'flame', 'neon-pink', 'light',
  'wabi', 'material', 'cyberpunk', 'liquid-galss', 'pixel', 'anime', 'gothic', 'github',
];

const root = document.documentElement;
const glassVars = () => Object.fromEntries(['--glass-angle', '--glass-sheen-x', '--glass-sheen-y',
  '--glass-rim-strength', '--glass-haze-x', '--glass-haze-y'].map(name => [name, root.style.getPropertyValue(name)]));

async function freshTheme() {
  vi.resetModules();
  return import('../../pwa/js/theme.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getRandomThemeEnabled.mockReturnValue(true);
  storage.isProUser.mockReturnValue(true);
  storage.getRandomThemeDate.mockReturnValue(null);
  root.removeAttribute('data-theme');
  root.removeAttribute('data-ui-skin');
  root.removeAttribute('style');
  root.className = '';
  document.body.removeAttribute('style');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('theme and skin', () => {
  it('applies and saves the theme', async () => {
    const { applyTheme } = await freshTheme();
    applyTheme('emerald');
    expect(root.dataset.theme).toBe('emerald');
    expect(storage.saveTheme).toHaveBeenCalledWith('emerald');
  });

  it('applies the modern skin, and the classic one for anything else', async () => {
    const { applyUiSkin } = await freshTheme();
    applyUiSkin('modern');
    expect(root.dataset.uiSkin).toBe('modern');
    for (const value of ['classic', 'neon', undefined]) {
      applyUiSkin(value);
      expect(root.dataset.uiSkin).toBe('classic');
      expect(storage.saveUiSkin).toHaveBeenLastCalledWith('classic');
    }
  });
});

describe('random theme of the day (Pro)', () => {
  it('picks one of the themes once a day and remembers the day', async () => {
    const { applyRandomThemeForToday } = await freshTheme();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    applyRandomThemeForToday();
    expect(root.dataset.theme).toBe(THEMES.at(-1));
    expect(storage.saveTheme).toHaveBeenCalledWith(THEMES.at(-1));
    expect(storage.saveRandomThemeDate).toHaveBeenCalledWith('2026-11-26');
    Math.random.mockReturnValue(0);
    applyRandomThemeForToday();
    expect(root.dataset.theme).toBe(THEMES[0]);
  });

  it('leaves the theme alone when switched off, without Pro, or already picked today', async () => {
    const { applyRandomThemeForToday } = await freshTheme();
    storage.getRandomThemeEnabled.mockReturnValue(false);
    applyRandomThemeForToday();
    storage.getRandomThemeEnabled.mockReturnValue(true);
    storage.isProUser.mockReturnValue(false);
    applyRandomThemeForToday();
    storage.isProUser.mockReturnValue(true);
    storage.getRandomThemeDate.mockReturnValue('2026-11-26');
    applyRandomThemeForToday();
    expect(storage.saveTheme).not.toHaveBeenCalled();
    expect(storage.saveRandomThemeDate).not.toHaveBeenCalled();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});

describe('background image', () => {
  it('saves and draws the image, and removes it', async () => {
    const { applyBgImage, removeBgImage } = await freshTheme();
    applyBgImage('data:image/png;base64,AAAA');
    expect(storage.saveBgImage).toHaveBeenLastCalledWith('data:image/png;base64,AAAA');
    expect(document.body.style.backgroundImage).toContain('data:image/png;base64,AAAA');
    expect(document.body.style.backgroundSize).toBe('cover');
    expect(document.body.style.backgroundAttachment).toBe('fixed');
    expect(root.classList.contains('has-bg')).toBe(true);
    removeBgImage();
    expect(storage.saveBgImage).toHaveBeenLastCalledWith(null);
    expect(document.body.style.backgroundImage).toBe('');
    expect(root.classList.contains('has-bg')).toBe(false);
  });
});

describe('Liquid Glass reflection', () => {
  function stubPlatform({ coarse = false, ua = 'Mozilla/5.0', requestPermission } = {}) {
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => frames.push(callback)));
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.matchMedia = vi.fn(() => ({ matches: coarse }));
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
    window.DeviceOrientationEvent = requestPermission ? { requestPermission } : function DeviceOrientationEvent() {};
    const listeners = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      (listeners[type] ||= []).push(listener);
    });
    const fire = (type, event = {}) => (listeners[type] || []).forEach(listener => listener(event));
    return { frames, listeners, fire };
  }

  const runFrames = (frames, timestamps) => {
    for (const time of timestamps) {
      const callback = frames.shift();
      if (!callback) return;
      callback(time);
    }
  };

  it('writes the resting reflection and follows the pointer, eased over frames, only in the Liquid Glass theme', async () => {
    const { initLiquidGlassReflection } = await freshTheme();
    const { frames, listeners, fire } = stubPlatform();
    initLiquidGlassReflection();
    expect(glassVars()).toEqual({
      '--glass-angle': '136deg', '--glass-sheen-x': '50%', '--glass-sheen-y': '34%',
      '--glass-rim-strength': '0.58', '--glass-haze-x': '50%', '--glass-haze-y': '36%',
    });
    expect(root.classList.contains('liquid-galss-lite-motion')).toBe(false);
    expect(root.classList.contains('liquid-galss-static-motion')).toBe(false);
    // No permission to ask: the tilt is followed from the start.
    expect(listeners.deviceorientation).toHaveLength(1);

    // Another theme: the pointer changes nothing.
    root.dataset.theme = 'emerald';
    fire('pointermove', { clientX: 0, clientY: 0 });
    expect(frames).toHaveLength(0);

    root.dataset.theme = 'liquid-galss';
    window.innerWidth = 1000;
    window.innerHeight = 800;
    fire('pointermove', { clientX: 1000, clientY: 0 });
    expect(frames).toHaveLength(1);
    // Frames closer than 32 ms wait; later ones ease toward the pointer.
    runFrames(frames, [100, 110]);
    const first = parseFloat(glassVars()['--glass-sheen-x']);
    expect(first).toBeGreaterThan(50);
    runFrames(frames, Array.from({ length: 200 }, (_, index) => 150 + index * 40));
    expect(frames).toHaveLength(0);
    // Settled on the target (sheen x 50 + 24), within the clamps.
    expect(parseFloat(glassVars()['--glass-sheen-x'])).toBeCloseTo(74, 0);
    expect(parseFloat(glassVars()['--glass-angle'])).toBeLessThanOrEqual(165);
  });

  it('follows the tilt, clamped, and stops when the theme changes', async () => {
    const { initLiquidGlassReflection } = await freshTheme();
    const { frames, fire } = stubPlatform();
    initLiquidGlassReflection();
    root.dataset.theme = 'liquid-galss';
    fire('deviceorientation', { gamma: 90, beta: -180 });
    expect(frames).toHaveLength(1);
    runFrames(frames, Array.from({ length: 200 }, (_, index) => 100 + index * 40));
    const vars = glassVars();
    // The tilt is capped at 42 degrees each way (gamma 90 and beta -180 count
    // as 42 and -42): angle 136 + 42 * 0.46 + 42 * 0.18, sheen x 50 + 42 * 0.62.
    expect(parseFloat(vars['--glass-angle'])).toBeCloseTo(162.88, 0);
    expect(parseFloat(vars['--glass-sheen-x'])).toBeCloseTo(76.04, 0);
    expect(parseFloat(vars['--glass-rim-strength'])).toBeCloseTo(0.82, 1);
    // A missing reading counts as level.
    fire('deviceorientation', { gamma: null, beta: undefined });
    root.dataset.theme = 'light';
    runFrames(frames, [99999]);
    expect(frames).toHaveLength(0);
  });

  it('updates at most every 280 ms on touch screens, with a softer rim, and ignores the pointer there', async () => {
    const { initLiquidGlassReflection } = await freshTheme();
    const { frames, fire } = stubPlatform({ coarse: true });
    let now = 1000;
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    initLiquidGlassReflection();
    expect(root.classList.contains('liquid-galss-lite-motion')).toBe(true);
    root.dataset.theme = 'liquid-galss';
    fire('pointermove', { clientX: 0, clientY: 0 });
    expect(glassVars()['--glass-sheen-x']).toBe('50%');
    fire('deviceorientation', { gamma: 42, beta: 0 });
    expect(frames).toHaveLength(0);
    // Written at once, a third of the way: 50 + (50 + 42 * 0.62 - 50) * 0.35.
    expect(parseFloat(glassVars()['--glass-sheen-x'])).toBeCloseTo(59.11, 1);
    now += 100;
    fire('deviceorientation', { gamma: -42, beta: 0 });
    expect(parseFloat(glassVars()['--glass-sheen-x'])).toBeCloseTo(59.11, 1);
    now += 300;
    fire('deviceorientation', { gamma: 42, beta: 42 });
    // The rim never goes past 0.64 on touch screens.
    for (let step = 0; step < 30; step += 1) {
      now += 300;
      fire('deviceorientation', { gamma: 42, beta: 42 });
    }
    expect(parseFloat(glassVars()['--glass-rim-strength'])).toBeLessThanOrEqual(0.64);
  });

  it('stays still in Chrome on iOS', async () => {
    const { initLiquidGlassReflection } = await freshTheme();
    const { frames, listeners, fire } = stubPlatform({ ua: 'Mozilla/5.0 (iPhone) CriOS/131.0' });
    initLiquidGlassReflection();
    expect(root.classList.contains('liquid-galss-static-motion')).toBe(true);
    expect(listeners.deviceorientation).toBeUndefined();
    root.dataset.theme = 'liquid-galss';
    fire('pointermove', { clientX: 10, clientY: 10 });
    fire('click');
    expect(frames).toHaveLength(0);
    expect(listeners.deviceorientation).toBeUndefined();
  });

  it('asks for motion permission once, on the first tap in the Liquid Glass theme (iOS Safari)', async () => {
    const { initLiquidGlassReflection } = await freshTheme();
    const requestPermission = vi.fn(() => Promise.resolve('granted'));
    const { listeners, fire } = stubPlatform({ requestPermission });
    initLiquidGlassReflection();
    expect(listeners.deviceorientation).toBeUndefined();
    // Not in the Liquid Glass theme: no prompt.
    fire('touchstart');
    expect(requestPermission).not.toHaveBeenCalled();
    root.dataset.theme = 'liquid-galss';
    fire('touchstart');
    fire('click');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(listeners.deviceorientation).toHaveLength(1));
  });

  it('does not follow the tilt when permission is refused or the prompt fails', async () => {
    for (const answer of [() => Promise.resolve('denied'), () => Promise.reject(new Error('not a gesture'))]) {
      const { initLiquidGlassReflection } = await freshTheme();
      const requestPermission = vi.fn(answer);
      const { listeners, fire } = stubPlatform({ requestPermission });
      initLiquidGlassReflection();
      root.dataset.theme = 'liquid-galss';
      fire('click');
      await Promise.resolve();
      await Promise.resolve();
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(listeners.deviceorientation).toBeUndefined();
      vi.restoreAllMocks();
    }
  });
});
