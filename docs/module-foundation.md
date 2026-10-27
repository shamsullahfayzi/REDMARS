# AXON module integration foundation

## Scope and deployment

REDMARS remains a modular NestJS monolith with PostgreSQL as the source of truth.
The supported deployment is **one hospital per database**. Facility-scoped foreign
keys provide additional protection; they do not make the existing username-only
login a shared multi-hospital identity system.

This change repairs shared transaction, audit, billing, encounter and integration
paths. Finance/accounting, HR/payroll and IPD workflows are separate upcoming
modules. The initial AFN finance release is now implemented; see
`docs/finance-implementation.md` for its scope and operating limits. The `hr` key
remains reserved until its implementation is installed. Existing module flags do
not by themselves implement any workflow.

## Corrections

- Business mutations, audit before/after images and supported integration events
  commit or roll back together. Audit storage failure fails the command. Upserts
  and batch operations are audited; nested changes appear on the parent snapshot.
  Credentials are redacted recursively. Read logging completes before the response
  is returned; read logging failure remains non-fatal.
- Commands use serializable transactions. Conflicting writes return HTTP 409;
  callers reload before deciding whether to retry. No silent transaction retries
  repeat side effects outside PostgreSQL.
- Prescription validation, auto-start, header and items now form one transaction.
  The browser sends its loaded version, so a background refresh cannot turn stale
  edits into an accepted overwrite. Billed or dispensed sheets cannot be rewritten.
- Lab payments receive receipt numbers; invoice payment also updates lab gates
  when fully settled. Refunds clear paid gates conservatively. A discounted lab
  invoice must be settled through the invoice screen. Arbitrary partial generic
  payments do not claim that any particular lab line is settled.
- Pharmacy handover and sample collection read their payment gates inside the
  same transaction as their status changes. Cancelled or draft bills cannot open
  those gates, including bills with a zero total.
- Visit cancellation reads the live payments inside its transaction, reverses only
  positive unreversed payments, enforces the refund permission/window and issues
  receipts. `refunds[]` contains exact amounts per invoice/currency. The old
  `refund` field is populated only for a single refunded invoice.
- Lab results retain the reference range selected at entry. Catalog changes no
  longer rewrite the range displayed in the visit or patient history. Legacy rows
  have unknown ranges, represented by null, rather than invented snapshots.
- Database checks reject invalid new monetary values. Composite foreign keys
  protect core patient, user, practitioner, department, room, encounter, appointment
  and invoice relationships from cross-facility references. Clinical charge origins
  cannot be billed twice.

## Rules for new modules

1. Inject `PrismaService` and use **`prisma.db`**. A command uses its callback
   transaction and passes that same `tx` to all participating services, number
   issuance and event consumption. Raw `PrismaClient` is for migrations and test
   fixtures, not production feature code. Raw SQL needs explicit audit handling.
2. Routes declare both `@RequirePermission` and the appropriate `@RequiresModule`.
   Resource ownership and conditional role rules must be checked inside services.
   Do not grant HR access to clinical records or finance access to clinical notes.
3. Reuse `Facility.id`, `Department.id`, `AppUser.id`, `Practitioner.id`, `Patient.id`
   and **`Visit.id` as the encounter identifier**. HR should introduce employee
   records with optional account/practitioner links; an employee is not necessarily
   a login or a clinician. IPD should attach admission/bed/movement records to the
   existing encounter, not create a second patient register.
4. Keep currency with every monetary amount and use decimal strings at API/event
   boundaries. Finance owns journal entries and accounting periods; HMIS invoices,
   receipts and reversals remain their source records. Do not change `paidAmount`
   from a finance screen. Never sum different currencies into one number.
5. New clients must send `expectedVersion` for prescription saves and UUID
   `idempotencyKey` for payment/refund/lab-payment commands. Keys are scoped to
   facility, actor and operation; an identical retry returns the original response,
   while different input under the same key is rejected. Fields remain optional
   for legacy clients, which do not receive sequential retry/stale-write protection.
6. External calls must not run inside database transactions. This foundation
   supports transactional **local** consumers; a remote connector requires a
   delivery worker, bounded retries, operational visibility and remote deduplication.

