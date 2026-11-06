#!/bin/bash
set -euo pipefail
PHONESIA_PG_BIN="${PHONESIA_TEST_PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PHONESIA_REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PHONESIA_TEST_ROOT="$(mktemp -d /private/tmp/phonesia-sync-test.XXXXXX)"
mkdir "$PHONESIA_TEST_ROOT/socket"
"$PHONESIA_PG_BIN/initdb" -D "$PHONESIA_TEST_ROOT/data" -U postgres --auth-local=trust --no-instructions >/dev/null
trap '"$PHONESIA_PG_BIN/pg_ctl" -D "$PHONESIA_TEST_ROOT/data" stop -m fast >/dev/null 2>&1 || true' EXIT INT TERM
"$PHONESIA_PG_BIN/pg_ctl" -D "$PHONESIA_TEST_ROOT/data" -l "$PHONESIA_TEST_ROOT/postgres.log" -o "-k $PHONESIA_TEST_ROOT/socket -c listen_addresses='' -p 55444" start -w >/dev/null
PHONESIA_PSQL=("$PHONESIA_PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$PHONESIA_TEST_ROOT/socket" -p 55444 -U postgres -d postgres)
"${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/scripts/phonesia/service-sync-bootstrap.sql"
"${PHONESIA_PSQL[@]}" -1 -f "$PHONESIA_REPO_ROOT/docs/pending/20260926_contract_service_sync.sql"
"${PHONESIA_PSQL[@]}" -f "$PHONESIA_REPO_ROOT/scripts/phonesia/service-sync-test.sql"
