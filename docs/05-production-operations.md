# Deployment and production operations

Snapshot: **2026-10-31**, repository source audit. No application code or live database was changed. “Source-confirmed” describes inspected code, not a passed browser, deployment or hospital test. ⚠️ UNVERIFIED = unresolved or untested; 🚧 NOT IMPLEMENTED = absent from the inspected ownership/routes; 🐞 SUSPECTED BUG = evidence needs a focused reproduction. Testing VPS and legacy LAN deployments are distinct. Actual VPS state and actual hospital configuration are not inferred from this checkout.

**Overall readiness: NOT READY for production.** This task inspects code and prepares documentation; it does not deploy, reboot the VPS, restore hospital data or approve UAT. Current user intent is cloud testing. The on-premise context in the documentation request is covered below as a separate legacy deployment. “production” in NODE_ENV does not grant hospital acceptance.

## Environment and secrets

[Every detected environment/configuration variable](_audit/environment.md) has a source reference and scope caveat. API boot validates NODE_ENV, PORT, DATABASE_URL, CORS_ORIGIN, JWT_SECRET and token TTL settings. VITE_API_URL is a build-time frontend value. `apps/api/src/config/env.validation.ts:1`; `apps/web/src/lib/api.ts:1`; `apps/web/Dockerfile:1`.

Testing secrets belong in root-owned mode-600 /etc/redmars-testing/stack.env; offsite credentials in a separate root-only offsite.env; encryption password outside that backed-up directory and independently escrowed. Never paste whole env files, database URLs, password hashes or raw container environment output. The kit generator produces random database/JWT secrets and refuses to overwrite existing configuration. Bootstrap passwords are transient and must be changed. No password values are reproduced in these docs. `output/redmars-testing-vps-kit/generate-env.sh:1`; `output/redmars-testing-vps-kit/offsite.env.example:1`.

## Deployment variants and ports

| Variant | Services / exposure | Correct procedure / source |
| --- | --- | --- |
| Current testing VPS kit | PostgreSQL internal 5432; API internal 3000; static web internal 80; public Caddy 80/443; persistent data/certificate volumes | Standalone compose.testing.yml via redmars-test; do not overlay the legacy files. `output/redmars-testing-vps-kit/compose.testing.yml:1` |
| Legacy LAN base | PostgreSQL loopback 5433 default; Adminer loopback 8080; backup sidecar; Caddy web 443 / API 8443 with local certificates; host dev services | Development/LAN arrangement, not equivalent to cloud kit. `docker-compose.yml:1`; `Caddyfile:1` |
| Legacy container overlay | Adds compiled API + static web and swaps Caddy upstreams; still legacy TLS/backup/adminer base | Review merged config and certificates before using. `docker-compose.prod.yml:1`; `Caddyfile.prod:1` |

Testing operator installation and DNS commands are in the [existing kit guide](../output/redmars-testing-vps-kit/GUIDE.md). A hostname must be a complete FQDN, not just web.<IP>; use the configured exact name in the address bar. Free IP-derived DNS was selected during manual testing, but long-term domain ownership and DNS continuity are external dependencies. Certificates must be trusted on each actual client. Certificate-obtained logs are not an end-to-end browser test.

### Start, inspect and stop testing services

Run as root on the **testing VPS**, not on a production database:

```bash
redmars-test up -d
redmars-test ps
redmars-test logs --tail=80 api caddy postgres
# Maintenance stop; preserves volumes:
redmars-test stop
# Resume:
redmars-test up -d
```

Source: `output/redmars-testing-vps-kit/redmars-test:1`; `output/redmars-testing-vps-kit/compose.testing.yml:1`. Do not use volume deletion or migrate reset as maintenance.

### Update and migrations

1. Agree a testing maintenance window, take/check a fresh backup and record current commit/image tags.
2. Confirm the source working tree is understood. Fetch and review the intended redmars-v2 revision; only fast-forward after review.
3. Set RELEASE_TAG to that reviewed revision in the protected config. Build API/web; changing VITE_API_URL requires rebuilding web.
4. Start the new services. API CMD runs **prisma migrate deploy** followed by compiled Node. It does not run the development seed.
5. Check migration status, /health, browser login/password change, role controls, a synthetic workflow and backup status.
6. Keep previous images and pre-update backup. If schema compatibility is not proven, an older image alone is not a rollback. Rehearse matched code/database recovery separately, preserve the failed state, and get explicit approval before replacing hospital data.

