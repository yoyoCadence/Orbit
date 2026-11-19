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
    return true;
  } catch {
    // Storage full or unavailable: the photo stays on this device; a later
    // backfill cannot find it again once the account is marked done, so this
    // is logged rather than ignored.
    console.warn('Proof sync queue could not be saved.');
    return false;
  }
}

/** @returns {boolean} whether the queue now holds it (false: storage full). */
function addToQueue(prefix, ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return false;
  return writeQueue(prefix, ownerId, [...readQueue(prefix, ownerId), sessionId]);
}

function dropFromQueue(prefix, ownerId, sessionId) {
  writeQueue(prefix, ownerId, readQueue(prefix, ownerId).filter(id => id !== sessionId));
}

/** Session ids whose photo is still waiting to be uploaded for this account. */
export function pendingProofUploads(ownerId) {
  return ownerId ? readQueue(UPLOAD_QUEUE_PREFIX, ownerId) : [];
}

// Cloud deletions the queue could not take (storage full). Held here for as
// long as the app runs, retried by every sync, and written to the queue by the
// first sync that finds room: once the session's row is gone, its deletion log
// entry is cleared, and nothing else would remember that its photo is still in
// the cloud.
const unsavedRemovals = new Map(); // ownerId → Set of session ids

function queueRemoval(ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return;
  if (addToQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId)) return;
  if (!unsavedRemovals.has(ownerId)) unsavedRemovals.set(ownerId, new Set());
  unsavedRemovals.get(ownerId).add(sessionId);
}

function saveUnsavedRemovals(ownerId) {
  const unsaved = unsavedRemovals.get(ownerId);
  if (!unsaved?.size) return;
  if (writeQueue(REMOVE_QUEUE_PREFIX, ownerId, [...readQueue(REMOVE_QUEUE_PREFIX, ownerId), ...unsaved])) {
    unsavedRemovals.delete(ownerId);
  }
}

function forgetRemoval(ownerId, sessionId) {
  const unsaved = unsavedRemovals.get(ownerId);
  if (unsaved?.delete(sessionId) && unsaved.size === 0) unsavedRemovals.delete(ownerId);
  dropFromQueue(REMOVE_QUEUE_PREFIX, ownerId, sessionId);
}

/** Session ids whose cloud photo is still waiting to be deleted for this account. */
export function pendingProofRemovals(ownerId) {
  if (!ownerId) return [];
  return [...new Set([...readQueue(REMOVE_QUEUE_PREFIX, ownerId), ...(unsavedRemovals.get(ownerId) ?? [])])];
}

/** @returns {boolean} whether the photo is now queued. */
export function queueProofUpload(ownerId, sessionId) {
  return addToQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
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

/**
 * Ids of this account's sessions on this device, without the ones being
 * deleted; or null when this device holds no data for the account (signed out,
 * or another account's data now). Null means unknown, never "deleted": sign-out
 * clears the local sessions, and reading that as deletions would drop queued
 * photos and take valid backups down.
 */
function ownSessionIds(ownerId) {
  if (storage.getUser()?.id !== ownerId) return null;
  const deleted = new Set(getDeletedSessionIds(ownerId));
  return new Set((storage.getSessions() || [])
    .map(session => session?.id)
    .filter(id => isObjectId(id) && !deleted.has(id)));
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) return null;
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    return null; // corrupt: never block the queue on it
  }
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
  let stored = null;
  try {
    stored = getProof(sessionId);
  } catch {
    return null;
  }
  const blob = decodeDataUrl(stored);
  if (!blob) return null;
  if (blob.type === 'image/jpeg') return blob;
  try {
    return await reencodeAsJpeg(blob);
  } catch {
    return null;
  }
}

// A refusal that will not change on retry: drop that item rather than block
// every later one behind it. Decided by Storage's error code (supabase-js keeps
// it as `error.code`), not by the HTTP status: Storage also answers 400 for an
// expired or invalid token (`InvalidJWT`), which must stop the sync and keep
// the queue. A bare 413 (a proxy refusing the size) is permanent too.
const PERMANENT_STORAGE_CODES = new Set(['EntityTooLarge', 'InvalidMimeType', 'InvalidKey']);

function isPermanentRefusal(error) {
  return PERMANENT_STORAGE_CODES.has(String(error?.code ?? '')) || Number(error?.status) === 413;
}

