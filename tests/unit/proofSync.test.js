// @vitest-environment jsdom
/**
 * HW-112C1: proof photo backup to the private `proofs` bucket (016).
 * Uploads, the per-account queues, the one-time backfill, deletion, and the
 * guards around them (account, session still present, size, file type).
 */

/* global btoa, Blob -- jsdom provides them */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const auth = vi.hoisted(() => ({ userId: null }));
const mockUpload = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const local = vi.hoisted(() => ({ user: null, sessions: [], deleted: new Set() }));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null } })) },
    storage: { from: vi.fn(() => ({ upload: mockUpload, remove: mockRemove })) },
  },
}));
vi.mock('../../pwa/js/storage.js', () => ({
  storage: { getUser: () => local.user, getSessions: () => local.sessions },
}));
vi.mock('../../pwa/js/platform/sessionDeletionLog.js', () => ({
  getDeletedSessionIds: () => local.deleted,
}));

import {
  PROOF_SYNC_BATCH,
  flushProofSync,
  pendingProofRemovals,
  pendingProofUploads,
  proofObjectPath,
  proofSaved,
  proofSessionDeleted,
  queueProofUpload,
  uploadProof,
} from '../../pwa/js/platform/proofSync.js';
import { proofStats, saveProof } from '../../pwa/js/platform/proofStore.js';

