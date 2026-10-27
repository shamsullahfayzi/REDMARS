# CRM Module 5 — Call Center Workspace

## Design

Add a Calls tab for manually recording completed inbound/outbound calls, missed
inbound calls and unanswered outbound attempts. Reuse the Module 4 interaction
as the authoritative notes/outcome/subject/retention record. A `CrmCall` extension
holds caller phone, call state, end time, callback reference and next action.
An unknown caller can be recorded without registering a contact or patient.
Only this internal call workflow can create an interaction without a subject.
Known contacts/leads and authorized patient relationships reuse existing checks.

Missed/unanswered calls require a follow-on action. The pending-action queue is
filterable by call state/direction and supports explicit completion with a note,
actor/time and optimistic version. Call facts are immutable; notes may be corrected
through the timeline with revision history, or withdrawn if entered incorrectly.
Callback attempts reference the original visible call and retain its subject and
phone. Recording an attempt does not silently close the original action.

All reads/counts apply the same facility, patient authorization and expiry filter
as timelines. Call phones/action notes are redacted from general audit logs.
Creation uses command receipts; completing an action is concurrency guarded.
Admin/call-center roles receive `crm.calls.write`; existing `crm.read` reads calls.

The workspace displays the facility's configured staffed escalation instructions,
contact preferences and current call-consent readiness. Logging records what
happened; it never places a call or sends a message. Unknown/shared phone matches
are not identity verification. Existing clinical follow-ups remain in their own
workspace, reached by an authorized navigation link. No prescription/clinical
content is copied into call notes or the CRM queue.

Module 6 owns assigned tasks, deadlines and reminders. Provider/webhook adapters,
automatic dialing, recordings and clinical follow-up record linking are separate
integration work; manual call logging works without them.

## Validation / rollback

Verify inbound/outbound/missed states, unknown callers, subject-safe callbacks,
required outcomes/actions, concurrent completion/duplicate submission, patient
access expiry, RBAC/module boundaries, redacted audits and existing CRM regressions.
Run builds/lint and a synthetic browser demo; back up main DB before migration.
Rollback by disabling CRM and deploying the prior app. Preserve additive call
and interaction records; do not drop live data. Subjectless call interactions are
not returned by older lead/contact timeline queries.

## Results

Implemented on 2026-10-15. Shared contracts, `CrmCallsService`, guarded controller,
additive `20261015110000_crm_calls` migration and the translated Calls tab are
available. Contact/lead timelines link back to call details. Corrections retain
the original call outcome and revision history. English, Dari and Pashto labels
are included; phone numbers keep left-to-right order within RTL text.

- 13 API suites: **206 tests passed**, covering Modules 1–5 and affected patient,
  reception, appointment, clinical follow-up and finance-foundation behavior.
- Shared contracts: **38 tests passed**; API unit tests: **6 passed**.
- The 11 call API tests passed again after stricter phone validation was added.
- Shared/API/web builds and affected API lint passed. Web lint has the existing
  `button.tsx` Fast Refresh warning; Vite retains its existing large-bundle warning.
- Synthetic browser demo on a separate database: unknown missed call → linked
  answered callback → explicit completion of original action → empty pending queue.
  Confirmed contact preferences/consent guidance, contact-linked call in the unified
  timeline, and Dari RTL layout. No demo records were added to the main database.
- Main backup: `.test-runtime/redmars-before-crm5-20261015.dump`, **486423 bytes**,
  checked with `pg_restore --list`. This checks archive readability, not a full
  disaster-recovery restore rehearsal.
- Migration applied successfully to test and main databases: **42 migrations**.
  Main API restarted with the new build; CRM remains at `/crm?tab=calls`.

Hospital UAT remains separate: verify the real staffed escalation contact in
Workspace settings, test the agent workflow and confirm local operational wording.
Assigned tasks, deadlines and reminders remain Module 6. Telephony providers and
direct clinical follow-up record links are not implemented in this module.
