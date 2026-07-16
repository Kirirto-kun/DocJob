#!/bin/sh
# deploy/backup/uploads-backup.sh
#
# Archives the DocJob `uploads` docker volume (case attachments/images —
# apps/web/src/lib/storage.ts, UPLOAD_DIR=/app/storage/uploads in the `web`
# container) to a timestamped tarball under $BACKUP_DIR, then rotates old
# archives (keeps the $UPLOADS_BACKUP_KEEP most recent, default 14).
#
# Usage:   ./deploy/backup/uploads-backup.sh
# Cron:    see deploy/backup/crontab.example
# Restore: see DEPLOY.md's "Backups" section.
#
# Env overrides:
#   BACKUP_DIR            where archives are written (default: <repo root>/backups)
#   UPLOADS_BACKUP_KEEP   how many archives to retain (default: 14)

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
KEEP="${UPLOADS_BACKUP_KEEP:-14}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

# Resolve the named `uploads` volume's real (compose-project-prefixed) name
# via the label Docker Compose stamps on every volume it creates, rather than
# reaching into the running `web` container — this works whether or not the
# stack is currently up.
VOLUME=$(docker volume ls --filter "label=com.docker.compose.volume=uploads" --format '{{.Name}}' | head -n 1)
if [ -z "$VOLUME" ]; then
  echo "[uploads-backup] ERROR: no docker volume labeled com.docker.compose.volume=uploads found." >&2
  echo "[uploads-backup] Has the stack ever been started (docker compose up -d)?" >&2
  exit 1
fi

echo "[uploads-backup] archiving volume '$VOLUME' -> $OUT_FILE"
# A throwaway alpine container mounts the volume read-only and tars it to a
# bind-mounted host dir — avoids needing tar/gzip installed on the host, and
# doesn't require the `web` service to be running.
docker run --rm \
  -v "$VOLUME:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine \
  tar czf "/backup/uploads-$TIMESTAMP.tar.gz.tmp" -C /data .
mv "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz.tmp" "$OUT_FILE"
echo "[uploads-backup] wrote $(du -h "$OUT_FILE" | cut -f1) ($OUT_FILE)"

# Rotation: keep only the $KEEP most recent archives.
COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  TO_DELETE=$((COUNT - KEEP))
  echo "[uploads-backup] rotating: removing $TO_DELETE old archive(s), keeping $KEEP"
  find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' | sort | head -n "$TO_DELETE" | while IFS= read -r f; do
    rm -f "$f"
    echo "[uploads-backup] removed $f"
  done
fi

echo "[uploads-backup] done"
