# AXON CRM — Module Build Order for Existing HMIS + ERP

**Purpose:** Implement CRM inside the existing Axon Hospital HMIS + ERP codebase. **Do not** create a second patient registry, appointment calendar, billing engine, notification service, authentication system, or audit service.

## Mandatory instructions for Codex

1. Inspect the repository and report existing stack, database/migrations, service interfaces, authentication and permissions, patients, registrations, scheduling, OPD, IPD, discharge, billing, notifications, auditing, deployment, and tests.
2. Produce a **reuse / extend / create / defer** matrix for all CRM modules below, with file paths and concrete evidence. Confirm how current data ownership works.
3. Write an incremental technical plan and implement **one module at a time**. Before database changes, review schema and create reversible migrations. Preserve backward compatibility and existing hospital workflows.
4. All new endpoints must use existing authorization, validation, tenant/facility boundaries (where applicable), rate limiting and audit facilities. Psychiatric clinical notes and restricted psychotherapy records are not exposed to call-center agents.
5. After each module: run automated tests, migration checks, security tests, and a demo workflow; produce files changed, test results, known gaps and rollback method. **Do not begin the next module until the current one meets acceptance criteria.**
6. The hospital starts with adult male psychiatric/addiction workflows where currently authorized; rules must be configurable per facility, and expansion to general hospitals must not require schema redesign. Never hard-code clinical admission eligibility without administrator-configurable policy and clinical authorization.
7. Distinguish **Lead** (inquiry) from **Patient** (registered clinical identity), and **Caller/Family Contact** from the patient. A single phone number may belong to many family members or patients. Matching a phone number is not proof of identity.

## Ordered modules and acceptance gates

| # | Build/Integration | Requirement / acceptance gate |
|---|---|---|
| 0 | Existing System Audit | Repository map, database entity inventory, reuse matrix, safe integration plan, baseline tests |
| 1 | CRM Foundation | CRM module registration, navigation, configuration, RBAC, logging, migrations, feature flags |
| 2 | Contact & Family Management | Contacts and patient relationships, consent/preferences, duplicate warnings, identity checks |
| 3 | Lead Management | Create/edit/search leads, standard statuses, qualification, assigned owner, source and service interest |
| 4 | Unified Interaction Timeline | Audited interactions linked to leads, contacts or authorized patient references; access filtering |
| 5 | Call Center Workspace | Inbound/outbound/missed calls, notes, outcome and follow-on action; phone integration optional adapter |
| 6 | Tasks & Follow-ups | Owners, due dates, priorities, reminders, outcomes, overdue queues and closure rules |
| 7 | Appointment Integration | Reuse existing provider schedules/appointments; no double-booking; booking and cancellation statuses synced |
| 8 | Lead-to-Patient Linking | Authorized registration, duplicate review, stable patient ID, retain lead source/history, reversible mapping where appropriate |
| 9 | OPD Integration | Check-in/visited status from clinical source of truth; least-privilege status visibility |
| 10 | IPD/Admission Integration | Admission requested vs clinically approved vs completed; bed availability from IPD source |
| 11 | Discharge Follow-up | Clinical team-authorized follow-up tasks, opt-out/consent and safe contact instructions |
| 12 | Notification Infrastructure | Reuse notification service; templates, consent, delivery log, retries, idempotency, quiet hours |
| 13 | WhatsApp/SMS/Email Channels | Official provider adapters, incoming queue, approved outbound content; no medical details in default messages |
| 14 | Social Media Intake | Facebook/other lead intake, provenance, deduplication, channel-specific consent |
| 15 | Referral Tracking | Referral source, referral relationship, approved attribution and reporting |
| 16 | Complaint Management | Case number, assignment, escalation, deadline, resolution and closure audit |
| 17 | Patient Satisfaction | Consent-based OPD/discharge surveys; aggregated reporting and privacy controls |
| 18 | Agent QA | 100-point scorecard; privacy and emergency critical failures override numeric pass |
| 19 | Marketing Campaigns | Source/campaign/ad metadata and budgets, inquiry-to-visit funnel, attribution without PHI disclosure |
| 20 | Billing & Finance Read-only Integration | Revenue attribution from existing invoices/payment ledger; no new finance ledger or invoice engine |
| 21 | Workflow Automation | Configurable triggers, approvals, deduplication, retry handling and safe contact policies |
| 22 | Supervisor Dashboard | Workload, missed calls, follow-up compliance, QA, complaints and alerts |
| 23 | CEO CRM Dashboard | Aggregated lead funnel, referral and campaign performance, appointments, visits, admissions |
| 24 | Migration Utilities | Dry-run Excel/Google Sheets mappings, validation, deduplication, audit reconciliation and backup |
| 25 | Security/Integration Release Gate | Pen-test checklist, role matrix, no clinical note leaks, test suite, restores, observability |
| 26 | Pilot and Production Rollout | Staged pilot, user training, SOP signoff, rollback, monitoring and owner acceptance |

