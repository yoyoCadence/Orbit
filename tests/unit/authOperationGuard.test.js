import { describe, expect, it } from 'vitest';
import { createAuthOperationGuard } from '../../pwa/js/platform/authOperationGuard.js';

describe('createAuthOperationGuard', () => {
  it('invalidates an earlier async operation when another account begins', () => {
    const guard = createAuthOperationGuard();
    const ownerA = guard.begin({ user: { id: 'owner-a' } });
    const ownerB = guard.begin({ user: { id: 'owner-b' } });

    expect(guard.isCurrent(ownerA)).toBe(false);
    expect(guard.isCurrent(ownerB)).toBe(true);
    expect(guard.getOwnerId()).toBe('owner-b');
  });

  it('invalidates all outstanding work on sign-out', () => {
    const guard = createAuthOperationGuard();
    const operation = guard.begin('owner-a');

    guard.invalidate();

    expect(guard.isCurrent(operation)).toBe(false);
    expect(guard.getOwnerId()).toBeNull();
  });

  it('treats a new generation for the same owner as the only current operation', () => {
    const guard = createAuthOperationGuard();
    const first = guard.begin('owner-a');
    const second = guard.begin('owner-a');

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });
});
