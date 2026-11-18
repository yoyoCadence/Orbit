// @vitest-environment jsdom
/**
 * HW-112C2b: an account's proof photos on this device.
 * - What counts as surely uploaded (only then may sign-out drop the local copy).
 * - Settings: "clear this device's photos" (keeps photos waiting to upload; a
 *   guest's are deleted) and "delete all proof photos" (here and the cloud).
 * Uses the real proofSync.js, so the backfill marker is the one it writes.
 */

/* global btoa -- jsdom provides it */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '11111111-1111-4111-8111-111111111111';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const auth = vi.hoisted(() => ({ userId: null }));
const local = vi.hoisted(() => ({ user: null, sessions: [] }));
const mockUpload = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockList = vi.hoisted(() => vi.fn());
const clearCloudProofs = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null } })) },
    storage: { from: vi.fn(() => ({ upload: mockUpload, remove: mockRemove, list: mockList })) },
  },
}));
vi.mock('../../pwa/js/storage.js', () => ({
  storage: { getUser: () => local.user, getSessions: () => local.sessions },
}));
vi.mock('../../pwa/js/platform/sessionDeletionLog.js', () => ({ getDeletedSessionIds: () => [] }));
vi.mock('../../pwa/js/platform/proofCloud.js', () => ({ clearCloudProofs }));

import { flushProofSync, queueProofUpload } from '../../pwa/js/platform/proofSync.js';
import {
  accountProofStats,
  clearDeviceProofs,
  deleteAllProofs,
  dropUploadedLocalProofs,
  photosNotSurelyUploaded,
  uploadedLocalProofIds,
} from '../../pwa/js/platform/proofLocal.js';
import { getAchievementPhotoSelection, saveProof, setAchievementPhotoSelection } from '../../pwa/js/platform/proofStore.js';

const jpeg = (bytes = 8) => `data:image/jpeg;base64,${btoa('\xff\xd8\xff' + 'x'.repeat(bytes))}`;
const png = 'data:image/png;base64,iVBORw0KGgo=';
const sessions = (...ids) => ids.map(id => ({ id }));
const has = sessionId => localStorage.getItem(`orbit_proof_${sessionId}`) !== null;

function signIn(...ids) {
  auth.userId = OWNER;
  local.user = { id: OWNER };
  local.sessions = sessions(...ids);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.userId = null;
  local.user = null;
  local.sessions = [];
  mockUpload.mockResolvedValue({ data: {}, error: null });
  mockRemove.mockResolvedValue({ data: [], error: null });
  mockList.mockResolvedValue({ data: [], error: null });
});

describe('accountProofStats', () => {
  it('counts only this account\'s photos on this device', () => {
    saveProof(sid(1), jpeg(1000));
    saveProof(sid(9), jpeg()); // another account's session
    expect(accountProofStats(sessions(sid(1), sid(2)))).toEqual({ count: 1, kb: 1 });
  });
});

describe('what is surely uploaded', () => {
  it('nothing before this account\'s photos were queued once (backfill)', () => {
    signIn(sid(1));
    saveProof(sid(1), jpeg());
    expect(uploadedLocalProofIds(OWNER, local.sessions)).toEqual([]);
  });

  it('a JPEG the sync sent, not one still waiting, an older PNG, an oversized one or another account\'s', async () => {
    signIn(sid(1), sid(2), sid(3), sid(4));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    saveProof(sid(3), png);
    saveProof(sid(4), jpeg(210 * 1024));
    saveProof(sid(9), jpeg());
    mockUpload.mockImplementation(async path => (path.includes(sid(2))
      ? { data: null, error: { message: 'Failed to fetch' } }
      : { data: {}, error: null }));
    await flushProofSync(OWNER); // the real backfill marks the account
    expect(uploadedLocalProofIds(OWNER, local.sessions)).toEqual([sid(1)]);
  });

  it('never a session id the bucket would refuse', async () => {
    signIn(sid(1));
    await flushProofSync(OWNER);
    saveProof('legacy-session', jpeg());
    expect(uploadedLocalProofIds(OWNER, sessions(sid(1), 'legacy-session'))).toEqual([]);
  });
});

describe('what an old icon must not be removed with (BUG-118 "check sync")', () => {
  it('counts every photo not surely uploaded: never queued yet, waiting, or not sendable as is', async () => {
    signIn(sid(1), sid(2), sid(3));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    expect(photosNotSurelyUploaded(OWNER, local.sessions)).toBe(2); // before the first sync queued them
    await flushProofSync(OWNER);
    expect(photosNotSurelyUploaded(OWNER, local.sessions)).toBe(0);
    saveProof(sid(3), png);
    queueProofUpload(OWNER, sid(2));
    expect(photosNotSurelyUploaded(OWNER, local.sessions)).toBe(2);
  });
});

describe('sign-out', () => {
  it('drops the local copies surely in the cloud and the downloaded ones; keeps the rest', async () => {
    signIn(sid(1), sid(2));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    saveProof(sid(9), jpeg());
    await flushProofSync(OWNER);
    queueProofUpload(OWNER, sid(2)); // taken again offline, say: waiting
    expect(dropUploadedLocalProofs(OWNER, local.sessions)).toBe(1);
    expect([has(sid(1)), has(sid(2)), has(sid(9))]).toEqual([false, true, true]);
    expect(clearCloudProofs).toHaveBeenCalledWith(OWNER);
  });
});

