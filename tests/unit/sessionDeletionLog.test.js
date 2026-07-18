// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSessionDeletion,
  filterDeletedSessions,
  getDeletedSessionIds,
  loadSessionDeletionLog,
  recordSessionDeletion,
  recordSessionDeletionAttempt,
  recordSessionDeletionRemoteConfirmed,
} from '../../pwa/js/platform/sessionDeletionLog.js';

describe('session deletion log', () => {
  beforeEach(() => localStorage.clear());

  it('keeps durable, owner-scoped tombstones without changing their deletion time', () => {
    recordSessionDeletion('owner-a', 'session-1', '2026-07-17T01:00:00.000Z');
    recordSessionDeletion('owner-a', 'session-1', '2026-07-18T01:00:00.000Z');

    expect(loadSessionDeletionLog('owner-a')['session-1']).toMatchObject({
      deletedAt: '2026-07-17T01:00:00.000Z',
      retryCount: 0,
    });
    expect(loadSessionDeletionLog('owner-b')).toEqual({});
  });

  it('filters resurrected local or remote sessions until cloud deletion is confirmed', () => {
    recordSessionDeletion('owner-a', 'deleted', '2026-07-17T01:00:00.000Z');
    const ids = getDeletedSessionIds('owner-a');

    expect(filterDeletedSessions([
      { id: 'kept' },
      { id: 'deleted' },
    ], ids)).toEqual([{ id: 'kept' }]);
  });

  it('records retries and clears only the confirmed id', () => {
    recordSessionDeletion('owner-a', 'one', '2026-07-17T01:00:00.000Z');
    recordSessionDeletion('owner-a', 'two', '2026-07-17T02:00:00.000Z');
    recordSessionDeletionAttempt('owner-a', 'one', '2026-07-17T03:00:00.000Z');

    expect(loadSessionDeletionLog('owner-a').one.retryCount).toBe(1);
    expect(clearSessionDeletion('owner-a', 'one')).toBe(true);
    expect(Object.keys(loadSessionDeletionLog('owner-a'))).toEqual(['two']);
    expect(clearSessionDeletion('owner-a', 'missing')).toBe(false);
  });

  it('persists remote confirmation separately from V2 tombstone completion', () => {
    recordSessionDeletion('owner-a', 'one', '2026-07-17T01:00:00.000Z');
    recordSessionDeletionRemoteConfirmed('owner-a', 'one', '2026-07-17T04:00:00.000Z');

    expect(loadSessionDeletionLog('owner-a').one).toMatchObject({
      deletedAt: '2026-07-17T01:00:00.000Z',
      remoteConfirmedAt: '2026-07-17T04:00:00.000Z',
    });
  });

  it('throws before reporting a deletion when durable storage rejects the write', () => {
    const setItem = vi.spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new globalThis.DOMException('Storage quota exceeded', 'QuotaExceededError');
      });
    try {
      expect(() => recordSessionDeletion(
        'owner-a',
        'unsafe-session',
        '2026-07-17T01:00:00.000Z',
      )).toThrow(/Failed to persist Session deletion log/);
    } finally {
      setItem.mockRestore();
    }

    expect(loadSessionDeletionLog('owner-a')).toEqual({});
  });
});
