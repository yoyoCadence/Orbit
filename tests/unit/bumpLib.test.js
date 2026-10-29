import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  changelogWithStub,
  packageLockWithVersion,
  replaceMarker,
  roadmapWithVersion,
} from '../../scripts/bumpLib.mjs';

let dir;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bumplib-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('packageLockWithVersion', () => {
  it('updates the root and packages[""] versions', () => {
    const lock = JSON.parse(packageLockWithVersion(`${JSON.stringify({
      name: 'orbit', version: '1.0.0', packages: { '': { name: 'orbit', version: '1.0.0' } },
    }, null, 2)}\n`, '1.2.3'));
    expect(lock.version).toBe('1.2.3');
    expect(lock.packages[''].version).toBe('1.2.3');
  });

  it('fails closed when packages[""] is missing', () => {
    expect(() => packageLockWithVersion(JSON.stringify({ name: 'orbit', version: '1.0.0', packages: {} }), '1.2.3'))
      .toThrow(/root package entry/);
  });

  it('fails closed when the lockfile is invalid JSON', () => {
    expect(() => packageLockWithVersion('{ not valid json', '1.2.3')).toThrow(/unreadable or invalid JSON/);
  });
});

describe('roadmapWithVersion', () => {
  it('updates the 目前版本 marker', () => {
    expect(roadmapWithVersion('# Roadmap\n\n目前版本：**v1.0.0**\n\nbody\n', 'v1.2.3')).toContain('目前版本：**v1.2.3**');
  });

  it('fails closed when the 目前版本 marker is absent', () => {
    expect(() => roadmapWithVersion('# Roadmap\n\nno version marker here\n', 'v1.2.3')).toThrow(/not found/);
  });
});

describe('replaceMarker', () => {
  it('fails closed when the pattern is absent', () => {
    expect(() => replaceMarker('const A = 1;\n', /const B = \d;/, 'const B = 2;', 'sample.js')).toThrow(/not found in sample\.js/);
  });
});

describe('changelogWithStub', () => {
  it('puts the new entry above the newest one', () => {
    const next = changelogWithStub('# Changelog\n\n## [1.0.0] - 2026-01-01\n\n- old\n', '1.0.1', '2026-02-02');
    expect(next.indexOf('## [1.0.1] - 2026-02-02')).toBeLessThan(next.indexOf('## [1.0.0]'));
  });
});

describe('npm run bump', () => {
  // Copies the script into a throwaway repository layout and runs it there.
  const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
  const FILES = {
    'package.json': `${JSON.stringify({ name: 'orbit', version: '1.0.0' }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({ name: 'orbit', version: '1.0.0', packages: { '': { version: '1.0.0' } } }, null, 2)}\n`,
    'pwa/js/version.js': "export const APP_VERSION = 'v1.0.0';\n",
    // An edit the developer has not committed yet must survive any outcome.
    'pwa/sw.js': "const CACHE = 'orbit-v1.0.0';\nconst SHELL = ['./uncommitted.js'];\n",
    'ROADMAP.md': '目前版本：**v1.0.0**\n',
    'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-01-01\n',
  };
  const setUp = files => {
    mkdirSync(join(dir, 'scripts'));
    for (const name of ['bump.mjs', 'bumpLib.mjs']) copyFileSync(join(SCRIPTS, name), join(dir, 'scripts', name));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
  };
  const bump = () => {
    try {
      execFileSync(process.execPath, [join(dir, 'scripts', 'bump.mjs'), 'patch'], { cwd: dir, stdio: 'pipe' });
      return { ok: true };
    } catch (error) {
      return { ok: false, stderr: String(error.stderr) };
    }
  };
  const contents = () => Object.fromEntries(Object.keys(FILES).map(path => [path, readFileSync(join(dir, path), 'utf8')]));

  it('writes nothing when any marker is missing', () => {
    setUp({ ...FILES, 'ROADMAP.md': 'no version marker here\n' });
    const before = contents();
    const result = bump();
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Nothing was written.');
    expect(contents()).toEqual(before);
  });

  it('bumps every file and keeps other edits', () => {
    setUp(FILES);
    expect(bump().ok).toBe(true);
    const after = contents();
    expect(JSON.parse(after['package.json']).version).toBe('1.0.1');
    expect(JSON.parse(after['package-lock.json']).packages[''].version).toBe('1.0.1');
    expect(after['pwa/js/version.js']).toContain("'v1.0.1'");
    expect(after['pwa/sw.js']).toBe("const CACHE = 'orbit-v1.0.1';\nconst SHELL = ['./uncommitted.js'];\n");
    expect(after['ROADMAP.md']).toContain('目前版本：**v1.0.1**');
    expect(after['CHANGELOG.md']).toMatch(/^## \[1\.0\.1\]/m);
  });
});

describe('the committed version (INFRA-107)', () => {
  // Since INFRA-107 a new service worker (another CACHE name) is the only way
  // new HTML and code reach users, so a partial or hand-edited bump would leave
  // them on the old version. `npm run bump` keeps these together.
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const read = path => readFileSync(join(ROOT, path), 'utf8');

  it('is the same in every versioned file', () => {
    const version = JSON.parse(read('package.json')).version;
    const lock = JSON.parse(read('package-lock.json'));
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read('pwa/js/version.js')).toContain(`export const APP_VERSION = 'v${version}';`);
    expect(read('pwa/sw.js').match(/const CACHE = '([^']*)';/)[1]).toBe(`orbit-v${version}`);
    expect([lock.version, lock.packages[''].version]).toEqual([version, version]);
    expect(read('ROADMAP.md')).toContain(`目前版本：**v${version}**`);
    // The newest CHANGELOG entry is this version.
    expect(read('CHANGELOG.md').match(/^## \[([^\]]+)\]/m)[1]).toBe(version);
  });

  it('gives every CHANGELOG entry its own version', () => {
    // Two PRs that both bump from the same version merge cleanly everywhere
    // but in CHANGELOG. Folding both under one heading would ship the second
    // PR's files under a CACHE name installed apps already have, so they would
    // never get them; keeping two headings of the same version fails here.
    const versions = [...read('CHANGELOG.md').matchAll(/^## \[v?([^\]]+)\]/gm)].map(match => match[1]);
    expect(versions.length).toBeGreaterThan(50);
    expect(versions.filter((version, index) => versions.indexOf(version) !== index)).toEqual([]);
  });
});
