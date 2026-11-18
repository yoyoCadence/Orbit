// HW-112C1: back up proof photos to Supabase Storage.
//
// Migration 016 (applied 2026-11-13, HW-112B) made the private bucket `proofs`:
// objects named `{user_id}/{session_id}.jpg`, JPEG only, at most 200 KB, and
// four policies that limit every account to its own folder. This module:
//   - uploads a signed-in user's photo after it is saved on this device, and
//     keeps a per-account queue of the ones still to send (retried after every
//     remote load: boot and reconnect, see app.js `_loadRemote`);
//   - once per account, queues the photos already on this device for that
//     account's sessions (proposal §5.2, approved §9.6);
//   - deletes the cloud copy (and the local one) when a session is deleted,
//     with its own retry queue.
// Downloading on other devices, the settings buttons and sign-out are HW-112C2.
//
// The cloud deletions keep their own queue instead of a field in the session
// deletion log (proposal §5.4): that log's "done" rule is shared with the
// Personal Space reconciliation in three places, and a photo is independent of
// both. The guarantee is the same: retried until the server confirms.
//
// Keys start with `orbit_proofsync_`, never `orbit_proof_`: proofStore treats
// every `orbit_proof_*` key as a photo (counts it, and clearAllProofs deletes it).
//
// A module of its own (INFRA-105): existing SHELL modules import only these new
// exports; this module imports only exports its dependencies already had.

/* global atob, Blob, createImageBitmap, OffscreenCanvas -- browser APIs; eslint.config.js lists only the common ones */

import { supabase } from '../supabase.js';
import { storage } from '../storage.js';
import { getDeletedSessionIds } from './sessionDeletionLog.js';
import { getProof } from './proofStore.js';

export const PROOF_BUCKET = 'proofs';
export const PROOF_MAX_BYTES = 204800; // 016's file_size_limit
export const PROOF_SYNC_BATCH = 10;

const LOCAL_PROOF_PREFIX = 'orbit_proof_'; // proofStore's key prefix
const UPLOAD_QUEUE_PREFIX = 'orbit_proofsync_upload:';
const REMOVE_QUEUE_PREFIX = 'orbit_proofsync_remove:';
const BACKFILL_DONE_PREFIX = 'orbit_proofsync_backfilled:';
// 016's insert policy only accepts `{uid}/{36 of [0-9a-f-]}.jpg`.
const OBJECT_ID = /^[0-9a-f-]{36}$/;

const isObjectId = value => typeof value === 'string' && OBJECT_ID.test(value);

export function proofObjectPath(ownerId, sessionId) {
  return `${ownerId}/${sessionId}.jpg`;
}

// ─── Per-account queues (localStorage; survive sign-out like other pending data) ──

function queueKey(prefix, ownerId) {
  return `${prefix}${encodeURIComponent(String(ownerId))}`;
}

function readQueue(prefix, ownerId) {
  try {
    const ids = JSON.parse(localStorage.getItem(queueKey(prefix, ownerId)));
    return Array.isArray(ids) ? ids.filter(isObjectId) : [];
  } catch {
    return [];
  }
}

function writeQueue(prefix, ownerId, ids) {
  try {
    const unique = [...new Set(ids.filter(isObjectId))];
    if (unique.length) localStorage.setItem(queueKey(prefix, ownerId), JSON.stringify(unique));
    else localStorage.removeItem(queueKey(prefix, ownerId));
  } catch {
    // Storage full or unavailable: the photo stays on this device; a later
    // backfill cannot find it again once the account is marked done, so this
    // is logged rather than ignored.
    console.warn('Proof sync queue could not be saved.');
  }
}

function addToQueue(prefix, ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return;
  writeQueue(prefix, ownerId, [...readQueue(prefix, ownerId), sessionId]);
}

function dropFromQueue(prefix, ownerId, sessionId) {
  writeQueue(prefix, ownerId, readQueue(prefix, ownerId).filter(id => id !== sessionId));
}

/** Session ids whose photo is still waiting to be uploaded for this account. */
export function pendingProofUploads(ownerId) {
  return ownerId ? readQueue(UPLOAD_QUEUE_PREFIX, ownerId) : [];
}

/** Session ids whose cloud photo is still waiting to be deleted for this account. */
export function pendingProofRemovals(ownerId) {
  return ownerId ? readQueue(REMOVE_QUEUE_PREFIX, ownerId) : [];
}

export function queueProofUpload(ownerId, sessionId) {
  addToQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function signedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Ids of this account's sessions on this device, without the ones being deleted. */
function ownSessionIds(ownerId) {
  if (storage.getUser()?.id !== ownerId) return new Set();
  const deleted = new Set(getDeletedSessionIds(ownerId));
  return new Set((storage.getSessions() || [])
    .map(session => session?.id)
    .filter(id => isObjectId(id) && !deleted.has(id)));
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

// Older versions may have kept PNG or WebP; the bucket takes JPEG only.
async function reencodeAsJpeg(blob) {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.5));
  } finally {
    bitmap.close?.();
  }
}

async function proofJpeg(sessionId) {
  const blob = decodeDataUrl(getProof(sessionId));
  if (!blob) return null;
  if (blob.type === 'image/jpeg') return blob;
  try {
    return await reencodeAsJpeg(blob);
  } catch {
    return null;
  }
}

