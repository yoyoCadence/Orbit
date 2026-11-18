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

  it('shows nothing that is not a JPEG (a proxy\'s error page), and tries again later', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce({ data: new Blob(['{"ok":true}'], { type: 'application/json' }), error: null });
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull();
    expect(cloud.cloudProofUrl(OWNER, sid(1))).toBeNull();
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true);
  });

  it('gives up on a request that never answers, so the next photos still load', async () => {
    signIn();
    const timers = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (delay === cloud.DOWNLOAD_TIMEOUT_MS) { timers.push(fn); return 0; }
      return realSetTimeout(fn, delay, ...args);
    });
    try {
      mockDownload.mockImplementation(path => (path.includes(sid(4))
        ? Promise.resolve({ data: jpeg(), error: null })
        : new Promise(() => {}))); // hangs
      const loads = [1, 2, 3, 4].map(n => cloud.loadCloudProof(OWNER, sid(n)));
      await vi.waitFor(() => expect(timers).toHaveLength(3));
      expect(mockDownload).toHaveBeenCalledTimes(3);
      timers.forEach(fire => fire());
      expect(await loads[3]).toMatch(/^blob:/);
      expect(await loads[0]).toBeNull();
      expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(true); // tried again later
    } finally {
      spy.mockRestore();
    }
  });

  it('lets go of the oldest photos past the memory limit, never one on the page', async () => {
    signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = await cloud.loadCloudProof(OWNER, sid(1));
    const second = await cloud.loadCloudProof(OWNER, sid(2));
    const shown = document.createElement('img');
    shown.setAttribute('src', first);
    document.body.appendChild(shown);
    vi.setSystemTime(Date.now() + 60 * 1000); // no longer just loaded
    for (let n = 3; n <= cloud.MEMORY_MAX_PHOTOS + 1; n += 1) await cloud.loadCloudProof(OWNER, sid(n));
    expect(cloud.cloudProofUrl(OWNER, sid(1))).toBe(first); // on the page
    expect(cloud.cloudProofUrl(OWNER, sid(2))).toBeNull(); // let go…
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(second);
    mockDownload.mockClear();
    expect(await cloud.loadCloudProof(OWNER, sid(2))).toMatch(/^blob:/); // …back from the cache
    expect(mockDownload).not.toHaveBeenCalled();
    shown.remove();
  });

  it('keeps a new photo past the memory limit when all the others are on the page', async () => {
    signIn();
    const shown = [];
    for (let n = 1; n <= cloud.MEMORY_MAX_PHOTOS; n += 1) {
      const img = document.createElement('img');
      img.setAttribute('src', await cloud.loadCloudProof(OWNER, sid(n)));
      document.body.appendChild(img);
      shown.push(img);
    }
    const added = await cloud.loadCloudProof(OWNER, sid(cloud.MEMORY_MAX_PHOTOS + 1));
    expect(added).toMatch(/^blob:/);
    expect(cloud.cloudProofUrl(OWNER, sid(cloud.MEMORY_MAX_PHOTOS + 1))).toBe(added);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    shown.forEach(img => img.remove());
  });

  it('never lets go of photos still on their way to the page (several loading at once)', async () => {
    signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    const shown = [];
    for (let n = 1; n <= cloud.MEMORY_MAX_PHOTOS; n += 1) {
      const img = document.createElement('img');
      img.setAttribute('src', await cloud.loadCloudProof(OWNER, sid(n)));
      document.body.appendChild(img);
      shown.push(img);
    }
    vi.setSystemTime(Date.now() + 60 * 1000);
    const urls = await Promise.all([1, 2, 3].map(n => cloud.loadCloudProof(OWNER, sid(cloud.MEMORY_MAX_PHOTOS + n))));
    [1, 2, 3].forEach((n, i) => expect(cloud.cloudProofUrl(OWNER, sid(cloud.MEMORY_MAX_PHOTOS + n))).toBe(urls[i]));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    shown.forEach(img => img.remove());
  });

  it('never joins a download started before a sign-out (same account signing in again)', async () => {
    signIn();
    mockDownload.mockImplementationOnce(() => new Promise(() => {})); // still out at sign-out
    void cloud.loadCloudProof(OWNER, sid(1));
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await cloud.clearCloudProofs(OWNER);
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toMatch(/^blob:/);
    expect(mockDownload).toHaveBeenCalledTimes(2);
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

  it('keeps nothing that arrives after sign-out cleared the cache', async () => {
    signIn();
    let release;
    const slow = jpeg();
    const bytes = slow.arrayBuffer.bind(slow);
    slow.arrayBuffer = () => new Promise(resolve => { release = () => resolve(bytes()); });
    mockDownload.mockResolvedValueOnce({ data: slow, error: null });
    const loading = cloud.loadCloudProof(OWNER, sid(1));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await cloud.clearCloudProofs(OWNER); // sign-out while the photo is being stored
    release();
    await loading;

    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValue(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toBeNull(); // not in the cache
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('keeps only the signed-in account\'s photos at a sync (another account never signed out here)', async () => {
    signIn(OTHER);
    await cloud.loadCloudProof(OTHER, sid(9));
    signIn();
    await cloud.loadCloudProof(OWNER, sid(1));
    await cloud.keepCloudProofsOf(OWNER);
    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValue(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toMatch(/^blob:/);
    signIn(OTHER);
    expect(await cloud.loadCloudProof(OTHER, sid(9))).toBeNull(); // gone from the cache
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('a sync of an account switched away from leaves the signed-in account\'s photos', async () => {
    signIn();
    await cloud.loadCloudProof(OWNER, sid(1));
    await cloud.keepCloudProofsOf(OTHER); // OTHER's late sync: not signed in any more
    await freshModule();
    mockDownload.mockClear();
    mockDownload.mockResolvedValue(notFound());
    expect(await cloud.loadCloudProof(OWNER, sid(1))).toMatch(/^blob:/);
    expect(mockDownload).not.toHaveBeenCalled();
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

  it('looks again at a row that found nothing once "not found" is forgotten (sync, foreground)', async () => {
    signIn();
    const container = rows(sid(1));
    const onLoaded = vi.fn();
    mockDownload.mockResolvedValueOnce(notFound());
    cloud.observeCloudProofs(container, OWNER, onLoaded);
    const [row] = container.querySelectorAll('.log-item');
    observerCallback([{ target: row, isIntersecting: true }]);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(observed).toHaveLength(0));

    cloud.forgetCloudProofMisses(); // the other device has uploaded it since
    expect(observed).toEqual([row]);
    observerCallback([{ target: row, isIntersecting: true }]);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('looks again after an offline failure when the next sync runs', async () => {
    signIn();
    const container = rows(sid(1));
    mockDownload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    cloud.observeCloudProofs(container, OWNER, vi.fn());
    const [row] = container.querySelectorAll('.log-item');
    observerCallback([{ target: row, isIntersecting: true }]);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(observed).toHaveLength(0);
    cloud.forgetCloudProofMisses();
    expect(observed).toEqual([row]);
  });

  it('looks again when "not found" runs out, and not before', async () => {
    signIn();
    const timers = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (delay >= cloud.MISS_TTL_MS) { timers.push(fn); return 0; }
      return realSetTimeout(fn, delay, ...args);
    });
    try {
      const container = rows(sid(1));
      mockDownload.mockResolvedValueOnce(notFound());
      cloud.observeCloudProofs(container, OWNER, vi.fn());
      const [row] = container.querySelectorAll('.log-item');
      observerCallback([{ target: row, isIntersecting: true }]);
      await vi.waitFor(() => expect(timers).toHaveLength(1));
      vi.useFakeTimers({ toFake: ['Date'] });
      timers[0](); // too early: the "not found" still holds
      expect(observed).toHaveLength(0);
      vi.setSystemTime(Date.now() + cloud.MISS_TTL_MS + 1);
      await vi.waitFor(() => expect(timers).toHaveLength(2));
      timers[1]();
      expect(observed).toEqual([row]);
    } finally {
      spy.mockRestore();
    }
  });

  it('shows a row\'s photo that arrived by another path (the achievement photo) when looking again', async () => {
    signIn();
    const container = rows(sid(1));
    const onLoaded = vi.fn();
    mockDownload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    cloud.observeCloudProofs(container, OWNER, onLoaded);
    const [row] = container.querySelectorAll('.log-item');
    observerCallback([{ target: row, isIntersecting: true }]);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    const url = await cloud.loadCloudProof(OWNER, sid(1)); // loaded elsewhere
    cloud.forgetCloudProofMisses();
    expect(onLoaded).toHaveBeenCalledWith(row.querySelector('[data-proof-cloud-session-id]'), url);
    expect(observed).toHaveLength(0);
  });

  it('a row drawn again during a recent "not found" keeps its place and is looked at once it is forgotten', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce(notFound());
    await cloud.loadCloudProof(OWNER, sid(1)); // seen on another page a moment ago
    expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false);
    expect(cloud.wantsCloudProof(OWNER, sid(1), { evenIfMissed: true })).toBe(true);

    const container = rows(sid(1)); // the page drawn again
    const onLoaded = vi.fn();
    cloud.observeCloudProofs(container, OWNER, onLoaded);
    const [row] = container.querySelectorAll('.log-item');
    observerCallback([{ target: row, isIntersecting: true }]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockDownload).toHaveBeenCalledTimes(1); // still a fresh miss: no request

    cloud.forgetCloudProofMisses();
    expect(observed).toEqual([row]);
    observerCallback([{ target: row, isIntersecting: true }]);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('looks again when the "not found" runs out, not a whole period later', async () => {
    signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    mockDownload.mockResolvedValueOnce(notFound());
    await cloud.loadCloudProof(OWNER, sid(1)); // seen missing on another page
    vi.setSystemTime(Date.now() + 9 * 60 * 1000); // nine minutes later
    const delays = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (delay > 30 * 1000) { delays.push(delay); return 0; }
      return realSetTimeout(fn, delay, ...args);
    });
    try {
      const container = rows(sid(1));
      cloud.observeCloudProofs(container, OWNER, vi.fn());
      const [row] = container.querySelectorAll('.log-item');
      observerCallback([{ target: row, isIntersecting: true }]);
      await vi.waitFor(() => expect(delays).toHaveLength(1));
      expect(delays[0]).toBeLessThanOrEqual(61 * 1000);
    } finally {
      spy.mockRestore();
    }
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

  it('tells only the latest caller, once, when asked again while it downloads', async () => {
    signIn();
    let release;
    mockDownload.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ data: jpeg(), error: null }); }));
    const callers = [vi.fn(), vi.fn(), vi.fn()];
    for (const caller of callers) cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, caller);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await vi.waitFor(() => expect(callers[2]).toHaveBeenCalledTimes(1));
    expect(callers[0]).not.toHaveBeenCalled();
    expect(callers[1]).not.toHaveBeenCalled();
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('tries a selected photo that found nothing again when "not found" is forgotten; the page drawn last is told', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce(notFound());
    const first = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, first);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false));
    const later = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, later); // drawn again meanwhile
    expect(mockDownload).toHaveBeenCalledTimes(1);

    cloud.forgetCloudProofMisses(); // sync or back to the foreground: it is there now
    await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, vi.fn()).status).toBe('selected');
  });

  it('updates the frame without downloading when a row loaded the photo meanwhile', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce({ data: null, error: { status: 500, statusCode: '500', message: 'boom' } });
    const onLoaded = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, onLoaded);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    await cloud.loadCloudProof(OWNER, sid(1)); // the history row, scrolled into view
    expect(mockDownload).toHaveBeenCalledTimes(2);
    cloud.forgetCloudProofMisses();
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('tries a selected photo a history row just found missing once that is forgotten', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce(notFound());
    await cloud.loadCloudProof(OWNER, sid(1)); // the row's lookup
    const onLoaded = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, onLoaded);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    cloud.forgetCloudProofMisses();
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('stops trying a photo that is no longer the selected one', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce(notFound());
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, vi.fn());
    await vi.waitFor(() => expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false));
    // The selection is cleared (or moved): the page draws an empty frame.
    cloud.withCloudAchievementPhoto(OWNER, sessions, { status: 'empty', sessionId: null }, vi.fn());
    mockDownload.mockClear();
    cloud.forgetCloudProofMisses();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('a sign-out drops the page waiting for a photo, so the next page loads its own', async () => {
    signIn();
    mockDownload.mockImplementationOnce(() => new Promise(() => {})); // still out
    const before = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, before);
    await vi.waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    await cloud.clearCloudProofs(OWNER); // sign-out, then the same account again
    const after = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, after);
    await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
    expect(before).not.toHaveBeenCalled();
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('stops trying the photo of a session deleted while it was selected', async () => {
    signIn();
    mockDownload.mockResolvedValueOnce(notFound());
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, vi.fn());
    await vi.waitFor(() => expect(cloud.wantsCloudProof(OWNER, sid(1))).toBe(false));
    cloud.withCloudAchievementPhoto(OWNER, [], unavailable, vi.fn()); // the session is gone
    mockDownload.mockClear();
    cloud.forgetCloudProofMisses();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('keeps the photo the frame shows in memory past the limit', async () => {
    signIn();
    vi.useFakeTimers({ toFake: ['Date'] });
    const onLoaded = vi.fn();
    cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, onLoaded);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    vi.setSystemTime(Date.now() + 60 * 1000);
    for (let n = 2; n <= cloud.MEMORY_MAX_PHOTOS + 2; n += 1) await cloud.loadCloudProof(OWNER, sid(n));
    vi.setSystemTime(Date.now() + 60 * 1000);
    await cloud.loadCloudProof(OWNER, sid(cloud.MEMORY_MAX_PHOTOS + 3));
    expect(cloud.withCloudAchievementPhoto(OWNER, sessions, unavailable, vi.fn()).status).toBe('selected');
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
