const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const {d,table,ref,write,scope}=require('./write-guides.cjs');
const mod=p=>'apps/api/src/modules/'+p;
write('docs/04-workflows.md',`# End-to-end hospital workflows

${scope}

The following are source-confirmed paths and proposed UAT scripts. They are **not completed hospital UAT**. Use synthetic identities and amounts in testing; record actual results and departmental approval separately. Exact action IDs, handlers and endpoint candidates are in [_audit/ui-actions.md](_audit/ui-actions.md).

## OPD: arrival to follow-up

\`\`\`mermaid
sequenceDiagram
  participant R as Receptionist
  participant A as API and database
  participant D as Doctor
  participant L as Lab technician
  participant P as Pharmacist
  R->>A: Check-in patient, visit, services and payment
  A-->>R: Saved visit and paid reception invoice
  D->>A: Start visit and save clinical sections
  D->>A: Lab order and prescription as needed
  R->>A: Settle selected priced lab lines
  L->>A: Collect, enter and verify results
  D->>A: Read verified results
  P->>A: Bill prescription item prices
  R->>A: Settle pharmacy invoice
  P->>A: Confirm medicine handover
  D->>A: Record return plan / book appointment
  D->>A: Save and complete visit
\`\`\`

1. **Receptionist:** search the patient register and avoid duplicate registration. Reception check-in creates a patient only when the new-patient input is supplied. It always creates the Visit, initial status history and invoice/items in one transaction, plus Payment if total is positive. It can fulfill a matching arrival appointment. Reception's saved invoice is born paid; this is not the later lab/pharmacy credit-collection flow. ${ref(mod('reception/reception.service.ts'),'async checkIn')}.
2. **Doctor/nurse:** use the Queue; start the visit and enter only the sections held by the account. The consultation URL is visit-based. Doctor owns diagnoses, psychiatric notes, lab requests and prescriptions; nurse authority is narrower. ${ref('apps/web/src/pages/ConsultPage.tsx')}; ${ref('apps/api/src/auth/permissions.ts',"'clinical_note.write'")}.
3. **Doctor → Receptionist → Lab technician:** order valid tests; settle eligible priced test lines; collect selected samples only after those lines are paid. Enter results and verify; an unpriced test with no charge does not owe a payment. ${ref(mod('lab-order/lab-order.service.ts'))}; ${ref(mod('lab-order/lab-sample.service.ts'),'async collect')}; ${ref(mod('lab-billing/lab-billing.service.ts'))}.
4. **Doctor:** review verified results and save the clinical assessment. Draft or unverified numbers must not be described as released results. ${ref(mod('lab-order/lab-result.service.ts'))}; ${ref('packages/shared/src/labResult.ts')}.
5. **Pharmacist → Receptionist → Pharmacist:** create the pharmacy bill with checked item prices, collect payment in Collections, then confirm handover. These are separate operations. No physical stock batch decrement exists in this version. ${ref(mod('pharmacy/dispense.service.ts'),'async bill')}; ${ref(mod('pharmacy/dispense.service.ts'),'No stock is tracked in v1')}.
6. **Doctor/receptionist:** record the follow-up and/or appointment. A follow-up plan and an actual booking are separate records; do not assume one guarantees the other. Save dirty consultation sections before finish. ${ref(mod('follow-up/follow-up.service.ts'))}; ${ref(mod('appointment/appointment.service.ts'))}; ${ref('apps/web/src/components/ConsultActions.tsx','const saveAndFinish')}.

### OPD acceptance checks

Check one saved patient identity, expected Visit and invoice records, correct doctor queue membership, exact billed/received amounts, payment gates, correct verified result visibility, no premature pharmacy handover and saved follow-up/appointment. Test duplicate and invalid-prerequisite failures. These checks are ⚠️ UNVERIFIED in this task; prior test evidence is historical and linked in 05-production-operations.md.

## IPD: supported coordination and missing clinical workflow

**🚧 NOT IMPLEMENTED as a complete clinical journey.** The source has reception coordination records and an IPD module flag, but no full installed admission chart, daily inpatient charges, nursing medication administration, clinical discharge summary and final settlement chain. A flag can currently be enabled because RESERVED_MODULE_KEYS is empty; it does not install functionality. ${ref('packages/shared/src/facilityModule.ts','RESERVED_MODULE_KEYS')}; ${ref('apps/api/prisma/schema.prisma','/// Reception-side coordination only.')}; [_inventory.md](_inventory.md).

\`\`\`mermaid
stateDiagram-v2
  [*] --> pending: reception submits care request
  pending --> approved: different authorized reviewer
  pending --> rejected: reviewer provides reason
  pending --> cancelled
  approved --> completed: coordination completed
  approved --> cancelled
\`\`\`

1. Admin/nurse creates an active available reception bed associated with an IPD department.
2. Receptionist/admin creates an admission/transfer/discharge coordination request for an existing patient, with matching source/target references where supplied.
3. A different authorized doctor/admin approves or rejects. Approval conditionally reserves the available target bed. Self-approval is rejected.
4. Completion of admission occupies the reserved target. Transfer puts the source into cleaning and the reserved target into occupied; discharge moves the source to cleaning. Cancellation releases a reserved target.
5. **Stop:** these operations do not prove a clinical admission, nursing care record, daily bed charging or discharge bill was created. Do not use this as the hospital's complete IPD record.

All above state/effect claims: ${ref(mod('reception/reception-operations.service.ts'),'reviewCareRequest(')}. The missing steps require scoped implementation and acceptance, not manual status changes.

## Laboratory

\`\`\`mermaid
stateDiagram-v2
  [*] --> ordered
  ordered --> sample_collected: eligible paid items collected
  sample_collected --> resulted: result recorded
  resulted --> verified: technician verifies
\`\`\`

This diagram is a common path, not the complete state machine: the enum also declares in_progress and cancelled. Exact permitted actions are in LabResultService/LabSampleService, not inferred from enum ordering. Sources: ${ref('packages/shared/src/labOrder.ts')}; ${ref(mod('lab-order/lab-result.service.ts'))}.

1. Doctor creates the order from the approved catalog. Receptionist pays selected lab lines through the lab charge workflow.
2. Lab technician selects still-ordered items, checks patient/sample identity and collects. The batch is transactional; an invalid or unpaid selected item refuses the operation.
3. Enter each test's value using its result type, unit and reference range. Review errors before saving.
4. Verify resulted items. The same lab_tech role can enter and verify; separate verifier identity is **not established by the role matrix**. Management must approve this policy.
5. Release/print verified values. To correct a verified result, use amendment; preserve the original and reason.

Sources: ${ref(mod('lab-order/lab-sample.service.ts'),'async collect')}; ${ref(mod('lab-order/lab-result.service.ts'))}; ${ref('apps/api/src/auth/permissions.ts',"'lab.verify_result'")}; ${ref('apps/web/src/components/LabResultSheet.tsx')}.

## Follow-up and call center

1. Doctor records the planned return on the prescription/clinical workflow and may book an appointment. Receptionist also books under appointment.create.
2. Follow-ups lists return plans; Appointments is the booking book. Do not interpret a due return plan as a timed appointment.
3. Call center/admin records a call response on Follow-ups; this response does not change clinical notes.
4. CRM contacts, consent/authorization and caller verification govern patient-linked CRM booking. The CRM flow reuses Appointment ownership and overlap protection.
5. On return check-in, the reception flow can fulfill the matching arrival appointment and link its Visit.
6. **⚠️ UNVERIFIED / not established:** automatic outbound SMS/WhatsApp/email delivery. An internal reminder/task record is not proof of sending a message.

Sources: ${ref(mod('follow-up/follow-up.controller.ts'))}; ${ref(mod('crm/crm-appointments.service.ts'))}; ${ref(mod('appointment/appointment.service.ts'))}; ${ref(mod('reception/reception.service.ts'),'fulfilOnArrival')}.

## Finance: invoice to reconciliation

\`\`\`mermaid
sequenceDiagram
  participant Desk as Reception or Pharmacy
  participant HMIS as Invoice and Payment
  participant GL as Finance event consumer and ledger
  participant F as Accountant / Finance manager
  Desk->>HMIS: Create charge / settlement / controlled refund
  HMIS->>GL: Transactional integration event
  F->>GL: Synchronize eligible events
  GL-->>F: Posted entries or pending error
  F->>GL: Compare AR/AP/cash controls and reports
  F->>GL: Close period only when checks pass
\`\`\`

1. Reception check-in settles at arrival; lab/pharmacy invoices can later be collected. Partial settlement/line settlement depends on the invoice origin and endpoint; do not generalize reception's born-paid behavior.
2. Receptionist/pharmacist discounts need a reason and obey the configured ceiling. Above-threshold authority belongs to admin; the code does not imply a separate asynchronous approval inbox for every discount.
3. Refunds create signed negative Payment records under state, ownership and date checks. They do not erase the original receipt. Reprint through the permitted print action.
4. Till groups payments by user/date/method. Reception operations adds saved close/review and handover records; this is separate from opening a mandatory cash session before payment.
5. Finance synchronization consumes supported Invoice/Payment events. Chart, mapping, cutover and period controls apply. Errors remain pending; investigate them rather than skipping events.
6. Accountant reconciles operational AR/AP/salary/cash/bank to the ledger and sources. Finance manager/admin closes the period when controls pass. A balanced trial balance alone does not prove invoice-level AR allocation.
7. **Blocked for production cutover:** opening patient/panel invoice allocation and receipts on pre-cutover invoices. A general opening GL CSV is not the solution. Named accountant, approved cutover date and acceptance remain pending.

Sources: ${ref(mod('invoice/payment.service.ts'))}; ${ref(mod('invoice/discount.service.ts'))}; ${ref(mod('till/till.service.ts'))}; ${ref(mod('finance/finance-ledger.service.ts'),'FINANCE_EVENTS')}; ${ref(mod('finance/finance-close.service.ts'))}; ${ref('docs/production-readiness-phase-6.md')}.

## HR: hire to exit

1. Admin creates active Department/Position and Employee. Clinical position is specifically required for Doctor account creation; there is no generic HR-job-title-to-role synchronization.
2. Admin creates linked account from Employee details. Doctor onboarding also creates/reuses a Practitioner with employee-number code and home-department membership. Other clinical roles receive UserRole grants; do not invent separate nurse/lab profile records.
3. Admin configures shift types/coverage, assigns draft rosters and publishes. Authorized HR/payroll staff mark attendance and manage leave under date/status eligibility checks. Employees use linked self-service leave.
4. **Separate finance owner:** approved HR inputs must be reconciled with FinancePayrollEmployee and manual payroll adjustments. There is no verified automatic feed that turns HR attendance into the salary run.
5. Payroll officer/accountant prepares; an independent authorized reviewer/approver progresses the run; authorized payer settles accrued salary. Follow state/independence checks even if one account has several roles.
6. On Employee exit the service records exited/date/reason, deactivates the linked login and revokes sessions. It does not demonstrate automatic reassignment of every open visit, CRM task, payroll balance or clinical document. Review and hand over those records explicitly. Practitioner active-state synchronization after exit is 🐞 SUSPECTED BUG: exit does not update Practitioner.isActive.

Sources: ${ref(mod('staff/staff.service.ts'),'async createAccount')}; ${ref(mod('staff/staff.service.ts'),'async exit')}; ${ref(mod('staff/staff-operations.service.ts'))}; ${ref(mod('finance/finance-payroll.service.ts'))}.

## Test record and sign-off template

| Workflow / scenario | Synthetic record IDs | Actor roles | Expected state/money effect | Observed result and timestamp | Department sign-off |
| --- | --- | --- | --- | --- | --- |
| OPD / Lab / Pharmacy / Finance / HR / coordination | Record during execution | Record actual account roles | Use the referenced service rules | ⚠️ Not executed in this documentation task | Pending |

For each journey test a normal completion, wrong prerequisite, unauthorized actor, duplicate submit and correction/reversal. Actual printers, staff training, a two-week HR attendance/roster pilot and downtime recovery are acceptance work, not source-code properties.
`);
const configFiles=['docker-compose.yml','docker-compose.prod.yml','Caddyfile','Caddyfile.prod','apps/api/Dockerfile','apps/web/Dockerfile','apps/api/src/config/env.validation.ts','apps/api/src/main.ts','apps/api/src/auth/auth.module.ts','apps/api/prisma/seed.ts','apps/api/prisma/dev-seed.ts','scripts/backup.sh','scripts/restore.sh',...fs.readdirSync('output/redmars-testing-vps-kit').filter(n=>/\.(sh|yml|example)$|^redmars-test$|^Caddyfile/.test(n)).map(n=>'output/redmars-testing-vps-kit/'+n)];
const env=new Map();function add(name,p,line){if(!env.has(name))env.set(name,new Set());env.get(name).add('`'+p+':'+line+'`');}
for(const f of d.files){const s=read(f.path);for(const m of s.matchAll(/(?:process\.env\.|import\.meta\.env\.|\.get(?:<[^>]*>)?\(['"])([A-Z][A-Z0-9_]+)/g))add(m[1],f.path,s.slice(0,m.index).split('\n').length);}
for(const p of configFiles){if(!fs.existsSync(p))continue;const s=read(p);for(const m of s.matchAll(/\$\{?([A-Z][A-Z0-9_]+)|^\s*([A-Z][A-Z0-9_]+)\s*[:=]/gm)){const n=m[1]||m[2];if(['EUID','HOME','PATH','TARGET','TARGET_DB','CONFIRM','CHECK_DB','BACKUP','NODE_ENV'].includes(n)&&n!=='NODE_ENV')continue;add(n,p,s.slice(0,m.index).split('\n').length);}}
const envMeaning={NODE_ENV:'Runtime validation mode; compiled testing VPS uses production mode but synthetic data.',PORT:'API listen port; default 3000.',DATABASE_URL:'Secret database URL; required PostgreSQL connection.',CORS_ORIGIN:'Exact browser web origin; local default localhost:5173 must be replaced on VPS.',JWT_SECRET:'Secret HS256 signing key, minimum 32 characters; generated per deployment.',JWT_ACCESS_TTL_SECONDS:'Access-token lifetime; default 900 seconds.',JWT_REFRESH_TTL_DAYS:'Refresh-session lifetime; API default 7 days, testing kit overrides 1 day.',VITE_API_URL:'Public browser-reachable API origin; baked at web build time.',POSTGRES_USER:'Database role; testing kit generated config.',POSTGRES_PASSWORD:'Secret database password; do not print or commit.',POSTGRES_DB:'Database name; testing kit fixes redmars_testing.',POSTGRES_PORT:'Legacy loopback host PostgreSQL port; default 5433.',ADMINER_PORT:'Legacy loopback database UI port; default 8080.',TZ:'System/backup timezone; use Asia/Kabul as configured.',WEB_DOMAIN:'Web FQDN without scheme/port; DNS must reach VPS.',API_DOMAIN:'API FQDN without scheme/port; distinct from web.',ACME_EMAIL:'Certificate-account contact email.',RELEASE_TAG:'Reviewed commit/image tag; record before updates.',SEED_ADMIN_PASSWORD:'Transient bootstrap password; not needed for ordinary API startup. Do not store in Git or chat.',ALLOW_TEST_BOOTSTRAP:'Testing-only opt-in; YES_TEST_ONLY plus exact database name; not production provisioning.',BACKUP_RETENTION_DAYS:'Legacy backup retention; default 14 days.',BACKUP_SCHEDULE:'Legacy cron expression; default 0 2 * * *.',CADDY_HTTPS_PORT:'Legacy LAN web TLS port, default 443.',CADDY_API_PORT:'Legacy LAN API TLS port, default 8443.',OFFSITE_ENABLED:'Optional testing kit Restic copy switch; false/no file means VPS-only backup.',RESTIC_REPOSITORY:'Offsite repository location; keep credentials private.',RESTIC_PASSWORD_FILE:'Path to encryption password stored outside the backed-up config directory.',AWS_ACCESS_KEY_ID:'Offsite S3 credential; secret.',AWS_SECRET_ACCESS_KEY:'Offsite S3 credential; secret.',PGHOST:'Legacy libpq host.',PGPORT:'Legacy libpq port.',PGUSER:'Legacy libpq role.',PGPASSWORD:'Legacy libpq secret.',PGDATABASE:'Legacy libpq target database.'};
write('docs/_audit/environment.md','# Environment variable inventory\n\nNames only; no secret values copied. Includes application source, seed/test helpers and tracked deployment/backup templates. Script-local variables can appear as candidates; they are not automatically mandatory deployment settings. Test-only variables must not be treated as production configuration.\n\n'+table(['Variable','Meaning / scope','Sources'],[...env].sort().map(([n,s])=>[n,envMeaning[n]||'⚠️ UNVERIFIED variable scope/default: inspect cited source before setting', [...s].join('; ')])));
write('docs/05-production-operations.md',`# Deployment and production operations

${scope}

**Overall readiness: NOT READY for production.** This task inspects code and prepares documentation; it does not deploy, reboot the VPS, restore hospital data or approve UAT. Current user intent is cloud testing. The on-premise context in the documentation request is covered below as a separate legacy deployment. “production” in NODE_ENV does not grant hospital acceptance.

## Environment and secrets

[Every detected environment/configuration variable](_audit/environment.md) has a source reference and scope caveat. API boot validates NODE_ENV, PORT, DATABASE_URL, CORS_ORIGIN, JWT_SECRET and token TTL settings. VITE_API_URL is a build-time frontend value. ${ref('apps/api/src/config/env.validation.ts')}; ${ref('apps/web/src/lib/api.ts')}; ${ref('apps/web/Dockerfile')}.

Testing secrets belong in root-owned mode-600 /etc/redmars-testing/stack.env; offsite credentials in a separate root-only offsite.env; encryption password outside that backed-up directory and independently escrowed. Never paste whole env files, database URLs, password hashes or raw container environment output. The kit generator produces random database/JWT secrets and refuses to overwrite existing configuration. Bootstrap passwords are transient and must be changed. No password values are reproduced in these docs. ${ref('output/redmars-testing-vps-kit/generate-env.sh')}; ${ref('output/redmars-testing-vps-kit/offsite.env.example')}.

## Deployment variants and ports

| Variant | Services / exposure | Correct procedure / source |
| --- | --- | --- |
| Current testing VPS kit | PostgreSQL internal 5432; API internal 3000; static web internal 80; public Caddy 80/443; persistent data/certificate volumes | Standalone compose.testing.yml via redmars-test; do not overlay the legacy files. ${ref('output/redmars-testing-vps-kit/compose.testing.yml')} |
| Legacy LAN base | PostgreSQL loopback 5433 default; Adminer loopback 8080; backup sidecar; Caddy web 443 / API 8443 with local certificates; host dev services | Development/LAN arrangement, not equivalent to cloud kit. ${ref('docker-compose.yml')}; ${ref('Caddyfile')} |
| Legacy container overlay | Adds compiled API + static web and swaps Caddy upstreams; still legacy TLS/backup/adminer base | Review merged config and certificates before using. ${ref('docker-compose.prod.yml')}; ${ref('Caddyfile.prod')} |

Testing operator installation and DNS commands are in the [existing kit guide](../output/redmars-testing-vps-kit/GUIDE.md). A hostname must be a complete FQDN, not just web.<IP>; use the configured exact name in the address bar. Free IP-derived DNS was selected during manual testing, but long-term domain ownership and DNS continuity are external dependencies. Certificates must be trusted on each actual client. Certificate-obtained logs are not an end-to-end browser test.

### Start, inspect and stop testing services

Run as root on the **testing VPS**, not on a production database:

\`\`\`bash
redmars-test up -d
redmars-test ps
redmars-test logs --tail=80 api caddy postgres
# Maintenance stop; preserves volumes:
redmars-test stop
# Resume:
redmars-test up -d
\`\`\`

Source: ${ref('output/redmars-testing-vps-kit/redmars-test')}; ${ref('output/redmars-testing-vps-kit/compose.testing.yml')}. Do not use volume deletion or migrate reset as maintenance.

### Update and migrations

1. Agree a testing maintenance window, take/check a fresh backup and record current commit/image tags.
2. Confirm the source working tree is understood. Fetch and review the intended redmars-v2 revision; only fast-forward after review.
3. Set RELEASE_TAG to that reviewed revision in the protected config. Build API/web; changing VITE_API_URL requires rebuilding web.
4. Start the new services. API CMD runs **prisma migrate deploy** followed by compiled Node. It does not run the development seed.
5. Check migration status, /health, browser login/password change, role controls, a synthetic workflow and backup status.
6. Keep previous images and pre-update backup. If schema compatibility is not proven, an older image alone is not a rollback. Rehearse matched code/database recovery separately, preserve the failed state, and get explicit approval before replacing hospital data.

Sources: ${ref('apps/api/Dockerfile','CMD')}; ${ref('output/redmars-testing-vps-kit/GUIDE.md','## 19.')}. There are 51 migration directories in the reviewed snapshot; _prisma_migrations status/checksums must be checked in each actual target. Previous fresh/upgrade rehearsals do not establish the VPS state. ${ref('docs/production-readiness-phase-3.md')}.

## Nightly backups and disaster recovery

Testing kit timer: **02:00 Asia/Kabul every night**, persistent after missed runs. Local directory: /var/backups/redmars-testing; custom pg_dump with SHA-256 and pg_restore --list check; local completed files older than 14 days removed after successful work. A successful archive listing is not a full restore test. Optional Restic copies encrypt the dump, checksums and operational config off server; retention is 14 daily, 8 weekly, 6 monthly snapshots, grouped by host/tags; forget does not automatically prune storage. No configured automatic alert channel is demonstrated. ${ref('output/redmars-testing-vps-kit/redmars-testing-backup.timer')}; ${ref('output/redmars-testing-vps-kit/backup-testing.sh')}.

Operator activation/checks, after installing the supplied units:

\`\`\`bash
systemctl enable --now redmars-testing-backup.timer
systemctl start redmars-testing-backup.service
systemctl list-timers redmars-testing-backup.timer
systemctl status redmars-testing-backup.service --no-pager
journalctl -u redmars-testing-backup.service --since yesterday --no-pager
\`\`\`

Sources: ${ref('output/redmars-testing-vps-kit/redmars-testing-backup.service')}; ${ref('output/redmars-testing-vps-kit/GUIDE.md')}. **⚠️ Activation and successful nightly/offsite runs on the user's VPS are not verified here.** VPS-only files do not survive total VPS loss; offsite activation and retrieval evidence are required before production.

### Restore rehearsal: separate database only

This is a testing drill, adapted from the kit guide. Inspect the chosen backup and available disk first. Never substitute the live database name.

\`\`\`bash
# Root shell on the testing VPS. Choose a completed dump:
ls -lt /var/backups/redmars-testing/*.dump
read -rp 'Absolute path of the dump to verify: ' BACKUP
test -f "$BACKUP" || { echo 'Backup not found'; exit 1; }
(cd "$(dirname "$BACKUP")" && sha256sum -c "$(basename "$BACKUP").sha256") || exit 1

CHECK_DB="redmars_restore_check_$(date -u +%Y%m%d%H%M%S)"
redmars-test exec -T postgres sh -ec \
  'createdb -U "$POSTGRES_USER" "$1"' sh "$CHECK_DB" || exit 1
redmars-test exec -T postgres sh -ec \
  'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error' \
  sh "$CHECK_DB" < "$BACKUP" || exit 1

redmars-test exec -T postgres sh -ec \
  'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1' sh "$CHECK_DB" <<'SQL'
SELECT count(*) AS completed_migrations FROM _prisma_migrations
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) AS facilities FROM facility;
SELECT count(*) AS users FROM app_user;
SELECT count(*) AS patients FROM patient;
SELECT count(*) AS unvalidated_constraints FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace AND NOT convalidated;
SQL
\`\`\`

Check every exit code, compare expected migration/checksum and representative record counts with backup-time evidence, inspect known records, then run the isolated restored-API connection test in kit guide Section 17. Keep the rehearsal DB until evidence is recorded. This procedure is **not newly executed in this documentation task**. Prior local isolated dump/restore evidence is in ${ref('output/redmars-testing-vps-kit/VALIDATION.md')}. The legacy scripts/restore.sh terminates sessions and drops the target schema: do not use it for a non-destructive rehearsal. ${ref('scripts/restore.sh','DROP SCHEMA')}.

## Monitoring, logs and recovery

GET /health is public and checks SELECT 1; healthy response reports API/DB status, uptime and timestamp; DB failure returns 503. Testing compose checks API and PostgreSQL health, logs rotate at 10 MB × 3 files per service. Restart unless-stopped helps process recovery but does not prove VPS reboot recovery or browser reconnection. ${ref('apps/api/src/health/health.controller.ts','async check')}; ${ref('output/redmars-testing-vps-kit/compose.testing.yml')}.

\`\`\`bash
redmars-test ps
redmars-test logs --tail=100 api caddy postgres
docker stats --no-stream
df -h
free -h
systemctl is-enabled docker redmars-testing-backup.timer
\`\`\`

Agree alert thresholds and recipients for failed health checks, backup age/failure, disk use, memory and TLS expiry. These are **⚠️ not proven activated**. Reboot only in an approved testing window; afterwards verify Docker/services, a saved synthetic record, login, role permissions, next backup time and application reconnection. No physical UPS test is required for the cloud VPS, but staff need an internet-outage SOP.

## Security and privacy

- Passwords use Argon2. Permanent changes require 12–256 characters, a different current password and exclusion of listed demo patterns. Users creation currently permits 8–256 characters; Users password reset and legacy Practitioner creation require 10–256; HR account creation/reset require 10–128; testing bootstrap requires 16–256. All these temporary accounts still require the permanent password-change flow. Direct operator scripts do not establish API policy compliance. ${ref('packages/shared/src/auth.ts','export const changePasswordRequestSchema')}; ${ref('packages/shared/src/user.ts','export const createUserRequestSchema')}; ${ref('packages/shared/src/hr.ts','export const createEmployeeAccountSchema')}; ${ref('packages/shared/src/practitioner.ts','export const createPractitionerAccountRequestSchema')}; ${ref('apps/api/src/auth/temporary-password.ts')}; ${ref('output/redmars-testing-vps-kit/bootstrap-testing.cjs')}.
- Access TTL defaults to 900 seconds; refresh defaults 7 days (testing kit 1). These are not an implemented inactivity timeout. Guard checks active/deleted state and credentialVersion per request; password changes revoke sessions. Login has a generic failure message and timing-resistant hash verification. **🚧 No login lockout/throttling call is present in AuthService.login; the rate-limit service is called for password change.** ${ref('apps/api/src/auth/auth.service.ts','async login')}; ${ref('apps/api/src/auth/auth.service.ts','async changePassword')}; ${ref('apps/api/src/common/guards/jwt-auth.guard.ts')}.
- Browser access and refresh tokens are in localStorage; refresh tokens do not rotate in the documented token store. Review XSS controls and the public-VPS session model before production. No installed MFA is demonstrated. ${ref('apps/web/src/lib/authTokens.ts')}.
- Permissions are enforced at API, module enablement is separate, and conditional matrix grants require service checks. Psychiatric notes remain doctor-only; exports and shared workstations need strict local procedures. Do not conflate administrator with unrestricted clinical author. ${ref('apps/api/src/auth/permissions.ts')}; ${ref('apps/api/src/common/guards/permissions.guard.ts')}.
- Writes through audited Prisma share a transaction with audit records and redact credentials; batch/nested behavior is described in source. Audit reads/auth events are best effort and log failures. Manual Prisma/operator scripts without request context do not receive the same attributable audit coverage. ${ref('apps/api/src/prisma/transactional-audit.ts')}; ${ref('apps/api/src/prisma/prisma.service.ts','async recordRead')}.
- Cloud testing publishes Caddy only; database/API are internal. Legacy Adminer/Postgres bindings are loopback. Actual provider firewall, SSH policy, TLS clients, access review, export handling and backup key custody require operator evidence. ${ref('output/redmars-testing-vps-kit/compose.testing.yml')}; ${ref('docker-compose.yml')}.

## Data integrity and performance

Business records use multiple preservation mechanisms: deletedAt on some masters/users, voidedAt/reason on HR documents/credentials, entered_in_error/cancellation on clinical paths, and payment/journal reversal rather than history erasure. Do not promise every entity is soft-deleted. Exact fields and constraints: ${ref('apps/api/prisma/schema.prisma')}; ${ref(mod('invoice/payment.service.ts'))}; ${ref(mod('finance/finance-ledger.service.ts'))}.

NumberSequenceService uses a facility/key/year UPSERT under a row lock. Sequence increments roll back only when the caller passes the same transaction. This supports controlled numbering but is not a universal guarantee of gap-free issued documents across every error/export/legacy operation. Money uses Prisma Decimal and finance decimal-text validation. Concurrency safeguards include command receipts, row locks and conditional updates; case-by-case acceptance is still needed for simultaneous reception/cashier actions. ${ref('apps/api/src/services/number-sequence.service.ts','async next')}; ${ref('apps/api/src/common/idempotent-command.ts')}; ${ref(mod('finance/finance-ledger.service.ts'),'export const decimal')}.

Facility-time helpers fix Asia/Kabul; finance/HR date controls use Shamsi conversion and normalized dates. Dari/Pashto locale files and document RTL behavior exist; HR has many literal English labels, so do not claim full localization approval. ${ref('apps/api/src/common/facility-time.ts')}; ${ref('packages/shared/src/shamsi.ts')}; ${ref('apps/web/src/i18n/useDocumentLanguage.ts')}; ${ref('apps/web/src/pages/HrPage.tsx')}.

Schema indexes cover representative visit queue, appointment date, invoice date and patient references; [the schema inventory](_inventory.md) identifies exact declarations. Patient search/query strategies, list limits and pagination vary; user and practitioner lists read all matching rows. No current production load/concurrency benchmark was run. Test realistic volumes and EXPLAIN hot queries before capacity claims. ${ref(mod('patient/patient.service.ts'))}; ${ref(mod('users/users.service.ts'),'async list')}; ${ref(mod('practitioner/practitioner.service.ts'),'async list')}; ${ref(mod('finance/finance-ledger.service.ts'))}.

## Printers and client devices

Printing uses the browser dialog and print CSS/components, with targeted sheets for lab/history-lab/ID card and prescription/check-in/invoice layouts. It does not prove a network print server, silent ESC/POS driver, barcode-label printer or cash drawer integration. On each actual workstation verify supported browser, trusted HTTPS, login, Dari/Pashto fonts/RTL, paper size/margins, patient identity, page breaks, receipt readability and PDF output. Verify physical prescription, lab result, receipt and ID-card prints with hospital staff. ${ref('apps/web/src/lib/print.ts')}; ${ref('apps/web/src/index.css')}; ${ref('apps/web/src/components/PrescriptionSheet.tsx')}; ${ref('apps/web/src/components/LabResultSheet.tsx')}.

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
| Wrong payment | Identify invoice/payment IDs and source receipt; restrict further related actions until understood | Use authorized refund/reversal and reconciliation; do not edit/delete payment history. ${ref(mod('invoice/payment.service.ts'))} |
| User locked out | Confirm account/employee active status and correct facility/hostname without sharing credentials | Another admin uses Users/HR temporary-password reset; mandatory first-login change. Last-admin recovery needs an authorized audited operator process; bootstrap is not a reset script. ${ref('apps/api/src/auth/temporary-password.ts')} |
| Employee leaves | Record exit and linked-account deactivation; review active sessions, practitioner routing and open records | Service revokes linked sessions; independently hand over clinical/CRM/payroll work. Practitioner synchronization is an unresolved issue. ${ref(mod('staff/staff.service.ts'),'async exit')} |
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

Historical records: ${ref('docs/production-readiness-phase-3.md')}; ${ref('docs/production-readiness-phase-4.md')}; ${ref('docs/production-readiness-phase-6.md')}; ${ref('output/redmars-testing-vps-kit/VALIDATION.md')}. They are not newly rerun or proof of complete production acceptance.
`);
console.log('Wrote workflow, operations and environment documents.');
