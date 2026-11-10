// @vitest-environment jsdom
/**
 * streakUnlock.test.js — PRO-014L2: SUB-16 is granted by the server.
 *
 * Proposal: docs/pro-014l-streak-unlock-server.md §5.3 (approved). The client
 * asks grant_streak_unlock() (migration 012); db.grantStreakUnlock() validates
 * the answer and writes it back to the legacy profile under the rule "extend
 * only, never shorten, never cancel"; streakUnlock.js decides when to ask.
 *
 * Real storage.js / proRollover.js / proEntitlement.js; the network, the day
 * and the modal are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })));
const session = vi.hoisted(() => ({ ownerId: 'owner-1' }));
const day = vi.hoisted(() => ({ value: '2026-11-10' }));
const modal = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc,
    from: () => {
      const self = {
        select: () => self,
        eq: () => self,
        upsert,
        update: () => Promise.resolve({ error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      storageKey: 'sb-test-auth-token',
      getSession: () => Promise.resolve({
        data: { session: session.ownerId ? { user: { id: session.ownerId } } : null },
      }),
    },
  },
}));
vi.mock('../../pwa/js/dayCycle.js', () => ({
  eToday: () => day.value,
  showStreakUnlockModal: modal,
}));

import { state } from '../../pwa/js/state.js';
import { db, storage } from '../../pwa/js/storage.js';
import { resetProEntitlementStorageState } from '../../pwa/js/platform/proEntitlement.js';
import {
  STREAK_UNLOCK_ASKED_KEY,
  requestStreakUnlock,
  shouldAskStreakUnlock,
} from '../../pwa/js/streakUnlock.js';
import { hasStoredSession } from '../../pwa/js/sessionPresence.js';

const OWNER = 'owner-1';
const SERVER_END = '2026-12-10T08:00:00.000Z';
const GRANTED_AT = '2026-11-10T08:00:00.000Z';

function row(fields) {
  return {
    status: 'granted', granted: true, is_active: true, paid_active: true,
    expires_at: SERVER_END, granted_at: GRANTED_AT, ...fields,
  };
}

function answer(fields) {
  rpc.mockResolvedValueOnce({ data: [row(fields)], error: null });
}

/** A signed-in free user with a 45-day streak, stored and in memory alike. */
function seedUser(fields = {}) {
  const user = {
    id: OWNER, newDayHour: 5, streakDays: 45, streakUnlockUsed: false,
    isPro: false, proExpiresAt: null, trialStartedAt: null, ...fields,
  };
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  state.user = { ...user };
  return state.user;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetProEntitlementStorageState();
  rpc.mockReset();
  upsert.mockClear();
  modal.mockReset();
  session.ownerId = OWNER;
  day.value = '2026-11-10';
});

