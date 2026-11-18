// HW-112C2a: show a signed-in account's cloud proof photos on any device.
//
// HW-112C1 (proofSync.js) uploads photos to `proofs/{user_id}/{session_id}.jpg`.
// On a device without the local copy (`orbit_proof_<id>`), a session row asks
// this module for the photo (proposal §5.3):
//   - only rows that come into view are fetched (IntersectionObserver), at most
//     MAX_DOWNLOADS at a time: the history page draws every session at once;
//   - there is no list call (list() stops at 100): each photo is downloaded by
//     its path. "Not found" is remembered for MISS_TTL_MS only, because a photo
//     can arrive after its session (uploaded later from the other device); the
//     memory is also cleared on every sync and when the app comes back to the
//     foreground. Other errors (offline, expired token) are not remembered;
//   - downloaded photos never go into localStorage (shared ~5 MB): they are kept
//     in IndexedDB, per account, at most CACHE_MAX_ENTRIES photos or
//     CACHE_MAX_BYTES (the longest unseen go first), and shown as `blob:` URLs
//     (CSP allows blob:). IndexedDB, not the Cache API: the service worker
//     deletes every cache but its own on each update;
//   - the account is checked again after every download, before anything is
//     cached or shown; signing out clears that account's photos here (§5.5).
// The photos taken on this device stay where they are (localStorage).
//
// A module of its own (INFRA-105): existing SHELL modules import only these new
// exports; this module imports only exports its dependencies already had.

/* global Blob, FileReader, IntersectionObserver, indexedDB -- browser APIs; eslint.config.js lists only the common ones */

import { supabase } from '../supabase.js';
import { storage } from '../storage.js';
import { hasStoredSession } from '../sessionPresence.js';
import { getProof } from './proofStore.js';
import { PROOF_BUCKET, proofObjectPath } from './proofSync.js';

export const MAX_DOWNLOADS = 3;
export const MISS_TTL_MS = 10 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 300;
export const CACHE_MAX_BYTES = 15 * 1024 * 1024;

const DB_NAME = 'orbit-proofs';
const DB_VERSION = 1;
const PHOTOS = 'photos'; // { key, bytes: ArrayBuffer, type }
const META = 'meta';     // { key, ownerId, size, viewedAt } — read without the bytes
const OBJECT_ID = /^[0-9a-f-]{36}$/;

const isObjectId = value => typeof value === 'string' && OBJECT_ID.test(value);
const entryKey = (ownerId, sessionId) => `${ownerId}/${sessionId}`;

// ─── State for this run of the app ───────────────────────────────────────────

const loaded = new Map();   // entryKey → { url, blob, dataUrl? }
const misses = new Map();   // entryKey → time the "not found" expires
const inFlight = new Map(); // entryKey → Promise<string|null>
const waiting = [];
let active = 0;

/** Forget every "this session has no cloud photo" (sync, back to the foreground). */
export function forgetCloudProofMisses() {
  misses.clear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') forgetCloudProofMisses();
  });
}

function signedInHere(ownerId) {
  return Boolean(ownerId) && hasStoredSession() && storage.getUser()?.id === ownerId;
}

async function signedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The photo as a `blob:` URL, when it was already loaded in this run. */
export function cloudProofUrl(ownerId, sessionId) {
  return loaded.get(entryKey(ownerId, sessionId))?.url ?? null;
}

/**
 * Whether a session row should ask for a cloud photo: a signed-in account's
 * own session, no photo on this device, and no recent "not found".
 */
export function wantsCloudProof(ownerId, sessionId) {
  if (!isObjectId(sessionId) || !signedInHere(ownerId)) return false;
  if (getProof(sessionId)) return false;
  const key = entryKey(ownerId, sessionId);
  if (loaded.has(key)) return false;
  const missUntil = misses.get(key);
  if (missUntil && missUntil > Date.now()) return false;
  return true;
}

