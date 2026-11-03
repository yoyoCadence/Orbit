// @vitest-environment jsdom
/**
 * csp.test.js — INFRA-113
 *
 * index.html sets a Content-Security-Policy that runs no inline code. These
 * checks keep the markup and the policy in step with the code:
 *   - no inline handler (`onclick="…"`) or inline <script> comes back;
 *   - every `data-action` names an action js/domActions.js runs;
 *   - the policy allows the Supabase host in js/config.js and exactly the two
 *     PDF libraries js/export.js loads;
 *   - the dispatcher runs only listed actions, and only the innermost one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOM_ACTION_NAMES, handleActionClick } from '../../pwa/js/domActions.js';

const PWA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pwa');
const read = path => readFileSync(join(PWA, path), 'utf8');
const indexHtml = read('index.html');

function appScripts(dir = join(PWA, 'js')) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return appScripts(path);
    return path.endsWith('.js') ? [relative(PWA, path)] : [];
  });
}

function policy() {
  const content = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(indexHtml)?.[1];
  expect(content).toBeTruthy();
  return Object.fromEntries(content.split(';').map(part => part.trim()).filter(Boolean)
    .map(part => { const [name, ...sources] = part.split(/\s+/); return [name, sources]; }));
}

describe('INFRA-113 Content-Security-Policy', () => {
  it('is the first thing in <head> after the charset, before any script or style', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
    const meta = head.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(head.indexOf('charset'));
    expect(meta).toBeLessThan(head.indexOf('<link'));
    expect(indexHtml.indexOf('<script')).toBeGreaterThan(meta);
  });

  it('runs no inline code: no handler attributes, no inline <script>, no javascript: URLs', () => {
    const files = { 'index.html': indexHtml, ...Object.fromEntries(appScripts().map(path => [path, read(path)])) };
    for (const [path, source] of Object.entries(files)) {
      expect(source.match(/\son[a-z]+=["']/gi), path).toBeNull();
      expect(source.match(/javascript:/gi), path).toBeNull();
    }
    expect(indexHtml.match(/<script(?![^>]*\ssrc=)[^>]*>/g)).toBeNull();
    const directives = policy();
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'none'"]);
  });

  it('names only actions the dispatcher runs', () => {
    const used = new Set();
    for (const source of [indexHtml, ...appScripts().map(read)]) {
      for (const match of source.matchAll(/data-action="([^"$]+)"/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(15);
    expect([...used].filter(name => !DOM_ACTION_NAMES.includes(name))).toEqual([]);
  });

  it('allows the Supabase host of js/config.js, and only it besides the site', () => {
    const url = /export const SUPABASE_URL\s*=\s*'([^']+)'/.exec(read('js/config.js'))?.[1];
    const origin = new URL(url).origin;
    const directives = policy();
    expect(directives['connect-src']).toEqual(["'self'", origin]);
    expect(directives['img-src']).toEqual(["'self'", 'data:', 'blob:', origin]);
  });

  it('allows exactly the two PDF libraries js/export.js loads (with SRI)', () => {
    const exportJs = read('js/export.js');
    const sources = [...exportJs.matchAll(/src:\s*'(https:[^']+)'/g)].map(match => match[1]);
    expect(sources).toHaveLength(2);
    expect(policy()['script-src']).toEqual(["'self'", "'unsafe-eval'", ...sources]);
  });
});

describe('data-action dispatcher', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const click = element => handleActionClick({ target: element });

  it('runs the named window function with its argument', () => {
    window.navigate = vi.fn();
    document.body.innerHTML = '<button data-action="navigate" data-action-arg="review"><span>Go</span></button>';
    click(document.querySelector('span'));
    expect(window.navigate).toHaveBeenCalledWith('review');
  });

  it('runs only the innermost action (the info button inside the shield row)', () => {
    window.reshowShieldBanner = vi.fn();
    window.showShieldInfo = vi.fn();
    document.body.innerHTML = '<div data-action="reshowShieldBanner"><button data-action="showShieldInfo">?</button></div>';
    const button = document.querySelector('button');
    click(button);
    expect(window.showShieldInfo).toHaveBeenCalledWith(button);
    expect(window.reshowShieldBanner).not.toHaveBeenCalled();
  });

  it('ignores an unlisted action, including Object.prototype names', () => {
    window.signOut = vi.fn();
    for (const name of ['signOut', 'toString', 'constructor', '__proto__']) {
      document.body.innerHTML = `<button data-action="${name}">x</button>`;
      expect(() => click(document.querySelector('button')), name).not.toThrow();
    }
    expect(window.signOut).not.toHaveBeenCalled();
  });

  it('is installed on the document', () => {
    window.closeLevelUp = vi.fn();
    document.body.innerHTML = '<button data-action="closeLevelUp">ok</button>';
    document.querySelector('button').click();
    expect(window.closeLevelUp).toHaveBeenCalledTimes(1);
  });
});
