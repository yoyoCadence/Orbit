// @vitest-environment jsdom
/**
 * HW-112D (c): orphaned cloud proof photos (their session was deleted but the
 * removal never ran) are removed only when nothing can still need them, and
 * never when the server read cannot be shown to see this account's rows.
 * Also: sessionsNotOnServer() reads the real storage.js sidecar.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '11111111-1111-4111-8111-111111111111';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const NOW = Date.parse('2026-11-19T12:00:00Z');
const daysAgo = days => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const cloud = vi.hoisted(() => ({
  signedIn: null,
  objects: [],          // { name, created_at }
  rows: new Set(),      // session ids the server has
  readError: null,
  removeError: null,
  removed: [],
  reads: [],
  inserts: [],
}));
const queue = vi.hoisted(() => ({ ids: [] }));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: cloud.signedIn ? { user: { id: cloud.signedIn } } : null } })) },
    storage: {
      from: () => ({
        list: vi.fn(async (_folder, { limit, offset }) => ({ data: cloud.objects.slice(offset, offset + limit), error: null })),
        remove: vi.fn(async paths => {
          if (cloud.removeError) return { data: null, error: cloud.removeError };
          cloud.removed.push(...paths);
          return { data: [], error: null };
        }),
      }),
    },
    from: table => {
      const query = { table, filters: {} };
      const chain = {
        select: () => chain,
        eq: (column, value) => { query.filters[column] = value; return chain; },
        in: async (column, values) => {
          cloud.reads.push({ ...query, ids: values });
          if (cloud.readError) return { data: null, error: cloud.readError };
          return { data: values.filter(id => cloud.rows.has(id)).map(id => ({ id })), error: null };
        },
        insert: async row => { cloud.inserts.push(row); return { error: null }; },
      };
      return chain;
    },
  },
}));
vi.mock('../../pwa/js/platform/proofSync.js', () => ({
  PROOF_BUCKET: 'proofs',
  pendingProofUploads: () => queue.ids,
}));

import { SWEEP_MAX_REMOVALS, sweepOrphanCloudProofs } from '../../pwa/js/platform/proofSweep.js';
import { sessionsNotOnServer } from '../../pwa/js/platform/sessionsNotOnServer.js';
import { storage } from '../../pwa/js/storage.js';

const object = (id, days) => ({ name: `${id}.jpg`, id: `obj-${id}`, created_at: daysAgo(days) });
const confirmed = (...ids) => ids.map(id => ({ id }));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.assign(cloud, { signedIn: OWNER, objects: [], rows: new Set(), readError: null, removeError: null, removed: [], reads: [], inserts: [] });
  queue.ids = [];
});

describe('sweepOrphanCloudProofs', () => {
  it('removes only old photos with no session anywhere; keeps everything that may still be needed', async () => {
    cloud.rows = new Set([sid(1), sid(3)]);
    cloud.objects = [
      object(sid(1), 90),   // local session (and on the server)
      object(sid(3), 90),   // on the server (another device's session)
      object(sid(4), 90),   // orphan
      object(sid(5), 10),   // recent: another device's row may be on its way
      object(sid(6), 90),   // queued to upload here
      object(sid(7), 90),   // a session here the server has not confirmed
      { name: `${sid(8)}.jpg`, created_at: null }, // unknown age
      object('not-a-session', 90),
    ];
    queue.ids = [sid(6)];
    const sessions = [{ id: sid(1) }, { id: sid(7), _syncPending: true }];

    expect(await sweepOrphanCloudProofs(OWNER, { sessions, now: NOW })).toEqual({ removed: 1 });
    expect(cloud.removed).toEqual([`${OWNER}/${sid(4)}.jpg`]);
    // One server read, for this account, with the confirmed local session as proof.
    expect(cloud.reads).toEqual([{ table: 'sessions', filters: { user_id: OWNER }, ids: [sid(1), sid(3), sid(4)] }]);

    // Done for the week.
    cloud.objects.push(object(sid(9), 90));
    expect(await sweepOrphanCloudProofs(OWNER, { sessions, now: NOW + 6 * 24 * 3600 * 1000 })).toBeNull();
    expect(await sweepOrphanCloudProofs(OWNER, { sessions, now: NOW + 8 * 24 * 3600 * 1000 })).toEqual({ removed: 2 });
  });

  it('never sweeps when the server read cannot be shown to see this account\'s rows', async () => {
    cloud.objects = [object(sid(4), 90)];
    // RLS or a wrong token can read as "no rows" without an error.
    cloud.rows = new Set();
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toBeNull();
    // Nothing confirmed here to check the read with.
    cloud.rows = new Set([sid(1)]);
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: [{ id: sid(1), _syncPending: true }], now: NOW })).toBeNull();
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: [], now: NOW })).toBeNull();
    expect(cloud.removed).toEqual([]);
    expect(localStorage.getItem(`orbit_proofsweep_at:${OWNER}`)).toBeNull();
  });

  it('stops on any error, another signed-in account, or no sessions; nothing is recorded', async () => {
    cloud.rows = new Set([sid(1)]);
    cloud.objects = [object(sid(4), 90)];
    cloud.readError = { message: 'timeout' };
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toBeNull();
    cloud.readError = null;
    cloud.removeError = { message: 'offline' };
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toBeNull();
    cloud.removeError = null;
    cloud.signedIn = '22222222-2222-4222-8222-222222222222';
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toBeNull();
    cloud.signedIn = OWNER;
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: null, now: NOW })).toBeNull();
    expect(cloud.removed).toEqual([]);
    expect(localStorage.getItem(`orbit_proofsweep_at:${OWNER}`)).toBeNull();
    // Once it can run, it does.
    expect(await sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toEqual({ removed: 1 });
  });

  it('removes at most a hundred per run, and one run at a time', async () => {
    cloud.rows = new Set([sid(1)]);
    cloud.objects = Array.from({ length: 150 }, (_, i) => object(sid(1000 + i), 60));
    const first = sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW });
    expect(sweepOrphanCloudProofs(OWNER, { sessions: confirmed(sid(1)), now: NOW })).toBe(first);
    expect(await first).toEqual({ removed: SWEEP_MAX_REMOVALS });
    expect(cloud.removed).toHaveLength(100);
    // The server was asked about every candidate, a hundred ids per request.
    expect(cloud.reads.map(read => read.ids.length)).toEqual([100, 51]);
  });
});

describe('sessionsNotOnServer', () => {
  it('reads storage.js\'s pending sidecar (a session saved this run has no flag in memory)', async () => {
    cloud.signedIn = null; // offline: the insert does not happen
    localStorage.setItem('yoyo_user', JSON.stringify({ id: OWNER }));
    const session = { id: sid(1), taskId: 't', date: '2026-11-19' };
    storage.saveSessions([session]);
    await Promise.resolve();
    expect(sessionsNotOnServer(OWNER, [session])).toEqual(new Set([sid(1)]));
    expect(sessionsNotOnServer(OWNER, [{ id: sid(2), _syncPending: true }])).toEqual(new Set([sid(1), sid(2)]));
    expect(sessionsNotOnServer('someone-else', [session])).toEqual(new Set());
  });
});
