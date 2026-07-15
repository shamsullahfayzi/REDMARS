#!/bin/sh
# Nightly logical backup of the REDMARS database.
#
# Runs inside the `backup` sidecar (see docker-compose.yml), which is the same
# postgres:16-alpine image as the server — pg_dump's major version must match the
# server's or it refuses to run.
#
# Connection comes from the standard PG* environment variables.
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="/backups/redmars-${STAMP}.sql.gz"
PARTIAL="${TARGET}.partial"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*"
}

# Write to .partial first and rename only on success. A dump killed halfway
# (power cut, OOM, disk full) must never be left sitting there with a name that
# says it is a complete backup — that is how you find out at restore time.
if ! pg_dump --format=plain --no-owner --no-privileges | gzip -9 >"${PARTIAL}"; then
  log "ERROR: pg_dump failed, discarding ${PARTIAL}"
  rm -f "${PARTIAL}"
  exit 1
fi

mv "${PARTIAL}" "${TARGET}"
log "ok: ${TARGET} ($(du -h "${TARGET}" | cut -f1))"

# Retention. Only ever touches files matching our own naming pattern.
DELETED=$(find /backups -maxdepth 1 -name 'redmars-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  log "retention: removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi
