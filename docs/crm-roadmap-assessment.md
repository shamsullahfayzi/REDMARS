# CRM roadmap assessment

Audited 2026-10-13 against `AXON_CRM_MODULE_BUILD_ORDER.md` and the current working tree, including existing uncommitted finance work.

## Module 1 update — 2026-10-14

Latest status (2026-10-18): Modules 1–7 are implemented locally. Module 7 reuses
the clinical appointment owner for timed booking, cancellation and status reads,
with provider/patient overlap protection and verified scheduling authorization.
All 280 selected tests passed, as did builds, the backup/upgrade rehearsal and
the synthetic browser booking/cancellation workflow. Migration 44 is applied.
See `crm-module-7.md` for limitations and release evidence. Historical inventory
and proposed plans below describe the original audit, not current completion.
Hospital acceptance remains separate from automated verification.

The user subsequently authorized CRM Foundation. Module 1 is implemented:
CRM registration/feature flag, admin and call-centre permissions, workspace UI,
facility-scoped versioned settings, read/write audit and database-backed rate
limiting. The missing call-centre `auth.me` grant is also corrected. See
`crm-module-1.md` for API/data contracts, validation, rollout and rollback details.
The migration is applied to the test and local main databases after a validated
main-database backup. CRM defaults off until enabled in Modules.

The inventory below preserves the pre-implementation audit; statements about
missing CRM registration, configuration and rate limiting are superseded by this
update. Modules 2–4 are described below; later CRM capabilities remain unimplemented.

## Module 2 update — 2026-10-14

The user authorized Contact & Family Management. Implemented contacts and
preferences, duplicate review with shared phones, many-to-many existing-patient
links, administrator authorization, scoped consent history and expiring caller
checks. Patient/clinical ownership and existing call-centre permissions are
preserved. CRM error logs and mutation audits redact contact details. See
`crm-module-2.md` for contracts, validation and limitations.

The additive migration is applied to the isolated test and main local databases
after a validated backup. All 173 selected API tests, 28 shared tests and 3 unit
tests passed. Browser workflows for admin and agent access, consent withdrawal,
duplicate review and Dari layout passed.

## Module 3 update — 2026-10-15

Lead management is implemented: inquiry creation/edit/search, owner assignment
and claims, source retention, service interest, guarded qualification and stage
history, duplicate review and concurrent-command protection. All 185 selected API,
31 shared and 4 unit tests passed. Browser creation/qualification/history and Dari
layout passed. The additive migration is applied to test and local main databases
after a validated backup. See `crm-module-3.md`. Hospital UAT remains separate.
The user has now authorized Module 4 — Unified Interaction Timeline.

## Module 4 update — 2026-10-15

The unified interaction timeline is implemented under lead and contact details.
It records operational summaries, channels, direction, event/recording time and
outcomes. Corrections/withdrawal preserve revisions. Patient references use
existing authorized relationships and current caller checks; the same access
filter protects lists, counts, details and history. Settings now control
visibility retention. Free text is redacted from audit snapshots.

All 195 API tests in 12 suites, 34 shared tests and 5 unit tests passed, as did
builds and targeted API lint. Browser checks passed recording, correction history,
the shared lead/contact timeline, Dari layout and patient-entry hiding before an
agent's caller check, followed by visibility after verification. See
`crm-module-4.md` for rollout, constraints and rollback. Hospital UAT is separate.
Module 5 has not started.

## Scope and conclusion

The ERP has useful CRM foundations, but no dedicated CRM module, lead registry, contact relationship model, interaction timeline, or assigned callback task engine. Existing call-centre functionality is a prescription follow-up queue.

This request covers inspection and documentation only. No application code, database schema, permissions, or hospital records were changed. The roadmap's embedded instruction to begin Modules 1–6 is a future implementation plan, not authorization to start them during this audit. Module 0 deliverables are recorded here; operational signoff and future module acceptance remain separate.

## Repository map and evidence

Paths below are relative to the repository root. They identify existing evidence, not proposed files.