## Durable integration contract

`IntegrationEvent` is written with the audit entry for Invoice, Payment, AppUser,
Practitioner, Department and Visit mutations. Event types are
`hmis.<PrismaModel>.<create|update|delete>.v1`, with version `1`, a facility,
aggregate ID, source audit ID, timestamp and allowlisted before/after data.
Names, clinical text, passwords, tokens and free-text payment references are not
published. Payment events include the invoice currency and patient/encounter IDs.
Treat identifiers as sensitive and keep consumers facility scoped.

Import `IntegrationModule` and use `IntegrationService.pending(facilityId,
consumerName, eventTypes, limit)` (maximum 500). Process each event through
`consume(facilityId, consumerName, eventId, handler)`. The handler receives the
event and audited transaction. Its local writes and unique consumer receipt commit
together. A failure leaves the event pending; a completed duplicate returns false.
A concurrent delivery can return a conflict and must retry by the same event ID.
Events predating this migration are not invented or backfilled.

For accounting, positive `Payment.create` is cash received and negative
`Payment.create` is money returned. The original payment's `update` marks its
reversal; **do not post that update as another cash movement**. Maintain the source
event ID on every journal posting and require balanced entries in the finance
module's own transaction. Invoice changes describe charge state, not cash receipts.

## Migration and release procedure

1. Back up the hospital database and verify restoration to an isolated environment.
2. Run `apps/api/prisma/foundation-preflight.sql` on the restored copy. Review every
   result: orphaned/mismatched scope, totals, missing receipts and duplicate origins
   require explicit reconciliation. Do not reset or silently rewrite history.
3. Build shared contracts, generate Prisma and apply migrations on that copy:
   `pnpm --filter @redmars/shared build`, `pnpm --filter api exec prisma generate`,
   `pnpm --filter api exec prisma migrate deploy`.
4. Monetary checks and new composite foreign keys initially use `NOT VALID` to
   preserve existing rows while rejecting new invalid writes. After reconciliation,
   validate each new constraint using `ALTER TABLE ... VALIDATE CONSTRAINT ...`.
   The unique clinical-origin index deliberately stops migration on duplicates.
5. Run the CI checks, a hospital workflow rehearsal and a restore test before
   applying the same migration/build to production in a maintenance window.
   After new writes begin, prefer a reviewed forward repair to dropping history.

The added CI workflow runs migrations, seed, shared/API/web builds, unit tests and
the API E2E suite against disposable PostgreSQL 16. E2E execution refuses a DATABASE_URL whose
database name does not start with `test_` or end with `_test`.

## Verification recorded on 2026-09-19

- All 18 migrations applied to an empty, isolated PostgreSQL 18.4 database.
  Prisma validation passed and schema comparison reported no difference.
- All 58 E2E suites passed: **806 tests**. The audit redaction unit test passed.
  Coverage includes rollback on failed audits/prescription items, concurrent
  payments, duplicate command replay, stale prescription versions, saved lab
  ranges, cancelled-bill gates and local event consumer rollback/deduplication.
- Shared contracts, API and web production builds passed. The web build retains
  a bundle-size warning; this change does not add route splitting.
- ESLint passed for the changed transaction, audit, integration and service code.
  All 15 read-only preflight queries executed successfully with no findings in the
  disposable test database. This says nothing about existing hospital data.
- PostgreSQL 16 is the configured CI target; the local run used 18.4 because
  Docker Desktop was unavailable. The new CI workflow has not been run remotely.
  No hospital database migration or production deployment was performed.

## Remaining module/release work

This is not a hospital-wide production sign-off. The next modules still require
their workflows, schemas, role matrices, UI and acceptance tests. The saved v2
build plan also calls for signed/amended clinical record lifecycles, full immutable
payment allocations and reconciliation, audit database privileges, refresh-token
rotation, downtime/restore drills and clinical/operational acceptance. Those
features must not be inferred from the existence of integration keys or events.

In particular, partial refunds cannot yet identify exactly which lab lines remain
paid because the existing schema has no payment-allocation ledger. Clearing their
gates is conservative; implement immutable allocations before extending settlement
to IPD deposits, split tenders, credits, insurance or payroll deductions.
