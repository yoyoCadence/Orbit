import { supabase } from './supabase.js';
import { isOnline } from './platform/network.js';

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] },
  });
  return error ?? null;
}

/**
 * Signs out and always removes the session stored on this device (BUG-116).
 *
 * supabase-js returns before removing anything when it cannot load the stored
 * session — an expired access token with no network fails the refresh (after
 * about 25 s of retries), whatever the `scope`. The refresh token would then
 * stay in `sb-<project>-auth-token`: the next launch signs the account back
 * in, and the leaderboard treats a guest as signed in.
 *
 * Online, the SDK call also revokes the session on the server. Offline it
 * cannot, so it is skipped rather than waited for. Every SDK call still waits
 * for the client's start-up — after an offline launch with an expired token
 * that is its own ~25 s of refresh retries — but the key is removed first.
 *
 * @returns {Promise<Error|null>} the SDK's error, after the local session is gone
 */
export async function signOut() {
  if (!isOnline()) return forgetLocalSession();
  let error;
  try {
    ({ error } = await supabase.auth.signOut());
  } catch (e) {
    error = e;
  }
  if (!error) return null;
  await forgetLocalSession();
  return error;
}

async function forgetLocalSession() {
  // The SDK's own storage (localStorage, or memory when that is unavailable).
  try { await supabase.auth.storage.removeItem(supabase.auth.storageKey); } catch { /* already gone */ }
  // With nothing stored the SDK makes no request and runs its own cleanup:
  // the `-user` and PKCE entries, a cached refresh failure, and SIGNED_OUT.
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return error ?? null;
  } catch (e) {
    return e;
  }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function resetPasswordForEmail(email) {
  const redirectTo = window.location.href.split('#')[0];
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return error ?? null;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ?? null;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
