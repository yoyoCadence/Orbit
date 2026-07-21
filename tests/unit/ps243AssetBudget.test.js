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
// regression that inflates the proof scene or the deferred bundle fails here.
describe('PS-243 asset baseline', () => {
  const baseline = computeAssetBaseline();

  it('locks the reproducible first-paint asset bytes below the hard fallback ceiling', () => {
    const { initialPaint } = baseline.runtimeSceneAssets;
    expect(initialPaint.totalBytes).toBe(1_987_696);
    expect(initialPaint.totalBytes).toBeLessThan(BUDGETS.initialPaint.hardThresholdBytes);
    // Honestly recorded as FOLLOW-UP: above the 1.5 MB authored-art target,
    // still below the 2.5 MB fallback ceiling. PS-242 owns the final art.
    expect(initialPaint.result).toBe('FOLLOW-UP');
  });

  it('keeps the complete proof scene plus eight props within budget', () => {
    const { completeProofScene } = baseline.runtimeSceneAssets;
    expect(completeProofScene.totalBytes).toBe(2_760_735);
    expect(completeProofScene.files).toHaveLength(10); // background + protagonist + 8 props
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
    expect(committed).toBe(`${JSON.stringify(baseline, null, 2)}\n`);
  });
});