describe('settings: clear this device\'s photos', () => {
  it('signed in, before the first sync queued anything: nothing is cleared (not surely uploaded)', () => {
    signIn(sid(1), sid(2));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    // Opened offline on the new version: the queue is empty, but nothing was sent.
    expect(clearDeviceProofs(OWNER, local.sessions, { signedIn: true })).toEqual({ cleared: 0, kept: 2 });
    expect([has(sid(1)), has(sid(2))]).toEqual([true, true]);
    expect(clearCloudProofs).toHaveBeenCalledWith(OWNER); // the downloaded copies still go
  });

  it('signed in: this account\'s photos surely in the cloud; those waiting stay; the selection stays', async () => {
    signIn(sid(1), sid(2));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    saveProof(sid(9), jpeg());
    await flushProofSync(OWNER); // the backfill ran and sent both
    queueProofUpload(OWNER, sid(2)); // say, waiting again
    setAchievementPhotoSelection(OWNER, sid(1));
    expect(clearDeviceProofs(OWNER, local.sessions, { signedIn: true })).toEqual({ cleared: 1, kept: 1 });
    expect([has(sid(1)), has(sid(2)), has(sid(9))]).toEqual([false, true, true]);
    expect(getAchievementPhotoSelection(OWNER)).toBe(sid(1)); // shown from the cloud
    expect(clearCloudProofs).toHaveBeenCalledWith(OWNER);
  });

  it('an account seen as a guest (its stored session gone) keeps the photos still waiting to upload', () => {
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    queueProofUpload(OWNER, sid(2));
    expect(clearDeviceProofs(OWNER, sessions(sid(1), sid(2)), { signedIn: false })).toEqual({ cleared: 1, kept: 1 });
    expect([has(sid(1)), has(sid(2))]).toEqual([false, true]);
  });

  it('a guest: the guest\'s photos (no cloud copy) and the Personal Space selection', () => {
    saveProof(sid(1), jpeg());
    saveProof(sid(9), jpeg());
    setAchievementPhotoSelection('guest-1', sid(1));
    expect(clearDeviceProofs('guest-1', sessions(sid(1)), { signedIn: false })).toEqual({ cleared: 1, kept: 0 });
    expect([has(sid(1)), has(sid(9))]).toEqual([false, true]);
    expect(getAchievementPhotoSelection('guest-1')).toBeNull();
    expect(clearCloudProofs).not.toHaveBeenCalled();
  });
});

describe('settings: delete all proof photos', () => {
  const names = count => Array.from({ length: count }, (_, i) => ({ name: `${sid(100 + i)}.jpg`, id: `obj-${i}` }));

  it('deletes this account\'s photos here (waiting ones too), the selection, the downloads and the whole cloud folder', async () => {
    signIn(sid(1), sid(2));
    saveProof(sid(1), jpeg());
    saveProof(sid(2), jpeg());
    saveProof(sid(9), jpeg());
    queueProofUpload(OWNER, sid(2));
    setAchievementPhotoSelection(OWNER, sid(1));
    mockList
      .mockResolvedValueOnce({ data: names(100), error: null })
      .mockResolvedValueOnce({ data: [...names(103).slice(100), { name: 'folder', id: null }], error: null });

    const result = await deleteAllProofs(OWNER, local.sessions);

    expect(result).toEqual({ ok: true, local: 2, cloud: 103 });
    expect([has(sid(1)), has(sid(2)), has(sid(9))]).toEqual([false, false, true]);
    expect(getAchievementPhotoSelection(OWNER)).toBeNull();
    expect(clearCloudProofs).toHaveBeenCalledWith(OWNER);
    expect(mockList).toHaveBeenNthCalledWith(1, OWNER, expect.objectContaining({ limit: 100, offset: 0 }));
    expect(mockList).toHaveBeenNthCalledWith(2, OWNER, expect.objectContaining({ limit: 100, offset: 100 }));
    const removed = mockRemove.mock.calls.flatMap(call => call[0]);
    expect(removed).toHaveLength(103);
    expect(removed[0]).toBe(`${OWNER}/${sid(100)}.jpg`);
    expect(removed.every(path => path.startsWith(`${OWNER}/`))).toBe(true);
    // The queued upload found no photo and left the queue (nothing re-uploaded).
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('empties the cloud folder even when this device\'s cache never answers', async () => {
    signIn(sid(1));
    clearCloudProofs.mockImplementationOnce(() => new Promise(() => {})); // IndexedDB hangs
    mockList.mockResolvedValueOnce({ data: names(1), error: null });
    expect(await deleteAllProofs(OWNER, local.sessions)).toEqual({ ok: true, local: 0, cloud: 1 });
  });

  it('reports a cloud folder it could not empty (offline): pressing again retries', async () => {
    signIn(sid(1));
    saveProof(sid(1), jpeg());
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    expect(await deleteAllProofs(OWNER, local.sessions)).toEqual({ ok: false, local: 1, cloud: 0 });
    mockList.mockResolvedValueOnce({ data: names(2), error: null });
    expect(await deleteAllProofs(OWNER, local.sessions)).toEqual({ ok: true, local: 0, cloud: 2 });
  });

  it('touches no cloud folder unless this account is the one signed in', async () => {
    signIn(sid(1));
    auth.userId = '22222222-2222-4222-8222-222222222222';
    expect((await deleteAllProofs(OWNER, local.sessions)).ok).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
