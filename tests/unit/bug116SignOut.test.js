// @vitest-environment jsdom
/**
 * bug116SignOut.test.js — BUG-116
 *
 * Signing out must remove the session stored on this device even when
 * supabase-js cannot load it: with an expired access token and no network the
 * SDK's signOut() fails the refresh and returns before removing anything.
 *
 * Runs the real vendored client against a mocked fetch, so a change in the
 * SDK's behaviour shows up here.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// supabase-js keeps the fetch it finds when the client is created.
const fetchMock = vi.hoisted(() => {
  const mock = vi.fn();
  globalThis.fetch = mock;
  return mock;
});

const network = vi.hoisted(() => ({ online: true }));
vi.mock('../../pwa/js/platform/network.js', () => ({
  isOnline: () => network.online,
  onConnectivityChange: () => () => {},
}));

let supabase;
let signOut;
const events = [];

beforeAll(async () => {
  ({ supabase } = await import('../../pwa/js/supabase.js'));
  ({ signOut } = await import('../../pwa/js/auth.js'));
  await supabase.auth.initialize();
  await supabase.auth.stopAutoRefresh();
  supabase.auth.onAuthStateChange(event => { events.push(event); });
});

const key = () => supabase.auth.storageKey;

function storeSession({ expired }) {
  const now = Math.floor(Date.now() / 1000);
  localStorage.setItem(key(), JSON.stringify({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expired ? now - 3600 : now + 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated' },
  }));
  localStorage.setItem(`${key()}-user`, JSON.stringify({ user: { id: '00000000-0000-4000-8000-000000000001' } }));
}

const requested = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname + new URL(String(url)).search);

beforeEach(() => {
  localStorage.clear();
  events.length = 0;
  network.online = true;
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BUG-116 signOut removes the session on this device', () => {
  it('is the SDK key the app and the leaderboard read', () => {
    expect(key()).toMatch(/^sb-[a-z0-9]+-auth-token$/);
    expect(supabase.auth.storage).toBe(window.localStorage);
  });

  it('offline: removes the expired session at once, without a request', async () => {
    network.online = false;
    storeSession({ expired: true });

    const started = Date.now();
    await expect(signOut()).resolves.toBeNull();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(key())).toBeNull();
    expect(localStorage.getItem(`${key()}-user`)).toBeNull();
    expect(events).toContain('SIGNED_OUT');
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  it('online but unreachable: the refresh fails, and the session is still removed', async () => {
    vi.useFakeTimers();
    storeSession({ expired: true });

    const pending = signOut();
    await vi.runAllTimersAsync();
    const error = await pending;

    // The SDK tried to refresh and gave up with a retryable error…
    expect(requested().every(path => path === '/auth/v1/token?grant_type=refresh_token')).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(error?.name).toBe('AuthRetryableFetchError');
    // …which on its own would have left the refresh token on the device.
    expect(localStorage.getItem(key())).toBeNull();
    expect(localStorage.getItem(`${key()}-user`)).toBeNull();
    expect(events).toContain('SIGNED_OUT');
  });

  it('online: revokes the session on the server and needs nothing more', async () => {
    fetchMock.mockResolvedValue(new globalThis.Response(null, { status: 204 }));
    storeSession({ expired: false });
    const sdkSignOut = vi.spyOn(supabase.auth, 'signOut');

    await expect(signOut()).resolves.toBeNull();

    expect(requested()).toEqual(['/auth/v1/logout?scope=global']);
    expect(sdkSignOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key())).toBeNull();
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('removes the session when the SDK throws instead of returning an error', async () => {
    storeSession({ expired: true });
    const thrown = new Error('lock timeout');
    vi.spyOn(supabase.auth, 'signOut').mockRejectedValueOnce(thrown);

    await expect(signOut()).resolves.toBe(thrown);

    expect(localStorage.getItem(key())).toBeNull();
    expect(events).toContain('SIGNED_OUT');
  });
});
