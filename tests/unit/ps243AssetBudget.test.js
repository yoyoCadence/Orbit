import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  computeAssetBaseline,
  REPO_ROOT,
} from '../../scripts/ps243/computeAssetBaseline.mjs';

// PS-243 deterministic asset gate. Unlike the volatile route timings, raw asset
// bytes are a pure function of committed files, so these are real CI gates: a
// regression that inflates the production scene or the deferred bundle fails here.
describe('PS-243 asset baseline', () => {
  const baseline = computeAssetBaseline();

  it('keeps the PS-242 production first paint below the authored-art target', () => {
    const { initialPaint } = baseline.runtimeSceneAssets;
    expect(initialPaint.totalBytes).toBe(182_493);
    expect(initialPaint.totalBytes).toBeLessThan(BUDGETS.initialPaint.targetBytes);
    expect(initialPaint.result).toBe('PASS');
  });

  it('keeps the complete production state pack plus eight props within budget', () => {
    const { completeProofScene } = baseline.runtimeSceneAssets;
    expect(completeProofScene.totalBytes).toBe(1_298_860);
    // Legacy evidence key retained for artifact compatibility: 1 background,
    // 12 protagonist poses, 6 Companion states, 2 weather overlays, and 8 props.
    expect(completeProofScene.files).toHaveLength(29);
    expect(completeProofScene.result).toBe('PASS');
  });

  it('keeps the deferred V2 + Pixi bundle under the 300 KB gzip budget', () => {
    const { deferredJsBundles } = baseline;
    expect(deferredJsBundles.combinedGzipBytes).toBeLessThan(BUDGETS.deferredBundle.budgetBytes);
    expect(deferredJsBundles.result).toBe('PASS');
  });

  it('keeps the committed evidence artifact reproducible and in sync', () => {
    const committed = readFileSync(
      join(REPO_ROOT, 'docs', 'ps243', 'asset-baseline.json'),
      'utf8',
    );
    // Normalize line endings: the canonical serialization is LF, but a Windows
    // autocrlf checkout may present the committed file as CRLF. The point is
    // that the recorded numbers match a fresh cross-platform computation.
    expect(committed.replace(/\r\n/g, '\n')).toBe(`${JSON.stringify(baseline, null, 2)}\n`);
  });
});