const jpegDataUrl = (bytes = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) =>
  `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;

function signIn(id = OWNER) { auth.userId = id; }
function ownSessions(...ids) {
  local.user = { id: OWNER };
  local.sessions = ids.map(id => ({ id }));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.userId = null;
  local.user = null;
  local.sessions = [];
  local.deleted = new Set();
  mockUpload.mockResolvedValue({ data: {}, error: null });
  mockRemove.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('upload', () => {
  it('uploads a saved photo as a JPEG Blob to {owner}/{session}.jpg, never overwriting', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    proofSaved(OWNER, sid(1));
    await flushProofSync(OWNER);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [path, blob, options] = mockUpload.mock.calls[0];
    expect(path).toBe(`${OWNER}/${sid(1)}.jpg`);
    expect(path).toBe(proofObjectPath(OWNER, sid(1)));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(7);
    expect(options).toMatchObject({ contentType: 'image/jpeg', upsert: false });
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it('counts "already exists" as done', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    mockUpload.mockResolvedValueOnce({ data: null, error: { statusCode: '409', message: 'The resource already exists' } });
    expect(await uploadProof(OWNER, sid(1))).toBe('exists');
  });

  it('keeps the queue and stops at the first failure (offline)', async () => {
    signIn();
    ownSessions(sid(1), sid(2));
    saveProof(sid(1), jpegDataUrl());
    saveProof(sid(2), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    queueProofUpload(OWNER, sid(2));
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(pendingProofUploads(OWNER)).toEqual([sid(1), sid(2)]);

    await flushProofSync(OWNER);
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it('sends nothing while another account (or no one) is signed in', async () => {
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    await flushProofSync(OWNER);
    signIn(OTHER);
    await flushProofSync(OWNER);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(pendingProofUploads(OWNER)).toEqual([sid(1)]);
  });

  it('drops a photo the bucket would refuse (over 200 KB) without sending it', async () => {
    signIn();
    ownSessions(sid(1));
    // 273,068 base64 'A's decode to 204,801 zero bytes: one byte over the limit.
    saveProof(sid(1), `data:image/jpeg;base64,${'A'.repeat(273068)}`);
    queueProofUpload(OWNER, sid(1));
    await flushProofSync(OWNER);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it('drops a queued photo whose session is gone or not this account\'s', async () => {
    signIn();
    ownSessions(sid(1));
    local.deleted = new Set([sid(1)]);
    saveProof(sid(1), jpegDataUrl());
    saveProof(sid(2), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    queueProofUpload(OWNER, sid(2));
    await flushProofSync(OWNER);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it(`sends at most ${PROOF_SYNC_BATCH} per flush`, async () => {
    signIn();
    const ids = Array.from({ length: 12 }, (_, i) => sid(i + 1));
    ownSessions(...ids);
    for (const id of ids) { saveProof(id, jpegDataUrl()); queueProofUpload(OWNER, id); }
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(PROOF_SYNC_BATCH);
    expect(pendingProofUploads(OWNER)).toEqual(ids.slice(PROOF_SYNC_BATCH));
  });

  it('runs one flush at a time per account', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    const first = flushProofSync(OWNER);
    expect(flushProofSync(OWNER)).toBe(first);
    await first;
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('re-encodes an older PNG photo as JPEG', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), `data:image/png;base64,${btoa('png-bytes')}`);
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { drawImage: vi.fn() }; }
      convertToBlob(options) { expect(options).toEqual({ type: 'image/jpeg', quality: 0.5 }); return Promise.resolve(jpeg); }
    });
    expect(await uploadProof(OWNER, sid(1))).toBe('uploaded');
    expect(mockUpload.mock.calls[0][1]).toBe(jpeg);
  });

  it('skips a PNG it cannot re-encode (no canvas support)', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), `data:image/png;base64,${btoa('png-bytes')}`);
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await uploadProof(OWNER, sid(1))).toBe('skipped');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('takes the file down again when the session was deleted during the upload', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    mockUpload.mockImplementationOnce(async () => {
      // Deleted here while the request was out: in the deletion log, and the
      // account's other data is still on this device.
      local.deleted = new Set([sid(1)]);
      return { data: {}, error: null };
    });
    await flushProofSync(OWNER);
    expect(mockRemove).toHaveBeenCalledWith([`${OWNER}/${sid(1)}.jpg`]);
    expect(pendingProofRemovals(OWNER)).toEqual([]);
  });

  it('keeps the backup and the rest of the queue when the user signs out mid-sync', async () => {
    signIn();
    ownSessions(sid(1), sid(2), sid(3));
    for (const id of [sid(1), sid(2), sid(3)]) { saveProof(id, jpegDataUrl()); queueProofUpload(OWNER, id); }
    mockUpload.mockImplementationOnce(async () => {
      // handleSignOut(): the session ends and the local user and sessions are cleared.
      auth.userId = null;
      local.user = null;
      local.sessions = [];
      return { data: {}, error: null };
    });
    await flushProofSync(OWNER);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(pendingProofRemovals(OWNER)).toEqual([]);
    // The first one is in the cloud; the other two wait for the account to come back.
    expect(pendingProofUploads(OWNER)).toEqual([sid(2), sid(3)]);

    signIn();
    ownSessions(sid(1), sid(2), sid(3));
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('stops without touching the queues when another account\'s data replaces this one mid-sync', async () => {
    signIn();
    ownSessions(sid(1), sid(2));
    for (const id of [sid(1), sid(2)]) { saveProof(id, jpegDataUrl()); queueProofUpload(OWNER, id); }
    mockUpload.mockImplementationOnce(async () => {
      local.user = { id: OTHER };
      local.sessions = [{ id: sid(9) }];
      return { data: {}, error: null };
    });
    await flushProofSync(OWNER);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(pendingProofUploads(OWNER)).toEqual([sid(2)]);
  });

  it('runs one more pass for a photo saved while a sync was running', async () => {
    signIn();
    ownSessions(sid(1), sid(2));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    mockUpload.mockImplementationOnce(async () => {
      // Photographed while the first upload was out (so the backfill at the
      // start of this sync could not have seen it).
      saveProof(sid(2), jpegDataUrl());
      proofSaved(OWNER, sid(2));
      return { data: {}, error: null };
    });
    await flushProofSync(OWNER);
    await vi.waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    expect(mockUpload.mock.calls[1][0]).toBe(`${OWNER}/${sid(2)}.jpg`);
    await vi.waitFor(() => expect(pendingProofUploads(OWNER)).toEqual([]));
  });

  it('skips a corrupt photo and goes on with the next one', async () => {
    signIn();
    ownSessions(sid(1), sid(2));
    saveProof(sid(1), 'data:image/jpeg;base64,%%%not-base64%%%');
    saveProof(sid(2), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    queueProofUpload(OWNER, sid(2));
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][0]).toBe(`${OWNER}/${sid(2)}.jpg`);
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  // StorageApiError as supabase-js builds it: status (HTTP), statusCode, code.
  it.each([
    ['EntityTooLarge', { status: 413, statusCode: '413', code: 'EntityTooLarge' }],
    ['InvalidMimeType', { status: 415, statusCode: '415', code: 'InvalidMimeType' }],
    ['InvalidKey', { status: 400, statusCode: '400', code: 'InvalidKey' }],
    ['a bare 413 from a proxy', { status: 413, statusCode: '413' }],
  ])('drops an item the server refuses for good (%s) and goes on', async (_label, refusal) => {
    signIn();
    ownSessions(sid(1), sid(2));
    saveProof(sid(1), jpegDataUrl());
    saveProof(sid(2), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    queueProofUpload(OWNER, sid(2));
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'refused', ...refusal } });
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it('stops and keeps the whole queue on an expired or invalid token (Storage answers 400 InvalidJWT)', async () => {
    signIn();
    ownSessions(sid(1), sid(2), sid(3));
    for (const id of [sid(1), sid(2), sid(3)]) { saveProof(id, jpegDataUrl()); queueProofUpload(OWNER, id); }
    mockUpload.mockResolvedValue({
      data: null,
      error: { status: 400, statusCode: '400', code: 'InvalidJWT', message: '"exp" claim timestamp check failed' },
    });
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(pendingProofUploads(OWNER)).toEqual([sid(1), sid(2), sid(3)]);
  });

  it('counts the Duplicate code as already stored', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    mockUpload.mockResolvedValueOnce({ data: null, error: { status: 400, statusCode: '409', code: 'Duplicate', message: 'x' } });
    expect(await uploadProof(OWNER, sid(1))).toBe('exists');
  });

  it('keeps an item refused for authentication (401/403) for the next sync', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    mockUpload.mockResolvedValueOnce({ data: null, error: { statusCode: '403', message: 'new row violates row-level security policy' } });
    await flushProofSync(OWNER);
    expect(pendingProofUploads(OWNER)).toEqual([sid(1)]);
  });

  it('ignores ids the bucket policy would refuse', () => {
    queueProofUpload(OWNER, 'not-a-uuid');
    queueProofUpload(OWNER, `${sid(1)}/../x`);
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });
});

describe('backfill of photos already on this device (once per account)', () => {
  it('queues this account\'s photos only, and only once', async () => {
    signIn();
    ownSessions(sid(1), sid(2));
    saveProof(sid(1), jpegDataUrl());
    saveProof(sid(3), jpegDataUrl()); // another account's or a guest's session
    mockUpload.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await flushProofSync(OWNER);
    expect(pendingProofUploads(OWNER)).toEqual([sid(1)]);

    // Done once: a photo removed from the queue is not queued again.
    localStorage.removeItem(`orbit_proofsync_upload:${encodeURIComponent(OWNER)}`);
    await flushProofSync(OWNER);
    expect(pendingProofUploads(OWNER)).toEqual([]);
  });

  it('is not marked done when the queue could not be saved (storage full)', async () => {
    signIn();
    ownSessions(sid(1));
    saveProof(sid(1), jpegDataUrl());
    const setItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key.startsWith('orbit_proofsync_upload:')) throw new Error('QuotaExceededError');
      return setItem.call(this, key, value);
    });
    try {
      await flushProofSync(OWNER);
    } finally {
      spy.mockRestore();
    }
    expect(localStorage.getItem(`orbit_proofsync_backfilled:${encodeURIComponent(OWNER)}`)).toBeNull();
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('waits until the account\'s sessions are on this device', async () => {
    signIn();
    saveProof(sid(1), jpegDataUrl());
    await flushProofSync(OWNER);
    expect(pendingProofUploads(OWNER)).toEqual([]);
    ownSessions(sid(1));
    await flushProofSync(OWNER);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps its queues out of the photo count (keys are not orbit_proof_*)', async () => {
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    proofSessionDeleted(OWNER, sid(2), { signedIn: true });
    expect(proofStats().count).toBe(1);
  });
});

describe('deleting a session', () => {
  it('deletes the photo here and in the cloud, and stops its upload', async () => {
    signIn();
    ownSessions(sid(2));
    saveProof(sid(1), jpegDataUrl());
    queueProofUpload(OWNER, sid(1));
    proofSessionDeleted(OWNER, sid(1), { signedIn: true });
    await flushProofSync(OWNER);
    expect(localStorage.getItem(`orbit_proof_${sid(1)}`)).toBeNull();
    expect(pendingProofUploads(OWNER)).toEqual([]);
    expect(mockRemove).toHaveBeenCalledWith([`${OWNER}/${sid(1)}.jpg`]);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(pendingProofRemovals(OWNER)).toEqual([]);
  });

  it('retries the cloud deletion until the server confirms', async () => {
    signIn();
    ownSessions(sid(2));
    mockRemove.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    proofSessionDeleted(OWNER, sid(1), { signedIn: true });
    await flushProofSync(OWNER);
    expect(pendingProofRemovals(OWNER)).toEqual([sid(1)]);
    await flushProofSync(OWNER);
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(pendingProofRemovals(OWNER)).toEqual([]);
  });

  it('for a guest, only deletes the photo on this device', async () => {
    saveProof(sid(1), jpegDataUrl());
    proofSessionDeleted('guest-id', sid(1), { signedIn: false });
    await flushProofSync('guest-id');
    expect(localStorage.getItem(`orbit_proof_${sid(1)}`)).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(pendingProofRemovals('guest-id')).toEqual([]);
  });
});
