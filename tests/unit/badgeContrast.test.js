/**
 * badgeContrast.test.js — PRO-014F1 follow-up
 *
 * The Pro badges, the leaderboard's "你" badge and its letter avatars put
 * small bold text on the theme's primary colour. White on a light primary
 * (liquid-galss #eaff35, pixel #39ff14, ...) is about 1.1–1.7:1, so those
 * themes set `--on-primary`. Every theme must reach 4.5:1 (WCAG AA, small text).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../pwa/assets/style.css', import.meta.url), 'utf8');

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

const themes = [...css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)]
  .map(([, name, body]) => ({
    name,
    primary: /--primary:\s*(#[0-9a-f]{3,6})\b/i.exec(body)?.[1],
    onPrimary: /--on-primary:\s*(#[0-9a-f]{3,6})\b/i.exec(body)?.[1] ?? '#ffffff',
  }))
  .filter(theme => theme.primary);

describe('text on the primary colour', () => {
  it('finds the themes', () => {
    expect(themes.length).toBeGreaterThanOrEqual(14);
    expect(themes.map(t => t.name)).toEqual(expect.arrayContaining(['liquid-galss', 'pixel', 'dark-purple']));
  });

  it.each(themes.map(t => [t.name, t]))('%s reaches 4.5:1', (_name, theme) => {
    expect(contrast(theme.primary, theme.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('the badges and letter avatars use it', () => {
    for (const selector of ['\n.pro-badge {', '\n.pro-badge--inline {', '\n.pro-badge--corner {', '\n.lb-you  {', '\n.lb-avatar {']) {
      const start = css.indexOf(selector);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      const rule = css.slice(start, css.indexOf('}', start));
      expect(rule, selector).toMatch(/background: var\(--primary\); color: var\(--on-primary, #fff\);/);
    }
  });
});
