#!/bin/sh
# Restore the REDMARS database from a nightly backup produced by backup.sh.
#
# Runs inside the `backup` sidecar (same postgres:16-alpine image, so psql's
# major version matches the server). Connection comes from the standard PG*
# environment variables already wired in docker-compose.yml.
#
# Usage (from the host):
#   docker compose exec backup sh /usr/local/bin/restore.sh /backups/redmars-20260721-020000.sql.gz
#   docker compose exec backup sh /usr/local/bin/restore.sh          # picks the newest backup
set -eu

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*"
}

TARGET="${1:-}"
if [ -z "${TARGET}" ]; then
  TARGET=$(find /backups -maxdepth 1 -name 'redmars-*.sql.gz' -type f | sort | tail -n 1)
  if [ -z "${TARGET}" ]; then
    log "ERROR: no backup file given and none found in /backups"
    exit 1
  fi
  log "no file given, using newest: ${TARGET}"
fi

if [ ! -f "${TARGET}" ]; then
  log "ERROR: backup file not found: ${TARGET}"
  exit 1
fi

log "restoring ${TARGET} into database '${PGDATABASE}' on ${PGHOST}:${PGPORT}"

# Terminate other connections so DROP SCHEMA can't be blocked by the API pool.
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid();
"

# Drop and recreate the schema rather than dropping the database — the backup
# sidecar connects to PGDATABASE directly and can't DROP DATABASE while
# connected to it, and this avoids needing a separate maintenance-db connection.
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

gunzip -c "${TARGET}" | psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}"

log "restore complete from ${TARGET}"
