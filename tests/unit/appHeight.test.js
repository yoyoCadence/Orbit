/**
 * appHeight.test.js — BUG-117
 *
 * `--app-height` is the visible viewport plus the bottom safe area, except in
 * the iOS home-screen app below an opaque (`default`) status bar, whose
 * viewport already reaches the bottom edge. See pwa/js/appHeight.js.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appShellHeight } from '../../pwa/js/appHeight.js';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('appShellHeight()', () => {
  it('iOS home-screen app below an opaque status bar: the viewport as is', () => {
    // iPhone 16 Pro portrait: 874 screen − 62 status bar, home indicator 34.
    expect(appShellHeight({ viewportHeight: 812, safeBottom: 34, safeTop: 0, iosHomeScreen: true })).toBe(812);
  });

  it('an icon iOS still opens translucent (top inset above 0): unchanged, inset added', () => {
    expect(appShellHeight({ viewportHeight: 840, safeBottom: 34, safeTop: 62, iosHomeScreen: true })).toBe(874);
  });

  it('browsers and Android: unchanged, inset added', () => {
    expect(appShellHeight({ viewportHeight: 700, safeBottom: 34, safeTop: 0, iosHomeScreen: false })).toBe(734);
    expect(appShellHeight({ viewportHeight: 640.4, safeBottom: 0, safeTop: 0, iosHomeScreen: false })).toBe(640);
  });
});

describe('wiring', () => {
  it('app.js feeds it the safe areas from CSS and navigator.standalone', () => {
    const app = read('pwa/js/app.js');
    expect(app).toContain("import { appShellHeight } from './appHeight.js';");
    expect(app).toMatch(/safeTop: parseFloat\(rootStyle\.getPropertyValue\('--sat'\)\)/);
    expect(app).toMatch(/iosHomeScreen: window\.navigator\.standalone === true/);
    expect(read('pwa/assets/style.css')).toMatch(/--sat: env\(safe-area-inset-top, 0px\);/);
  });

  it('is in the service worker shell (INFRA-105: a new module)', () => {
    expect(read('pwa/sw.js')).toContain("  './js/appHeight.js',\n");
  });
});
