#!/bin/bash
set -euo pipefail

PHONESIA_PG_BIN="${PHONESIA_TEST_PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PHONESIA_REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PHONESIA_TEST_ROOT="$(mktemp -d /private/tmp/phonesia-security-test.XXXXXX)"
PHONESIA_SOCKET="$PHONESIA_TEST_ROOT/socket"
mkdir "$PHONESIA_SOCKET"

"$PHONESIA_PG_BIN/initdb" -D "$PHONESIA_TEST_ROOT/data" -U postgres --auth-local=trust --auth-host=scram-sha-256 --no-instructions >/dev/null
cleanup() {
  "$PHONESIA_PG_BIN/pg_ctl" -D "$PHONESIA_TEST_ROOT/data" stop -m fast >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
"$PHONESIA_PG_BIN/pg_ctl" -D "$PHONESIA_TEST_ROOT/data" -l "$PHONESIA_TEST_ROOT/postgres.log" \
  -o "-k $PHONESIA_SOCKET -c listen_addresses='' -p 55443" start -w >/dev/null
PHONESIA_PSQL=("$PHONESIA_PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$PHONESIA_SOCKET" -p 55443 -U postgres -d postgres)

{
  printf 'Isolated PostgreSQL security test: %s\n' "$PHONESIA_TEST_ROOT"
  "${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/scripts/phonesia/security-test-bootstrap.sql"
  "${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/supabase/migrations/20260923143000_phonesia_qr_registration.sql"
  "${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/supabase/migrations/20260923143500_phonesia_data_access_security.sql"
  "${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/scripts/phonesia/security-test-main.sql"
  "${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/scripts/phonesia/security-followup-audit.sql"
  printf 'Security SQL checks passed. No production database or messaging service was used.\n'
} 2>&1 | tee "$PHONESIA_TEST_ROOT/results.log"
