import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../pwa/db/012_streak_unlock_server.sql', import.meta.url),
  'utf8',
);
const sql = migration.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('PRO-014L migration contract', () => {
  it('adds a server-owned once-only marker and includes it in updated_at', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.pro_entitlements ADD COLUMN IF NOT EXISTS streak_unlock_granted_at timestamptz/i,
    );
    expect(sql).toMatch(
      /ROW\( NEW\.is_pro, NEW\.pro_expires_at, NEW\.trial_started_at, NEW\.streak_unlock_granted_at \) IS DISTINCT FROM ROW\( OLD\.is_pro, OLD\.pro_expires_at, OLD\.trial_started_at, OLD\.streak_unlock_granted_at \)/i,
    );
  });

  it('exposes only a no-argument authenticated SECURITY DEFINER RPC', () => {
    expect(sql).toMatch(
      /FUNCTION public\.grant_streak_unlock\(\) RETURNS TABLE[\s\S]*?SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql).toMatch(/caller_id uuid := \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication required'/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.grant_streak_unlock\(\) FROM public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.grant_streak_unlock\(\) TO authenticated/i,
    );
  });

  it('recomputes the same effective-day rules from caller-owned sessions', () => {
    expect(sql).toMatch(/FROM public\.sessions s WHERE s\.user_id = caller_id/i);
    expect(sql).toMatch(/SUM\(s\.final_xp\) FILTER \(WHERE s\.is_productive_xp = true\)/i);
    expect(sql).toMatch(/s\.impact_type = 'task' AND s\.value IN \('A', 'S'\) AND s\.result <> 'invalid'/i);
    expect(sql).toMatch(/SUM\(s\.duration_minutes\) FILTER \(WHERE s\.impact_type = 'entertainment'\)/i);
    expect(sql).toMatch(/productive_xp >= 50/i);
    expect(sql).toMatch(/entertainment_minutes <= 120/i);
    expect(sql).toMatch(/HAVING COUNT\(\*\) >= 45/i);
    expect(sql).not.toMatch(/p_streak|p_expires|p_granted/i);
  });

  it('serializes claims and grants exactly 30 days from server time', () => {
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/i);
    expect(sql).toMatch(/WHERE e\.user_id = caller_id FOR UPDATE/i);
    expect(sql).toMatch(/IF entitlement\.streak_unlock_granted_at IS NOT NULL/i);
    expect(sql).toMatch(/pro_expires_at = now\(\) \+ interval '30 days'/i);
    expect(sql).toMatch(/streak_unlock_granted_at = now\(\)/i);
  });

  it('does not consume the reward while another entitlement is active', () => {
    expect(sql).toMatch(
      /IF public\.is_pro_active\([\s\S]*?RETURN QUERY SELECT 'active_entitlement'::text/i,
    );
  });
});
