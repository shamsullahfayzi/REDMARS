# CRM Module 1 — Foundation

Implementation date: 2026-10-14. Reference: `AXON_CRM_MODULE_BUILD_ORDER.md`.

## Scope

Register CRM inside the existing ERP and provide a usable facility configuration
screen. Contact records, leads, interaction histories, calls and assigned tasks
belong to Modules 2–6 and are not implemented by this foundation.

## UI and API contract

- `/crm`: workspace name, facility/timezone, access level, configured service
  areas, staffed clinical/emergency escalation contact and safe contact guidance.
  Administrators can edit settings. Call-centre users see guidance and a link to
  their existing patient follow-up queue.
- `/modules`: the existing administrator switch enables/disables CRM. New and
  existing facilities default to off. Switching updates the current session's
  navigation without requiring a new login.
- `GET /crm/workspace`: `crm.read`, granted to admin and call_center. Returns
  facility name/timezone, `canConfigure` and versioned settings; no patient data.
- `PUT /crm/settings`: `crm.configure`, admin only. Requires the full settings
  object and `expectedVersion`; unknown fields, including facilityId, are rejected.
- Both routes use the global authentication, permissions and facility module
  guards, plus CRM rate limiting. The authenticated facility determines scope.
- Configuration uses the existing `Setting` model with key `crm.settings`.
  Missing settings return version 0 and empty operational guidance. Reads do not
  create configuration records. The existing serializable audited transaction
  increments the version and rejects stale/concurrent changes with HTTP 409.

Workspace names allow 1–80 characters. Service areas allow up to 20 distinct
labels of 1–80 characters; they do not determine admission eligibility. Escalation
contact allows 120 characters and contact guidance 500. These fields are shared
operational settings, so the screen explicitly excludes patient details and
clinical notes. No hospital-specific clinical eligibility policy is hard-coded.

English, Dari and Pashto UI strings are included. Regional wording should receive
the normal native-speaker review during hospital UAT.

## Authorization, audit and rate limits

`crm.read` and `crm.configure` are added to the existing permission registry and
database grants. The call-centre role also receives the previously missing
`auth.login` and `auth.me` grants so its existing account can load the application.
No new clinical or financial permissions are granted.

Workspace reads use `@AuditRead('CrmWorkspace')`; settings mutations use the
existing transactional Setting audit. Read auditing retains the platform's current
best-effort failure behavior; this module does not change auditing globally.
Configuration snapshots include operational guidance, not a new patient record.

The shared `RateLimitService` stores atomic counters in `rate_limit_bucket`, keyed
by a SHA-256 hash of facility/user/scope. All CRM reads share 60 requests per
60-second window; writes share 10. HTTP 429 includes `Retry-After`. Counters use
database time and remain effective across API workers/restarts. They do not trust
forwarded IP headers and do not contain request bodies, credentials or patient
information. Authentication, permission and module guards run first.

One counter is reused per authenticated user/scope; expiry resets it. Operational
housekeeping may remove rows whose `expires_at` is older than one day. Counter
updates deliberately bypass business auditing. Other API modules are not
rate-limited by this change; future sensitive CRM endpoints need an appropriate
scope/limit, and public provider webhooks need their own authentication and limit.

## Migration and rollback

`20261014090000_crm_foundation` adds the `crm` ModuleKey enum value, transient rate
counter table/index and CRM grants. Settings reuse the existing table. It does
not enable CRM or rewrite clinical/financial records. Existing deployments gain
grants through the migration; fresh deployments also gain them from RBAC seeding.

For operational rollback:

1. Disable CRM through `/modules` as the facility administrator. This is audited
   and blocks direct API reads/writes while preserving settings. Re-enable to
   resume; the integration test covers this round trip.
2. Deploy the prior application build if required. Leave the additive enum value,
   disabled flag, settings and audit records in place. Older code ignores the
   disabled CRM flag and the extra settings/table.