function isAlreadyStored(error) {
  if (['Duplicate', 'ResourceAlreadyExists'].includes(String(error?.code ?? ''))) return true;
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
    if (isAlreadyStored(error)) return 'exists';
    return isPermanentRefusal(error) ? 'skipped' : 'failed';
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
  if (!own || own.size === 0) return; // sessions not here yet: try again next time
  const local = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LOCAL_PROOF_PREFIX)) continue;
    const sessionId = key.slice(LOCAL_PROOF_PREFIX.length);
    // Only this account's sessions: another account's or a guest's photos on
    // this device are never uploaded here.
    if (own.has(sessionId)) local.push(sessionId);
  }
  // Not marked done when the queue could not be saved (storage full): the
  // photos would otherwise never be queued again.
  if (!writeQueue(UPLOAD_QUEUE_PREFIX, ownerId, [...readQueue(UPLOAD_QUEUE_PREFIX, ownerId), ...local])) return;
  try {
    localStorage.setItem(queueKey(BACKFILL_DONE_PREFIX, ownerId), '1');
  } catch {
    // Not marked: the next flush queues them again, which is harmless.
  }
}

// ─── Flush ────────────────────────────────────────────────────────────────────

const flushing = new Map();
const rerun = new Set();

async function flushRemovals(ownerId) {
  saveUnsavedRemovals(ownerId);
  for (const sessionId of pendingProofRemovals(ownerId).slice(0, PROOF_SYNC_BATCH)) {
    if (!await removeCloudProof(ownerId, sessionId)) return false;
    forgetRemoval(ownerId, sessionId);
  }
  return true;
}

/**
 * Send what is queued for this account: deletions first, then at most
 * PROOF_SYNC_BATCH uploads, then deletions queued meanwhile. Stops at the
 * first failure (usually offline), and as soon as this device no longer holds
 * the account's data (signed out, switched), keeping the rest for next time.
 * Never throws.
 */
export function flushProofSync(ownerId) {
  if (!ownerId) return Promise.resolve();
  if (flushing.has(ownerId)) {
    // Already running with the queue as it was: one more pass afterwards, so a
    // photo saved or a session deleted meanwhile does not wait for next launch.
    rerun.add(ownerId);
    return flushing.get(ownerId);
  }
  const run = (async () => {
    try {
      if (await signedInUserId() !== ownerId) return;
      queueExistingProofs(ownerId);
      if (!await flushRemovals(ownerId)) return;

      for (const sessionId of readQueue(UPLOAD_QUEUE_PREFIX, ownerId).slice(0, PROOF_SYNC_BATCH)) {
        const own = ownSessionIds(ownerId);
        if (!own) return; // signed out or switched: unknown, keep everything queued
        if (!own.has(sessionId)) {
          // Deleted (here or on another device) or not this account's: nothing to back up.
          dropFromQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
          continue;
        }
        const result = await uploadProof(ownerId, sessionId);
        if (result === 'failed') {
          // Usually offline, but a deletion queued during this run (one only held
          // in memory included) still gets its try now.
          await flushRemovals(ownerId);
          return;
        }
        dropFromQueue(UPLOAD_QUEUE_PREFIX, ownerId, sessionId);
        // Deleted while it was being uploaded: take the new file down again. Only
        // when the account's sessions are still here and this one is not.
        const after = ownSessionIds(ownerId);
        if (result === 'uploaded' && after && !after.has(sessionId)) queueRemoval(ownerId, sessionId);
      }
      await flushRemovals(ownerId);
    } catch (error) {
      console.warn('Proof sync stopped; queued photos stay for the next sync:', error);
    }
  })();
  const settled = run.finally(() => {
    flushing.delete(ownerId);
    if (rerun.delete(ownerId)) void flushProofSync(ownerId);
  });
  flushing.set(ownerId, settled);
  return settled;
}

// ─── Hooks for the app ───────────────────────────────────────────────────────

/** A photo was just saved for a session of this signed-in account. */
export function proofSaved(ownerId, sessionId) {
  if (!ownerId || !isObjectId(sessionId)) return;
  if (!queueProofUpload(ownerId, sessionId)) {
    // Storage full: the queue could not take it. Forget that the backfill ran
    // (removing a key works even then), so the next sync looks at every photo
    // of this account again; those already in the cloud come back as "exists".
    try {
      localStorage.removeItem(queueKey(BACKFILL_DONE_PREFIX, ownerId));
    } catch {
      // nothing more to do here
    }
  }
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
  queueRemoval(ownerId, sessionId);
  void flushProofSync(ownerId);
}