// ─── IndexedDB (best effort: without it, photos are only kept in memory) ─────

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'key' }).createIndex('owner', 'ownerId');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading or deleting the database: let it, open again later.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function readCached(ownerId, sessionId) {
  const db = await openDb();
  if (!db) return null;
  try {
    const key = entryKey(ownerId, sessionId);
    const tx = db.transaction([PHOTOS, META], 'readwrite');
    const photo = await done(tx.objectStore(PHOTOS).get(key));
    const meta = await done(tx.objectStore(META).get(key));
    if (!photo || !meta || meta.ownerId !== ownerId) return null;
    tx.objectStore(META).put({ ...meta, viewedAt: Date.now() }); // least recently seen goes first
    await finished(tx);
    return new Blob([photo.bytes], { type: photo.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

async function writeCached(ownerId, sessionId, blob) {
  const db = await openDb();
  if (!db) return;
  try {
    const bytes = await blob.arrayBuffer();
    const key = entryKey(ownerId, sessionId);
    const tx = db.transaction([PHOTOS, META], 'readwrite');
    tx.objectStore(PHOTOS).put({ key, bytes, type: blob.type || 'image/jpeg' });
    tx.objectStore(META).put({ key, ownerId, size: bytes.byteLength, viewedAt: Date.now() });
    await finished(tx);
    await trimCache(db, ownerId);
  } catch {
    // Quota or a closed database: the photo is still shown from memory.
  }
}

async function trimCache(db, ownerId) {
  const tx = db.transaction([PHOTOS, META], 'readwrite');
  const metas = await done(tx.objectStore(META).index('owner').getAll(ownerId));
  metas.sort((a, b) => a.viewedAt - b.viewedAt);
  let count = metas.length;
  let bytes = metas.reduce((sum, meta) => sum + (meta.size || 0), 0);
  for (const meta of metas) {
    if (count <= CACHE_MAX_ENTRIES && bytes <= CACHE_MAX_BYTES) break;
    tx.objectStore(PHOTOS).delete(meta.key);
    tx.objectStore(META).delete(meta.key);
    count -= 1;
    bytes -= meta.size || 0;
  }
  await finished(tx);
}

async function deleteCachedFor(ownerId) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([PHOTOS, META], 'readwrite');
    const keys = await done(tx.objectStore(META).index('owner').getAllKeys(ownerId));
    for (const key of keys) {
      tx.objectStore(PHOTOS).delete(key);
      tx.objectStore(META).delete(key);
    }
    await finished(tx);
  } catch {
    // nothing more to do
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

// Storage answers a missing object (or one this account may not see) with 404,
// or 400 carrying statusCode 404 / "not found". An expired token is also a 400
// (`InvalidJWT`): that one is not a miss.
function isNotFound(error) {
  const code = String(error?.code ?? '');
  if (code === 'InvalidJWT') return false;
  if (['NoSuchKey', 'not_found'].includes(code)) return true;
  if (Number(error?.status) === 404 || String(error?.statusCode ?? '') === '404') return true;
  return /not[ _-]?found/i.test(`${error?.message ?? ''} ${error?.error ?? ''}`);
}

async function download(ownerId, sessionId) {
  if (await signedInUserId() !== ownerId) return null;
  let result;
  try {
    result = await supabase.storage.from(PROOF_BUCKET).download(proofObjectPath(ownerId, sessionId));
  } catch {
    return null;
  }
  const { data, error } = result ?? {};
  if (error || !data) {
    if (error && isNotFound(error)) misses.set(entryKey(ownerId, sessionId), Date.now() + MISS_TTL_MS);
    return null;
  }
  // The account may have changed while the photo was on its way.
  if (await signedInUserId() !== ownerId || !signedInHere(ownerId)) return null;
  return data.type === 'image/jpeg' ? data : new Blob([data], { type: 'image/jpeg' });
}

function withSlot(task) {
  return new Promise(resolve => {
    const run = async () => {
      active += 1;
      try {
        resolve(await task());
      } catch {
        resolve(null);
      } finally {
        active -= 1;
        waiting.shift()?.();
      }
    };
    if (active < MAX_DOWNLOADS) void run();
    else waiting.push(run);
  });
}

function remember(ownerId, sessionId, blob) {
  const key = entryKey(ownerId, sessionId);
  const url = URL.createObjectURL(blob);
  loaded.set(key, { url, blob });
  misses.delete(key);
  return url;
}

/**
 * Load one cloud photo: this run's memory, then this device's cache, then
 * Storage. Resolves to a `blob:` URL, or null (none, offline, signed out).
 * Never throws.
 */
export function loadCloudProof(ownerId, sessionId) {
  const key = entryKey(ownerId, sessionId);
  const known = loaded.get(key);
  if (known) return Promise.resolve(known.url);
  if (!wantsCloudProof(ownerId, sessionId)) return Promise.resolve(null);
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    const cached = await readCached(ownerId, sessionId);
    if (cached) return signedInHere(ownerId) ? remember(ownerId, sessionId, cached) : null;
    const blob = await withSlot(() => download(ownerId, sessionId));
    if (!blob) return null;
    const url = remember(ownerId, sessionId, blob);
    if (signedInHere(ownerId)) await writeCached(ownerId, sessionId, blob);
    return url;
  })().catch(() => null).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// ─── Session rows ─────────────────────────────────────────────────────────────

const observers = new WeakMap(); // container → IntersectionObserver

/**
 * Fetch the cloud photos of the rows in `container` that come into view.
 * `onLoaded(sentinel, url)` runs for each photo found while its row is still
 * on the page. Calling it again for the same container replaces the observer.
 */
export function observeCloudProofs(container, ownerId, onLoaded) {
  observers.get(container)?.disconnect();
  observers.delete(container);
  const sentinels = [...container.querySelectorAll('[data-proof-cloud-session-id]')];
  if (!sentinels.length || !signedInHere(ownerId)) return;

  const start = sentinel => {
    const sessionId = sentinel.dataset.proofCloudSessionId;
    void loadCloudProof(ownerId, sessionId).then(url => {
      if (url && sentinel.isConnected) onLoaded(sentinel, url);
    });
  };
  if (typeof IntersectionObserver !== 'function') {
    sentinels.forEach(start); // still at most MAX_DOWNLOADS at a time
    return;
  }
  const byRow = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const sentinel = byRow.get(entry.target);
      if (sentinel) start(sentinel);
    }
  }, { rootMargin: '200px 0px' });
  for (const sentinel of sentinels) {
    // The sentinel itself is hidden (no box): watch its row.
    const row = sentinel.closest('.log-item') || sentinel.parentElement;
    if (!row) continue;
    byRow.set(row, sentinel);
    observer.observe(row);
  }
  observers.set(container, observer);
}

