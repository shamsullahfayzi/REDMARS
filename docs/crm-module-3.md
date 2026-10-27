# CRM Module 3 — Lead management

## Scope and design

Reuse CRM contacts, facility/module guards, staff accounts, settings service areas,
transactional audit, rate limits and command receipts. A lead is an inquiry with
an optional existing CRM contact. It never registers or links a patient, books an
appointment, sends a message or creates a clinical decision.

Stages: New → Contacted → Qualified; active stages can move to On hold or Closed.
On hold can resume as Contacted or Qualified. Qualified can return to Contacted
for requalification. Only an administrator can reopen Closed → New, with a
reason. Closing requires an outcome. Qualification requires an active contact,
an eligible assigned owner, service interest, confirmation of the inquiry's need
and confirmation that the requested service is offered. These checks describe
administrative readiness, not clinical eligibility.

Admin and call-centre users read leads in their facility. Agents create leads
owned by themselves, edit their own leads and explicitly claim unassigned leads.
Administrators may assign/unassign an active eligible CRM user in the same
facility and edit/reopen leads. Inactive or unauthorized owners cannot receive
new assignments. An existing inactive owner remains visible for reassignment.
Source and source detail are retained from creation and are immutable in v1.

The UI provides Leads / Contacts / Workspace tabs, paginated searching/filtering,
contact search using Module 2, ownership, source, service suggestions from current
settings, qualification, closure and status history. Personal and clinical
information must not be entered in inquiry summaries. CRM audit snapshots redact
free text; status history contains only stages, actor, time and a redacted reason
in general audit. Agents receive no patient/clinical projections here.

## Data/API and safeguards

Add `CrmLead` and `CrmLeadStatusChange` with composite facility foreign keys,
indexes, version checks and database vocabulary/qualification constraints.
`GET /crm/leads`, `/options`, `/:id`; `POST /crm/leads`, `/:id/claim`;
`PUT /crm/leads/:id`. Create requires an idempotency key and reuses command receipts
containing only the created ID. Updates/claims use optimistic versions inside
serializable transactions. Similar open inquiries trigger a review warning; an
explicit override permits a separate inquiry without merging people.

## Validation and rollout

Test isolated DB migration, anonymous/contact inquiries, transitions,
qualification, stale/concurrent commands, same-key retry, duplicate review,
assignment/claims, foreign/inactive contacts and owners, module/RBAC enforcement,
audit privacy, source retention and no patient/finance creation. Run CRM and
clinical/finance foundation regression, shared/unit tests and builds. Browser-demo
using synthetic fixtures. Back up main DB before additive migration.

Rollback: disable CRM and restore the prior application build. Retain additive
tables/history; do not drop live inquiry data. A destructive rollback requires a
separate preserved-data restore plan. No Module 4 work is included.

## Results

Completed 2026-10-15. Shared/API/web builds and targeted API lint passed; web lint
has only the existing button Fast Refresh warning. All 185 API tests in 11 suites,
31 shared tests and 4 unit tests passed. API coverage includes concurrent claims,
edits and submissions, duplicate review, ownership, qualification, source retention,
closure/reopening, filters, pagination, facility boundaries and audit privacy.
Browser demo passed inquiry creation with an existing contact, New → Contacted →
Qualified, three status-history entries and Dari layout. Hospital UAT remains a
user acceptance step.

Migration `20261015090000_crm_leads` is applied to test and local main databases
(40 migrations total). Main backup: `.test-runtime/redmars-before-crm3-20261015.dump`,
456,735 bytes, validated with `pg_restore --list`. Local API restarted with this build.

Changed files: Prisma schema/migration; shared `crmLeads.ts` and exports;
`crm-leads.service.ts`, controller, CRM module registration, permission declarations
and audit redaction; `CrmLeads.tsx`, CRM tab navigation and EN/PRS/PS translations;
lead integration/shared tests and audit unit tests; permissions and roadmap docs.
The supplied roadmap remains unchanged.
