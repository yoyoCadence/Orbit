import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../pwa/db/011_leaderboard_pro.sql', import.meta.url),
  'utf8',
);
const sql = migration.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('PRO-014A entitlement migration contract', () => {
  it('contains only the server-owned entitlement foundation', () => {
    expect(sql).toMatch(/CREATE TABLE public\.pro_entitlements\s*\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.pro_trial_duration\s*\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_pro_active\s*\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.start_trial\s*\(\s*\)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.my_pro_status\s*\(\s*\)/i);
    expect(sql).not.toMatch(/display_name|leaderboard_view/i);
  });

  it('allows authenticated users to select only their own entitlement row', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.pro_entitlements ENABLE ROW LEVEL SECURITY;/i,
    );
    expect(sql).toMatch(
      /CREATE POLICY "pro_entitlements_select_own" ON public\.pro_entitlements FOR SELECT TO authenticated USING \(\(select auth\.uid\(\)\) = user_id\);/i,
    );

    const policies = sql.match(/CREATE POLICY\b[^;]+;/gi) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i);
  });

  it('denies direct client writes through table privileges and missing write policies', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.pro_entitlements FROM public, anon, authenticated;/i,
    );

    const tableGrants = sql.match(
      /GRANT\s+[^;]+\s+ON TABLE public\.pro_entitlements\s+TO\s+[^;]+;/gi,
    ) ?? [];
    expect(tableGrants).toEqual([
      'GRANT SELECT ON TABLE public.pro_entitlements TO authenticated;',
    ]);
  });

  it('maintains updated_at for real entitlement changes', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER pro_entitlements_set_updated_at BEFORE UPDATE ON public\.pro_entitlements/i,
    );
    expect(sql).toMatch(
      /ROW\(NEW\.is_pro, NEW\.pro_expires_at, NEW\.trial_started_at\) IS DISTINCT FROM ROW\(OLD\.is_pro, OLD\.pro_expires_at, OLD\.trial_started_at\)/i,
    );
    expect(sql).toMatch(/NEW\.updated_at = now\(\)/i);
    expect(sql).toMatch(/NEW\.updated_at = OLD\.updated_at/i);
  });

  it('fails closed for missing, expired, null, and future-dated entitlement values', () => {
    expect(sql).toMatch(/SELECT COALESCE\s*\(/i);
    expect(sql).toMatch(/p_trial_started_at <= now\(\)/i);
    expect(sql).toMatch(
      /p_trial_started_at > now\(\) - public\.pro_trial_duration\(\)/i,
    );
    expect(sql).toMatch(/\), false\);/i);
  });

  it('keeps trial duration in one internal helper', () => {
    expect(sql.match(/INTERVAL '15 days'/gi)).toHaveLength(1);
    expect(sql).toMatch(
      /FUNCTION public\.pro_trial_duration\(\)[\s\S]*?LANGUAGE sql IMMUTABLE SET search_path = ''/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.pro_trial_duration\(\) FROM public, anon, authenticated;/i,
    );
  });

  it('hardens the trial RPC and keeps the server timestamp once-only', () => {
    expect(sql).toMatch(
      /FUNCTION public\.start_trial\(\)[\s\S]*?SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql).toMatch(
      /IF \(select auth\.uid\(\)\) IS NULL THEN RAISE EXCEPTION 'authentication required'/i,
    );
    expect(sql).toMatch(
      /VALUES \(\(select auth\.uid\(\)\), now\(\)\) ON CONFLICT \(user_id\) DO UPDATE/i,
    );
    expect(sql).toMatch(
      /trial_started_at = COALESCE\(e\.trial_started_at, EXCLUDED\.trial_started_at\)/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.start_trial\(\) FROM public, anon;/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.start_trial\(\) TO authenticated;/i,
    );
  });

  it('returns a server-derived current-user status snapshot', () => {
    expect(sql).toMatch(
      /FUNCTION public\.my_pro_status\(\)[\s\S]*?SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql).toMatch(
      /RETURNS TABLE \( is_active boolean, expires_at timestamptz, trial_ends_at timestamptz \)/i,
    );
    expect(sql).toMatch(
      /FROM \(SELECT auth\.uid\(\) AS user_id\) AS caller LEFT JOIN public\.pro_entitlements e ON e\.user_id = caller\.user_id/i,
    );
    expect(sql).toMatch(
      /WHEN e\.is_pro = true THEN e\.pro_expires_at ELSE NULL END AS expires_at/i,
    );
    expect(sql).toMatch(
      /WHEN e\.trial_started_at IS NOT NULL AND e\.trial_started_at <= now\(\) THEN e\.trial_started_at \+ public\.pro_trial_duration\(\) ELSE NULL END AS trial_ends_at/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.my_pro_status\(\) FROM public, anon;/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.my_pro_status\(\) TO authenticated;/i,
    );
  });

  it('does not expose the internal active-status helper to client roles', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.is_pro_active\([^;]+FROM authenticated;/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_pro_active\([^;]+TO authenticated;/i,
    );
  });
});

const migration014 = readFileSync(
  new URL('../../pwa/db/014_my_pro_status_trial_cap.sql', import.meta.url),
  'utf8',
);
const sql014 = migration014.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('PRO-014R 014 migration contract', () => {
  it('only replaces my_pro_status(), without dropping it or touching tables', () => {
    expect(sql014.match(/CREATE OR REPLACE FUNCTION public\.\w+/gi)).toEqual([
      'CREATE OR REPLACE FUNCTION public.my_pro_status',
    ]);
    expect(sql014).not.toMatch(/DROP\s+FUNCTION|CREATE\s+TABLE|ALTER\s+TABLE|ON\s+TABLE|CREATE\s+POLICY/i);
  });

  it('keeps the return signature, SECURITY DEFINER and empty search_path, so clients are unaffected', () => {
    expect(sql014).toMatch(
      /RETURNS TABLE \( is_active boolean, expires_at timestamptz, trial_ends_at timestamptz \)/i,
    );
    expect(sql014).toMatch(
      /FUNCTION public\.my_pro_status\(\)[\s\S]*?SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql014).toMatch(
      /FROM \(SELECT auth\.uid\(\) AS user_id\) AS caller LEFT JOIN public\.pro_entitlements e ON e\.user_id = caller\.user_id/i,
    );
    expect(sql014).toMatch(
      /WHEN e\.is_pro = true THEN e\.pro_expires_at ELSE NULL END AS expires_at/i,
    );
  });

  it('reports the trial end only while the trial can extend access beyond payment', () => {
    expect(sql014).toMatch(
      /WHEN e\.trial_started_at IS NULL OR e\.trial_started_at > now\(\) THEN NULL WHEN e\.is_pro = true AND \(e\.pro_expires_at IS NULL OR e\.pro_expires_at >= e\.trial_started_at \+ public\.pro_trial_duration\(\)\) THEN NULL ELSE e\.trial_started_at \+ public\.pro_trial_duration\(\) END AS trial_ends_at/i,
    );
  });

  it('restates the grants so a re-created function never becomes callable by anon', () => {
    expect(sql014).toMatch(/REVOKE ALL ON FUNCTION public\.my_pro_status\(\) FROM public, anon;/i);
    expect(sql014).toMatch(/GRANT EXECUTE ON FUNCTION public\.my_pro_status\(\) TO authenticated;/i);
    expect(sql014).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.my_pro_status\(\) TO (anon|public)/i);
  });
});
