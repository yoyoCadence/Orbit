/**
 * streakUnlockSql.test.js — PRO-014L1：migration 012 與它的資料庫測試的契約。
 *
 * 資料庫的行為由 tests/database/pro014l.test.sql 在 PostgreSQL 上驗證（ASSERT，
 * 單一 transaction）。這裡只鎖住不需要資料庫就能檢查、而且改錯會很危險的部分：
 * 權限、輸入面、只回傳付費的 paid_active、回填只寫標記、測試本身不是 pgTAP。
 * 提案：docs/pro-014l-streak-unlock-server.md §5.1。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const strip = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

const sql = strip(read('pwa/db/012_streak_unlock_server.sql'));
const dbTest = read('tests/database/pro014l.test.sql');
const rollback = strip(read('tests/database/pro014l.rollback.sql'));

/** The body of grant_streak_unlock(), between its AS $$ … $$ markers. */
const rpcBody = sql.match(/FUNCTION public\.grant_streak_unlock\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/i)?.[1] ?? '';

describe('PRO-014L1 migration 012', () => {
  it('adds the server-owned once-only marker and keeps updated_at aware of it', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.pro_entitlements ADD COLUMN IF NOT EXISTS streak_unlock_granted_at timestamptz/i,
    );
    expect(sql).toMatch(
      /ROW\( NEW\.is_pro, NEW\.pro_expires_at, NEW\.trial_started_at, NEW\.streak_unlock_granted_at \) IS DISTINCT FROM ROW\( OLD\.is_pro, OLD\.pro_expires_at, OLD\.trial_started_at, OLD\.streak_unlock_granted_at \)/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_pro_entitlement_updated_at\(\) FROM public, anon, authenticated/i,
    );
  });

  it('exposes only a no-argument SECURITY DEFINER RPC to authenticated', () => {
    expect(sql).toMatch(
      /FUNCTION public\.grant_streak_unlock\(\) RETURNS TABLE \( status text, granted boolean, is_active boolean, expires_at timestamptz, granted_at timestamptz, paid_active boolean \) LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/i,
    );
    expect(sql).toMatch(/caller_id uuid := \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.grant_streak_unlock\(\) FROM public, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_streak_unlock\(\) TO authenticated/i);
    expect(sql).not.toMatch(/GRANT [^;]*grant_streak_unlock[^;]* TO (anon|public)\b/i);
    // The client cannot hand in a streak, a date or an expiry.
    expect(sql).not.toMatch(/grant_streak_unlock\(\s*[a-z_]/i);
  });

  it('recomputes the effective-day rules from the caller’s own sessions, up to the server date', () => {
    expect(rpcBody).toMatch(/FROM public\.sessions s WHERE s\.user_id = caller_id AND s\.date <= current_date/i);
    expect(rpcBody).toMatch(/SUM\(s\.final_xp\) FILTER \(WHERE s\.is_productive_xp = true\)/i);
    expect(rpcBody).toMatch(/s\.impact_type = 'task' AND s\.value IN \('A', 'S'\) AND s\.result <> 'invalid'/i);
    expect(rpcBody).toMatch(/SUM\(s\.duration_minutes\) FILTER \(WHERE s\.impact_type = 'entertainment'\)/i);
    expect(rpcBody).toMatch(/productive_xp >= 50 AND has_a_or_s_task = true AND entertainment_minutes <= 120/i);
    expect(rpcBody).toMatch(/HAVING COUNT\(\*\) >= 45/i);
  });

  it('serializes claims on the entitlement row and grants exactly 30 days from server time', () => {
    expect(rpcBody).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/i);
    expect(rpcBody).toMatch(/WHERE e\.user_id = caller_id FOR UPDATE/i);
    expect(rpcBody).toMatch(/IF entitlement\.streak_unlock_granted_at IS NOT NULL THEN RETURN QUERY SELECT 'already_granted'::text/i);
    expect(rpcBody).toMatch(/IF public\.is_pro_active\([^)]*\) THEN RETURN QUERY SELECT 'active_entitlement'::text/i);
    expect(rpcBody).toMatch(/is_pro = true, pro_expires_at = now\(\) \+ interval '30 days', streak_unlock_granted_at = now\(\)/i);
  });

  // paid_active is what the client writes back as legacy Pro. It must never be
  // the trial-inclusive is_active (a trialling account would become lifetime).
  it('returns a paid-only paid_active in every branch', () => {
    const branches = rpcBody.split(/RETURN QUERY SELECT/i).slice(1);
    expect(branches).toHaveLength(4);
    const paidExpr = /entitlement\.is_pro AND \(entitlement\.pro_expires_at IS NULL OR entitlement\.pro_expires_at > now\(\)\)\s*;/i;
    expect(branches[0]).toMatch(/^ 'already_granted'::text/);
    expect(branches[0]).toMatch(paidExpr);
    expect(branches[1]).toMatch(/^ 'active_entitlement'::text/);
    expect(branches[1]).toMatch(paidExpr);
    expect(branches[2]).toMatch(/^ 'not_eligible'::text, false, false, entitlement\.pro_expires_at, NULL::timestamptz, false\s*;/i);
    expect(branches[3]).toMatch(/^ 'granted'::text, true, true, entitlement\.pro_expires_at, entitlement\.streak_unlock_granted_at, true\s*;/i);
    for (const branch of branches) {
      const lastColumn = branch.split(/;/)[0].split(/,(?![^(]*\))/).at(-1);
      expect(lastColumn).not.toMatch(/is_pro_active/i);
    }
  });

  it('backfills only the marker for accounts that used the legacy unlock', () => {
    const backfill = sql.match(/INSERT INTO public\.pro_entitlements AS e \(user_id, streak_unlock_granted_at\)[^;]*;/i)?.[0] ?? '';
    expect(backfill).toMatch(/SELECT p\.user_id, now\(\) FROM public\.profiles p WHERE p\.streak_unlock_used = true/i);
    expect(backfill).toMatch(
      /ON CONFLICT \(user_id\) DO UPDATE SET streak_unlock_granted_at = COALESCE\(e\.streak_unlock_granted_at, now\(\)\)\s*;$/i,
    );
    // Denial only: nothing that grants or moves Pro may be written from profiles.
    expect(backfill).not.toMatch(/is_pro|pro_expires_at|trial_started_at/i);
  });
});

