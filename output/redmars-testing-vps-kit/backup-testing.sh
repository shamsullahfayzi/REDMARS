#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
exec 9>/run/lock/redmars-testing-backup.lock
flock -n 9 || { echo 'A testing backup is already running.'; exit 0; }
directory=/var/backups/redmars-testing
install -d -m 700 "$directory"
stamp=$(date -u +%Y%m%dT%H%M%S.%NZ)
dump="$directory/redmars-testing-$stamp.dump"
partial="$dump.partial"
trap 'rm -f -- "$partial"' EXIT
/usr/local/bin/redmars-test exec -T postgres sh -ec \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$partial"
test -s "$partial"
/usr/local/bin/redmars-test exec -T postgres pg_restore --list < "$partial" > /dev/null
mv -- "$partial" "$dump"
(cd "$directory" && sha256sum "$(basename "$dump")" > "$(basename "$dump").sha256")
if [[ -f /etc/redmars-testing/offsite.env ]]; then
  set -a
  source /etc/redmars-testing/offsite.env
  set +a
fi
if [[ ${OFFSITE_ENABLED:-false} == true ]]; then
  : "${RESTIC_REPOSITORY:?Missing offsite repository}"
  : "${RESTIC_PASSWORD_FILE:?Missing offsite encryption password file}"
  restic backup "$dump" "$dump.sha256" /etc/redmars-testing /opt/redmars-testing --tag redmars-testing
  restic forget --tag redmars-testing --group-by host,tags --keep-daily 14 --keep-weekly 8 --keep-monthly 6
  echo 'Encrypted off-server snapshot completed.'
else
  echo 'Off-server copy is not configured; this backup remains on the VPS only.'
fi
# Delete only our completed local backup files after a successful run.
find "$directory" -maxdepth 1 -type f \( -name 'redmars-testing-*.dump' -o -name 'redmars-testing-*.dump.sha256' \) -mmin +20160 -delete
printf '%s Backup complete: %s\n' "$(date -Is)" "$(basename "$dump")"
