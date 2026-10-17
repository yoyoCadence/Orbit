import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// BUG-109: the behavioral proof lives in tests/database/bug109.test.sql (needs a
// Postgres with auth.users). This contract keeps CI from regressing the migration
// text itself: same function, same trigger wiring, only the name is truncated.

const read = name => readFileSync(new URL(`../../pwa/db/${name}`, import.meta.url), 'utf8');
const normalize = text => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

const original = normalize(read('004_triggers.sql'));
const migration = normalize(read('013_signup_profile_name.sql'));

const functionBody = sql => sql.match(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\).*?\$\$;/i)?.[0];

describe('BUG-109 signup trigger migration', () => {
  it('replaces only handle_new_user(), without touching the trigger or the constraint', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1);
    expect(migration).not.toMatch(/\b(DROP|ALTER TABLE|CREATE TRIGGER|CREATE OR REPLACE TRIGGER|GRANT|REVOKE)\b/i);
  });

  it('truncates the profile name source to the 30-character column limit', () => {
    expect(migration).toMatch(
      /left\(COALESCE\(NEW\.raw_user_meta_data->>'name', split_part\(NEW\.email, '@', 1\)\), 30\)/,
    );
  });

  it('keeps every other part of the 004 definition identical', () => {
    const before = functionBody(original);
    const after = functionBody(migration);
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();

    const untruncated = after.replace(
      /left\((COALESCE\(NEW\.raw_user_meta_data->>'name', split_part\(NEW\.email, '@', 1\)\)), 30\)/,
      '$1',
    );
    expect(untruncated).toBe(before);
  });

  it('still runs as SECURITY DEFINER with the pinned search_path and creates the energy row', () => {
    expect(migration).toMatch(/SECURITY DEFINER SET search_path = public/i);
    expect(migration).toMatch(/INSERT INTO public\.energy \(user_id\) VALUES \(NEW\.id\);/i);
  });
});
