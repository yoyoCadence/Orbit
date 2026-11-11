/**
 * bug117-ios-header.test.js — BUG-117
 *
 * iOS 26.1+ blurs the top of a home-screen web app. WebKit skips that blur
 * when a fixed or sticky box spanning the top edge paints one solid colour; it
 * finds that box by hit-testing the top edge with pointer-events ignored, and
 * cannot under a black-translucent status bar. The fix: status bar `default`
 * (index.html) and, in the installed app on iOS only, a sticky, opaque header
 * above the time tint, without backdrop blur or sheen (style.css, BUG-117).
 *
 * Chromium neither matches `@supports (-webkit-touch-callout: none)` nor draws
 * the iOS blur, so this checks what it can:
 *   - outside iOS the header is unchanged;
 *   - with style.css served so that the iOS-only conditions hold (the rules
 *     stay where they are in the file), for every theme, both skins, with and
 *     without a background image and in every time band: the header is sticky
 *     at the top, opaque, with no background image, backdrop filter or
 *     ::after, and it is what a hit test at the top edge finds (pseudo-element
 *     hits count as their host, as in WebKit).
 * Whether iOS then skips the blur needs a device (tasks.md BUG-117A).
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');
const THEMES = [...new Set([...css.matchAll(/\[data-theme="([a-z-]+)"\] \{/g)].map(match => match[1]))];
const TIME_BANDS = ['morning', 'day', 'evening', 'night'];

/** style.css as an iOS home-screen app would apply it. */
function cssAsIosHomeScreen() {
  const conditions = ['@supports (-webkit-touch-callout: none)', '@media (display-mode: standalone)'];
  for (const condition of conditions) expect(css).toContain(condition);
  return css
    .replaceAll('@supports (-webkit-touch-callout: none)', '@supports (display: block)')
    .replaceAll('@media (display-mode: standalone)', '@media (min-width: 0px)');
}

async function openApp(page, { iosHomeScreen = false } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  if (iosHomeScreen) {
    const body = cssAsIosHomeScreen();
    await page.route('**/assets/style.css*', route => route.fulfill({ status: 200, contentType: 'text/css', body }));
  }
  await seedStorage(page, [FOCUS_TASK], [], GUEST_USER);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

function readHeader(page) {
  return page.evaluate(() => {
    const header = document.getElementById('header');
    const style = window.getComputedStyle(header);
    // WebKit's hit test ignores pointer-events; force them on to do the same.
    const probe = document.createElement('style');
    probe.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
    document.head.append(probe);
    const hit = document.elementFromPoint(window.innerWidth / 2, 4);
    probe.remove();
    return {
      position: style.position,
      top: style.top,
      background: style.backgroundColor,
      image: style.backgroundImage,
      backdrop: style.backdropFilter,
      after: window.getComputedStyle(header, '::after').display,
      topHit: hit?.closest('#header') ? 'header' : (hit?.id || hit?.tagName || 'nothing'),
    };
  });
}

test.describe('BUG-117 iOS home-screen header', () => {
  test.use({ serviceWorkers: 'block' });

  test('outside the iOS home-screen app the header is unchanged', async ({ page }) => {
    const html = await page.request.get('/').then(response => response.text());
    const styles = [...html.matchAll(/<meta name="apple-mobile-web-app-status-bar-style" content="([^"]*)">/g)];
    expect(styles.map(match => match[1])).toEqual(['default']);

    await openApp(page);
    expect((await readHeader(page)).position).toBe('static');
  });

  test('in the iOS home-screen app the header is the solid box at the top edge, in every look', async ({ page }) => {
    expect(THEMES.length).toBeGreaterThan(10);
    await openApp(page, { iosHomeScreen: true });

    const failures = [];
    for (const skin of ['classic', 'modern']) {
      for (const theme of THEMES) {
        for (const hasBg of [false, true]) {
          for (const band of TIME_BANDS) {
            await page.evaluate(({ skin, theme, hasBg, band }) => {
              const root = document.documentElement;
              root.setAttribute('data-ui-skin', skin);
              root.setAttribute('data-theme', theme);
              root.setAttribute('data-time-band', band);
              root.classList.toggle('has-bg', hasBg);
            }, { skin, theme, hasBg, band });
            const header = await readHeader(page);
            const ok = header.position === 'sticky' && header.top === '0px'
              && /^rgb\(\d+, \d+, \d+\)$/.test(header.background) && header.image === 'none'
              && header.backdrop === 'none' && header.after === 'none' && header.topHit === 'header';
            if (!ok) failures.push({ skin, theme, hasBg, band, ...header });
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
