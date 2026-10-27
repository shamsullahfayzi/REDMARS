# Reception workflow assessment

Assessed 2026-10-26 against the current REDMARS HMIS/ERP working tree.

## Scope

The user authorized the 25-item receptionist workflow release. Existing owners remain authoritative:

- Patient identity and identifiers: `Patient`, `PatientIdentifier`, patient services.
- Appointments and collision protection: `Appointment`, appointment services.
- Encounters and emergency arrivals: `Visit`, visit services.
- Billing, receipts and refunds: `Invoice`, `Payment`, invoice services.
- Panel master: `Panel`.
- Cash totals: till reporting.
- Audit: transactional audit middleware and `AuditLog`.

No second patient registry, appointment calendar, invoice engine, ledger, or audit log may be created.
Reception may coordinate an IPD request, transfer, discharge, or queue priority change, but a clinical
reviewer must approve clinical movement and priority decisions.

## Reuse / extend / create matrix

| # | Capability | Decision | Current evidence / required work |
|---|---|---|---|
| 1 | IPD admission request | Create | Add a reception care request; approval is separate from the receptionist. |
| 2 | Bed availability | Extend | `Room` exists without beds; add facility-scoped bed spaces and occupancy states. |
| 3 | Transfer/discharge coordination | Create | Use the care-request workflow; keep final clinical approval separate. |
| 4 | Emergency arrival | Extend | `VisitType.emergency` already exists; add an explicit quick action and alert classification. |
| 5 | Appointment slot calendar | Reuse | Timed appointments, duration and provider/patient collision protection already exist. |
| 6 | Appointment waitlist | Create | Add a facility-scoped waitlist and offer/book/decline lifecycle. |
| 7 | Reschedule/cancellation reasons | Extend | Close reasons exist; add atomic rescheduling that keeps the original booking. |
| 8 | Patient document scanning | Create | Add restricted patient document storage with type/size/hash validation. |
| 9 | National ID/identifiers | Reuse | `PatientIdentifier` add/remove and patient `nationalId` already exist. |
| 10 | Duplicate merge request | Extend | Duplicate warnings and admin merge permission exist; add a receptionist request, never a direct merge. |
| 11 | Guardian/emergency contacts | Extend | Guardian fields exist; add multiple contacts and safe-contact preferences. |
| 12 | Referral source | Reuse | `Visit.referredBy` and `Visit.referralSource` already exist in check-in. |
| 13 | Panel eligibility | Extend | `Panel` exists; add patient coverage and eligibility verification. |
| 14 | Deposits/advances | Create | Add an append-only patient deposit register; applications/refunds remain explicit. |
| 15 | Refunds/corrections | Reuse | Append-only same-day refunds with reason and R5 control already exist. |
| 16 | Payment/bank terminal | Extend | Payment method/reference exist; expose clearer reference capture and validation. |
| 17 | Queue priority | Create | Add requested priority plus clinical approval before queue ordering changes. |
| 18 | SMS/WhatsApp reminders | Create | Add consent-aware outbox records; provider delivery remains an adapter boundary. |
| 19 | Shift handover | Create | Add open/acknowledged/closed handover records. |
| 20 | Till closing/discrepancy | Extend | Till totals exist; add counted cash, discrepancy and supervisor review. |
| 21 | Printable forms | Extend | Receipt/ID printing exists; add registration and consent print views. |
| 22 | Privacy/safe contact | Extend | CRM has consent controls; add patient-level reception contact preferences. |
| 23 | Reception alerts | Create | Compute pending approvals, waitlist, reminder, handover and till alerts. |
| 24 | Downtime registration | Create | Add printable downtime forms and local non-PHI markers with explicit re-entry review; no silent writes. |
| 25 | Audit/supervisor review | Extend | Reuse `AuditLog`; add reception-scoped review and workflow oversight. |

## Delivery gates

1. Additive schema and RBAC only; no existing hospital data rewritten.
2. Shared contracts validate every command and response.
3. Facility ownership is enforced on every read and write.
4. Clinical movement and queue priority require a reviewer distinct from the requester where applicable.
5. Financial records are append-only and never bypass existing invoice/payment controls.
6. Documents and contact preferences are excluded from generic operational logs.
7. API integration tests cover cross-facility isolation, approval gates, idempotency and lifecycle rules.
8. Web build, English/Dari/Pashto layout, mobile layout, migration status and a synthetic demo workflow pass.

This assessment is updated as the release is implemented and verified.

## Implementation status — 2026-10-26

All 25 items are now represented in the reception workflow. The release adds the
`/reception/operations` workspace, atomic appointment rescheduling, emergency-arrival shortcut,
facility-scoped beds and care requests, waitlist, documents, contacts and safe-contact consent,
coverage verification, AFN deposit custody, consent-aware reminder outbox, handover, till review,
printable forms, non-PHI downtime markers, alerts and a redacted supervisor audit feed.

Controls verified:

- Reception can request admission, transfer, discharge, queue priority and duplicate review, but
  cannot approve its own clinical request.
- Beds can become reserved or occupied only through an approved care request.
- Reminder destinations must exactly match a contact that consented to the chosen channel.
- Uploaded document content and private contact fields are redacted from audit snapshots.
- Deposit custody remains append-only and does not create unapproved Finance Layer 1 postings.
- The browser stores no patient name, phone or clinical reason in downtime markers.

Verification completed:

- Database backup: `backups/redmars-20261026-112439.sql.gz`.
- Migrations through `20261026144000_reception_fk_name` applied; migration status current.
- API production build and web production build passed.
- Reception integration suite: 3/3 passed against isolated `redmars_reception_test`.
- Transactional audit suite: 6/6 passed.
- Shared contract regression suite: 41/41 passed.
- Live receptionist login, navigation, patient search and operations workspace visually verified.

External boundaries remain explicit: SMS/WhatsApp records are queued for a future configured
provider adapter, and patient deposits await the Finance roadmap's approved patient-liability
posting design after the required clinical pilot is confirmed.
