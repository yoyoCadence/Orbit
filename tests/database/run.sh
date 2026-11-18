#!/usr/bin/env bash
# Run the database tests, each in a fresh local PostgreSQL database:
#   tests/database/support/supabase-standin.sql → pwa/db/0*.sql in order → the test,
#   with plpgsql.check_asserts on (an ASSERT that fails stops the test).
#
# Usage (from anywhere; connection through the usual PG* variables, default the local socket):
#   tests/database/run.sh                       # every tests/database/*.test.sql
#   tests/database/run.sh tests/database/pro017.test.sql ...
#
# Needs createdb/dropdb rights. Only for a local, throwaway cluster: it creates and drops
# databases named orbit_test_*. Never point it at Supabase. pgTAP tests (pro014d) are
# skipped when the pgtap extension is not installed.
# Exit status: 0 when every test that ran passed, 1 otherwise.

set -u
cd "$(dirname "$0")/../.." || exit 2

if [ "$#" -gt 0 ]; then tests=("$@"); else tests=(tests/database/*.test.sql); fi

psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
has_pgtap=$(psql -X -Atc "select count(*) from pg_available_extensions where name = 'pgtap'" postgres 2>/dev/null || echo 0)
log=$(mktemp)
trap 'rm -f "$log"' EXIT

passed=0; failed=0; skipped=0
for test in "${tests[@]}"; do
  name=$(basename "$test" .test.sql)
  if grep -q 'pgtap' "$test" && [ "$has_pgtap" != "1" ]; then
    echo "SKIP $name (pgtap extension not installed)"
    skipped=$((skipped + 1))
    continue
  fi
  db="orbit_test_$(echo "$name" | tr -c 'a-z0-9\n' '_')_$$"
  if ! createdb "$db" 2>"$log"; then
    echo "FAIL $name (createdb)"; cat "$log"; failed=$((failed + 1)); continue
  fi
  ok=1; step="supabase-standin.sql"
  psql_q -d "$db" -f tests/database/support/supabase-standin.sql >"$log" 2>&1 || ok=0
  if [ "$ok" = 1 ]; then
    for migration in pwa/db/0*.sql; do
      step=$(basename "$migration")
      psql_q -d "$db" -f "$migration" >"$log" 2>&1 || { ok=0; break; }
    done
  fi
  if [ "$ok" = 1 ]; then
    step="test"
    # pgTAP reports failures as result rows instead of errors: "not ok N - ..." (psql pads
    # the row with a space) and "# Looks like you failed / planned ..." from finish().
    if ! psql_q -d "$db" -c 'set plpgsql.check_asserts = on' -f "$test" >"$log" 2>&1 \
      || grep -qE '^[[:space:]]*(not ok|# Looks like you)' "$log"; then
      ok=0
    fi
  fi
  dropdb "$db" 2>/dev/null
  if [ "$ok" = 1 ]; then
    echo "PASS $name"; passed=$((passed + 1))
  else
    echo "FAIL $name ($step)"; tail -n 20 "$log"; failed=$((failed + 1))
  fi
done

echo "passed $passed, failed $failed, skipped $skipped"
[ "$failed" = 0 ]
