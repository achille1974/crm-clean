#!/bin/sh
set -eu

PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
TEST_ROOT="/private/tmp/crm-clean-pg-batch-20260918"
DATA_DIR="$TEST_ROOT/data"
SOCKET_DIR="$TEST_ROOT/socket"
LOG_FILE="$TEST_ROOT/postgres.log"
PORT="55439"
DB_NAME="crm_batch_isolated"
MIGRATION="/Users/archimede/crm-clean/supabase/migrations/20260918_phonesia_persistent_whatsapp_batches.sql"
REPORT="/Users/archimede/crm-clean/supabase/persistent-batch-sql-test-report.txt"

case "$TEST_ROOT" in /private/tmp/crm-clean-pg-batch-*) ;; *) echo "unsafe test root" >&2; exit 2;; esac
if [ ! -x "$PG_BIN/initdb" ]; then echo "PostgreSQL 16 binaries missing" >&2; exit 2; fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT already in use" >&2; exit 2; fi

mkdir -p "$TEST_ROOT" "$SOCKET_DIR"
if [ -d "$DATA_DIR" ]; then mv "$DATA_DIR" "$TEST_ROOT/data.previous.$(date +%s)"; fi
"$PG_BIN/initdb" -D "$DATA_DIR" --auth-local=trust --auth-host=trust --no-instructions >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start >/dev/null
cleanup() { "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop -m fast >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

PSQL="$PG_BIN/psql -X -v ON_ERROR_STOP=1 -h $SOCKET_DIR -p $PORT"
$PSQL -d postgres -c "create database $DB_NAME" >/dev/null
{
  echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "PostgreSQL: $($PG_BIN/postgres --version)"
  echo "Database: isolated local cluster; socket=$SOCKET_DIR; port=$PORT; database=$DB_NAME"
  echo "Migration: $MIGRATION"
  $PSQL -d "$DB_NAME" -f /Users/archimede/crm-clean/scripts/phonesia/sql-test-bootstrap.sql
  $PSQL -d "$DB_NAME" -f "$MIGRATION"
  $PSQL -d "$DB_NAME" -f /Users/archimede/crm-clean/scripts/phonesia/sql-test-main.sql
  echo "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} 2>&1 | tee "$REPORT"
