import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = {};
const cache = {
  addAll: vi.fn(() => Promise.resolve()),
  match: vi.fn(),
  put: vi.fn(() => Promise.resolve()),
};
const cachesApi = {
  open: vi.fn(() => Promise.resolve(cache)),
  keys: vi.fn(() => Promise.resolve([])),
  delete: vi.fn(),
};
const fetchMock = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('self', {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  });
  vi.stubGlobal('caches', cachesApi);
  vi.stubGlobal('fetch', fetchMock);
  await import('../../pwa/sw.js');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service worker image cache-first strategy', () => {
  it('persists a successful network response and reuses a cached response', async () => {
    const request = { method: 'GET', url: 'https://orbit.test/assets/workspace.png' };
    const clonedResponse = { ok: true, source: 'clone' };
    const networkResponse = { ok: true, clone: vi.fn(() => clonedResponse) };
    cache.match.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(networkResponse);

    const first = await dispatchFetch(request);

    expect(first).toBe(networkResponse);
    expect(cache.put).toHaveBeenCalledWith(request, clonedResponse);

    const cachedResponse = { ok: true, source: 'cache' };
    cache.match.mockResolvedValueOnce(cachedResponse);
    const second = await dispatchFetch(request);

    expect(second).toBe(cachedResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache an unsuccessful network response', async () => {
    const request = { method: 'GET', url: 'https://orbit.test/assets/missing.png' };
    const networkResponse = { ok: false, clone: vi.fn() };
    cache.match.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(networkResponse);

    expect(await dispatchFetch(request)).toBe(networkResponse);
    expect(cache.put).not.toHaveBeenCalled();
    expect(networkResponse.clone).not.toHaveBeenCalled();
  });
});

function dispatchFetch(request) {
  let responsePromise;
  listeners.fetch({
    request,
    respondWith: value => { responsePromise = value; },
  });
  return responsePromise;
}
