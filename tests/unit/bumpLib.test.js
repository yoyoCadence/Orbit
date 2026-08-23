import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
