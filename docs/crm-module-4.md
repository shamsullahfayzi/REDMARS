# CRM Module 4 — Unified interaction timeline

## Contract and scope

Add operational interactions to existing lead and contact details. Each entry
records channel, direction, event time, recording agent, summary and outcome.
At least one lead/contact is required. When both are supplied they must agree at
creation. Subject references are immutable; correcting a mistaken subject means
withdrawing the entry and recording a new one. Lead reassignment/contact changes
do not rewrite historical subjects.

An optional existing CRM relationship identifies a patient reference; arbitrary
patient IDs and clinical fields are rejected. Patient-linked entries, counts and
revision history are visible only while the contact/patient are active, the
relationship permits the entry's scheduling/follow-up purpose and the agent has a
current successful caller check for the current contact version. Administrators
with `crm.contacts.authorize` bypass the caller check, not revoked authority.
Only name/MRN are projected. No clinical or finance records are read.

Reuse CRM guards, rate limits, audit, idempotent command receipts, staff identity
and settings. `crm.interactions.write` allows admin/agents to log interactions;
only the original author or `crm.interactions.correct` administrators may correct
or withdraw an entry. Corrections require a reason and expected version and append
a revision. General audit snapshots redact all free text. Reads are audited.

`GET /crm/timeline` requires exactly one leadId/contactId and supports page,
channel and direction filters. `GET /crm/timeline/:id` returns authorized revision
history. `POST /crm/timeline` creates an entry with a required idempotency key;
`PUT /crm/timeline/:id` corrects or withdraws one. No DELETE route.

Facility settings control timeline visibility retention (30–3650 days, default
365). Expiry is fixed from event time at creation; later setting changes affect
new entries only. Expired entries and revisions are unavailable through CRM.
This is visibility retention, not physical deletion. A reviewed database purge
and backup-retention policy remain an operational release requirement.

## Validation and rollback

Test subject/FK integrity, facility/RBAC/module guards, patient authorization and
verification expiry/revocation, hidden counts, corrections/history, optimistic
concurrency, retry keys, retention, pagination and redacted audit. Run affected
CRM and clinical/finance regressions, builds and a synthetic browser demo.
Back up main DB before the additive migration. Roll back by disabling CRM and
deploying the prior application; preserve timeline records and revisions.

Module 5 calls, Module 6 tasks, automated event ingestion and outbound delivery
remain separate roadmap work. This module records interactions manually.

## Results

Completed 2026-10-15. Shared, API and web builds passed. Targeted API lint passed;
web lint retains only the existing Button Fast Refresh warning. Vite reports the
existing large bundle advisory. All 195 API tests in 12 suites, 34 shared tests
and 5 unit tests passed. Logs are in `.test-runtime/crm4-regression.log` and
`.test-runtime/crm4-shared.log`.

The synthetic browser walkthrough passed:

1. Create a general interaction from a lead and correct its summary with a reason.
2. Open revision history and see both original and corrected versions.
3. Add an authorized patient scheduling entry and see both entries from the contact.
4. Inspect the Dari layout and sign in as an agent.
5. Confirm the agent sees only the general entry and cannot correct another author.
6. Complete the existing caller-verification workflow; the authorized patient
   entry becomes visible. Browser console reported no warnings/errors.

Synthetic preview records/accounts were removed and preview processes stopped.
Hospital UAT remains the user's acceptance step. To test: open CRM, choose a lead
or contact, then use **Interaction timeline → Record interaction**. Existing
entries offer revision history and authorized correction. Workspace settings
contains the visibility retention period.

Migration `20261015100000_crm_timeline` is applied to test and local main databases
(41 migrations total). Main backup `.test-runtime/redmars-before-crm4-20261015.dump`
is 470,088 bytes and passed `pg_restore --list` validation. The main API was
restarted with the tested build. This backup check is not a production restore
rehearsal or hospital acceptance signoff.

Changed files: Prisma schema and additive timeline migration; shared
`crmTimeline.ts`, CRM settings and exports; timeline service/controller, CRM
module registration, permissions, settings compatibility and audit redaction;
`CrmTimeline.tsx`, lead/contact integration, settings UI and EN/PRS/PS locales;
timeline integration/shared tests and audit tests; permissions and roadmap docs.
The user-supplied roadmap remains unchanged.

Known limits: records are entered manually; messaging, telephony and automated
clinical events belong to later modules. Retention hides expired records but does
not physically purge database copies/backups. Staff must keep free text operational;
rejecting clinical API fields cannot detect every clinical phrase typed into a
summary. Existing relationship checks gate patient context on all API reads;
the UI refreshes access every 15 seconds and hides entries at their known expiry.
