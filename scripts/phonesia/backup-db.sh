#!/bin/bash
# Backup completo del database Phonesia (pg_dump formato custom, compresso) + SHA-256.
# Requisiti sul Mac: pg_dump 17 (brew install postgresql@17) e la stringa di connessione
# del database in un file leggibile solo da te (chmod 600), per esempio:
#   /Users/archimede/ai-secrets/phonesia-db-url   (contenuto: postgresql://postgres:...@db.vqtoxgcacosdqtoxihko.supabase.co:5432/postgres)
# Sola lettura sul database: pg_dump non modifica nulla.
set -euo pipefail
URL_FILE="${PHONESIA_DB_URL_FILE:-/Users/archimede/ai-secrets/phonesia-db-url}"
DEST="${PHONESIA_BACKUP_DIR:-/Users/archimede/server-backups/phonesia}"
KEEP=8
PG_DUMP="${PG_DUMP:-$(command -v pg_dump || echo /opt/homebrew/opt/postgresql@17/bin/pg_dump)}"
[ -r "$URL_FILE" ] || { echo "Manca il file con la connessione: $URL_FILE"; exit 1; }
[ -x "$PG_DUMP" ] || { echo "pg_dump non trovato. Installa: brew install postgresql@17"; exit 1; }
mkdir -p "$DEST"; chmod 700 "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
OUT="$DEST/phonesia-$STAMP.dump"
"$PG_DUMP" --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=phonesia_private --file="$OUT" "$(cat "$URL_FILE")"
chmod 600 "$OUT"
shasum -a 256 "$OUT" > "$OUT.sha256"
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t "$DEST"/phonesia-*.dump | tail -n +$((KEEP+1)) | while read -r old; do rm -f "$old" "$old.sha256"; echo "rimosso vecchio: $old"; done
