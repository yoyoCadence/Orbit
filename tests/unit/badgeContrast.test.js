/**
 * badgeContrast.test.js — PRO-014F1 follow-up
 *
 * The Pro badges, the leaderboard's "你" badge and its letter avatars put
 * small bold text on the theme's primary colour (and so does the active
 * leaderboard tab). White on a light primary
 * (liquid-galss #eaff35, pixel #39ff14, ...) is about 1.1–1.7:1, so those
 * themes set `--on-primary`. Every theme must reach 4.5:1 (WCAG AA, small text).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');
const themeJs = readFileSync(new URL('../../pwa/js/theme.js', import.meta.url), 'utf8');
// Every theme the settings page offers (theme.js), so none can be skipped.
const THEME_IDS = [...(/const _ALL_THEME_IDS = \[([^\]]*)\]/.exec(themeJs)?.[1] ?? '').matchAll(/'([^']+)'/g)]
  .map(match => match[1]);

function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Each theme's own block: `[data-theme="x"] {` starting its line, or the
// default's `:root, [data-theme="dark-purple"] {`.
const themes = THEME_IDS.map(name => {
  const body = new RegExp(`(^|\\n)(:root, )?\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[3] ?? '';
  return {
    name,
    primary: /--primary:\s*(#[0-9a-f]{6}|#[0-9a-f]{3});/i.exec(body)?.[1],
    onPrimary: /--on-primary:\s*(#[0-9a-f]{6}|#[0-9a-f]{3});/i.exec(body)?.[1] ?? '#ffffff',
  };
});

describe('text on the primary colour', () => {
  it('finds every theme, each with a hex primary colour in its own block', () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(14);
    expect(THEME_IDS).toEqual(expect.arrayContaining(['liquid-galss', 'pixel', 'dark-purple']));
    expect(themes.filter(theme => !theme.primary).map(theme => theme.name)).toEqual([]);
  });

  it.each(THEME_IDS)('%s reaches 4.5:1', name => {
    const theme = themes.find(entry => entry.name === name);
    expect(contrast(theme.primary, theme.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('the badges and letter avatars use it', () => {
    const selectors = ['\n.pro-badge {', '\n.pro-badge--inline {', '\n.pro-badge--corner {', '\n.lb-you  {', '\n.lb-avatar {', '\n.lb-tab.active {'];
    for (const selector of selectors) {
      const start = css.indexOf(selector);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      const rule = css.slice(start, css.indexOf('}', start));
      expect(rule, selector).toMatch(/background: var\(--primary\); color: var\(--on-primary, #fff\);/);
    }
  });
});