function isAlreadyStored(error) {
  const status = String(error?.statusCode ?? error?.status ?? '');
  return status === '409' || /already exists|duplicate/i.test(String(error?.message ?? error?.error ?? ''));
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload one photo. Never overwrites (`upsert: false`; there is no retake):
 * "already exists" counts as done.
 * @returns {Promise<'uploaded'|'exists'|'skipped'|'failed'>} `skipped` when there
 *   is nothing valid to send (no local photo, not decodable, over 200 KB).
 */
export async function uploadProof(ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return 'skipped';
  if (await signedInUserId() !== ownerId) return 'failed';
  const blob = await proofJpeg(sessionId);
  if (!blob || blob.size > PROOF_MAX_BYTES) return 'skipped';
  // The account may have changed while the photo was being prepared.
  if (await signedInUserId() !== ownerId) return 'failed';
  try {
    const { error } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(proofObjectPath(ownerId, sessionId), blob, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '3600',
      });
    if (!error) return 'uploaded';
    return isAlreadyStored(error) ? 'exists' : 'failed';
  } catch {
    return 'failed';
  }
}

async function removeCloudProof(ownerId, sessionId) {
  if (await signedInUserId() !== ownerId) return false;
  try {
    // remove() also succeeds for a file that is not there.
    const { error } = await supabase.storage
      .from(PROOF_BUCKET)
      .remove([proofObjectPath(ownerId, sessionId)]);
    return !error;
  } catch {
    return false;
  }
}

// ─── Backfill (once per account) ─────────────────────────────────────────────

function backfillDone(ownerId) {
  try {
    return localStorage.getItem(queueKey(BACKFILL_DONE_PREFIX, ownerId)) === '1';
  } catch {
    return true;
  }
}

function queueExistingProofs(ownerId) {
  if (backfillDone(ownerId)) return;
  const own = ownSessionIds(ownerId);
  if (own.size === 0) return; // sessions not loaded yet: try again next time
  const local = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LOCAL_PROOF_PREFIX)) continue;
    const sessionId = key.slice(LOCAL_PROOF_PREFIX.length);
    // Only this account's sessions: another account's or a guest's photos on
    // this device are never uploaded here.
    if (own.has(sessionId)) local.push(sessionId);
  }
  writeQueue(UPLOAD_QUEUE_PREFIX, ownerId, [...readQueue(UPLOAD_QUEUE_PREFIX, ownerId), ...local]);
  try {
    localStorage.setItem(queueKey(BACKFILL_DONE_PREFIX, ownerId), '1');
  } catch {
    // Not marked: the next flush queues them again, which is harmless.
  }
}

// ─── Flush ────────────────────────────────────────────────────────────────────

const flushing = new Map();

/**
 * Send what is queued for this account: deletions first, then at most
 * PROOF_SYNC_BATCH uploads. Stops at the first failure (usually offline) and
 * keeps the rest for the next time. Never throws.
 */
export function flushProofSync(ownerId) {
  if (!ownerId) return Promise.resolve();
  if (flushing.has(ownerId)) return flushing.get(ownerId);
  const run = (async () => {
    try {
      if (await signedInUserId() !== ownerId) return;
      queueExistingProofs(ownerId);

      for (const sessionId of readQueue(REMOVE_QUEUE_PREFIX, ownerId).slice(0, PROOF_SYNC_BATCH)) {
        if (!await removeCloudProof(ownerId, sessionId)) return;
        dropFromQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId);
      }

      for (const sessionId of readQueue(UPLOAD_QUEUE_PREFIX, ownerId).slice(0, PROOF_SYNC_BATCH)) {
        if (!ownSessionIds(ownerId).has(sessionId)) {
          // Deleted (here or on another device) or not this account's: nothing to back up.
          dropFromQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
          continue;
        }
        const result = await uploadProof(ownerId, sessionId);
        if (result === 'failed') return;
        dropFromQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
        // Deleted while it was being uploaded: take the new file down again.
        if (result === 'uploaded' && !ownSessionIds(ownerId).has(sessionId)) {
          addToQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId);
          if (await removeCloudProof(ownerId, sessionId)) dropFromQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId);
        }
      }
    } catch (error) {
      console.warn('Proof sync stopped; queued photos stay for the next sync:', error);
    }
  })();
  const settled = run.finally(() => flushing.delete(ownerId));
  flushing.set(ownerId, settled);
  return settled;
}

// ─── Hooks for the app ───────────────────────────────────────────────────────

/** A photo was just saved for a session of this signed-in account. */
export function proofSaved(ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return;
  queueProofUpload(ownerId, sessionId);
  void flushProofSync(ownerId);
}

/**
 * A session was deleted: delete its photo on this device, stop any pending
 * upload, and (signed in) delete the cloud copy, retried until confirmed.
 */
export function proofSessionDeleted(ownerId, sessionId, { signedIn = false } = {}) {
  if (!isObjectId(sessionId)) return;
  try {
    localStorage.removeItem(LOCAL_PROOF_PREFIX + sessionId);
  } catch {
    // nothing stored
  }
  if (!ownerId) return;
  dropFromQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
  if (!signedIn) return;
  addToQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId);
  void flushProofSync(ownerId);
}
