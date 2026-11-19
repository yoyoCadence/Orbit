// HW-112D (c): photos left in this account's cloud folder after their session
// was deleted (the removal could not be queued, e.g. storage was full, or the
// app was closed offline before it ran). Owner agreed 2026-11-19 ("done safely").
//
// A photo is removed only when nothing can still need it:
//   - its object is at least 30 days old: a photo another device uploaded is
//     recent while that device's session row may still be on its way;
//   - this device has no session with that id, and it is not queued to upload;
//   - the server has no session row with that id for this account.
// The server check must prove it sees this account's rows: it also asks for a
// few of this device's sessions already confirmed on the server, and stops if
// any is missing (a read that silently returns nothing must never read as
// "every photo is an orphan"). Any error stops the sweep; at most 100 photos go
// per run. A device whose session never reached the server keeps its own copy
// (sign-out keeps those, proofLocal.js), so this never removes the last one.
// At most once a week per account on this device, after a sync, signed in.
//
// A module of its own (INFRA-105): it imports only exports its dependencies
// already had.

import { supabase } from '../supabase.js';
import { PROOF_BUCKET, pendingProofUploads } from './proofSync.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_MIN_AGE_MS = 30 * DAY_MS;
export const SWEEP_EVERY_MS = 7 * DAY_MS;
export const SWEEP_MAX_REMOVALS = 100;
const LIST_PAGE = 100;
const ID_BATCH = 100;
const CANARIES = 5;
const SWEPT_PREFIX = 'orbit_proofsweep_at:';
const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_NAME = /^([0-9a-f-]{36})\.jpg$/i;

const running = new Map();

function sweptKey(ownerId) {
  return `${SWEPT_PREFIX}${encodeURIComponent(String(ownerId))}`;
}

function lastSwept(ownerId) {
  try {
    const value = Number(localStorage.getItem(sweptKey(ownerId)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function markSwept(ownerId, now) {
  try {
    localStorage.setItem(sweptKey(ownerId), String(now));
  } catch {
    // not recorded: the next sync sweeps again, which is harmless
  }
}

async function signedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Every photo in the account's folder: session id and when it was stored. */
async function listCloudProofs(ownerId) {
  const objects = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .list(ownerId, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !Array.isArray(data)) throw error || new Error('list failed');
    for (const entry of data) {
      const match = OBJECT_NAME.exec(entry?.name ?? '');
      const storedAt = Date.parse(entry?.created_at ?? '');
      // An unknown age is never old enough.
      if (match && OBJECT_ID.test(match[1]) && Number.isFinite(storedAt)) {
        objects.push({ sessionId: match[1].toLowerCase(), storedAt });
      }
    }
    if (data.length < LIST_PAGE) return objects;
  }
}

/** The ids among `ids` the server has a session row for (this account's). */
async function sessionsOnServer(ownerId, ids) {
  const found = new Set();
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', ownerId)
      .in('id', ids.slice(i, i + ID_BATCH));
    if (error || !Array.isArray(data)) throw error || new Error('sessions read failed');
    for (const row of data) if (row?.id) found.add(String(row.id).toLowerCase());
  }
  return found;
}

async function sweep(ownerId, sessions, now) {
  if (await signedInUserId() !== ownerId) return null;

  const local = new Set();
  const canaries = [];
  for (const session of sessions) {
    const id = String(session?.id ?? '').toLowerCase();
    if (!id) continue;
    local.add(id);
    // Confirmed on the server (saveSessions flags the ones not yet).
    if (OBJECT_ID.test(id) && session._syncPending !== true && canaries.length < CANARIES) canaries.push(id);
  }
  // Nothing to prove the server read with: do not sweep.
  if (canaries.length === 0) return null;
  for (const id of pendingProofUploads(ownerId)) local.add(String(id).toLowerCase());

  const candidates = (await listCloudProofs(ownerId))
    .filter(object => now - object.storedAt >= ORPHAN_MIN_AGE_MS && !local.has(object.sessionId))
    .map(object => object.sessionId);
  if (candidates.length === 0) {
    markSwept(ownerId, now);
    return { removed: 0 };
  }

  const onServer = await sessionsOnServer(ownerId, [...canaries, ...candidates]);
  if (!canaries.every(id => onServer.has(id))) return null;
  const orphans = candidates.filter(id => !onServer.has(id)).slice(0, SWEEP_MAX_REMOVALS);

  if (orphans.length && await signedInUserId() !== ownerId) return null;
  for (let i = 0; i < orphans.length; i += ID_BATCH) {
    const paths = orphans.slice(i, i + ID_BATCH).map(id => `${ownerId}/${id}.jpg`);
    const { error } = await supabase.storage.from(PROOF_BUCKET).remove(paths);
    if (error) return null;
  }
  markSwept(ownerId, now);
  return { removed: orphans.length };
}

/**
 * Remove this account's orphaned cloud photos (see above). `sessions` are this
 * account's sessions on this device as stored (with their `_syncPending`
 * flags); without them nothing is swept. Never throws.
 * @returns {Promise<{ removed: number } | null>} null: skipped or stopped.
 */
export function sweepOrphanCloudProofs(ownerId, { sessions = null, now = Date.now() } = {}) {
  if (!ownerId || !Array.isArray(sessions)) return Promise.resolve(null);
  if (now - lastSwept(ownerId) < SWEEP_EVERY_MS) return Promise.resolve(null);
  if (running.has(ownerId)) return running.get(ownerId);
  const run = sweep(ownerId, sessions, now)
    .catch(error => {
      console.warn('Proof photo sweep stopped; nothing more removed:', error);
      return null;
    })
    .finally(() => running.delete(ownerId));
  running.set(ownerId, run);
  return run;
}
