/**
 * bug117-ios-header.test.js — BUG-117
 *
 * iOS 26.1+ blurs the top of a home-screen web app. WebKit skips that blur
 * when a full-width fixed/sticky box at the top edge paints one solid colour,
 * which it cannot do under a black-translucent status bar. The fix: status bar
 * `default` (index.html) and, in the installed app on iOS only, a sticky,
 * opaque header without backdrop blur or sheen (style.css, BUG-117 block).
 *
 * Chromium neither matches `@supports (-webkit-touch-callout: none)` nor draws
 * the iOS blur, so this checks what it can:
 *   - outside iOS the block does not apply (the header is unchanged);
 *   - the block's rules, applied as written, win over every theme, both skins
 *     and a background image: the header ends sticky at the top, opaque, with
 *     no backdrop filter, no background image and no ::after sheen.
 * Whether iOS then skips the blur needs a device (tasks.md BUG-117).
 */

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, mockSupabase, seedStorage } from './support/seed.js';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');
const THEMES = [...new Set([...css.matchAll(/\[data-theme="([a-z-]+)"\] \{/g)].map(match => match[1]))];

/** The rules inside the BUG-117 `@supports (-webkit-touch-callout: none)` block. */
function iosStandaloneRules() {
  const start = css.indexOf('BUG-117: iOS home-screen app');
  const open = css.indexOf('@supports (-webkit-touch-callout: none) {', start);
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', open) + 1, i);
  }
  throw new Error('BUG-117 block not found');
}

async function openApp(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await seedStorage(page, [FOCUS_TASK], [], GUEST_USER);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
}

function readHeader(page) {
  return page.evaluate(() => {
    const header = document.getElementById('header');
    const style = window.getComputedStyle(header);
    return {
      position: style.position,
      top: style.top,
      background: style.backgroundColor,
      image: style.backgroundImage,
      backdrop: style.backdropFilter,
      after: window.getComputedStyle(header, '::after').display,
      width: header.getBoundingClientRect().width,
    };
  });
}

const alpha = color => {
  const match = /rgba?\(([^)]+)\)/.exec(color);
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? Number(parts[3]) : 1;
};

test.describe('BUG-117 iOS home-screen header', () => {
  test('outside the iOS home-screen app the header is unchanged', async ({ page }) => {
    const html = await page.request.get('/').then(response => response.text());
    const styles = [...html.matchAll(/<meta name="apple-mobile-web-app-status-bar-style" content="([^"]*)">/g)];
    expect(styles.map(match => match[1])).toEqual(['default']);

    await openApp(page);
    expect((await readHeader(page)).position).toBe('static');
  });

  test('the rules win over every theme, both skins and a background image', async ({ page }) => {
    expect(THEMES.length).toBeGreaterThan(10);
    await openApp(page);
    await page.addStyleTag({ content: iosStandaloneRules() });

    const failures = [];
    for (const skin of ['classic', 'modern']) {
      for (const theme of THEMES) {
        for (const hasBg of [false, true]) {
          await page.evaluate(({ skin, theme, hasBg }) => {
            const root = document.documentElement;
            root.setAttribute('data-ui-skin', skin);
            root.setAttribute('data-theme', theme);
            root.classList.toggle('has-bg', hasBg);
          }, { skin, theme, hasBg });
          const header = await readHeader(page);
          const ok = header.position === 'sticky' && header.top === '0px'
            && alpha(header.background) === 1 && header.image === 'none'
            && header.backdrop === 'none' && header.after === 'none';
          if (!ok) failures.push({ skin, theme, hasBg, ...header });
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
