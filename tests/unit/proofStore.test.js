/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAchievementPhotoSelection,
  clearAllProofs,
  getAchievementPhotoSelection,
  getProof,
  proofStats,
  resolveAchievementPhoto,
  saveProof,
  setAchievementPhotoSelection,
} from '../../pwa/js/platform/proofStore.js';

const PROOF = 'data:image/jpeg;base64,QUJD';

describe('local achievement photo selection', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the selected Session scoped to one local owner', () => {
    expect(setAchievementPhotoSelection('owner-a', 'session-1')).toBe(true);
    expect(getAchievementPhotoSelection('owner-a')).toBe('session-1');
    expect(getAchievementPhotoSelection('owner-b')).toBeNull();
    expect(clearAchievementPhotoSelection('owner-a')).toBe(true);
    expect(getAchievementPhotoSelection('owner-a')).toBeNull();
  });

  it('resolves only a supported proof belonging to a current Session', () => {
    saveProof('session-1', PROOF);
    setAchievementPhotoSelection('owner-a', 'session-1');

    expect(resolveAchievementPhoto('owner-a', [{
      id: 'session-1',
      taskName: '完成作品集',
      completedAt: '2026-07-31T10:00:00.000Z',
    }])).toEqual({
      status: 'selected',
      sessionId: 'session-1',
      src: PROOF,
      taskName: '完成作品集',
      completedAt: '2026-07-31T10:00:00.000Z',
    });
  });

  it('falls back without exposing a stale or unsupported local image', () => {
    saveProof('session-1', 'data:image/svg+xml;base64,PHN2Zz4=');
    setAchievementPhotoSelection('owner-a', 'session-1');

    expect(resolveAchievementPhoto('owner-a', [])).toMatchObject({
      status: 'unavailable',
      sessionId: 'session-1',
      src: null,
    });
    expect(resolveAchievementPhoto('owner-a', [{ id: 'session-1' }])).toMatchObject({
      status: 'unavailable',
      src: null,
    });
  });

  it('clears proofs and photo-wall selections without counting selection metadata', () => {
    saveProof('session-1', PROOF);
    setAchievementPhotoSelection('owner-a', 'session-1');
    expect(proofStats()).toMatchObject({ count: 1 });

    clearAllProofs();

    expect(getProof('session-1')).toBeNull();
    expect(getAchievementPhotoSelection('owner-a')).toBeNull();
    expect(proofStats()).toEqual({ count: 0, kb: 0 });
  });
});
