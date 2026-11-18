// HW-112C2b: an account's proof photos on this device — what the settings page
// clears or deletes, and what sign-out may drop (proposal §5.5, §9.4 A, §9.5 B).
//
//   - "Clear this device's photos": this account's photos here, except the ones
//     still waiting to be uploaded (they would be lost), and its downloaded
//     copies. The cloud keeps them; a guest has no cloud, so for a guest this
//     deletes them.
//   - "Delete all proof photos" (signed in): this account's photos here, its
//     downloaded copies and every photo in its cloud folder.
//   - Sign-out: this account's photos that are surely in the cloud are dropped
//     here (shown again from the cloud after the next sign-in); the others stay.
//
// Other accounts' photos on this device are never touched (keys carry only the
// session id, so "this account's" means its sessions).
//
// A module of its own (INFRA-105): existing SHELL modules import only these new
// exports; this module imports only exports its dependencies already had.

import { supabase } from '../supabase.js';
import {
  clearAchievementPhotoSelection,
  getProof,
} from './proofStore.js';
import {
  PROOF_BUCKET,
  PROOF_MAX_BYTES,
  flushProofSync,
  pendingProofUploads,
} from './proofSync.js';
import { clearCloudProofs } from './proofCloud.js';

const LOCAL_PROOF_PREFIX = 'orbit_proof_'; // proofStore's key prefix
// proofSync's "this account's existing photos were queued" marker (private
// there; tests/unit/proofLocal.test.js checks the two agree).
const BACKFILL_DONE_PREFIX = 'orbit_proofsync_backfilled:';
const OBJECT_ID = /^[0-9a-f-]{36}$/;
const LIST_PAGE = 100;
const REMOVE_BATCH = 100;

const isObjectId = value => typeof value === 'string' && OBJECT_ID.test(value);

function sessionIdsOf(sessions) {
  return [...new Set((Array.isArray(sessions) ? sessions : [])
    .map(session => String(session?.id ?? ''))
    .filter(Boolean))];
}

function removeLocal(sessionId) {
  try {
    localStorage.removeItem(LOCAL_PROOF_PREFIX + sessionId);
    return true;
  } catch {
    return false;
  }
}

/** This account's photos stored on this device: session ids and size (KB). */
export function accountProofStats(sessions) {
  let count = 0;
  let bytes = 0;
  for (const sessionId of sessionIdsOf(sessions)) {
    const proof = getProof(sessionId);
    if (!proof) continue;
    count += 1;
    bytes += proof.length;
  }
  return { count, kb: Math.round(bytes / 1024) };
}

function backfillDone(ownerId) {
  try {
    return localStorage.getItem(`${BACKFILL_DONE_PREFIX}${encodeURIComponent(String(ownerId))}`) === '1';
  } catch {
    return false;
  }
}

// A photo upload sends as is: a JPEG data URL within the bucket's size limit.
// (PNG/WebP photos from older versions are re-encoded on upload, which may not
// have worked: those are never counted as uploaded here.)
function sendsAsIs(dataUrl) {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/]+=*)$/i.exec(dataUrl || '');
  if (!match) return false;
  const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0;
  return (match[1].length * 3) / 4 - padding <= PROOF_MAX_BYTES;
}

/**
 * This account's local photos that are surely in the cloud: the account's
 * photos were all queued once (backfill), this one is no longer waiting, and
 * it was one the bucket takes as is. Anything uncertain stays.
 */
export function uploadedLocalProofIds(ownerId, sessions) {
  if (!ownerId || !backfillDone(ownerId)) return [];
  const pending = new Set(pendingProofUploads(ownerId));
  return sessionIdsOf(sessions).filter(sessionId => isObjectId(sessionId)
    && !pending.has(sessionId)
    && sendsAsIs(getProof(sessionId)));
}

/**
 * Sign-out (§9.5 B): drop this account's local photos that are surely in the
 * cloud, and its downloaded copies. Returns how many local photos went.
 */
export function dropUploadedLocalProofs(ownerId, sessions) {
  if (!ownerId) return 0;
  let dropped = 0;
  for (const sessionId of uploadedLocalProofIds(ownerId, sessions)) {
    if (removeLocal(sessionId)) dropped += 1;
  }
  void clearCloudProofs(ownerId);
  return dropped;
}

/**
 * Settings, "clear this device's photos". Signed in: this account's local
 * photos except those still waiting to be uploaded, and its downloaded copies
 * (the cloud keeps everything). A guest: the guest's photos (there is no cloud
 * copy) and the Personal Space selection.
 * @returns {{ cleared: number, kept: number }} kept: still waiting to upload.
 */
export function clearDeviceProofs(ownerId, sessions, { signedIn = false } = {}) {
  const pending = new Set(signedIn && ownerId ? pendingProofUploads(ownerId) : []);
  let cleared = 0;
  let kept = 0;
  for (const sessionId of sessionIdsOf(sessions)) {
    if (!getProof(sessionId)) continue;
    if (pending.has(sessionId)) {
      kept += 1;
      continue;
    }
    if (removeLocal(sessionId)) cleared += 1;
  }
  if (signedIn && ownerId) void clearCloudProofs(ownerId);
  else if (ownerId) clearAchievementPhotoSelection(ownerId);
  return { cleared, kept };
}

async function listCloudProofNames(ownerId) {
  const names = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .list(ownerId, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !Array.isArray(data)) throw error || new Error('list failed');
    for (const entry of data) {
      if (typeof entry?.name === 'string' && entry.name.endsWith('.jpg')) names.push(entry.name);
    }
    if (data.length < LIST_PAGE) return names;
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

/**
 * Settings, "delete all proof photos" (signed in). This account's photos on
 * this device go first (so nothing more can be uploaded), with its downloaded
 * copies and the Personal Space selection; then every photo in its cloud
 * folder. Never throws.
 * @returns {Promise<{ ok: boolean, local: number, cloud: number }>} ok: the
 *   cloud folder was emptied (false: offline or refused; pressing again retries).
 */
export async function deleteAllProofs(ownerId, sessions) {
  if (!ownerId) return { ok: false, local: 0, cloud: 0 };
  let local = 0;
  for (const sessionId of sessionIdsOf(sessions)) {
    if (getProof(sessionId) && removeLocal(sessionId)) local += 1;
  }
  clearAchievementPhotoSelection(ownerId);
  await clearCloudProofs(ownerId);

  let cloud = 0;
  try {
    // An upload already on its way would land after the listing below: wait
    // for the running sync (with the photos gone, the queue only drains).
    await flushProofSync(ownerId);
    if (await signedInUserId() !== ownerId) return { ok: false, local, cloud };
    const names = await listCloudProofNames(ownerId);
    for (let i = 0; i < names.length; i += REMOVE_BATCH) {
      const paths = names.slice(i, i + REMOVE_BATCH).map(name => `${ownerId}/${name}`);
      const { error } = await supabase.storage.from(PROOF_BUCKET).remove(paths);
      if (error) return { ok: false, local, cloud };
      cloud += paths.length;
    }
    return { ok: true, local, cloud };
  } catch {
    return { ok: false, local, cloud };
  }
}
