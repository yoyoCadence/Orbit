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
    // PS-250B: the default characters are the Q-style WebPs (182,283 B before).
    expect(initialPaint.totalBytes).toBe(122_433);
    expect(initialPaint.totalBytes).toBeLessThan(BUDGETS.initialPaint.targetBytes);
    expect(initialPaint.result).toBe('PASS');
  });

  it('keeps the night first paint (PS-250E1: evening and night) below the same target', () => {
    const { nightInitialPaint } = baseline.runtimeSceneAssets;
    expect(nightInitialPaint.files[0].path).toMatch(/building-formal-workstation-room-v2-night\.webp$/);
    expect(nightInitialPaint.totalBytes).toBe(104_205);
    expect(nightInitialPaint.totalBytes).toBeLessThan(BUDGETS.initialPaint.targetBytes);
    expect(nightInitialPaint.result).toBe('PASS');
  });

  it('keeps the complete production state pack plus eight props within budget', () => {
    const { completeProofScene } = baseline.runtimeSceneAssets;
    // PS-250B: the default characters are the Q-style WebPs (1,293,693 B before).
    // PS-250E1: plus the night room and its 8 props (751,670 B before).
    expect(completeProofScene.totalBytes).toBe(1_288_625);
    // Legacy evidence key retained for artifact compatibility: 1 background,
    // 12 protagonist poses, 6 Companion states, 2 weather overlays, 8 props,
    // and the night background with 8 night props.
    expect(completeProofScene.files).toHaveLength(38);
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