## Build slices

**Slice A — First usable CRM (0–6):** A call-center agent can record an inquiry, create or link a contact without assuming identity, log a call, qualify the lead and set an assigned follow-up.

**Slice B — Clinical journey (7–11):** A lead can book an existing HMIS appointment, be linked to patient registration after identity verification and receive minimal status updates from OPD/IPD/discharge without exposing confidential notes.

**Slice C — Channels and experience (12–18):** Message delivery, communications consent, social inquiries, complaints, satisfaction and agent QA work reliably.

**Slice D — Analytics and release (19–26):** Attribution, finance data reuse, safe automation, dashboards, migration and controlled production go-live.

## Shared domain concepts

- `Person/Patient` is owned by the existing patient master/MPI (or implemented there if absent).
- `Lead` is owned by CRM; its relationship to registered patients is a nullable explicit link, not a replacement identity.
- `Contact` may be linked to multiple patients with relationship, permissions and communication preferences.
- `Interaction` supports channel, direction, timestamps, agent, authorized subject, summary, outcome and retention policy.
- `FollowUpTask` supports owner, due date, status, priority, source, outcome and escalation history.
- `Appointment`, `Encounter`, `Admission`, `Discharge`, `Invoice` remain in existing HMIS/ERP systems of record.
- `Consent`, `AuditEvent`, `NotificationEvent` and `Outbox` should use shared cross-module infrastructure where available.

## Clinical safety and privacy gates (apply to every module)

- Call-center agents do not diagnose, prescribe, alter medications, read psychotherapy notes, or make admission decisions.
- Crisis calls must offer immediate escalation to a staffed clinical/ER pathway; a CRM automation is not emergency care.
- Validate caller identity/authorization before discussing a patient, even if caller ID or a known phone number matches.
- Family contacts, addiction histories and psychiatric encounters require least-privilege access and privacy-safe logs, exports, recording and messaging.
- Do not expose detailed diagnoses, medical notes or financial records in agent screens merely because a contact is linked to a patient.
- All integrations require failure handling, reconciliation, idempotency, audit trails and privacy-safe operational logs.

## Module completion checklist (repeat for each build)

- [ ] Verified reuse of existing code and database ownership
- [ ] Written concise module spec and UI/API/data contract
- [ ] Safe and reversible migration (if required)
- [ ] Backend authorization and input validation
- [ ] User interface with loading/empty/error states
- [ ] Audit logs and privacy limits
- [ ] Unit, API and integration tests green
- [ ] No regression in existing OPD/IPD/finance workflows
- [ ] Demo scenario and UAT checklist passed
- [ ] Codex reports files changed, results and remaining risks

## First instruction to paste into Codex

> Read this entire `AXON_CRM_MODULE_BUILD_ORDER.md` and inspect the current Axon HMIS + ERP repository. Do not implement anything yet. Report (1) existing reusable modules and their file paths, (2) gaps against modules 0–26, (3) current data ownership and identity strategy, (4) security/privacy risks, (5) proposed changes and migrations for Modules 1–6, and (6) a test plan. After presenting the audit, begin implementing Module 1 through Module 6 in order, stopping at each module's acceptance gate, preserving all existing functionality.
