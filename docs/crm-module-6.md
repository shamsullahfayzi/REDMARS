# CRM Module 6 — Tasks and follow-ups

## Contract and reuse

Tasks reference an existing CRM interaction, preserving its lead/contact/call and
authorized patient scope. Subject access, retention, rate limits, audit and
command receipts reuse Modules 1–5. A task is operational coordination; it does
not change a prescription, appointment, patient or call outcome.

Owners are active eligible staff in the same facility. Agents create tasks for
themselves, edit their own open tasks and atomically claim unassigned work.
Administrators assign/reassign, cancel and reopen with a reason. Open/in-progress
tasks require a due instant, priority and optional reminder at or before due time.
Completion/cancellation requires an outcome. Every change records a versioned
history entry, actor, time and reason. Escalation records a reason and raises
priority to urgent; staffed emergency guidance stays visible.

In-app reminders are computed from the schedule and persist until acknowledged.
Acknowledgement is stored once for the current schedule; reassignment or changing
due/reminder time resets it. Closing suppresses reminders. No messages or OS
notifications are sent. Due/overdue comparisons use UTC instants, with explicit
local time-zone labels in forms. Task due time must precede source retention expiry.

The optional clinical follow-up reference exposes only the existing prescription
follow-up date and identifier, after current patient authorization and existing
follow-up permission checks. It never copies clinical notes or marks attendance.

## Verification and rollback

Test facility/role/owner boundaries, current caller checks, filtered counts,
idempotency, competing claims/closures, required outcomes, reopening, reminder
acknowledgement/reset and time-zone-equivalent due instants. Run affected CRM,
patient, appointment, reception, follow-up and finance-foundation regressions.
Demonstrate inquiry/contact/call/qualification/task handoff with synthetic data.
Back up main before additive migration; rollback by disabling CRM and deploying
the previous app, preserving task/history data. Do not drop live tables.

Implementation and verification in progress. Hospital UAT is separate.