describe('PRO-014L1 database test and rollback', () => {
  it('is plain-SQL ASSERT in one rolled-back transaction, not pgTAP', () => {
    const body = strip(dbTest);
    expect(body).toMatch(/^begin;/i);
    expect(body).toMatch(/rollback;$/i);
    expect(body).not.toMatch(/(^|;)\s*commit\s*;/i);   // `on commit drop` on temp tables is fine
    expect(body).not.toMatch(/pgtap|\bplan\(|\bselect ok\(/i);   // comments may mention pgTAP; code may not
    expect(body).toMatch(/if not current_setting\('plpgsql\.check_asserts'\)::boolean then raise exception/i);
  });

  it('re-runs the backfill only for its own fixtures', () => {
    const reruns = strip(dbTest).match(/insert into public\.pro_entitlements as e \(user_id, streak_unlock_granted_at\)[^;]*;/gi) ?? [];
    expect(reruns).toHaveLength(2);
    for (const rerun of reruns) {
      expect(rerun).toMatch(/and p\.user_id in \(select user_id from pro014l_backfill\)/i);
    }
  });

  it('covers paid_active for trial, grant, lifetime and backfilled trial accounts', () => {
    expect(dbTest).toMatch(/'active trial \+ 45',[^\n]*'active_entitlement', true, {2}false\)/);
    expect(dbTest).toMatch(/'lifetime paid \+ 45',[^\n]*'active_entitlement', true, {2}true\)/);
    expect(dbTest).toMatch(/r\.status = 'already_granted' and not r\.granted and not r\.paid_active/);
  });

  it('rollback removes the RPC and the column and restores the 011 trigger', () => {
    expect(rollback).toMatch(/drop function public\.grant_streak_unlock\(\);/i);
    expect(rollback).toMatch(
      /if row\(new\.is_pro, new\.pro_expires_at, new\.trial_started_at\) is distinct from row\(old\.is_pro, old\.pro_expires_at, old\.trial_started_at\)/i,
    );
    expect(rollback).toMatch(/alter table public\.pro_entitlements drop column streak_unlock_granted_at;/i);
  });
});
