#!/usr/bin/env node
// PRO-014E2: compare the client's public-name rule (pwa/js/leaderboardPublic.js,
// displayNameProblem) with the server's (pwa/db/018_leaderboard_display_name.sql,
// profiles_display_name_check) on many random names, in a real PostgreSQL.
//
// The script prints SQL; run it with psql on any UTF8 database (it only uses a
// temporary table, so no migration or stand-in is needed). Write it to a file
// first: in a plain `node ... | psql` pipe, a crash of this script would leave
// psql an empty input and the pipe would still exit 0.
//
//   node tests/database/support/name-rule-parity.mjs > /tmp/name-rule-parity.sql \
//     && psql -X -q -v ON_ERROR_STOP=1 -d postgres -f /tmp/name-rule-parity.sql
//
// It fails (psql exits non-zero) when any name gets a different answer, and lists
// a few as UTF-8 hex; it also fails when it compared fewer than 500 names
// (a comparison that small would mean nothing).
// Options:
//   --count N   names to try (an integer from 1000; default 50000; duplicates
//               are dropped)
//   --seed N    random seed (default 20261113, the first run's)
//   --mutate    break the client's trailing-space check first, to show the
//               comparison does catch a difference (it must then fail)
// Run it after changing either rule. The names lean on both sides of every range
// in the rule, plus spaces, selectors, tags and random code points.

/* global process, Buffer -- a Node script; eslint.config.js lists Node globals per directory */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

const MIN_NAMES = 1000; // --count floor
const MIN_COMPARED = 500; // after duplicates are dropped
const args = process.argv.slice(2);
const option = (name, fallback, min) => {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} needs an integer of at least ${min}, got ${JSON.stringify(args[at + 1] ?? null)}`);
  }
  return value;
};
const count = option('--count', 50000, MIN_NAMES);
let seed = option('--seed', 20261113, 0);
const mutate = args.includes('--mutate');

// ── The client rule, without its Supabase import (not loadable in Node) ──────
let source = readFileSync(join(ROOT, 'pwa/js/leaderboardPublic.js'), 'utf8')
  .replace("import { supabase } from './supabase.js';", 'const supabase = null;');
if (mutate) {
  const trailing = "if (i >= 0 && cps[i] === SPACE) return 'edge';";
  if (!source.includes(trailing)) throw new Error('--mutate: the trailing-space check was not found');
  source = source.replace(trailing, '');
}
const dir = mkdtempSync(join(tmpdir(), 'name-rule-parity-'));
let rule;
try {
  writeFileSync(join(dir, 'rule.mjs'), source);
  rule = await import(pathToFileURL(join(dir, 'rule.mjs')).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { displayNameProblem, DISPLAY_NAME_FORBIDDEN, DISPLAY_NAME_EDGE } = rule;

// ── The server rule: the CHECK expression exactly as 018 writes it ───────────
const sql018 = readFileSync(join(ROOT, 'pwa/db/018_leaderboard_display_name.sql'), 'utf8');
const marker = 'ADD CONSTRAINT profiles_display_name_check CHECK (';
const start = sql018.indexOf(marker);
if (start === -1) throw new Error('profiles_display_name_check not found in 018');
let depth = 1;
let end = start + marker.length;
while (depth > 0) {
  const ch = sql018[end];
  if (ch === undefined) throw new Error('unbalanced CHECK in 018');
  if (ch === '(') depth += 1;
  if (ch === ')') depth -= 1;
  end += 1;
}
const checkExpression = sql018.slice(start + marker.length, end - 1);

// ── Names ────────────────────────────────────────────────────────────────────
const rand = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = list => list[Math.floor(rand() * list.length)];
const isScalar = cp => cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff);
const boundaries = new Set([0x20, 0x41, 0x62, 0x4e2d, 0x1f422, 0x2764, 0x1f3f4]);
for (const [lo, hi] of [...DISPLAY_NAME_FORBIDDEN, ...DISPLAY_NAME_EDGE]) {
  for (const cp of [lo - 1, lo, hi, hi + 1]) if (isScalar(cp)) boundaries.add(cp);
}
const boundaryList = [...boundaries];
const common = [0x20, 0x41, 0x4e2d, 0xfe0f, 0xe0041, 0xe0100];
const randomScalar = () => {
  for (;;) {
    const cp = 1 + Math.floor(rand() * 0x10ffff);
    if (isScalar(cp)) return cp;
  }
};

const rows = [];
const seen = new Set();
for (let n = 0; n < count; n += 1) {
  const length = 1 + Math.floor(rand() * 23); // 1–23: across the 20 limit
  const points = [];
  for (let k = 0; k < length; k += 1) {
    const r = rand();
    points.push(r < 0.45 ? pick(boundaryList) : r < 0.75 ? pick(common) : randomScalar());
  }
  const name = String.fromCodePoint(...points);
  if (seen.has(name)) continue;
  seen.add(name);
  rows.push(Buffer.from(name, 'utf8').toString('hex') + TAB + (displayNameProblem(name) === null ? 't' : 'f'));
}

// ── SQL ──────────────────────────────────────────────────────────────────────
const decoded = "convert_from(decode(hex, 'hex'), 'UTF8')";
const serverAccepts = checkExpression.split('display_name').join(decoded);
process.stdout.write([
  'create temporary table name_rule_parity (hex text not null, client_accepts boolean not null);',
  'copy name_rule_parity from stdin;',
  ...rows,
  BS + '.',
  'do $parity$',
  'declare total int; client int; server int; differ int; examples text;',
  'begin',
  '  select count(*),',
  '         count(*) filter (where client_accepts),',
  '         count(*) filter (where ok),',
  '         count(*) filter (where ok is distinct from client_accepts),',
  "         string_agg(hex || ' client=' || client_accepts || ' server=' || ok, '; ')",
  "           filter (where ok is distinct from client_accepts)",
  '    into total, client, server, differ, examples',
  `    from (select hex, client_accepts, (${serverAccepts}) as ok from name_rule_parity) t;`,
  `  if total < ${MIN_COMPARED} then`,
  "    raise exception 'name rule parity: only % names compared; the comparison would mean nothing', total;",
  '  end if;',
  '  if differ > 0 then',
  "    raise exception 'name rule parity: % of % names differ (client accepts %, server %); first: %',",
  '      differ, total, client, server, left(examples, 600);',
  '  end if;',
  "  raise notice 'name rule parity: % names, client and server agree (accepted %)', total, client;",
  'end $parity$;',
  '',
].join(NL));
