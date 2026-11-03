import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// INFRA-110: the behavioural proof lives in tests/database/infra110.test.sql (needs
// a Postgres with the Supabase roles). This contract keeps the migration text to
// what was approved: privileges only, the view itself untouched.

const read = name => readFileSync(new URL(`../../pwa/db/${name}`, import.meta.url), 'utf8');
const sql = read('015_leaderboard_view_grants.sql').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('INFRA-110 leaderboard_view grants migration', () => {
  it('revokes every privilege from PUBLIC, anon and authenticated, then grants authenticated SELECT', () => {
    expect(sql).toBe(
      'REVOKE ALL ON TABLE public.leaderboard_view FROM PUBLIC, anon, authenticated; '
      + 'GRANT SELECT ON TABLE public.leaderboard_view TO authenticated;',
    );
  });

  it('has a number of its own, after the migrations that define the view and the roles it touches', () => {
    const names = readdirSync(new URL('../../pwa/db/', import.meta.url)).filter(name => /^\d{3}_.*\.sql$/.test(name));
    expect(names.filter(name => name.startsWith('015_'))).toEqual(['015_leaderboard_view_grants.sql']);
    for (const name of ['005_leaderboard.sql', '010_leaderboard_avatars.sql']) expect(names).toContain(name);
  });

  it('matches the columns the client reads (the view definition stays in 010)', () => {
    const view = read('010_leaderboard_avatars.sql');
    for (const column of ['user_id', 'name', 'total_xp', 'streak_days', 'week_xp', 'avatar_url']) {
      expect(view, column).toMatch(new RegExp(`\\b${column}\\b`));
    }
    const client = readFileSync(new URL('../../pwa/js/pages/leaderboard.js', import.meta.url), 'utf8');
    expect(client).toContain("supabase.from('leaderboard_view')");
  });
});
