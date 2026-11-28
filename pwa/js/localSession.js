// Ends the Supabase session stored on this device, without a request to the
// server (BUG-116's forgetLocalSession, moved here for BUG-141).
//
// A module of its own (INFRA-105): app.js needs it for the guest path, and a
// SHELL module must not import a new export of another SHELL module (auth.js).

import { supabase } from './supabase.js';

/**
 * Removes this device's session and lets the SDK clean up after it.
 *
 * supabase-js returns before removing anything when it cannot load the stored
 * session (an expired access token with no network), whatever the `scope`, so
 * the key is removed first. With nothing stored the SDK makes no request and
 * runs its own cleanup: the `-user` and PKCE entries, a cached refresh
 * failure, and SIGNED_OUT (to this tab and, through its BroadcastChannel, to
 * the others).
 *
 * @returns {Promise<Error|null>} the SDK's error, after the local session is gone
 */
export async function forgetLocalSession() {
  // The SDK's own storage (localStorage, or memory when that is unavailable).
  try { await supabase.auth.storage.removeItem(supabase.auth.storageKey); } catch { /* already gone */ }
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return error ?? null;
  } catch (e) {
    return e;
  }
}
