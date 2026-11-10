// PRO-014L2: a synchronous "is anyone signed in on this device" for rendering.
//
// SUB-16 needs an account (the server records the grant), so the profile and
// settings pages tell a guest so instead of showing a reward a guest cannot
// get. This reads the Supabase client's stored session key, as the leaderboard
// does (INFRA-110); BUG-116 makes sign-out always remove it.
//
// A module of its own: it imports only the Supabase client, so the pages can
// use it without a cycle through dayCycle.js and router.js.

import { supabase } from './supabase.js';

export function hasStoredSession() {
  try {
    return Boolean(localStorage.getItem(supabase.auth.storageKey));
  } catch {
    return true;   // storage unavailable: do not tell a signed-in user to sign in
  }
}