Sources: `apps/api/Dockerfile:85`; `output/redmars-testing-vps-kit/GUIDE.md:598`. There are 51 migration directories in the reviewed snapshot; _prisma_migrations status/checksums must be checked in each actual target. Previous fresh/upgrade rehearsals do not establish the VPS state. `docs/production-readiness-phase-3.md:1`.

## Nightly backups and disaster recovery

Testing kit timer: **02:00 Asia/Kabul every night**, persistent after missed runs. Local directory: /var/backups/redmars-testing; custom pg_dump with SHA-256 and pg_restore --list check; local completed files older than 14 days removed after successful work. A successful archive listing is not a full restore test. Optional Restic copies encrypt the dump, checksums and operational config off server; retention is 14 daily, 8 weekly, 6 monthly snapshots, grouped by host/tags; forget does not automatically prune storage. No configured automatic alert channel is demonstrated. `output/redmars-testing-vps-kit/redmars-testing-backup.timer:1`; `output/redmars-testing-vps-kit/backup-testing.sh:1`.

Operator activation/checks, after installing the supplied units:

```bash
systemctl enable --now redmars-testing-backup.timer
systemctl start redmars-testing-backup.service
systemctl list-timers redmars-testing-backup.timer
systemctl status redmars-testing-backup.service --no-pager
journalctl -u redmars-testing-backup.service --since yesterday --no-pager
```

Sources: `output/redmars-testing-vps-kit/redmars-testing-backup.service:1`; `output/redmars-testing-vps-kit/GUIDE.md:1`. **⚠️ Activation and successful nightly/offsite runs on the user's VPS are not verified here.** VPS-only files do not survive total VPS loss; offsite activation and retrieval evidence are required before production.

### Restore rehearsal: separate database only

This is a testing drill, adapted from the kit guide. Inspect the chosen backup and available disk first. Never substitute the live database name.

```bash
# Root shell on the testing VPS. Choose a completed dump:
ls -lt /var/backups/redmars-testing/*.dump
read -rp 'Absolute path of the dump to verify: ' BACKUP
test -f "$BACKUP" || { echo 'Backup not found'; exit 1; }
(cd "$(dirname "$BACKUP")" && sha256sum -c "$(basename "$BACKUP").sha256") || exit 1

CHECK_DB="redmars_restore_check_$(date -u +%Y%m%d%H%M%S)"
redmars-test exec -T postgres sh -ec   'createdb -U "$POSTGRES_USER" "$1"' sh "$CHECK_DB" || exit 1
redmars-test exec -T postgres sh -ec   'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error'   sh "$CHECK_DB" < "$BACKUP" || exit 1

redmars-test exec -T postgres sh -ec   'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1' sh "$CHECK_DB" <<'SQL'
SELECT count(*) AS completed_migrations FROM _prisma_migrations
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) AS facilities FROM facility;
SELECT count(*) AS users FROM app_user;
SELECT count(*) AS patients FROM patient;
SELECT count(*) AS unvalidated_constraints FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace AND NOT convalidated;
SQL
```

Check every exit code, compare expected migration/checksum and representative record counts with backup-time evidence, inspect known records, then run the isolated restored-API connection test in kit guide Section 17. Keep the rehearsal DB until evidence is recorded. This procedure is **not newly executed in this documentation task**. Prior local isolated dump/restore evidence is in `output/redmars-testing-vps-kit/VALIDATION.md:1`. The legacy scripts/restore.sh terminates sessions and drops the target schema: do not use it for a non-destructive rehearsal. `scripts/restore.sh:34`.

## Monitoring, logs and recovery

GET /health is public and checks SELECT 1; healthy response reports API/DB status, uptime and timestamp; DB failure returns 503. Testing compose checks API and PostgreSQL health, logs rotate at 10 MB × 3 files per service. Restart unless-stopped helps process recovery but does not prove VPS reboot recovery or browser reconnection. `apps/api/src/health/health.controller.ts:36`; `output/redmars-testing-vps-kit/compose.testing.yml:1`.

```bash
redmars-test ps
redmars-test logs --tail=100 api caddy postgres
docker stats --no-stream
df -h
free -h
systemctl is-enabled docker redmars-testing-backup.timer
```

Agree alert thresholds and recipients for failed health checks, backup age/failure, disk use, memory and TLS expiry. These are **⚠️ not proven activated**. Reboot only in an approved testing window; afterwards verify Docker/services, a saved synthetic record, login, role permissions, next backup time and application reconnection. No physical UPS test is required for the cloud VPS, but staff need an internet-outage SOP.

## Security and privacy

