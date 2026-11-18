// @vitest-environment jsdom
/**
 * HW-112C2a: cloud proof photos on a device without the local copy.
 * Who may fetch, the download path, "not found" that expires, other errors not
 * remembered, at most 3 at a time, one request per photo, the account check
 * after the download, the IndexedDB cache (survives a restart, capped per
 * account, cleared on sign-out), rows fetched only when in view, and the
 * achievement photo.
 */

/* global Blob, indexedDB -- jsdom and fake-indexeddb provide them */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const auth = vi.hoisted(() => ({ userId: null, stored: true }));
const local = vi.hoisted(() => ({ user: null }));
const mockDownload = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null } })) },
    storage: { from: mockFrom },
  },
}));
vi.mock('../../pwa/js/storage.js', () => ({ storage: { getUser: () => local.user } }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => auth.stored }));
vi.mock('../../pwa/js/platform/proofSync.js', () => ({
  PROOF_BUCKET: 'proofs',
  proofObjectPath: (ownerId, sessionId) => `${ownerId}/${sessionId}.jpg`,
}));

const jpeg = (size = 8) => new Blob([new Uint8Array(size).fill(0xff)], { type: 'image/jpeg' });
const notFound = () => ({ data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } });

let cloud;
let urls = 0;

function signIn(id = OWNER) {
  auth.userId = id;
  auth.stored = true;
  local.user = { id };
}

async function freshModule() {
  vi.resetModules();
  cloud = await import('../../pwa/js/platform/proofCloud.js');
  return cloud;
}

function deleteDatabase() {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase('orbit-proofs');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.userId = null;
  auth.stored = true;
  local.user = null;
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:orbit/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  mockDownload.mockResolvedValue({ data: jpeg(), error: null });
  mockFrom.mockImplementation(() => ({ download: mockDownload }));
  await deleteDatabase();
  await freshModule();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('who asks for a cloud photo', () => {
  it('a signed-in account\'s own row without a photo on this device', () => {
    signIn();
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true);
  });

  it('not a guest, not another account, not a photo already here, not an invalid id', () => {
    signIn();
    auth.stored = false;
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    signIn(OTHER);
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    signIn();
    localStorage.setItem(`orbit_proof_${sid(1)}`, 'data:image/jpeg;base64,/9j/');
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    expect(cloud.wantsCloudProof(OWNER, 'not-a-uuid')).toBe(false);
  });
});

