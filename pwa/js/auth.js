import { supabase } from './supabase.js';

/**
 * Send a magic-link OTP to the given email.
 * Returns an error object on failure, or null on success.
 */
export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Redirect back to the app after clicking the link.
      // Make sure this URL (and localhost:3000) is listed in Supabase
      // Auth → URL Configuration → Redirect URLs.
      emailRedirectTo: window.location.href.split('#')[0],
    },
  });
  return error ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** Returns the current session, or null if not logged in. */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Register a listener for auth state changes.
 * Returns the subscription object (call .unsubscribe() to stop).
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
