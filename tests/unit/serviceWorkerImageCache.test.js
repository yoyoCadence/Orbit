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
    location: { origin: 'https://orbit.test' },
  });
  vi.stubGlobal('caches', cachesApi);
  vi.stubGlobal('fetch', fetchMock);
  await import('../../pwa/sw.js');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service worker image cache-first strategy', () => {
  it('leaves cross-origin Supabase GET requests to the browser network layer', () => {
    const request = {
      method: 'GET',
      url: 'https://project.supabase.co/rest/v1/tasks?select=*',
    };

    expect(dispatchFetch(request)).toBeUndefined();
    expect(cachesApi.open).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

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

describe('service worker JS / CSS: this version\'s code (INFRA-107)', () => {
  it('serves the cached module and does not refresh it in the background', async () => {
    // Refreshing it would pair this version's HTML with the next version's code
    // whenever the next worker fails to install.
    const request = { method: 'GET', url: 'https://orbit.test/js/app.js' };
    const cachedResponse = { ok: true, source: 'cache' };
    cache.match.mockResolvedValueOnce(cachedResponse);

    expect(await dispatchFetch(request)).toBe(cachedResponse);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('fetches a module that is not cached from the server, not the HTTP cache (INFRA-105), and keeps it', async () => {
    const request = { method: 'GET', url: 'https://orbit.test/js/app.js' };
    const clonedResponse = { ok: true, source: 'clone' };
    const networkResponse = { ok: true, clone: vi.fn(() => clonedResponse) };
    cache.match.mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(networkResponse);

    expect(await dispatchFetch(request)).toBe(networkResponse);
    expect(fetchMock).toHaveBeenCalledWith(request, { cache: 'no-cache' });
    expect(cache.put).toHaveBeenCalledWith(request, clonedResponse);
  });

  it('does not keep an error response for a module', async () => {
    const request = { method: 'GET', url: 'https://orbit.test/js/app.js' };
    const errorResponse = { ok: false, status: 503, clone: vi.fn() };
    cache.match.mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(errorResponse);

    expect(await dispatchFetch(request)).toBe(errorResponse);
    expect(cache.put).not.toHaveBeenCalled();
    expect(errorResponse.clone).not.toHaveBeenCalled();
  });
});

describe('service worker page loads (INFRA-107)', () => {
  it('serves the site root under a sub-path from this version\'s cache, ignoring the query', async () => {
    // GitHub Pages serves the app at /Orbit/; an auth redirect adds ?code=.
    const request = { method: 'GET', mode: 'navigate', url: 'https://orbit.test/Orbit/?code=abc' };
    const cachedResponse = { ok: true, source: 'cache' };
    cache.match.mockResolvedValueOnce(cachedResponse);

    expect(await dispatchFetch(request)).toBe(cachedResponse);
    expect(cache.match).toHaveBeenCalledWith(request, { ignoreSearch: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('serves index.html, the installed app\'s start page, from the cache too', async () => {
    const request = { method: 'GET', mode: 'navigate', url: 'https://orbit.test/Orbit/index.html' };
    const cachedResponse = { ok: true, source: 'cache' };
    cache.match.mockResolvedValueOnce(cachedResponse);

    expect(await dispatchFetch(request)).toBe(cachedResponse);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a page that is not cached and keeps it under its URL without the query', async () => {
    const request = { method: 'GET', mode: 'navigate', url: 'https://orbit.test/Orbit/make-icons.html?size=192' };
    const clonedResponse = { ok: true, source: 'clone' };
    const networkResponse = { ok: true, redirected: false, clone: vi.fn(() => clonedResponse) };
    cache.match.mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(networkResponse);

    expect(await dispatchFetch(request)).toBe(networkResponse);
    expect(fetchMock).toHaveBeenCalledWith(request);
    expect(cache.put).toHaveBeenCalledWith('https://orbit.test/Orbit/make-icons.html', clonedResponse);
  });

  it('does not keep an error, a redirect or a redirected page', async () => {
    const request = { method: 'GET', mode: 'navigate', url: 'https://orbit.test/Orbit/missing' };
    for (const response of [
      { ok: false, status: 404, clone: vi.fn() },
      { ok: false, status: 0, type: 'opaqueredirect', clone: vi.fn() },
      { ok: true, redirected: true, clone: vi.fn() },
    ]) {
      cache.match.mockResolvedValueOnce(undefined);
      fetchMock.mockResolvedValueOnce(response);
      expect(await dispatchFetch(request)).toBe(response);
      expect(response.clone).not.toHaveBeenCalled();
    }
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('leaves the page load to fail offline when the page was never cached', async () => {
    const request = { method: 'GET', mode: 'navigate', url: 'https://orbit.test/Orbit/missing' };
    cache.match.mockResolvedValueOnce(undefined);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(dispatchFetch(request)).rejects.toThrow('Failed to fetch');
    expect(cache.put).not.toHaveBeenCalled();
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
