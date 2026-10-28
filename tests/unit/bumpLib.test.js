import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  replaceInFile,
  syncPackageLock,
  syncRoadmapVersion,
} from '../../scripts/bumpLib.mjs';

let dir;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bumplib-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function writeFixture(name, content) {
  writeFileSync(join(dir, name), content);
}

describe('syncPackageLock', () => {
  it('updates the root and packages[""] versions', () => {
    writeFixture('package-lock.json', `${JSON.stringify({
      name: 'orbit', version: '1.0.0', packages: { '': { name: 'orbit', version: '1.0.0' } },
    }, null, 2)}\n`);

    syncPackageLock(dir, '1.2.3');

    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe('1.2.3');
    expect(lock.packages[''].version).toBe('1.2.3');
  });

  it('fails closed when packages[""] is missing', () => {
    writeFixture('package-lock.json', JSON.stringify({ name: 'orbit', version: '1.0.0', packages: {} }));
    expect(() => syncPackageLock(dir, '1.2.3')).toThrow(/root package entry/);
  });

  it('fails closed when the lockfile is absent or invalid JSON', () => {
    expect(() => syncPackageLock(dir, '1.2.3')).toThrow(/unreadable or invalid JSON/);
    writeFixture('package-lock.json', '{ not valid json');
    expect(() => syncPackageLock(dir, '1.2.3')).toThrow(/unreadable or invalid JSON/);
  });
});

describe('syncRoadmapVersion', () => {
  it('updates the 目前版本 marker', () => {
    writeFixture('ROADMAP.md', '# Roadmap\n\n目前版本：**v1.0.0**\n\nbody\n');
    syncRoadmapVersion(dir, 'v1.2.3');
    expect(readFileSync(join(dir, 'ROADMAP.md'), 'utf8')).toContain('目前版本：**v1.2.3**');
  });

  it('fails closed when the 目前版本 marker is absent', () => {
    writeFixture('ROADMAP.md', '# Roadmap\n\nno version marker here\n');
    expect(() => syncRoadmapVersion(dir, 'v1.2.3')).toThrow(/not found/);
  });
});

describe('replaceInFile', () => {
  it('fails closed when the pattern is absent', () => {
    const file = join(dir, 'sample.js');
    writeFixture('sample.js', 'const A = 1;\n');
    expect(() => replaceInFile(file, /const B = \d;/, 'const B = 2;')).toThrow(/not found/);
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
});
