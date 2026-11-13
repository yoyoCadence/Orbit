// PRO-014E2: the leaderboard's public name and the server read model.
//
// Migration 018 (applied in production 2026-11-13) added profiles.display_name
// with a CHECK constraint and the get_leaderboard() RPC. This module holds:
//   - the public-name rule, identical to profiles_display_name_check, so the
//     client refuses a name before the server does (tests/unit/
//     leaderboardPublic.test.js reads the ranges out of 018 and compares);
//   - the RPC read, and its own cache key (leaderboardCacheV2), so an older
//     client never mistakes the new row shape for its own cache;
//   - the write of display_name / is_public. These two fields are not part of
//     the whole-profile sync any more (storage.js PROFILE_FIELDS reads them
//     only): another device's stale profile could otherwise switch the
//     leaderboard off again or wipe the public name. The write here waits for
//     the server and only then changes local state.
//
// A module of its own (INFRA-105): existing SHELL modules import only these
// new exports, never a new export added to another existing module.

import { supabase } from './supabase.js';

export const DISPLAY_NAME_MAX = 20;

// Code points refused anywhere in a public name (018: the first CHECK class).
export const DISPLAY_NAME_FORBIDDEN = Object.freeze([
  [0x1, 0x1f], [0x7f, 0xa0], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c],
  [0x115f, 0x115f], [0x1160, 0x1160], [0x1680, 0x1680], [0x17b4, 0x17b4], [0x17b5, 0x17b5],
  [0x180b, 0x180f], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x206f], [0x2800, 0x2800],
  [0x3000, 0x3000], [0x3164, 0x3164], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff0, 0xfffb],
  [0x13430, 0x1343f], [0x16fe4, 0x16fe4], [0x1bca0, 0x1bca3], [0x1d159, 0x1d159], [0x1d173, 0x1d17a],
  [0xe0080, 0xe00ff], [0xe01f0, 0xe0fff],
].map(range => Object.freeze(range)));

// Variation selectors and tag characters: allowed after a visible character,
// never at the start, and never hiding a trailing space (018: the edge class).
export const DISPLAY_NAME_EDGE = Object.freeze([
  [0xfe00, 0xfe0f], [0xe0000, 0xe007f], [0xe0100, 0xe01ef],
].map(range => Object.freeze(range)));

const SPACE = 0x20;

function inRanges(cp, ranges) {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/**
 * Why a public name would be refused, or null when the server will accept it.
 * Mirrors profiles_display_name_check exactly; lengths count code points, as
 * PostgreSQL's char_length() does.
 * @returns {null | 'empty' | 'too_long' | 'forbidden' | 'edge'}
 */
export function displayNameProblem(name) {
  if (typeof name !== 'string') return 'empty';
  const cps = Array.from(name, ch => ch.codePointAt(0));
  if (cps.length === 0) return 'empty';
  if (cps.length > DISPLAY_NAME_MAX) return 'too_long';
  if (cps.some(cp => inRanges(cp, DISPLAY_NAME_FORBIDDEN))) return 'forbidden';
  // '^[ EDGE]': the first character is a space, a variation selector or a tag.
  if (cps[0] === SPACE || inRanges(cps[0], DISPLAY_NAME_EDGE)) return 'edge';
  // ' [EDGE]*$': a space followed only by variation selectors / tags at the end.
  let i = cps.length - 1;
  while (i >= 0 && inRanges(cps[i], DISPLAY_NAME_EDGE)) i -= 1;
  if (i >= 0 && cps[i] === SPACE) return 'edge';
  return null;
}

export const DISPLAY_NAME_MESSAGES = Object.freeze({
  empty: '請輸入公開名稱',
  too_long: `公開名稱最多 ${DISPLAY_NAME_MAX} 個字`,
  forbidden: '公開名稱不能包含換行、tab 或看不見的字元（一般的半形空白可以）',
  edge: '公開名稱的開頭和結尾不能是空白',
  server: '公開名稱不符合規則，請換一個',
  network: '無法儲存，請確認網路連線後再試一次',
});

// ─── Leaderboard read ─────────────────────────────────────────────────────────

export const LEADERBOARD_CACHE_V2_KEY = 'yoyo_leaderboardCacheV2';
const LEGACY_CACHE_KEY = 'yoyo_leaderboardCache';

export function readLeaderboardCacheV2() {
  try {
    const cache = JSON.parse(localStorage.getItem(LEADERBOARD_CACHE_V2_KEY));
    return cache && Array.isArray(cache.rows) ? cache : null;
  } catch {
    return null;
  }
}

export function writeLeaderboardCacheV2(rows, refreshedAt, refreshDate) {
  try {
    localStorage.setItem(LEADERBOARD_CACHE_V2_KEY, JSON.stringify({ rows, refreshedAt, refreshDate }));
    // The leaderboard_view cache of older versions is never read again.
    localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // Storage full or unavailable: the board still renders from the network.
  }
}

export function clearLeaderboardCacheV2() {
  try {
    localStorage.removeItem(LEADERBOARD_CACHE_V2_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Rows of get_leaderboard(): display_name, avatar_path, total_xp, week_xp,
 * streak_days, mode, joined_on, is_me, and a display-only Pro flag for the
 * PRO-014F badge (never a gate). The server lists only public users with a
 * public name and never returns user_id.
 */
export async function fetchLeaderboardRows() {
  const { data, error } = await supabase.rpc('get_leaderboard');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── Public name and opt-in write ─────────────────────────────────────────────

/**
 * Change the caller's own display_name and/or is_public, and wait for the
 * server. RLS (002) limits the update to the caller's row; zero rows (another
 * user's id, or no session) comes back as an error from .single().
 * @param {string} userId
 * @param {{ displayName?: string|null, isPublic?: boolean }} changes
 * @returns {Promise<{ displayName: string|null, isPublic: boolean }>}
 */
export async function savePublicSettings(userId, changes) {
  const patch = {};
  if ('displayName' in changes) patch.display_name = changes.displayName;
  if ('isPublic' in changes) patch.is_public = Boolean(changes.isPublic);
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('display_name, is_public')
    .single();
  if (error) throw error;
  return { displayName: data?.display_name ?? null, isPublic: Boolean(data?.is_public) };
}

/** The error code PostgreSQL uses for a CHECK violation (the name rule). */
export function isNameRuleViolation(error) {
  return error?.code === '23514';
}
