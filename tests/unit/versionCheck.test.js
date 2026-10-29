/**
 * versionCheck.test.js — INFRA-108
 *
 * The rule CI applies to every pull request: a change to the deployed pwa/
 * must bump the version, because since INFRA-107 the service worker never
 * refreshes a version's cached HTML and code, so only a new CACHE name brings
 * a change to installed apps.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cacheName,
  checkVersionBump,
  compareVersions,
  deployedChanges,
} from '../../scripts/versionCheckLib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sw = version => `// Service Worker\nconst CACHE = 'orbit-v${version}';\nconst SHELL = [];\n`;
const at = version => ({ version, swSource: sw(version) });

describe('INFRA-108 version check', () => {
  it('needs no bump when nothing deployed changed', () => {
    for (const changedFiles of [[], ['tasks.md', 'docs/x.md'], ['tests/unit/a.test.js'], ['pwa/server.cjs']]) {
      expect(checkVersionBump({ changedFiles, base: at('1.41.1'), head: at('1.41.1') }).ok, changedFiles.join()).toBe(true);
    }
  });

  it('fails a pwa/ change that keeps the CACHE name, and says how to fix it', () => {
    const result = checkVersionBump({ changedFiles: ['pwa/js/app.js', 'tasks.md'], base: at('1.41.1'), head: at('1.41.1') });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('pwa/js/app.js');
    expect(result.message).toContain('orbit-v1.41.1');
    expect(result.message).toContain('npm run bump');
  });

  it('passes a pwa/ change with a patch, minor or major bump', () => {
    for (const next of ['1.41.2', '1.42.0', '2.0.0']) {
      expect(checkVersionBump({ changedFiles: ['pwa/sw.js'], base: at('1.41.1'), head: at(next) }), next)
        .toMatchObject({ ok: true });
    }
  });

  it('fails a version that went backwards, or a CACHE that disagrees with package.json', () => {
    expect(checkVersionBump({ changedFiles: ['pwa/index.html'], base: at('1.41.1'), head: at('1.41.0') }).ok).toBe(false);
    expect(checkVersionBump({
      changedFiles: ['pwa/index.html'],
      base: at('1.41.1'),
      head: { version: '1.41.2', swSource: sw('1.41.3') },
    })).toMatchObject({ ok: false, message: expect.stringContaining('does not match') });
  });

  it('treats every deployed file the same, art included', () => {
    expect(deployedChanges([
      'pwa/assets/personal-space/v2/workspace/window/exterior-morning.webp',
      'pwa/server.cjs',
      'pwa/index.html',
      'art-pipeline/ps251-window/render_window.py',
      'README.md',
    ])).toEqual(['pwa/assets/personal-space/v2/workspace/window/exterior-morning.webp', 'pwa/index.html']);
  });

  it('compares versions numerically and reads the CACHE name', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.41.1', '1.41.1')).toBe(0);
    expect(() => compareVersions('1.41', '1.41.1')).toThrow();
    expect(cacheName(sw('1.41.1'))).toBe('orbit-v1.41.1');
    expect(cacheName('no cache here')).toBeNull();
    expect(cacheName(readFileSync(join(ROOT, 'pwa', 'sw.js'), 'utf8')))
      .toBe(`orbit-v${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}`);
  });

  it('runs against a real git history the way CI does', () => {
    // A throwaway repository: a base commit, then a branch that changes pwa/.
    const dir = mkdtempSync(join(tmpdir(), 'infra108-'));
    const script = join(ROOT, 'scripts', 'check-version-bump.mjs');
    const run = (...args) => execFileSync(args[0], args.slice(1), { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const write = (path, content) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    };
    const check = () => {
      try {
        return { ok: true, output: run('node', script, 'main') };
      } catch (error) {
        return { ok: false, output: `${error.stdout}${error.stderr}` };
      }
    };
    try {
      run('git', 'init', '-q', '-b', 'main');
      run('git', 'config', 'user.email', 'ci@example.test');
      run('git', 'config', 'user.name', 'CI');
      write('package.json', JSON.stringify({ version: '1.41.1' }));
      write('pwa/sw.js', sw('1.41.1'));
      write('pwa/js/app.js', 'export {};\n');
      run('git', 'add', '-A');
      run('git', 'commit', '-q', '--no-gpg-sign', '-m', 'base');
      run('git', 'checkout', '-q', '-b', 'feature');

      write('docs.md', 'notes\n');
      run('git', 'add', '-A');
      run('git', 'commit', '-q', '--no-gpg-sign', '-m', 'docs only');
      expect(check().ok).toBe(true);

      write('pwa/js/app.js', 'export const changed = true;\n');
      run('git', 'add', '-A');
      run('git', 'commit', '-q', '--no-gpg-sign', '-m', 'code without a bump');
      const failed = check();
      expect(failed.ok).toBe(false);
      expect(failed.output).toContain('pwa/js/app.js');

      write('package.json', JSON.stringify({ version: '1.41.2' }));
      write('pwa/sw.js', sw('1.41.2'));
      run('git', 'add', '-A');
      run('git', 'commit', '-q', '--no-gpg-sign', '-m', 'bump');
      expect(check().ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