describe('db.grantStreakUnlock(): write-back to the legacy profile', () => {
  it('granted on a free profile: paid Pro until the server’s end, unlock recorded, profile pushed', async () => {
    const user = seedUser();
    answer({});
    const out = await db.grantStreakUnlock(OWNER, () => user);
    expect(rpc).toHaveBeenCalledWith('grant_streak_unlock');
    expect(out).toMatchObject({ ok: true, ownerChanged: false, recovered: false });
    expect(user).toMatchObject({ isPro: true, proExpiresAt: SERVER_END, streakUnlockUsed: true });
    expect(storage.getUser()).toMatchObject({ isPro: true, proExpiresAt: SERVER_END, streakUnlockUsed: true });
    await flush();
    expect(upsert).toHaveBeenCalled();
  });

  it('a free profile (isPro false, no date) is not mistaken for lifetime', async () => {
    const user = seedUser({ isPro: false, proExpiresAt: null });
    answer({});
    await db.grantStreakUnlock(OWNER, () => user);
    expect(user.isPro).toBe(true);
    expect(user.proExpiresAt).toBe(SERVER_END);
  });

  it('answer lost, retried: already_granted + paid_active writes the Pro back and reports recovered', async () => {
    const user = seedUser();
    answer({ status: 'already_granted', granted: false });
    const out = await db.grantStreakUnlock(OWNER, () => user);
    expect(out.recovered).toBe(true);
    expect(user).toMatchObject({ isPro: true, proExpiresAt: SERVER_END, streakUnlockUsed: true });
  });

  it('a backfilled account in its trial (paid_active false) does not become lifetime', async () => {
    const user = seedUser({ trialStartedAt: '2026-11-05T00:00:00.000Z' });
    answer({ status: 'already_granted', granted: false, is_active: true, paid_active: false, expires_at: null });
    const out = await db.grantStreakUnlock(OWNER, () => user);
    expect(out.recovered).toBe(false);
    expect(user).toMatchObject({ isPro: false, proExpiresAt: null, streakUnlockUsed: true });
  });

  it('paid expired on the server does not cancel Pro still valid in the profile', async () => {
    const user = seedUser({ isPro: true, proExpiresAt: '2026-11-20T00:00:00.000Z' });
    answer({ status: 'already_granted', granted: false, is_active: false, paid_active: false, expires_at: '2026-11-01T00:00:00.000Z' });
    await db.grantStreakUnlock(OWNER, () => user);
    expect(user).toMatchObject({ isPro: true, proExpiresAt: '2026-11-20T00:00:00.000Z', streakUnlockUsed: true });
  });

  it('a lifetime profile is never shortened', async () => {
    const user = seedUser({ isPro: true, proExpiresAt: null });
    answer({ status: 'already_granted', granted: false });
    await db.grantStreakUnlock(OWNER, () => user);
    expect(user).toMatchObject({ isPro: true, proExpiresAt: null });
  });

  it('a profile that already runs later is not shortened; an earlier one is extended', async () => {
    const later = seedUser({ isPro: true, proExpiresAt: '2027-01-01T00:00:00.000Z' });
    answer({ status: 'already_granted', granted: false });
    await db.grantStreakUnlock(OWNER, () => later);
    expect(later.proExpiresAt).toBe('2027-01-01T00:00:00.000Z');

    const earlier = seedUser({ isPro: true, proExpiresAt: '2026-11-15T00:00:00.000Z' });
    answer({ status: 'already_granted', granted: false });
    await db.grantStreakUnlock(OWNER, () => earlier);
    expect(earlier.proExpiresAt).toBe(SERVER_END);
  });

  it('a lifetime server account (expires_at null, paid) mirrors lifetime', async () => {
    const user = seedUser({ isPro: true, proExpiresAt: '2026-11-15T00:00:00.000Z' });
    answer({ status: 'already_granted', granted: false, expires_at: null });
    await db.grantStreakUnlock(OWNER, () => user);
    expect(user).toMatchObject({ isPro: true, proExpiresAt: null });
  });

  it.each([
    ['not_eligible', { status: 'not_eligible', granted: false, is_active: false, paid_active: false, expires_at: null, granted_at: null }],
    ['active_entitlement', { status: 'active_entitlement', granted: false, is_active: true, paid_active: false, expires_at: null, granted_at: null }],
  ])('%s writes nothing', async (_, fields) => {
    const user = seedUser();
    answer(fields);
    const out = await db.grantStreakUnlock(OWNER, () => user);
    expect(out.ok).toBe(true);
    expect(out.result.status).toBe(fields.status);
    expect(user).toMatchObject({ isPro: false, proExpiresAt: null, streakUnlockUsed: false });
    expect(JSON.parse(localStorage.getItem('yoyo_user')).streakUnlockUsed).toBe(false);
  });

  it.each([
    ['an unknown status', { status: 'maybe' }],
    ['granted flag that contradicts the status', { status: 'not_eligible', granted: true }],
    ['paid without active', { paid_active: true, is_active: false }],
    ['a grant that is not paid', { paid_active: false }],
    ['a grant without an end', { expires_at: null }],
    ['a grant without a time', { granted_at: null }],
    ['a time that is not a time', { expires_at: 'soon' }],
    ['already_granted without the marker time', { status: 'already_granted', granted: false, granted_at: null }],
    ['a non-boolean paid_active', { paid_active: 'yes' }],
  ])('rejects %s and writes nothing', async (_, fields) => {
    const user = seedUser();
    answer(fields);
    const out = await db.grantStreakUnlock(OWNER, () => user);
    expect(out).toEqual({ ok: false, ownerChanged: false });
    expect(user).toMatchObject({ isPro: false, streakUnlockUsed: false });
  });

  it('rejects more than one row', async () => {
    const user = seedUser();
    rpc.mockResolvedValueOnce({ data: [row({}), row({})], error: null });
    expect(await db.grantStreakUnlock(OWNER, () => user)).toEqual({ ok: false, ownerChanged: false });
  });

  it('an RPC error or a network failure writes nothing', async () => {
    const user = seedUser();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' }, status: 0 });
    expect(await db.grantStreakUnlock(OWNER, () => user)).toEqual({ ok: false, ownerChanged: false });
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await db.grantStreakUnlock(OWNER, () => user)).toEqual({ ok: false, ownerChanged: false });
    expect(user.streakUnlockUsed).toBe(false);
  });

  it('another account signed in: no request, nothing written', async () => {
    const user = seedUser();
    session.ownerId = 'someone-else';
    expect(await db.grantStreakUnlock(OWNER, () => user)).toEqual({ ok: false, ownerChanged: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refreshes the entitlement projection after a grant (no-op on legacy)', async () => {
    const user = seedUser();
    const refresh = vi.spyOn(db, 'refreshProEntitlement');
    answer({});
    await db.grantStreakUnlock(OWNER, () => user);
    expect(refresh).toHaveBeenCalledWith(OWNER);
    refresh.mockRestore();
  });
});

describe('requestStreakUnlock(): when to ask', () => {
  it('asks only for a signed-in user with a 45-day streak, unlock unused, not known Pro', () => {
    seedUser();
    expect(shouldAskStreakUnlock(OWNER)).toBe(true);
    expect(shouldAskStreakUnlock('someone-else')).toBe(false);
    seedUser({ streakDays: 44 });
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
    seedUser({ streakUnlockUsed: true });
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
    seedUser({ isPro: true, proExpiresAt: null });                    // legacy: known Pro
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
    state.user = null;
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
  });

  it('granted: updates the screen and shows the celebration once', async () => {
    seedUser();
    answer({});
    const onChange = vi.fn();
    await expect(requestStreakUnlock(OWNER, { onChange, delayMs: 0 })).resolves.toBe('granted');
    expect(onChange).toHaveBeenCalledTimes(1);
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
    expect(state.user).toMatchObject({ isPro: true, streakUnlockUsed: true });
    // Recorded now: the next sync does not ask again.
    await expect(requestStreakUnlock(OWNER)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('recovered after a lost answer: celebrates too', async () => {
    seedUser();
    answer({ status: 'already_granted', granted: false });
    await requestStreakUnlock(OWNER, { delayMs: 0 });
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
  });

  it('already_granted without paid access: recorded quietly, no celebration', async () => {
    seedUser();
    answer({ status: 'already_granted', granted: false, is_active: false, paid_active: false, expires_at: null });
    await requestStreakUnlock(OWNER, { delayMs: 0 });
    await flush();
    expect(modal).not.toHaveBeenCalled();
    expect(state.user.streakUnlockUsed).toBe(true);
  });

  it('a refusal waits for the next day (owner-scoped), so syncs do not call every time', async () => {
    seedUser();
    answer({ status: 'not_eligible', granted: false, is_active: false, paid_active: false, expires_at: null, granted_at: null });
    await expect(requestStreakUnlock(OWNER)).resolves.toBe('not_eligible');
    expect(JSON.parse(localStorage.getItem(STREAK_UNLOCK_ASKED_KEY))).toEqual({ ownerId: OWNER, day: '2026-11-10' });
    await expect(requestStreakUnlock(OWNER)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);

    day.value = '2026-11-11';
    answer({ status: 'active_entitlement', granted: false, is_active: true, paid_active: false, expires_at: null, granted_at: null });
    await expect(requestStreakUnlock(OWNER)).resolves.toBe('active_entitlement');
    expect(rpc).toHaveBeenCalledTimes(2);

    localStorage.setItem(STREAK_UNLOCK_ASKED_KEY, JSON.stringify({ ownerId: 'someone-else', day: '2026-11-11' }));
    expect(shouldAskStreakUnlock(OWNER)).toBe(true);
  });

  it('a failure leaves nothing behind: the next sync asks again', async () => {
    seedUser();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(requestStreakUnlock(OWNER)).resolves.toBeNull();
    expect(localStorage.getItem(STREAK_UNLOCK_ASKED_KEY)).toBeNull();
    expect(shouldAskStreakUnlock(OWNER)).toBe(true);
  });

  it('not_eligible while Sessions wait to upload is not remembered: the sync that uploads them asks again', async () => {
    seedUser();
    const pendingKey = `yoyo_sessionSyncPending:${OWNER}`;
    localStorage.setItem(pendingKey, JSON.stringify({ ownerId: OWNER, value: [{ id: 'offline-day' }] }));
    const notEligible = { status: 'not_eligible', granted: false, is_active: false, paid_active: false, expires_at: null, granted_at: null };

    answer(notEligible);
    await expect(requestStreakUnlock(OWNER)).resolves.toBe('not_eligible');
    expect(localStorage.getItem(STREAK_UNLOCK_ASKED_KEY)).toBeNull();
    expect(shouldAskStreakUnlock(OWNER)).toBe(true);

    // Uploaded (queue empty): now the server has seen every day, so a refusal holds for the day.
    localStorage.removeItem(pendingKey);
    answer(notEligible);
    await expect(requestStreakUnlock(OWNER)).resolves.toBe('not_eligible');
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('active_entitlement does not depend on Sessions: remembered even with uploads pending', async () => {
    seedUser();
    localStorage.setItem(`yoyo_sessionSyncPending:${OWNER}`, JSON.stringify({ ownerId: OWNER, value: [{ id: 'offline-day' }] }));
    answer({ status: 'active_entitlement', granted: false, is_active: true, paid_active: false, expires_at: null, granted_at: null });
    await expect(requestStreakUnlock(OWNER)).resolves.toBe('active_entitlement');
    expect(shouldAskStreakUnlock(OWNER)).toBe(false);
  });

  it('a sync that replaced the profile during the request keeps its changes and gets the grant', async () => {
    const before = seedUser({ xp: 100 });
    let reply;
    rpc.mockReturnValueOnce(new Promise(resolve => { reply = resolve; }));
    const ask = requestStreakUnlock(OWNER, { delayMs: 0 });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // loadStateFromStorage() after a reconnect sync: a new object with newer fields.
    const synced = { ...before, xp: 250, name: 'renamed' };
    localStorage.setItem('yoyo_user', JSON.stringify(synced));
    state.user = synced;

    reply({ data: [row({})], error: null });
    await expect(ask).resolves.toBe('granted');
    expect(state.user).toBe(synced);
    expect(state.user).toMatchObject({ xp: 250, name: 'renamed', isPro: true, proExpiresAt: SERVER_END, streakUnlockUsed: true });
    expect(JSON.parse(localStorage.getItem('yoyo_user'))).toMatchObject({ xp: 250, name: 'renamed', isPro: true, streakUnlockUsed: true });
    expect(before).toMatchObject({ xp: 100, isPro: false, streakUnlockUsed: false });   // the old object is left alone
  });

  it('concurrent asks for one owner share one request', async () => {
    seedUser();
    answer({});
    const [a, b] = await Promise.all([
      requestStreakUnlock(OWNER, { delayMs: 0 }),
      requestStreakUnlock(OWNER, { delayMs: 0 }),
    ]);
    expect([a, b]).toEqual(['granted', 'granted']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('signed out or switched meanwhile: no screen update, no celebration', async () => {
    seedUser();
    answer({ status: 'not_eligible', granted: false, is_active: false, paid_active: false, expires_at: null, granted_at: null });
    const onChange = vi.fn();
    await expect(requestStreakUnlock(OWNER, { isCurrent: () => false, onChange, delayMs: 0 })).resolves.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(localStorage.getItem(STREAK_UNLOCK_ASKED_KEY)).toBeNull();
  });

  it('an older storage.js without grantStreakUnlock (mixed versions): does nothing', async () => {
    seedUser();
    const original = db.grantStreakUnlock;
    delete db.grantStreakUnlock;
    try {
      await expect(requestStreakUnlock(OWNER)).resolves.toBeNull();
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      db.grantStreakUnlock = original;
    }
  });
});

describe('hasStoredSession(): guests are told SUB-16 needs an account', () => {
  it('reads the Supabase client’s stored session key', () => {
    expect(hasStoredSession()).toBe(false);
    localStorage.setItem('sb-test-auth-token', '{}');
    expect(hasStoredSession()).toBe(true);
  });

  it('storage that throws does not tell a signed-in user to sign in', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      expect(hasStoredSession()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
