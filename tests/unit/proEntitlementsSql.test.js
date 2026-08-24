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

  it('fails closed for missing, expired, null, and future-dated entitlement values', () => {
    expect(sql).toMatch(/SELECT COALESCE\s*\(/i);
    expect(sql).toMatch(/p_trial_started_at <= now\(\)/i);
    expect(sql).toMatch(/p_trial_started_at > now\(\) - INTERVAL '15 days'/i);
    expect(sql).toMatch(/\), false\);/i);
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
      /REVOKE ALL ON FUNCTION public\.start_trial\(\) FROM public, anon; GRANT EXECUTE ON FUNCTION public\.start_trial\(\) TO authenticated;/i,
    );
  });

  it('keeps status reads scoped to the calling user and RPC execution least-privileged', () => {
    expect(sql).toMatch(
      /FUNCTION public\.my_pro_status\(\)[\s\S]*?SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql).toMatch(
      /FROM public\.pro_entitlements e WHERE e\.user_id = \(select auth\.uid\(\)\)/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.my_pro_status\(\) FROM public, anon; GRANT EXECUTE ON FUNCTION public\.my_pro_status\(\) TO authenticated;/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.is_pro_active\([^;]+FROM authenticated;/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_pro_active\([^;]+TO authenticated;/i,
    );
  });
});
