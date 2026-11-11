// @vitest-environment jsdom
/**
 * proResume.test.js — PRO-014H
 *
 * Returning to the app refreshes the Pro projection once the last answer for
 * the signed-in owner is an hour old or missing (pwa/js/proResume.js). The
 * wiring in app.js is covered by appBootSequence.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const proSource = vi.hoisted(() => ({ legacy: false }));
vi.mock('../../pwa/js/platform/proEntitlement.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, isServerProEntitlementEnabled: () => !proSource.legacy && actual.isServerProEntitlementEnabled() };
});

import { resetProEntitlementStorageState, writeProEntitlementSnapshot } from '../../pwa/js/platform/proEntitlement.js';
import { PRO_RESUME_REFRESH_MS, needsProRefreshOnResume } from '../../pwa/js/proResume.js';

const OWNER = 'owner-1';
const NOW = Date.parse('2026-11-11T09:00:00Z');

function snapshot(fields = {}) {
  writeProEntitlementSnapshot({
    ownerId: OWNER, isActive: true, expiresAt: null, trialEndsAt: null, fetchedAtMs: NOW, ...fields,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
  proSource.legacy = false;
});

describe('needsProRefreshOnResume()', () => {
  it('a fresh answer for this owner: no request', () => {
    snapshot({ fetchedAtMs: NOW - PRO_RESUME_REFRESH_MS + 1 });
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(false);
  });

  it('an hour old or more: refresh (well before the 24 h limit)', () => {
    snapshot({ fetchedAtMs: NOW - PRO_RESUME_REFRESH_MS });
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(true);
    snapshot({ fetchedAtMs: NOW - 25 * PRO_RESUME_REFRESH_MS });
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(true);
  });

  it('no answer yet (first launch after the update made offline), or another owner’s: refresh', () => {
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(true);
    snapshot({ ownerId: 'someone-else' });
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(true);
  });

  it('the clock moved back past the answer: refresh', () => {
    snapshot({ fetchedAtMs: NOW + 60_000 });
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(true);
  });

  it('guests, offline, and the legacy source: never', () => {
    expect(needsProRefreshOnResume(null, { nowMs: NOW })).toBe(false);
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW, online: false })).toBe(false);
    proSource.legacy = true;
    expect(needsProRefreshOnResume(OWNER, { nowMs: NOW })).toBe(false);
  });
});