- Passwords use Argon2. Permanent changes require 12–256 characters, a different current password and exclusion of listed demo patterns. Users creation currently permits 8–256 characters; Users password reset and legacy Practitioner creation require 10–256; HR account creation/reset require 10–128; testing bootstrap requires 16–256. All these temporary accounts still require the permanent password-change flow. Direct operator scripts do not establish API policy compliance. `packages/shared/src/auth.ts:163`; `packages/shared/src/user.ts:42`; `packages/shared/src/hr.ts:209`; `packages/shared/src/practitioner.ts:74`; `apps/api/src/auth/temporary-password.ts:1`; `output/redmars-testing-vps-kit/bootstrap-testing.cjs:1`.
- Access TTL defaults to 900 seconds; refresh defaults 7 days (testing kit 1). These are not an implemented inactivity timeout. Guard checks active/deleted state and credentialVersion per request; password changes revoke sessions. Login has a generic failure message and timing-resistant hash verification. **🚧 No login lockout/throttling call is present in AuthService.login; the rate-limit service is called for password change.** `apps/api/src/auth/auth.service.ts:82`; `apps/api/src/auth/auth.service.ts:354`; `apps/api/src/common/guards/jwt-auth.guard.ts:1`.
- Browser access and refresh tokens are in localStorage; refresh tokens do not rotate in the documented token store. Review XSS controls and the public-VPS session model before production. No installed MFA is demonstrated. `apps/web/src/lib/authTokens.ts:1`.
- Permissions are enforced at API, module enablement is separate, and conditional matrix grants require service checks. Psychiatric notes remain doctor-only; exports and shared workstations need strict local procedures. Do not conflate administrator with unrestricted clinical author. `apps/api/src/auth/permissions.ts:1`; `apps/api/src/common/guards/permissions.guard.ts:1`.
- Writes through audited Prisma share a transaction with audit records and redact credentials; batch/nested behavior is described in source. Audit reads/auth events are best effort and log failures. Manual Prisma/operator scripts without request context do not receive the same attributable audit coverage. `apps/api/src/prisma/transactional-audit.ts:1`; `apps/api/src/prisma/prisma.service.ts:17`.
- Cloud testing publishes Caddy only; database/API are internal. Legacy Adminer/Postgres bindings are loopback. Actual provider firewall, SSH policy, TLS clients, access review, export handling and backup key custody require operator evidence. `output/redmars-testing-vps-kit/compose.testing.yml:1`; `docker-compose.yml:1`.

## Data integrity and performance

Business records use multiple preservation mechanisms: deletedAt on some masters/users, voidedAt/reason on HR documents/credentials, entered_in_error/cancellation on clinical paths, and payment/journal reversal rather than history erasure. Do not promise every entity is soft-deleted. Exact fields and constraints: `apps/api/prisma/schema.prisma:1`; `apps/api/src/modules/invoice/payment.service.ts:1`; `apps/api/src/modules/finance/finance-ledger.service.ts:1`.

NumberSequenceService uses a facility/key/year UPSERT under a row lock. Sequence increments roll back only when the caller passes the same transaction. This supports controlled numbering but is not a universal guarantee of gap-free issued documents across every error/export/legacy operation. Money uses Prisma Decimal and finance decimal-text validation. Concurrency safeguards include command receipts, row locks and conditional updates; case-by-case acceptance is still needed for simultaneous reception/cashier actions. `apps/api/src/services/number-sequence.service.ts:67`; `apps/api/src/common/idempotent-command.ts:1`; `apps/api/src/modules/finance/finance-ledger.service.ts:38`.

Facility-time helpers fix Asia/Kabul; finance/HR date controls use Shamsi conversion and normalized dates. Dari/Pashto locale files and document RTL behavior exist; HR has many literal English labels, so do not claim full localization approval. `apps/api/src/common/facility-time.ts:1`; `packages/shared/src/shamsi.ts:1`; `apps/web/src/i18n/useDocumentLanguage.ts:1`; `apps/web/src/pages/HrPage.tsx:1`.

Schema indexes cover representative visit queue, appointment date, invoice date and patient references; [the schema inventory](_inventory.md) identifies exact declarations. Patient search/query strategies, list limits and pagination vary; user and practitioner lists read all matching rows. No current production load/concurrency benchmark was run. Test realistic volumes and EXPLAIN hot queries before capacity claims. `apps/api/src/modules/patient/patient.service.ts:1`; `apps/api/src/modules/users/users.service.ts:62`; `apps/api/src/modules/practitioner/practitioner.service.ts:68`; `apps/api/src/modules/finance/finance-ledger.service.ts:1`.

