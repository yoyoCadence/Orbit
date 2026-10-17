// Location context adapter (HW-107).
// Opt-in, device-local, coarse. The only coordinates ever kept are the ones the
// user explicitly assigns to a label, rounded to 3 decimals (≈110 m), stored
// per owner through storageBridge and never synced. A live position is read
// only to compare against those labels and is not stored.

import { readJSON, removeValue, writeJSON } from './storageBridge.js';

export const PLACE_LABELS = Object.freeze(['home', 'work']);
export const PLACE_MATCH_RADIUS_M = 300;
const COORD_DECIMALS = 3;
const KEY_PREFIX = 'place-context-v1';

export function supportsGeolocation() {
  return typeof navigator !== 'undefined' && typeof navigator.geolocation?.getCurrentPosition === 'function';
}

export function roundCoord(value) {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(Number(value) * factor) / factor;
}

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @returns {'home'|'work'|'outside'} the nearest saved label within the radius,
 *   otherwise 'outside'.
 */
export function resolvePlaceLabel(position, places = {}, radiusM = PLACE_MATCH_RADIUS_M) {
  if (!isValidPoint(position)) return 'outside';
  let best = null;
  for (const label of PLACE_LABELS) {
    const place = places?.[label];
    if (!isValidPoint(place)) continue;
    const distance = distanceMeters(position, place);
    if (distance <= radiusM && (!best || distance < best.distance)) best = { label, distance };
  }
  return best?.label ?? 'outside';
}

function isValidPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

/**
 * One low-accuracy fix, rounded before it leaves this module.
 * @returns {Promise<{lat: number, lng: number}>}
 */
export function getCoarsePosition({ timeoutMs = 10000, maximumAgeMs = 10 * 60 * 1000 } = {}) {
  if (!supportsGeolocation()) return Promise.reject(new Error('geolocation-unsupported'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: roundCoord(coords.latitude), lng: roundCoord(coords.longitude) }),
      reject,
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: maximumAgeMs },
    );
  });
}

// ── Owner-scoped, device-local settings ─────────────────────────────────────

function settingsKey(ownerId) {
  return `${KEY_PREFIX}:${encodeURIComponent(ownerId || 'local')}`;
}

export function loadPlaceContext(ownerId) {
  const raw = readJSON(settingsKey(ownerId), null);
  const places = {};
  for (const label of PLACE_LABELS) {
    const place = raw?.places?.[label];
    if (isValidPoint(place)) places[label] = { lat: roundCoord(place.lat), lng: roundCoord(place.lng) };
  }
  return { enabled: raw?.enabled === true, places };
}

export function savePlaceContext(ownerId, { enabled, places }) {
  const current = loadPlaceContext(ownerId);
  const next = {
    enabled: enabled ?? current.enabled,
    places: { ...current.places },
  };
  for (const label of PLACE_LABELS) {
    const place = places?.[label];
    if (place === null) delete next.places[label];
    else if (isValidPoint(place)) next.places[label] = { lat: roundCoord(place.lat), lng: roundCoord(place.lng) };
  }
  return writeJSON(settingsKey(ownerId), next) ? next : null;
}

export function clearPlaceContext(ownerId) {
  return removeValue(settingsKey(ownerId));
}