// ─── Achievement photo (home and Personal Space) ─────────────────────────────

function blobToDataUrl(blob) {
  return new Promise(resolve => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

async function loadedDataUrl(ownerId, sessionId) {
  const entry = loaded.get(entryKey(ownerId, sessionId));
  if (!entry) return null;
  if (!entry.dataUrl) {
    const dataUrl = await blobToDataUrl(entry.blob);
    // The frame only takes JPEG/PNG/WebP data URLs (orbitWindow.js).
    entry.dataUrl = /^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl || '') ? dataUrl : null;
  }
  return entry.dataUrl;
}

/**
 * The achievement photo from `resolveAchievementPhoto()`, completed with the
 * cloud copy when this device has none. Returns what can be shown now (a data
 * URL when already loaded); otherwise starts the download and calls
 * `onLoaded()` once there is something new to show.
 */
export function withCloudAchievementPhoto(ownerId, sessions, photo, onLoaded) {
  if (photo?.status !== 'unavailable' || !photo.sessionId) return photo;
  const sessionId = photo.sessionId;
  const session = (Array.isArray(sessions) ? sessions : []).find(entry => String(entry?.id || '') === sessionId);
  if (!session || !signedInHere(ownerId)) return photo;
  const entry = loaded.get(entryKey(ownerId, sessionId));
  if (entry?.dataUrl) return { ...photo, status: 'selected', src: entry.dataUrl };
  if (!entry && !wantsCloudProof(ownerId, sessionId)) return photo;
  void loadCloudProof(ownerId, sessionId)
    .then(url => (url ? loadedDataUrl(ownerId, sessionId) : null))
    .then(dataUrl => { if (dataUrl && signedInHere(ownerId)) onLoaded?.(); })
    .catch(() => {});
  return photo;
}

// ─── Sign-out ─────────────────────────────────────────────────────────────────

/** Forget this account's downloaded photos: memory, misses and this device's cache. */
export function clearCloudProofs(ownerId) {
  if (!ownerId) return Promise.resolve();
  const prefix = `${ownerId}/`;
  for (const [key, entry] of loaded) {
    if (!key.startsWith(prefix)) continue;
    URL.revokeObjectURL(entry.url);
    loaded.delete(key);
  }
  for (const key of [...misses.keys()]) if (key.startsWith(prefix)) misses.delete(key);
  return deleteCachedFor(ownerId);
}
