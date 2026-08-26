// Boot depends on this module, so the client is loaded from the repo-vendored
// copy (pwa/vendor/supabase.js, precached in sw.js SHELL) rather than a CDN:
// the version is pinned and auditable, and a first load still works with no
// third-party host reachable. Regenerate with `npm run vendor:supabase`.
import { createClient }                from '../vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
