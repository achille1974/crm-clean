#!/bin/bash
set -euo pipefail
umask 077

pg_bin=/opt/homebrew/opt/postgresql@17/bin
test_dir=$(mktemp -d /private/tmp/phonesia-finalization-test.XXXXXX)
mkdir -m 700 "$test_dir/socket"
started=false
cleanup() {
  if "$started"; then
    "$pg_bin/pg_ctl" -D "$test_dir/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$test_dir/data" --no-instructions -A trust >/dev/null
"$pg_bin/pg_ctl" -D "$test_dir/data" \
  -o "-c listen_addresses='' -c unix_socket_directories='$test_dir/socket'" \
  -w start >/dev/null
started=true

"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -q -h "$test_dir/socket" -d postgres \
  -f scripts/phonesia/test-campaign-finalization.sql >/dev/null

"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -qAt -h "$test_dir/socket" -d postgres \
  -c "select public.phonesia_finalize_whatsapp_campaign('00000000-0000-0000-0000-000000000009')" \
  >"$test_dir/first.out" &
first_pid=$!
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -qAt -h "$test_dir/socket" -d postgres \
  -c "select public.phonesia_finalize_whatsapp_campaign('00000000-0000-0000-0000-000000000009')" \
  >"$test_dir/second.out" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -qAt -h "$test_dir/socket" -d postgres \
  -c "do \$\$ begin if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000009') <> 'completed' then raise exception 'concurrent finalization failed'; end if; if (select count(*) from public.phonesia_whatsapp_campaign_recipients where campaign_id='00000000-0000-0000-0000-000000000009') <> 1 then raise exception 'concurrent finalization changed recipients'; end if; end \$\$;" >/dev/null

echo 'PostgreSQL 17: finalization, recovery, idempotence and concurrency passed'