## Printers and client devices

Printing uses the browser dialog and print CSS/components, with targeted sheets for lab/history-lab/ID card and prescription/check-in/invoice layouts. It does not prove a network print server, silent ESC/POS driver, barcode-label printer or cash drawer integration. On each actual workstation verify supported browser, trusted HTTPS, login, Dari/Pashto fonts/RTL, paper size/margins, patient identity, page breaks, receipt readability and PDF output. Verify physical prescription, lab result, receipt and ID-card prints with hospital staff. `apps/web/src/lib/print.ts:1`; `apps/web/src/index.css:1`; `apps/web/src/components/PrescriptionSheet.tsx:1`; `apps/web/src/components/LabResultSheet.tsx:1`.

## Operator checklist

| Frequency | Required human check | Evidence / source |
| --- | --- | --- |
| Daily | Health, unresolved API/migration errors, disk, newest successful local/offsite backup, next timer run, failed finance events | Health, Docker/journal logs, backup filenames/snapshot IDs; sources above |
| Weekly | Restore into separate DB; compare records; check staff access and exports; inspect real printer results | Signed drill/access log; kit guide Sections 16–18 |
| Monthly | Review roles, leavers, credentials, dependency/catalog changes, capacity and retained backup retrieval | Management-approved access/SOP review; 03-dependency-matrix.md |

These are proposed operational duties, not an existing automatic scheduler for each check.

## Incident runbook

| Incident | Immediate action | Recovery / stop condition |
| --- | --- | --- |
| Server/app unavailable | Check provider console, Docker status, disk and container logs; distinguish API 503 from DNS/TLS failure | Restore service without deleting volumes; confirm saved records and browser reconnection. Do not declare recovered from process status alone. |
| Suspected DB corruption | Stop writes in an approved outage; preserve logs and volume/snapshot evidence | Restore to a separate DB and validate first. Replacing the real target requires explicit approval and a documented data-loss window. |
| Wrong payment | Identify invoice/payment IDs and source receipt; restrict further related actions until understood | Use authorized refund/reversal and reconciliation; do not edit/delete payment history. `apps/api/src/modules/invoice/payment.service.ts:1` |
| User locked out | Confirm account/employee active status and correct facility/hostname without sharing credentials | Another admin uses Users/HR temporary-password reset; mandatory first-login change. Last-admin recovery needs an authorized audited operator process; bootstrap is not a reset script. `apps/api/src/auth/temporary-password.ts:1` |
| Employee leaves | Record exit and linked-account deactivation; review active sessions, practitioner routing and open records | Service revokes linked sessions; independently hand over clinical/CRM/payroll work. Practitioner synchronization is an unresolved issue. `apps/api/src/modules/staff/staff.service.ts:342` |
| Hospital internet down while using VPS | Activate approved paper/downtime process; preserve patient identity and receipt numbers | Controlled later reconciliation; no verified browser offline-write queue. |

## Go-live checklist

| Requirement | Pass/fail for production | Evidence still required |
| --- | --- | --- |
| Current reviewed source and clean CI | ⚠️ UNVERIFIED current release | This task changes docs only; historical Phase 1 tests/tag do not cover subsequent revisions. |
| Clean schema and separate real database | ⚠️ UNVERIFIED VPS production target | Actual migration/checksum/no-demo validation; production provisioning approval. |
| TLS, firewall, secrets and login protection | FAIL / pending | Client tests, secret custody, access review and login abuse controls. |
| Nightly encrypted offsite backup and restore | ⚠️ UNVERIFIED | Enabled timer, successful snapshots, separate restore and retrieval evidence. |
| Reboot recovery and browser reconnection | ⚠️ UNVERIFIED | Actual scheduled VPS drill. |
| Finance opening AR, real cutover and accountant acceptance | FAIL / blocked | Controlled opening invoice migration; named accountant; approved actual figures. |
| Complete clinical IPD | FAIL / missing | Clinical admission-to-discharge implementation and tests. |
| Hospital configuration | POSTPONED | User file and authorization. |
| Staff UAT, printer/device tests and two-week HR pilot | FAIL / pending | Actual departmental sign-off and pilot results. |

Historical records: `docs/production-readiness-phase-3.md:1`; `docs/production-readiness-phase-4.md:1`; `docs/production-readiness-phase-6.md:1`; `output/redmars-testing-vps-kit/VALIDATION.md:1`. They are not newly rerun or proof of complete production acceptance.