describe('download', () => {
  it('downloads {owner}/{session}.jpg from the proofs bucket and shows it as a blob: URL', async () => {
    signIn();
    const url = await cloud.loadCloudProof(OWNER, sid(1));
    expect(mockFrom).toHaveBeenCalledWith('proofs');
    expect(mockDownload).toHaveBeenCalledWith(`${OWNER}/${sid(1)}.jpg`);
    expect(url).toBe('blob:orbit/1');
    expect(cloud.cloudProofUrl(OWNER, sid(1))).toBe(url);
    // Loaded once: shown again without another request.
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBe(url);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0); // never in localStorage
  });

  it('remembers "not found" for 10 minutes only', async () => {
    signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    mockDownload.mockResolvedValueOnce(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(mockDownload).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + cloud.MISS_TTL_MS + 1);
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBe('blob:orbit/1');
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a 404 status', { status: 404, statusCode: '404', message: 'Not Found' }],
    ['the not_found error', { status: 400, statusCode: '400', error: 'not_found', message: 'x' }],
  ])('counts %s as not found', async (_label, error) => {
    signIn();
    mockDownload.mockResolvedValueOnce({ data: null, error });
    await cloud.loadCloudProof(OWNER, sid(1));
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
  });

  it('forgets "not found" after a sync and when the app comes back to the foreground', async () => {
    signIn();
    mockDownload.mockResolvedValue(notFound());
    await cloud.loadCloudProof(OWNER, sid(1));
    cloud.forgetCloudProofMisses();
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true);

    await cloud.loadCloudProof(OWNER, sid(1));
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true);
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['an expired token (400 InvalidJWT)', () => Promise.resolve({
      data: null, error: { status: 400, statusCode: '400', code: 'InvalidJWT', message: '"exp" claim timestamp check failed' },
    })],
    ['a server error', () => Promise.resolve({ data: null, error: { status: 500, statusCode: '500', message: 'boom' } })],
  ])('does not remember %s: tries again next time', async (_label, failure) => {
    signIn();
    mockDownload.mockImplementationOnce(failure);
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true);
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBe('blob:orbit/1');
  });

  it('sends at most 3 requests at a time, and one per photo', async () => {
    signIn();
    let running = 0;
    let most = 0;
    const releases = [];
    mockDownload.mockImplementation(() => {
      running += 1;
      most = Math.max(most, running);
      return new Promise(resolve => releases.push(() => { running -= 1; resolve({ data: jpeg(), error: null }); }));
    });
    const loads = [1, 2, 3, 4, 5, 1, 2].map(n => cloud.loadCloudProof(OWNER, sid(n)));
    await vi.waitFor(() => expect(releases.length).toBe(3));
    while (releases.length) {
      releases.shift()();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(5));
    while (releases.length) releases.shift()();
    const results = await Promise.all(loads);
    expect(most).toBe(3);
    expect(mockDownload).toHaveBeenCalledTimes(5);
    expect(results[5]).toBe(results[0]);
    expect(results[6]).toBe(results[1]);
  });

  it('shows and keeps nothing when the account changed during the download', async () => {
    signIn();
    mockDownload.mockImplementationOnce(async () => {
      signIn(OTHER);
      return { data: jpeg(), error: null };
    });
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(cloud.cloudProofUrl(OWNER, sid(1))).toBeNull();
    signIn();
    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValueOnce(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull(); // not cached either
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while signed out', async () => {
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('cache on this device (IndexedDB)', () => {
  it('shows a downloaded photo again after a restart without downloading it', async () => {
    signIn();
    await cloud.loadCloudProof(OWNER, sid(1));
    await freshModule();
    mockDownload.mockClear();
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toMatch(/^blob:/);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it(`keeps at most ${15} MB per account, the longest unseen going first`, async () => {
    signIn();
    const big = () => jpeg(6 * 1024 * 1024);
    for (const n of [1, 2, 3]) {
      mockDownload.mockResolvedValueOnce({ data: big(), error: null });
      await cloud.loadCloudProof(OWNER, sid(n));
      await new Promise(resolve => setTimeout(resolve, 2)); // distinct viewedAt
    }
    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValue(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull(); // evicted: 18 MB > 15 MB
    expect(await cloud.loadCloudProof(OWNER, sid(2))).toMatch(/^blob:/);
    expect(await cloud.loadCloudProof(OWNER, sid(3))).toMatch(/^blob:/);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('signing out forgets that account\'s photos here (memory, misses and cache) only', async () => {
    signIn(OTHER);
    await cloud.loadCloudProof(OTHER, sid(9));
    signIn();
    await cloud.loadCloudProof(OWNER, sid(1));
    mockDownload.mockResolvedValueOnce(notFound());
    await cloud.loadCloudProof(OWNER, sid(2));

    await cloud.clearCloudProofs(OWNER);
    expect(cloud.cloudProofUrl(OWNER, sid(1))).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:orbit/2');
    expect(cloud.wantsCloudProof(OWNER, sid(2))).toBe(true);

    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValue(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(mockDownload).toHaveBeenCalledTimes(1);
    signIn(OTHER);
    expect(await cloud.loadCloudProof(OTHER, sid(9))).toMatch(/^blob:/); // still cached
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});

describe('rows in view', () => {
  let observed;
  let observerCallback;

  beforeEach(() => {
    observed = [];
    globalThis.IntersectionObserver = class {
      constructor(callback) { observerCallback = callback; this.callback = callback; }
      observe(element) { observed.push(element); }
      unobserve(element) { observed = observed.filter(entry => entry !== element); }
      disconnect() { observed = []; }
    };
  });

  afterEach(() => {
    delete globalThis.IntersectionObserver;
    document.body.innerHTML = '';
  });

  function rows(...ids) {
    const container = document.createElement('div');
    container.innerHTML = ids.map(id => `
      <div class="log-item"><span data-proof-cloud-session-id="${id}" hidden></span></div>`).join('');
    document.body.appendChild(container);
    return container;
  }

  it('fetches only the rows that come into view', async () => {
    signIn();
    const container = rows(sid(1), sid(2));
    const onLoaded = vi.fn();
    cloud.observeCloudProofs(container, OWNER, onLoaded);
    expect(observed).toHaveLength(2);
    expect(mockDownload).not.toHaveBeenCalled();

    const [first] = container.querySelectorAll('.log-item');
    observerCallback([{ target: first, isIntersecting: true }]);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(`${OWNER}/${sid(1)}.jpg`);
    expect(onLoaded.mock.calls[0][0].dataset.proofCloudSessionId).toBe(sid(1));
    expect(observed).toHaveLength(1);
  });

  it('does nothing for a guest', () => {
    signIn();
    auth.stored = false;
    cloud.observeCloudProofs(rows(sid(1)), OWNER, vi.fn());
    expect(observed).toHaveLength(0);
  });

  it('replaces the observer when the list is drawn again', () => {
    signIn();
    const container = rows(sid(1));
    cloud.observeCloudProofs(container, OWNER, vi.fn());
    container.innerHTML = '<div class="log-item"><span data-proof-cloud-session-id="' + sid(2) + '" hidden></span></div>';
    cloud.observeCloudProofs(container, OWNER, vi.fn());
    expect(observed).toHaveLength(1);
  });
});

describe('achievement photo', () => {
  const sessions = [{ id: sid(1), taskName: 'Deep work', completedAt: '2026-11-18T08:00:00.000Z' }];
  const unavailable = { status: 'unavailable', sessionId: sid(1), src: null, taskName: 'Deep work', completedAt: sessions[0].completedAt };

  it('downloads the selected photo when this device has none, then shows it as a data URL', async () => {
    signIn();
    const onLoaded = vi.fn();
    expect(cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, onLoaded)).toEqual(unavailable);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    const shown = cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, onLoaded);
    expect(shown.status).toBe('selected');
    expect(shown.src).toMatch(/^data:image\/jpeg;base64,/);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('leaves it as it is for a guest, a selection whose session is gone, or a photo already shown', () => {
    signIn();
    const selected = { ...unavailable, status: 'selected', src: 'data:image/jpeg;base64,/9j/' };
    expect(cloud.withCloudAchievementPhoto(OWNER, sessions, selected, vi.fn())).toBe(selected);
    expect(cloud.withCloudAchievementPhoto(OWNER, [], unavailable, vi.fn())).toBe(unavailable);
    auth.stored = false;
    expect(cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, vi.fn())).toBe(unavailable);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
