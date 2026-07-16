#!/bin/sh
# deploy/backup/pg-backup.sh
#
# Dumps the DocJob Postgres database (the docker-compose `postgres` service)
# to a gzip-compressed, timestamped file under $BACKUP_DIR, then rotates old
# dumps (keeps the $PG_BACKUP_KEEP most recent, default 14).
#
# Usage:   ./deploy/backup/pg-backup.sh
# Cron:    see deploy/backup/crontab.example
# Restore: see DEPLOY.md's "Backups" section.
#
# Env overrides:
#   BACKUP_DIR       where dumps are written (default: <repo root>/backups)
#   PG_BACKUP_KEEP   how many dumps to retain (default: 14)

set -eu

# Resolve the repo root (this script lives at deploy/backup/) so cron — which
# runs with no shell rc / working-directory context — finds docker-compose.yml
# regardless of the cwd it's invoked from.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
KEEP="${PG_BACKUP_KEEP:-14}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="$BACKUP_DIR/docjob-$TIMESTAMP.sql"
OUT_FILE="$DUMP_FILE.gz"

mkdir -p "$BACKUP_DIR"

echo "[pg-backup] dumping docjob -> $OUT_FILE"
# Two separate commands (dump-to-file, then gzip) rather than a
# `pg_dump | gzip` pipe — POSIX sh (dash) has no `pipefail`, so piping would
# only surface gzip's exit status and `set -e` would silently accept a
# truncated/empty "backup" if pg_dump itself failed mid-stream.
docker compose exec -T postgres pg_dump -U docjob docjob > "$DUMP_FILE"
gzip -f "$DUMP_FILE"
echo "[pg-backup] wrote $(du -h "$OUT_FILE" | cut -f1) ($OUT_FILE)"

# Rotation: keep only the $KEEP most recent dumps.
COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'docjob-*.sql.gz' | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  TO_DELETE=$((COUNT - KEEP))
  echo "[pg-backup] rotating: removing $TO_DELETE old dump(s), keeping $KEEP"
  find "$BACKUP_DIR" -maxdepth 1 -name 'docjob-*.sql.gz' | sort | head -n "$TO_DELETE" | while IFS= read -r f; do
    rm -f "$f"
    echo "[pg-backup] removed $f"
  done
fi

echo "[pg-backup] done"