| Area | Evidence | What exists |
|---|---|---|
| Workspace | `package.json`, `apps/api/package.json`, `apps/web/package.json` | pnpm workspace; NestJS 11 API, Prisma 6/PostgreSQL; React 19, Vite 8, React Router, TanStack Query, Tailwind and i18next UI. Versions describe the checked-in manifests. |
| Contracts | `packages/shared/src/index.ts` | Shared TypeScript/Zod request and response contracts, date and money utilities. |
| Database | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/` | 37 migration directories; facility-owned clinical, identity, billing and finance models. No CRM domain models. |
| Module registration | `apps/api/src/app.module.ts`, `packages/shared/src/facilityModule.ts`, `apps/api/src/modules/facility-module/facility-module.service.ts` | Module flags and backend gating exist. No `crm` key or CRM backend module. |
| Navigation | `apps/web/src/auth/nav.ts`, `apps/web/src/router.tsx` | Existing permission-aware routes and navigation; no CRM workspace. |
| Authentication and authorization | `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/permissions.ts`, `apps/api/src/common/guards/permissions.guard.ts`, `apps/api/src/common/guards/module.guard.ts` | JWT/session authentication, global permission guard, facility module guard. Missing permission declarations fail closed. Conditional permission rules still require service enforcement. |
| Patient master | `apps/api/src/modules/patient/patient.service.ts`, `apps/web/src/pages/PatientsPage.tsx`, `apps/web/src/pages/PatientDetailPage.tsx` | Registration, demographics, MRN, identifiers, search and duplicate candidates. Phone normalization and name comparison are useful candidate matching, not identity verification. |
| Appointments | `apps/api/src/modules/appointment/appointment.service.ts`, `apps/web/src/pages/AppointmentsPage.tsx`, `apps/web/src/hooks/useAppointments.ts` | Date-based bookings for registered patients, department/practitioner validation, cancellation/no-show handling and arrival matching. No provider time-slot inventory or booking collision constraint found in this service. |
| Reception and OPD | `apps/api/src/modules/reception/reception.service.ts`, `apps/api/src/modules/visit/visit.service.ts`, `apps/web/src/pages/ReceptionPage.tsx` | Check-in creates the visit and associated billing in a transaction; appointment fulfilment uses the same workflow. |
| Call-centre follow-ups | `apps/api/src/modules/follow-up/follow-up.service.ts`, `apps/api/src/modules/follow-up/follow-up.controller.ts`, `apps/web/src/pages/FollowUpsPage.tsx` | Prescription follow-up dates, attendance detection and recorded responses. Existing `call_center` role can read and respond; it has no general patient browsing or appointment creation grant. |
| Billing and finance | `apps/api/src/modules/invoice/`, `apps/api/src/modules/finance/`, `apps/web/src/pages/FinancePage.tsx` | Invoice/payment services and finance ledger/reporting. These remain authoritative for revenue; CRM attribution is absent. |
| Audit | `apps/api/src/audit/audit.interceptor.ts`, `apps/api/src/prisma/transactional-audit.ts` | Read-audit infrastructure and transactional mutation auditing. Coverage must be explicitly checked for each CRM endpoint. |
| Integration | `apps/api/src/integration/integration.service.ts`, `apps/api/src/prisma/transactional-audit.ts` | Durable integration events and consumer receipts for local transactional effects. Current event-producing models include Invoice, Payment, AppUser, Practitioner, Department and Visit; Appointment is not currently included. |
| Deployment and recovery | `docker-compose.prod.yml`, `deploy/redmars-api.service`, `deploy/redmars-web.service`, `scripts/backup.sh`, `scripts/restore.sh` | Deployment configuration and backup/restore scripts exist. Their presence does not establish a successful production restore or pilot signoff. |
| Automated checks | `.github/workflows/ci.yml`, `apps/api/test/jest-e2e.json`, `apps/api/test/require-test-database.ts`, `packages/shared/test/` | CI, API integration tests and test database guard. See audit baseline below. |

## Entity inventory and ownership

| Owner | Existing entities | CRM use |
|---|---|---|
| Shared platform | Facility, AppUser, Role, Permission, RolePermission, UserRole, Session, Department, Practitioner, Room, FacilityModule, Setting, NumberSequence | Reuse identities, facility scope, configuration and numbering. Room is not a bed-availability model. |
| Patient master | Patient, PatientIdentifier | Keep the stable patient ID and MRN here. Do not create a second registry or infer a verified identity from a matching phone. |
| Clinical system | Appointment, Visit, VisitStatusHistory, Vitals, Diagnosis, ClinicalNote, Allergy, Prescription, PrescriptionItem, FollowUpResponse, LabOrder and result models | CRM receives approved minimal status projections. Clinical notes, medications and diagnoses are not call-centre timeline content. |
| Billing/finance | Invoice, InvoiceItem, Payment, Panel, FinanceAccount, FinanceJournal and supporting revenue, payables, payroll, asset, budget and statement models | Read-only, permission-scoped attribution through existing services. No CRM ledger or invoice engine. |
| Audit/integration | AuditLog, ErrorLog, IntegrationEvent, IntegrationReceipt, CommandReceipt | Extend shared mechanisms with safe events and idempotent commands. Never expose the raw event stream as an agent timeline. |
| CRM, proposed | Contact, contact-to-patient relationships, Lead, Interaction, Call, FollowUpTask, communication consent/preferences and later CRM records | New operational records with explicit facility ownership and authorized links to existing masters. These do not exist yet. |

`Patient.phone` is indexed but not unique. Guardian name/relation columns are flat demographics, not a family-contact relationship or authorization model. One contact may relate to multiple patients and multiple people may share a phone. Keep these cases valid and show duplicate candidates for human review.

Patient IDs have a facility composite key; new CRM relations should enforce the same facility at both service and database levels. Some existing targets, including Appointment, need a composite key review before adding facility-scoped foreign keys. `PatientIdentifier` currently has global `(system, value)` uniqueness: review intended identifier scope before importing cross-facility data. This audit does not establish a full enterprise MPI or patient merge workflow.

## Reuse / extend / create / defer matrix

“Create” means the CRM capability is absent, while platform facilities above can still be reused. “Defer” identifies a dependency, not permission to skip the requirement permanently.

| # | Roadmap module | Decision | Existing evidence and remaining work |
|---|---|---|---|
| 0 | Existing System Audit | Reuse + document | Repository/schema inventory above, baseline below, this assessment and preserved roadmap. |
| 1 | CRM Foundation | Implemented | `apps/api/src/modules/crm/`, `apps/web/src/pages/CrmPage.tsx`, shared CRM contracts, module flag/RBAC migration and `apps/api/src/common/rate-limit.service.ts`. Engineering checks and isolated browser demo passed; hospital acceptance remains a user step. |
| 2 | Contact & Family Management | Implemented | `crm-contacts.service.ts`, `crm-contacts.controller.ts`, `CrmContacts.tsx`, shared `crmContacts.ts` contracts and additive migration. Contacts, patient relationships, consent/preferences, duplicate warnings and caller checks tested; hospital acceptance remains a user step. |
| 3 | Lead Management | Implemented | `crm-leads.service.ts`, controller, `CrmLeads.tsx`, shared contracts and additive migration. Inquiry lifecycle, ownership, source, qualification and concurrency checks verified; see `crm-module-3.md`. |
| 4 | Unified Interaction Timeline | Implemented | `crm-timeline.service.ts`, controller, `CrmTimeline.tsx`, shared contracts and additive migration. Lead/contact views, authorized patient references, corrections, retention and audited filtered reads verified; see `crm-module-4.md`. |
| 5 | Call Center Workspace | Implemented | Manual inbound/outbound/missed calls, subject-safe callbacks, pending-action completion, timeline revisions, caller-check filters and redacted audits. Shared/API/web checks and synthetic browser demo passed; see `crm-module-5.md`. Telephony remains optional. |
| 6 | Tasks & Follow-ups | Extend + create | Existing follow-up service is prescription-based; add generic assigned tasks, due dates, priorities, closure rules and reminder state. Preserve the clinical follow-up queue. |
| 7 | Appointment Integration | Extend | Reuse AppointmentService and reception fulfilment. Add approved booking access, safe status synchronization and scheduling/capacity enforcement in the appointment subsystem. |
| 8 | Lead-to-Patient Linking | Extend | Reuse PatientService and duplicate candidate workflow. Add explicit verified linking, provenance and audited correction without deleting clinical records. |
| 9 | OPD Integration | Extend | Visit/reception services own check-in and visit status. Add minimal CRM projection and event reconciliation. |
| 10 | IPD/Admission Integration | Defer clinical dependency | `ipd` exists as a facility module key and VisitType enum value. No admission approval, bed allocation or discharge service/model found. Integrate only when an authoritative IPD source exists. |
| 11 | Discharge Follow-up | Defer clinical dependency | No Discharge entity/service found. Requires clinically authorized discharge events plus tasks and communication preferences. |
| 12 | Notification Infrastructure | Extend + create | IntegrationService has durable events/receipts, but no delivery service, template registry, consent enforcement, quiet hours or retry worker. Build shared delivery infrastructure here. |
| 13 | WhatsApp/SMS/Email | Create | No provider adapters found in AppModule. Add official adapters, authenticated webhooks, inbox and outbound delivery controls after Module 12. |
| 14 | Social Media Intake | Create | No social intake entities/services found. Add source provenance, webhook verification, deduplication and channel consent. |
| 15 | Referral Tracking | Extend | Visit has free-text `referredBy` and `referralSource`. Add structured attribution while preserving historical text. |
| 16 | Complaint Management | Create | `apps/api/test/complaint.e2e-spec.ts` covers the clinical chief complaint, not service complaints. Add separate cases, assignment, escalation and resolution audit. |
| 17 | Patient Satisfaction | Create | No survey entities/services found. Add consent-based surveys and privacy-filtered aggregates. |
| 18 | Agent QA | Create | No QA scorecard/review model found. Add 100-point scoring and critical-failure override. |
| 19 | Marketing Campaigns | Create | No campaign/ad/budget attribution model found. Link CRM sources and aggregate conversions without sending patient information to ad providers. |
| 20 | Billing & Finance Read-only | Reuse + extend | Invoice/payment/finance services already own financial facts. Add restricted attribution projections that respect reversals and refunds. |
| 21 | Workflow Automation | Extend + create | Reuse integration receipts and command idempotency; add approved rules, execution history, retries and contact-policy enforcement. |
| 22 | Supervisor Dashboard | Create | No CRM measures exist yet. Build from tasks, calls, QA and complaints after those sources are reliable. |
| 23 | CEO CRM Dashboard | Create | Existing reports are clinical/finance reports. Add aggregated CRM funnel with defined denominators and access limits. |
| 24 | Migration Utilities | Create | Backup/restore scripts are reusable; CRM Excel/Sheets mapping, dry runs, duplicate review and reconciliation are absent. |
| 25 | Security/Integration Gate | Extend | Reuse CI, guards, audit and test database protection; add CRM role, privacy, rate-limit, provider failure and recovery checks. |
| 26 | Pilot/Production | Defer until gates pass | Deployment files exist, but no CRM pilot, training, SOP approval or operational acceptance has occurred. |

## Important integration and security decisions

1. **Appointments need a scheduling decision.** Existing bookings store the facility's midnight for a chosen date. They do not implement time-slot collision prevention. Module 7 must define slots or capacity and enforce it transactionally in the existing appointment subsystem; a second CRM calendar would duplicate ownership.
2. **Module 7 requires registered patients today.** Appointment creation requires `patientId`. Use authorized existing registration before booking and implement the full lead-link lifecycle in Module 8. An unregistered inquiry may hold a CRM appointment request, but it must not masquerade as a confirmed HMIS booking or create a placeholder patient.
3. **IPD and discharge are real dependencies.** An enum or feature flag is not evidence of implemented workflows. Do not claim Modules 10–11 complete using invented CRM admission/discharge statuses. Keep clinical approval with the clinical system.
4. **Permissions need service-level checks.** The global guard checks permission presence, not every conditional rule. CRM ownership, facility boundaries, verified patient relationship and restricted-field selection need explicit enforcement and negative tests. Do not broaden `call_center` into a clinical role.
5. **Audit needs deliberate coverage and payload limits.** The existing follow-up list explicitly omits `@AuditRead`. Its name, phone and attendance data still require careful access controls. Establish useful CRM list/detail/export audit events without copying sensitive summaries into logs. The transactional audit redactor currently masks keys matching password/token/secret; it is not a general patient-data redactor. Review how new contact and interaction fields enter before/after snapshots, and restrict audit access and retention accordingly.
6. **Rate limiting is an unmet infrastructure requirement.** No rate limiter was found in the inspected API/auth setup. Before CRM endpoints are released, add or verify a shared limiter for search, lookup, exports and public webhooks, with safe proxy configuration and deployment-appropriate storage. Do not describe it as already available.
7. **Consent and caller authorization are separate.** Record who authorized which disclosure/contact, the applicable patient and relationship, allowed channels and safe contact instructions. Opt-out must stop later delivery. A known phone number is not verification and a family relationship alone is not permission to disclose.
8. **Events are not a delivery service.** Integration receipts protect committed local effects. External provider calls need their own idempotency keys, durable delivery attempts, retry policy and reconciliation. Publish minimal approved fields; avoid importing clinical payloads or unrestricted audit JSON into CRM.
9. **Facility policy remains configurable.** Do not hard-code gender, age or psychiatric/addiction admission eligibility into CRM identity tables. Clinical authorization and facility policy govern those workflows. Crisis calls need a configured staffed clinical/ER escalation route; agent UI must not make clinical decisions.

## Incremental technical plan: Modules 1–6

Names below are proposed, not implemented. Use the existing Nest module/service patterns, shared Zod contracts, React Query hooks, translated UI and facility-scoped Prisma access.

| Module | Data and service changes | UI and acceptance gate |
|---|---|---|
| 1 — Foundation | Register `crm` in shared module keys and server module registry; add least-privilege CRM permissions and facility configuration through existing mechanisms. Add `/crm` API foundation with guards, validation, audit and rate limiting. Use an additive migration only where schema/seed changes require it. | Permission-aware CRM navigation and module-disabled behavior. Verify direct API requests cannot bypass disabled flags or roles, other facilities remain isolated, and existing workflows still pass. Keep operational activation explicit. |
| 2 — Contacts | Proposed `CrmContact`, `CrmContactPatientLink` and identity-verification records. Add shared communication consent/preferences with scope, channel, status, provenance and timestamps. Validate facility-safe relationships and authorization; phone stays non-unique. | Contact create/edit/search, duplicate candidates, relationship and preference editor. Test shared phones, multiple relatives, unauthorized caller, consent withdrawal, cross-facility denial and audit history. |
| 3 — Leads | Proposed `CrmLead` and status history; facility, contact, assigned owner, status, source, service interest, qualification and optional patient link. Add paginated/filterable create/read/update/assign endpoints with allowed transitions and concurrency checks. | Lead list/detail and qualification form. Demonstrate inquiry creation without a patient record, valid transitions, restricted assignment, source retention and duplicate request protection. Full registration/link correction follows Module 8. |
| 4 — Timeline | Proposed `CrmInteraction`: channel, direction, event time, agent, subject references, operational summary, outcome and retention controls. Enforce valid subject combinations and facility-safe references; audit corrections and filtered reads. | Lead/contact timeline with minimal authorized patient references. Test forbidden clinical fields, inaccessible subjects, pagination, correction history and privacy-safe logs. |
| 5 — Calls | Proposed `CrmCall` or typed interaction extension: direction, call state, timestamps, outcome, caller reference and next action. Add optional provider reference with uniqueness for future webhook deduplication. Manual logging must work independently. | Call-centre workspace with inbound/outbound/missed calls, safe identity checks and staffed escalation instructions. Verify least-privilege views, complete outcomes and linkage to existing follow-up records where authorized. |
| 6 — Tasks | Proposed `CrmTask` and task history: subject, assignee, due timestamp, priority, status, source, outcome and escalation history. Add atomic claiming/assignment, closure rules, idempotent reminder state and overdue queries. Reuse clinical follow-up references without moving their ownership. | My tasks, overdue queue, supervisor assignment and due reminders inside the app. Test timezone boundaries, concurrent assignment/closure, required outcomes and duplicate reminder suppression. External delivery waits for Modules 12–13. Complete Slice A demo: inquiry → contact → call → qualified lead → assigned follow-up. |

### Migration and rollback approach

- Inspect current schema and reference documents again before each implementation. Take a backup before applying migrations to the main database.
- Prefer additive tables, nullable links and indexes. Add `(id, facilityId)` target keys as needed, composite foreign keys and facility-scoped deduplication keys. Do not add uniqueness to shared phones.
- Keep migrations compatible with existing patient, appointment, follow-up and finance behavior. Dry-run upgrades on an isolated database with representative fixtures; check data integrity and query indexes.
- Specify a reviewed rollback for each migration. Feature-disable and prior application deployment are the first containment steps. Prisma migrations do not automatically provide down migrations; destructive schema rollback after live writes requires preserved data and a tested recovery procedure.
- Do not drop populated CRM tables as a routine rollback. Demonstrate backup/restore on a separate database before production release.
- Finish the current module's automated checks, demo/UAT checklist, privacy checks and rollback report before starting the next. Passing tests does not imply hospital UAT or clinical pilot signoff.

## Baseline and future test plan

Audit baseline uses the existing `.test-runtime/run-finance-tests.cjs` runner, which overrides the connection database to `finance_foundation_test` and sets `NODE_ENV=test`. The Jest setup also rejects non-test database names. Tests create synthetic fixtures in that isolated database; the main hospital database is not the target.

Command:

```powershell
node .test-runtime/run-finance-tests.cjs 'patient.*\.e2e-spec|appointment\.e2e-spec|follow-up\.e2e-spec|reception\.e2e-spec|rbac\.e2e-spec|module-guard\.e2e-spec'
```

Result on 2026-10-13: **9 suites passed; 175 tests passed**, in 73.222 seconds. Suites cover patient registration, search, edits and duplicate detection; appointments; follow-ups; reception; RBAC; and module guards. The deliberate permission-denial probe emits an expected error log while passing. Local output: `.test-runtime/crm-audit-baseline.log`.

This is a focused reuse baseline, not a new full finance regression run, browser UAT, production restore test or proof that any new CRM capability exists. Application builds were not repeated for these documentation-only changes.

For each implementation gate, add meaningful checks for its new behavior and run affected existing suites. Include unauthenticated/forbidden access, disabled modules, cross-facility reads and writes, shared phones, verified authorization, no psychiatric-note leakage, safe audit payloads, consent withdrawal, invalid transitions, retries and concurrent duplicate commands. Appointment integration needs concurrent booking tests; notifications need provider timeout and delivery reconciliation tests; finance attribution needs reversal/refund tests.

At Slice A completion, run shared/API/web builds, relevant lint, complete regression coverage, migration upgrade/recovery rehearsal, and the inquiry-to-follow-up demo with the intended agent/supervisor roles. Full release also requires Module 25 security/recovery checks and Module 26 hospital pilot approval. This audit does not establish those later acceptance gates.

## Documentation changed by this audit

- `docs/AXON_CRM_MODULE_BUILD_ORDER.md`: unchanged copy of the supplied roadmap; SHA-256 `A1FC41E2AA55A0F0A9C05A92250D9134A98D8E3C09E1485509C0ADB840B3D824` matches the original.
- `AGENTS.md`: requires reading the CRM roadmap before application coding and this assessment before CRM implementation; retains finance reference requirements.
- `docs/crm-roadmap-assessment.md`: this audit, ownership map, complete module matrix, proposed first-slice plan and validation record.

Next implementation step after current module acceptance and a request to proceed:
**Module 8**, after hospital review and an explicit request to proceed.