3. Do not remove an enum value or drop saved configuration as routine rollback.
   Physical removal requires a maintenance migration reviewed against all later
   dependants and a tested backup. Prisma does not generate automatic down SQL.
4. Keep the call-centre identity grants; removing them would restore the prior
   sign-in/profile defect. Do not rerun an old full RBAC seed during rollback.

The main database was backed up to
`.test-runtime/redmars-before-crm-20261014.dump` (436,126 bytes); `pg_restore --list`
validated the archive. Migration deployment passed in both
`finance_foundation_test` and `redmars` (38 migrations total). This archive check
is not a full restore rehearsal. No patient or finance records were rewritten by
the CRM migration. The main API was restarted and both API health and the web
CRM route returned HTTP 200. The CRM module remains off in the main facility
until an administrator enables it through Modules.

## Verification and demo

Automated checks cover unauthenticated/unauthorized access, direct requests while
disabled, toggling without data loss, call-centre identity and patient-access
denial, facility isolation, strict settings validation, read/write audit records,
stale and concurrent saves, HTTP 429/retry, counter expiry and shared counters
across clients. Existing clinical/finance regressions, builds and lint are also
checked. Tests run against `finance_foundation_test`, not the hospital database.

Demo/UAT checklist:

1. Sign in as admin; open Modules, enable CRM, and confirm CRM appears in navigation.
2. Open CRM, configure workspace name and service areas, and save. Reload to
   confirm persistence. Use verified operational contact details only.
3. Sign in as a call-centre user. Read the guidance, confirm settings cannot be
   edited, and open the existing follow-up queue.
4. Disable CRM as admin. Confirm the navigation item disappears and a direct
   `/crm` request shows unavailable; re-enable and verify saved settings remain.
5. Open settings at two workstations. Save one, then attempt a stale save at the
   other; reload is required and the first change remains intact.

Results:

- CRM foundation: **8 integration tests passed**. Log:
  `.test-runtime/crm-foundation-tests.log`.
- Regression selection: 18 suites / 257 tests. The first combined run passed
  16 suites and 246 tests; finance revenue hit its 60-second volume-test timeout
  and a follow-on transaction timeout, and statement setup hit a login conflict
  during overlapping test activity. Both affected suites were rerun sequentially:
  **20/20 tests passed**. All selected suites therefore have passing results;
  the initial run was not wholly green. Logs: `crm-regression-tests.log` and
  `crm-finance-recheck.log` under `.test-runtime`.
- API unit: **1 test passed**; shared contract/date/money tests: **25 passed**.
- Shared, API and web builds passed. CRM backend/service/test lint passed;
  web lint has one pre-existing fast-refresh warning in `components/ui/button.tsx`.
  Vite reports the existing large bundle advisory.
- Isolated browser demo passed: admin sign-in, enable switch and immediate nav
  refresh, settings save/reload, English and Dari layouts, and call-centre sign-in
  showing operational guidance without settings controls or patient navigation.
  Synthetic preview accounts/data were removed; temporary preview servers stopped.
- Disabled-module rollback/re-enable, concurrent editor conflicts and cross-facility
  denial were exercised by API integration tests. Hospital UAT/signoff and verified
  staffed escalation details remain user acceptance steps. Module 2 has not started.

## Main files

Follow-up on 2026-10-14: the Modules page now identifies HTTP 403 as an
administrator-access requirement instead of a generic loading failure. The
reported request came from the accountant role. Access grants are unchanged.

- `packages/shared/src/crm.ts`, `packages/shared/src/facilityModule.ts`, shared exports.
- `apps/api/prisma/schema.prisma` and the CRM foundation migration.
- `apps/api/src/modules/crm/`, `apps/api/src/common/rate-limit.service.ts`.
- Existing AppModule, permission registry and `roles-and-permissions.md`.
- `apps/web/src/pages/CrmPage.tsx`, router, navigation/icons and three locale files.
- Existing auth context/provider and facility-module mutation hook for live navigation refresh.
- `apps/api/test/crm-foundation.e2e-spec.ts`.
