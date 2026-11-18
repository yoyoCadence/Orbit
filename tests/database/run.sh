#!/usr/bin/env bash
# Run the database tests, each in a fresh local PostgreSQL database:
#   tests/database/support/supabase-standin.sql → pwa/db/0*.sql in order → the test,
#   with plpgsql.check_asserts on (an ASSERT that fails stops the test).
#
# Usage (from any directory; test paths are relative to where you run it):
#   tests/database/run.sh                              # every tests/database/*.test.sql
#   tests/database/run.sh tests/database/pro017.test.sql ...
#
# Connects through the usual PG* variables (default: the local socket). Only for a
# local, throwaway cluster: it creates and drops databases named orbit_test_*, and it
# refuses a PGHOST that is not local unless ORBIT_DB_TEST_ALLOW_REMOTE=1. Never point
# it at Supabase. Tests that create the pgtap extension (pro014d) are skipped when
# pgtap is not installed; REQUIRE_PGTAP=1 makes that a failure instead (for CI).
# Exit status: 0 when every test passed (or was skipped), 1 otherwise, 2 on a setup error.

set -u

case "${PGHOST:-}" in
  ''|localhost|127.0.0.1|::1|/*) ;;
  *)
    if [ "${ORBIT_DB_TEST_ALLOW_REMOTE:-}" != "1" ]; then
      echo "refusing PGHOST=$PGHOST: run.sh creates and drops databases; set ORBIT_DB_TEST_ALLOW_REMOTE=1 to override" >&2
      exit 2
    fi
    ;;
esac

# Resolve the tests before moving to the repository root.
tests=()
if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    if [ ! -f "$arg" ]; then echo "no such test file: $arg" >&2; exit 2; fi
    tests+=("$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")")
  done
fi
cd "$(dirname "$0")/../.." || exit 2
if [ "${#tests[@]}" -eq 0 ]; then tests=("$PWD"/tests/database/*.test.sql); fi

psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
has_pgtap=$(psql -X -Atc "select count(*) from pg_available_extensions where name = 'pgtap'" postgres 2>/dev/null || echo 0)
log=$(mktemp)
db=""
cleanup() {
  [ -n "$db" ] && dropdb --if-exists "$db" 2>/dev/null
  rm -f "$log"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

passed=0; failed=0; skipped=0
for test in "${tests[@]}"; do
  name=$(basename "$test" .test.sql)
  if grep -qiE 'create extension[^;]*pgtap' "$test" && [ "$has_pgtap" != "1" ]; then
    if [ "${REQUIRE_PGTAP:-}" = "1" ]; then
      echo "FAIL $name (pgtap extension not installed, REQUIRE_PGTAP=1)"
      failed=$((failed + 1))
    else
      echo "SKIP $name (pgtap extension not installed)"
      skipped=$((skipped + 1))
    fi
    continue
  fi
  db="orbit_test_$(echo "$name" | tr -c 'a-z0-9\n' '_')_$$"
  if ! createdb "$db" 2>"$log"; then
    echo "FAIL $name (createdb)"; cat "$log"; failed=$((failed + 1)); db=""; continue
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
    # pgTAP reports failures as result rows instead of errors: "not ok N - ..." (psql
    # pads the row, and expanded output puts it after a label) and "# Looks like you
    # failed / planned ..." from finish().
    if ! psql_q -d "$db" -c 'set plpgsql.check_asserts = on' -f "$test" >"$log" 2>&1 \
      || grep -qE '(^|[^a-z])not ok [0-9]+|# Looks like you' "$log"; then
      ok=0
    fi
  fi
  if ! dropdb "$db" 2>/dev/null; then echo "warning: could not drop $db" >&2; fi
  db=""
  if [ "$ok" = 1 ]; then
    echo "PASS $name"; passed=$((passed + 1))
  else
    echo "FAIL $name ($step)"
    # The failing pgTAP checks (with their diagnostics), then the end of the output.
    grep -E -A4 '(^|[^a-z])not ok [0-9]+' "$log" | head -n 40
    tail -n 20 "$log"
    failed=$((failed + 1))
  fi
done

echo "passed $passed, failed $failed, skipped $skipped"
[ "$failed" = 0 ]
