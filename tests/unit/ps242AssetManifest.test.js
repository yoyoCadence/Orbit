import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildPs242AssetManifest,
  OUTPUT_PATH,
  serializePs242AssetManifest,
} from '../../art-pipeline/ps242/build-manifest.mjs';
import {
  getWorkspaceAssetManifestPaths,
  WORKSPACE_VISUAL_STATES,
} from '../../pwa/js/personalSpace/v2/content/assetManifest.js';

describe('PS-242 production asset manifest', () => {
  const manifest = buildPs242AssetManifest();

  it('covers the exact runtime contract with production metadata and stable hashes', () => {
    const runtimePaths = getWorkspaceAssetManifestPaths();
    expect(manifest.status).toBe('production');
    expect(manifest.scene.dimensions).toEqual({ width: 1536, height: 1024 });
    expect(manifest.outputs.map(entry => entry.path)).toEqual(runtimePaths);
    expect(manifest.outputs).toHaveLength(29);

    for (const entry of manifest.outputs) {
      expect(entry).toEqual(expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        role: expect.any(String),
        path: expect.any(String),
        dimensions: expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
        canonicalCameraId: 'building-workspace-v2',
        projectPhase: expect.anything(),
        source: expect.any(String),
        qc: expect.stringContaining('passed:'),
        licenseRef: expect.any(String),
        status: 'production',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }));
      expect(entry.bytes).toBeGreaterThan(0);
      if (entry.role !== 'background') expect(entry.alpha).toBe(true);
    }
  });

  it('covers both protagonist facings, all emitted Companion states, and both weather states', () => {
    const protagonist = manifest.outputs.filter(entry => entry.role === 'protagonist-action');
    expect(protagonist.map(entry => `${entry.state}:${entry.facing}`).sort()).toEqual(
      WORKSPACE_VISUAL_STATES.protagonist
        .flatMap(state => WORKSPACE_VISUAL_STATES.facings.map(facing => `${state}:${facing}`))
        .sort(),
    );

    const companion = manifest.outputs
      .filter(entry => entry.role === 'companion-action')
      .map(entry => entry.state)
      .sort();
    expect(companion).toEqual(['approach', 'congratulate', 'observe', 'remind', 'rest', 'work']);

    const weather = manifest.outputs
      .filter(entry => entry.role === 'weather-effect')
      .map(entry => entry.state)
      .sort();
    expect(weather).toEqual(['clear', 'rain']);
  });

  it('keeps the committed manifest reproducible', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(serializePs242AssetManifest());
  });
});
