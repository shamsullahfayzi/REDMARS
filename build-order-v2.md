# REDMARS HMIS — Build Order (v2, Production + Full Hospital Core)

> **How to use this.** Open it every morning. Do the lowest-numbered unfinished task whose
> dependencies are complete. Every task is a vertical slice: policy/workflow → DB constraint →
> API → permission → UI → audit → tests → operating procedure. A feature is not done because
> the happy path works on one laptop.
>
> **Starting point:** v1 already has a strong OPD foundation: patients, visits, consultation,
> prescriptions, laboratory, pharmacy dispensing, billing, reports, RBAC, audit scaffolding,
> multilingual UI, Docker deployment, and a substantial API E2E suite. Preserve what is sound.
> Repair unsafe foundations before adding hospital-wide workflows.
>
> **Target releases:**
> - **v2.0 — Production Core:** safe OPD + lab + pharmacy + billing + operations.
> - **v2.1 — Hospital Core:** IPD + nursing + medication administration + emergency + discharge.
> - **v2.2 — Complete Operational Platform:** radiology, inventory/procurement, theatre, blood bank,
>   interoperability, analytics, and mature operations.
>
> **Roles (minimum):** `admin` · `receptionist` · `cashier` · `nurse` · `doctor` · `lab_tech` ·
> `lab_supervisor` · `pharmacist` · `storekeeper` · `radiology_tech` · `radiologist` ·
> `admission_officer` · `theatre_staff` · `blood_bank_staff` · `management` · `auditor` ·
> `call_center` · `it_support`.
>
> **Engineering estimate:** ~3,500–4,300 focused engineering hours, plus hospital workflow
> discovery, clinical validation, training, procurement, and pilot time. This is a team program,
> not a nine-week solo build.
>
> **The line that matters:** no phase may introduce a clinical or financial workflow that bypasses
> authorization, immutable history, audit, concurrency protection, recovery, and tests.

---

## Release gates

| Gate | Meaning | Required evidence |
|---|---|---|
| G0 | Scope approved | Signed workflow map, data classification, deployment model, risk register |
| G1 | Safety foundation complete | P0 integrity defects closed; concurrency and audit tests pass |
| G2 | v2.0 release candidate | OPD/lab/pharmacy/billing pass security, UAT, load, and restore gates |
| G3 | v2.1 release candidate | IPD/emergency workflows pass clinical simulation and downtime drills |
| G4 | v2.2 release candidate | Hospital-wide modules and integrations pass end-to-end validation |
| G5 | Production go-live | Independent sign-off by clinical, finance, security, operations, and management |

> A calendar date never overrides a gate. If a gate fails, the release does not move forward.

---

## Architecture rules for v2

1. Keep a **modular monolith** until measured scale or independent deployment creates a real
   reason to split services. Distributed systems are not a production-readiness shortcut.
2. PostgreSQL is the transactional source of truth. Search indexes, caches, analytics stores,
   and message brokers are rebuildable projections, never competing clinical records.
3. Clinical and financial history is append-only after finalization. Corrections create explicit
   versions, reversals, or entered-in-error events; they do not erase facts.
4. Every aggregate owns one state machine and one command path. A second endpoint must not mutate
   the same state under different business rules.
5. Asynchronous work uses transactional outbox/inbox, idempotency keys, bounded retries, and a
   visible dead-letter/reconciliation queue.
6. Module boundaries are enforced in code and dependency checks. Clinical modules may depend on
   shared identity, encounter, terminology, audit, billing, and document capabilities—not each
   other's private tables.
7. APIs, events, document templates, terminology, settings, and integrations are versioned and
   have a published compatibility/deprecation policy.
8. Configuration that changes clinical, access, price, or financial behavior requires validation,
   authorization, effective dates, audit, and rollback—not an untracked environment edit.
9. Feature flags support controlled rollout and emergency disablement; they must never silently
   bypass data integrity, permission, or audit controls.
10. Do not build payroll, a general ledger, PACS image storage, or analyzer firmware inside REDMARS.
    Integrate those systems through governed boundaries unless the hospital separately commissions
    and validates them as new products.

---

## Phase 0 — Decisions, baselines & safety governance (~70 h)

Do not change behavior until the target and current baseline are measurable.

| # | Task | Touches | Done when |
|---|---|---|---|
| 0.1 | Freeze and tag the accepted v1 baseline | Git, release notes | One reproducible commit is the migration starting point |
| 0.2 | Make clean install/build/test reproducible without developer-machine state | workspace, lockfile, Docker | Fresh machine builds API/web and runs tests from documented commands |
| 0.3 | Decide tenancy: one DB per hospital or shared multi-tenant | architecture ADR | Decision, migration impact, and threat model are approved |
| 0.4 | Define v2 scope and explicit non-goals per release | product charter | Nobody can mistake a future enum for a working module |
| 0.5 | Map real workflows with each hospital role | workflow pack | Current, desired, exception, downtime, and approval paths are signed off |
| 0.6 | Approve the RBAC/conditional-rule matrix | permissions, policy | Every role/resource/action has owner, scope, and rationale |
| 0.7 | Define data classification and retention | privacy policy | PHI/PII/financial/audit/log data each have handling and retention rules |
| 0.8 | Define SLOs: availability, latency, capacity, RPO, RTO | operations | Numeric targets approved by management and IT |
| 0.9 | Create clinical safety and production risk registers | governance | Every hazard has severity, control, owner, status, and evidence |
| 0.10 | Define environments and data policy | dev/test/staging/training/prod | Environments are isolated; real patient data is forbidden outside production |
| 0.11 | Define Definition of Done and release evidence template | SDLC | Every task requires tests, audit, docs, security review, and rollback evidence |
| 0.12 | Inventory current endpoints, permissions, tables, jobs, reports, and prints | architecture catalog | Orphan permissions and undocumented behavior are listed |

> **Decision required in 0.3.** The current code assumes one facility per database in important
> places. Do not pretend it is safely multi-tenant without redesigning login and DB constraints.

---

## Phase 1 — P0 integrity repairs (~160 h) 🔒

Fix the known ways a patient or financial record can become incomplete or misleading.

| # | Task | Touches | Done when |
|---|---|---|---|
| 1.1 | Make prescription save one atomic aggregate transaction | Visit, Prescription, PrescriptionItem | Injected failure at any step leaves no partial prescription or status change |
| 1.2 | Add prescription optimistic versioning and idempotency | Prescription | Two tabs/retries cannot silently overwrite or duplicate an order |
| 1.3 | Add prescription lifecycle: draft, signed, dispensed, cancelled, entered-in-error, amended | Prescription | Signed versions are immutable and every transition is attributable |
| 1.4 | Replace hard-delete clinical corrections | Diagnosis, notes, orders | Corrections preserve original value, reason, actor, and time |
| 1.5 | Add signed/final/amended clinical note versions | ClinicalNote | A finalized note cannot be edited in place |
| 1.6 | Rebuild lab result persistence as versioned clinical data | LabResult | Initial entry, verification, and amendment are separate immutable events |
| 1.7 | Snapshot lab unit, method, reference range, and range version | LabResult | A historical report never changes after catalog edits |
| 1.8 | Decide and enforce independent lab verification | LabResult, roles | Same-user verification is allowed or denied by approved facility policy |
| 1.9 | Consolidate generic and lab-line payment settlement | Invoice, InvoiceItem, Payment | Any payment updates ledger, line gate, invoice balance, and receipt atomically |
| 1.10 | Add optimistic concurrency to every balance mutation | Invoice, Payment | Concurrent different-line payments cannot lose an update |
| 1.11 | Issue receipts for lab payments, refunds, and reversals | NumberSequence, Payment | Every movement of money has a unique printable reference |
| 1.12 | Correct multi-invoice cancellation/refund behavior | Visit, Invoice, Payment | Each refunded invoice has its own exact amount, currency, and receipt |
| 1.13 | Add invariant tests for partial failure, retries, and double-clicks | E2E, database | All high-risk commands prove all-or-nothing behavior |
| 1.14 | Reconcile existing v1 data against new invariants | migration report | Invalid/ambiguous rows are listed and resolved before migration |

> **🚩 G1 BLOCKER:** no new clinical module starts until 1.1–1.13 pass fault-injection and
> concurrency tests. New features built on unsafe writes only multiply the cleanup.

---

## Phase 2 — Audit, identity, access & privacy (~140 h) 🔒

The security model must be enforceable, reviewable, and complete—not a collection of route habits.

| # | Task | Touches | Done when |
|---|---|---|---|
| 2.1 | Define the canonical audit event catalog | AuditLog, policy | Clinical reads/writes, print, export, auth, admin, and finance are all covered |
| 2.2 | Make critical audit/domain events transactional | services, AuditLog/outbox | A committed critical write cannot exist without its event record |
| 2.3 | Cover upsert/batch/background/import operations explicitly | Prisma/services | No clinically important mutation depends on the incomplete generic interceptor |
| 2.4 | Add audit integrity monitoring and reconciliation | jobs, alerts | Missing/delayed audit events alert operations and create an incident |
| 2.5 | Make audit storage append-only and separately privileged | PostgreSQL roles | App admins cannot rewrite or delete history |
| 2.6 | Centralize conditional authorization policies | policy layer | R2/R5/R6/R7/R8/R10/R11/R12 cannot be forgotten by a handler |
| 2.7 | Build the complete permission-matrix test suite | API E2E | Every role × endpoint × ownership/scope case has allow/deny evidence |
| 2.8 | Add break-glass access | Session, AuditLog | Emergency access needs reason, expires, alerts, and is prominently reviewable |
| 2.9 | Complete user lifecycle | AppUser, UserRole, Session | Create/edit/disable/reset/unlock/role change/session revoke all work and audit |
| 2.10 | Rotate refresh tokens and detect reuse | Session | Stolen/replayed refresh token revokes its token family |
| 2.11 | Protect browser sessions from token theft | web auth, API | Long-lived credentials are not readable by injected browser JavaScript |
| 2.12 | Add login throttling, lockout policy, and MFA for privileged access | auth | Brute-force test is blocked without enabling denial-of-service against staff |
| 2.13 | Add server-side print/export authorization and audit | reports, documents | Sensitive print/export records who, what, why, and when |
| 2.14 | Sanitize errors, logs, traces, and support bundles | error handling | No token, password, SQL detail, or unnecessary PHI leaves controlled storage |
| 2.15 | Complete privacy workflows | Patient, exports | Consent/legal basis, access review, retention, correction, and approved disclosure are documented |

> **Never rely on hidden navigation.** The API and data layer enforce access. The UI merely
> explains what the user is allowed to do.

---

## Phase 3 — Database safety, tenancy & migrations (~130 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 3.1 | Add tenant-safe foreign keys/uniques for the selected deployment model | schema | Cross-facility references are impossible at DB level |
| 3.2 | Add DB constraints for money, dates, quantities, states, and identifiers | schema | Invalid values fail even through direct SQL/import bugs |
| 3.3 | Replace unsafe polymorphic billing references or enforce them through a ledger model | InvoiceItem | Every charge points to a valid origin record |
| 3.4 | Add row versions to mutable aggregates | core tables | Stale writes return a conflict instead of overwriting |
| 3.5 | Review delete/cascade behavior table by table | schema | Clinical/financial history cannot disappear through cascade |
| 3.6 | Define zero-downtime-compatible migration rules | migrations | Expand/migrate/contract process is documented and tested |
| 3.7 | Build production-size migration rehearsal data | test fixtures | Migrations run against realistic row counts and distributions |
| 3.8 | Add migration preflight, backup, verification, and rollback/roll-forward plan | deploy | Failed migration has a tested recovery path |
| 3.9 | Review and add query indexes from measured workloads | PostgreSQL | Queue/search/report plans meet SLO without speculative indexing |
| 3.10 | Add database roles and least-privilege grants | PostgreSQL | API, migration, backup, audit, and reporting accounts are separated |
| 3.11 | Define archival and partitioning strategy for large logs/history | AuditLog, ErrorLog | Five-year growth estimate stays queryable and maintainable |
| 3.12 | Add data-quality dashboard and reconciliation jobs | operations | Orphans, impossible states, and sequence anomalies are detected automatically |

---

## Phase 4 — Production billing, tills & revenue control (~150 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 4.1 | Separate cashier from receptionist permission and workflow | roles, nav, billing | Facilities can combine roles, but access is least privilege by default |
| 4.2 | Add till/session open and close | Till, CashSession | Cash cannot be accepted without an open named till session |
| 4.3 | Add denomination/counted-cash closing | Till, Payment | Expected vs counted cash and variance are recorded and approved |
| 4.4 | Add payment allocation ledger | PaymentAllocation | Partial payment is traceable to exact invoice lines |
| 4.5 | Add controlled void/refund approval workflow | Payment, Approval | Policy determines when a second person is required |
| 4.6 | Add discount approval lifecycle | Invoice, Approval | Requested, approved, rejected, and applied are distinct audited states |
| 4.7 | Add credit/deposit handling if hospital policy permits | PatientAccount | Advance money cannot be confused with revenue |
| 4.8 | Add daily revenue and settlement reconciliation | ledger, reports | Tills, payments, invoices, refunds, and bank/mobile totals reconcile exactly |
| 4.9 | Add accounting-period locks | FinancePeriod | Closed days cannot be silently rewritten |
| 4.10 | Add invoice/receipt duplicate-print markings | documents, AuditLog | Reprints are visibly marked and audited |
| 4.11 | Add tax, currency, rounding, and numbering policy per facility | Setting | Printed and stored totals always agree |
| 4.12 | Add finance exception dashboard | reports | Unallocated payments, negative balances, and stuck invoices are actionable |
| 4.13 | Add finance concurrency and property tests | tests | Ledger always balances under retries, concurrency, and reversals |

---

## Phase 5 — Longitudinal patient record & OPD completion (~180 h)

This turns the v1 consult into a durable longitudinal record rather than a collection of forms.

| # | Task | Touches | Done when |
|---|---|---|---|
| 5.1 | Add patient duplicate review and merge | Patient, identifiers, audit | Merge preserves aliases, history, provenance, and can be reviewed |
| 5.2 | Add patient alert framework | PatientAlert | Allergy, infection, safeguarding, fall, and other alerts have scope/expiry/owner |
| 5.3 | Add problem list separate from visit diagnoses | Problem | Active/resolved chronic problems span visits without copying errors |
| 5.4 | Add medication history and medication reconciliation | MedicationRecord | Current, stopped, external, and unknown medicines are distinguishable |
| 5.5 | Add configurable structured clinical forms | FormDefinition, FormResponse | New specialty forms do not require unsafe ad-hoc JSON changes |
| 5.6 | Add attachments with malware scanning and access rules | Attachment | Upload/read/download/delete policy is enforced and audited |
| 5.7 | Add referral and counter-referral workflow | Referral | Internal/external referral has owner, status, reason, and outcome |
| 5.8 | Complete appointment scheduling | Appointment, schedule | Calendar, capacity, reschedule, cancellation, no-show, and reminders work |
| 5.9 | Add practitioner availability and room/resource scheduling | Schedule, Room | Double-booking rules are explicit and enforced |
| 5.10 | Add patient communication preferences and consent | PatientContact | Reminders never disclose sensitive information to the wrong channel |
| 5.11 | Add document finalization for prescriptions, certificates, and summaries | Document | Every issued document has stable content, number, author, and reprint history |
| 5.12 | Remove hard-coded timezone/facility identity | Facility, web/API time | Every date boundary and print uses facility configuration |
| 5.13 | Complete accessibility and keyboard workflows | web | Core tasks meet WCAG target and are operable without a mouse |
| 5.14 | Complete Dari/Pashto/English terminology review | i18n | Clinical users approve translations; fallback/missing-key checks pass |
| 5.15 | Run full OPD clinical simulation | UAT | Registration-to-follow-up works through errors, downtime, and corrections |

> **🚩 v2.0 FEATURE COMPLETE after Phase 6, not production-ready yet.** Phases 14–17 still
> determine whether the feature-complete product can be safely operated.

---

## Phase 6 — Production laboratory workflow (~150 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 6.1 | Add explicit order/payment/collection/result/verification state machine | LabOrderItem | Illegal transitions are rejected at API and DB boundaries |
| 6.2 | Add persistent outstanding-work queue | LabOrderItem | Uncollected work never disappears at midnight |
| 6.3 | Add specimen model, accession, label, and rejection | Specimen | Each tube has identity, collector, time, type, status, and rejection reason |
| 6.4 | Add barcode label and scan workflow | Specimen, printers | Wrong-patient/wrong-specimen simulation is stopped before collection/result |
| 6.5 | Add recollection and cancellation | Specimen, LabOrderItem | Failed specimen does not erase the original chain of custody |
| 6.6 | Add critical-value rules and acknowledgement | LabResult, Alert | Critical result alerts named clinician and records acknowledgement/escalation |
| 6.7 | Add result amendment and corrected-report issue | LabResultVersion | Corrected report references prior version and re-notifies recipients |
| 6.8 | Add result comments, method, analyzer, and quality flags | LabResult | Context required to interpret result travels with it |
| 6.9 | Add reference-range governance/versioning | ReferenceRange | Range changes require approval and do not alter historical output |
| 6.10 | Add analyzer integration boundary | IntegrationMessage | Manual and interfaced results share validation, provenance, and error queues |
| 6.11 | Add lab quality-control and downtime procedures | LabQC, SOP | Failed QC blocks affected release according to approved policy |
| 6.12 | Add lab turnaround and backlog reporting | reports | Collection-to-verification performance and stuck items are visible |
| 6.13 | Validate printed reports and labels on real hardware | print QA | Barcode scans and reports remain readable on hospital printers |

---

## Phase 7 — Pharmacy inventory, procurement & controlled dispensing (~240 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 7.1 | Define drug item, pack, unit, strength, route, and conversion model | Drug, StockItem | Purchasing, prescribing, dispensing, and stock use unambiguous units |
| 7.2 | Add stores/locations and stock ledger | Store, StockLedger | Every quantity change is append-only and attributable |
| 7.3 | Add batch, lot, expiry, manufacturer, and barcode | StockBatch | Dispensing selects a valid non-expired batch using approved policy |
| 7.4 | Add goods receipt and supplier delivery workflow | GoodsReceipt | Received quantity, batch, expiry, cost, discrepancy, and approver are recorded |
| 7.5 | Add supplier and purchase-order workflow | Supplier, PurchaseOrder | Request → approve → order → receive → close is traceable |
| 7.6 | Add stock transfer between locations | StockTransfer | Source and destination agree; in-transit stock cannot be dispensed |
| 7.7 | Add stock count and adjustment approval | StockCount, StockAdjustment | Variance needs reason and appropriate approval |
| 7.8 | Deduct stock atomically at dispense/handover | Dispense, StockLedger | Payment/clinical handover/stock cannot disagree |
| 7.9 | Add partial fill, substitution, and backorder | DispenseItem | Pharmacist records what was actually supplied and why it differs |
| 7.10 | Add return-to-stock, quarantine, and destruction | StockDisposition | Returned medicine never silently re-enters usable stock |
| 7.11 | Add expiry, low-stock, reorder, and recall alerts | alerts | Affected batches and patients can be identified quickly |
| 7.12 | Add controlled-drug register if applicable | ControlledDrugLedger | Opening, receipt, dispense, waste, return, and closing balances reconcile |
| 7.13 | Add costing and valuation reports | reports | Finance can reconcile quantity and value by store/batch/date |
| 7.14 | Validate workflows with pharmacist and storekeeper | UAT | Real receiving, dispensing, return, expiry, and count scenarios pass |

---

## Phase 8 — IPD admission, beds & nursing (~320 h)

Do not model IPD as a longer OPD visit. It has different ownership, timing, safety, and documentation.

| # | Task | Touches | Done when |
|---|---|---|---|
| 8.1 | Add wards, rooms, beds, capabilities, and status | Ward, Bed | Occupancy, cleaning, maintenance, isolation, and blocked beds are distinct |
| 8.2 | Add admission request and authorization | AdmissionRequest | Clinical request, reason, priority, and acceptance are recorded |
| 8.3 | Add admission/encounter model | Admission, Encounter | One admission contains transfers, episodes, responsible team, and discharge |
| 8.4 | Add bed assignment and transfer | BedAssignment | No double occupancy; transfer history is immutable |
| 8.5 | Add nursing admission assessment | NursingAssessment | Required risks and baseline observations are complete or explicitly deferred |
| 8.6 | Add nursing observations and early-warning scoring | Observation | Deterioration threshold triggers escalation and acknowledgement |
| 8.7 | Add care plans, tasks, handover, and shift ownership | CarePlan, ClinicalTask | Work has due time, owner, completion, exception, and handover trail |
| 8.8 | Add inpatient medication orders | MedicationOrder | Start/stop/schedule/route/PRN/hold/amendment are versioned and signed |
| 8.9 | Add pharmacist verification where policy requires | MedicationOrderReview | Verification status cannot be mistaken for administration |
| 8.10 | Add Medication Administration Record (MAR) | MedicationAdministration | Five-rights checks, barcode option, omission, refusal, and late reason are recorded |
| 8.11 | Add inpatient investigations and specimen collection | LabOrder, Specimen | Ward orders join the same safe lab pipeline without OPD assumptions |
| 8.12 | Add multidisciplinary progress notes | ClinicalNote | Authorship, specialty, sign-off, amendments, and access are clear |
| 8.13 | Add diet, mobility, fall, pressure injury, and isolation indicators | care plan | Nursing safety indicators remain visible across shifts |
| 8.14 | Add discharge planning and medication reconciliation | DischargePlan | Follow-up, final medication, instructions, and pending results are complete |
| 8.15 | Add discharge summary and document release | DischargeSummary | Signed summary is stable, bilingual where required, and reprints audit |
| 8.16 | Add discharge/transfer/death states | Admission | Bed, billing, records, and notifications close consistently |
| 8.17 | Add IPD charges and daily services | Charge, Invoice | Charge origin, date, performer, reversal, and payer are traceable |
| 8.18 | Simulate complete multi-day admission | UAT | Admission survives shift changes, transfer, missed dose, correction, and discharge |

> **🚩 v2.1 cannot pilot until medication-order and MAR hazards have a signed clinical safety
> assessment.** A convenient medication screen with ambiguous units is worse than paper.

---

## Phase 9 — Emergency department (~180 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 9.1 | Add emergency arrival with temporary identity | EmergencyEncounter | Unknown patient can receive care without creating an unmergeable duplicate |
| 9.2 | Add triage scale and reassessment | Triage | Acuity, observations, pain, reassessment due, and deterioration are visible |
| 9.3 | Add emergency tracking board | EmergencyEncounter | Waiting, treatment, observation, admission, transfer, discharge, and left states update safely |
| 9.4 | Add emergency orders and rapid documentation | orders, notes | Urgent care is fast without bypassing attribution and audit |
| 9.5 | Add resuscitation record and time-critical events | ResuscitationEvent | Medications/procedures/times can be reconstructed accurately |
| 9.6 | Add emergency medication administration | MAR | Verbal/emergency orders require defined retrospective sign-off |
| 9.7 | Add consultation, referral, and admission handoff | Referral, Admission | Responsibility transfer is named and acknowledged |
| 9.8 | Add ED discharge/left-without-being-seen/death workflow | EmergencyEncounter | Every exit has disposition, author, time, and required documentation |
| 9.9 | Add crowding, wait, and time-to-treatment metrics | reports | Operational data follows approved definitions |
| 9.10 | Run mass-casualty/network-down simulation | UAT/SOP | Staff can continue safely and reconcile records afterward |

---

## Phase 10 — Radiology & imaging (~190 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 10.1 | Add imaging catalog, modality, preparation, contraindication rules | ImagingService | Order entry has sufficient clinical and safety context |
| 10.2 | Add radiology order and scheduling | ImagingOrder, Appointment | Priority, modality, slot, preparation, and transport needs are represented |
| 10.3 | Add pregnancy/contrast/renal/allergy safety checks | ImagingSafetyCheck | Required checks block or require documented override |
| 10.4 | Add performed/exam-quality workflow | ImagingStudy | Technician records acquisition and exceptions without signing report |
| 10.5 | Add report drafting, verification, and amendment | ImagingReportVersion | Final reports are immutable; addenda and corrected reports preserve history |
| 10.6 | Add critical finding notification | Alert | Named clinician acknowledgement and escalation are recorded |
| 10.7 | Integrate PACS/DICOM through a defined gateway | IntegrationMessage | REDMARS stores links/identifiers and status without pretending to be a PACS |
| 10.8 | Add report distribution and print | documents | Clinician and patient receive the authorized final version |
| 10.9 | Add turnaround, backlog, and discrepancy reports | reports | Operational and quality performance are measurable |
| 10.10 | Validate with radiologist and technologist | UAT | Order-to-final-report and corrected-report scenarios pass |

---

## Phase 11 — Theatre, procedures & sterilization (~180 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 11.1 | Add procedure catalog and booking | Procedure, TheatreSchedule | Urgency, team, room, equipment, and expected duration are scheduled |
| 11.2 | Add pre-operative checklist and consent references | ProcedureChecklist | Required checks cannot be silently skipped |
| 11.3 | Add WHO-style sign-in/time-out/sign-out workflow | ProcedureEvent | Team confirmation is timestamped and attributable |
| 11.4 | Add anaesthesia assessment and record boundary | AnaesthesiaRecord | Required data is captured or integrated without unsafe free-text substitution |
| 11.5 | Add procedure/operative note and implants | OperativeNote, ImplantUsage | Procedure, findings, staff, devices, and complications are recorded |
| 11.6 | Add recovery observations and disposition | RecoveryRecord | Deterioration/escalation and handoff are explicit |
| 11.7 | Add instrument set and sterilization traceability | SterilizationCycle | Patient-use items can be traced to cycle/load/result |
| 11.8 | Add theatre utilization and cancellation reports | reports | Reasons, delays, utilization, and outcomes are reviewable |
| 11.9 | Run elective and emergency procedure simulations | UAT | Safety checks, interruption, correction, and handoff pass |

---

## Phase 12 — Blood bank & transfusion safety (~220 h)

If the hospital does not operate a blood bank, implement a safe referral/integration boundary instead.

| # | Task | Touches | Done when |
|---|---|---|---|
| 12.1 | Add donor/donation screening where legally in scope | Donor, Donation | Eligibility, consent, deferral, and test results follow approved policy |
| 12.2 | Add blood component inventory | BloodUnit | Unique unit, group, expiry, status, storage, and location are known |
| 12.3 | Add compatibility testing and crossmatch | Crossmatch | Patient/specimen/unit identities are checked and immutable |
| 12.4 | Add blood request and clinical approval | TransfusionRequest | Indication, urgency, component, quantity, and authorizer are recorded |
| 12.5 | Add issue/return/wastage workflow | BloodUnitMovement | Chain of custody and temperature exceptions are captured |
| 12.6 | Add bedside transfusion verification | Transfusion | Two-person/barcode checks follow facility policy |
| 12.7 | Add transfusion observations and reaction workflow | TransfusionReaction | Stop/escalate/investigate steps and notifications are recorded |
| 12.8 | Add recall and traceability | reports | Any unit can be traced donor-to-recipient and recipient-to-unit |
| 12.9 | Validate with blood-bank and clinical leadership | UAT | Wrong-unit and reaction simulations are stopped and escalated |

---

## Phase 12b — Specialty care & hospital support workflows (~260 h)

Activate only the services the hospital actually operates. Each enabled service needs its own
clinical owner, workflow discovery, permissions, hazards, UAT, reports, and downtime procedure.

| # | Task | Touches | Done when |
|---|---|---|---|
| 12b.1 | Add ICU/HDU care profile on the IPD foundation | Encounter, Observation, Device | High-frequency observations, targets, devices, infusions, and handover are safe and usable |
| 12b.2 | Add infusion and continuous-medication administration | MedicationOrder, MAR | Rate, concentration, line, changes, double-checks, and stop events are reconstructable |
| 12b.3 | Add maternity antenatal/labour/delivery workflow | MaternityEpisode | Mother and baby records remain linked without sharing identity or observations incorrectly |
| 12b.4 | Add neonatal/newborn workflow | NewbornEpisode | Birth details, resuscitation, feeding, screening, and disposition are safely recorded |
| 12b.5 | Add ambulance request, dispatch, transport, and handover | TransportEpisode | Caller, location, crew, times, care, destination, and accepting handoff are recorded |
| 12b.6 | Add infection-prevention surveillance and isolation workflow | InfectionCase, Isolation | Alerts, precautions, exposure, review, and clearance follow approved policy |
| 12b.7 | Add diet/allergy-safe meal request and delivery | DietOrder | Current clinical diet reaches the correct patient and changes are acknowledged |
| 12b.8 | Add biomedical device inventory and maintenance | MedicalDevice, Maintenance | Device identity, location, service due, fault, quarantine, and patient-use trace are available |
| 12b.9 | Add environmental cleaning and bed-turnaround tasks | CleaningTask, Bed | Discharged bed cannot return to available before required cleaning completion |
| 12b.10 | Add mortality, mortuary, and body-release workflow | DeathRecord, MortuaryCase | Certification, identity, belongings, custody, and authorized release are controlled |
| 12b.11 | Add adverse-event and incident reporting | SafetyIncident | Staff can report, investigate, act, and trend events with protected access |
| 12b.12 | Validate each enabled specialty independently | safety case, UAT | The service has signed clinical acceptance; disabled services expose no usable workflow |

---

## Phase 13 — Insurance, contracts & claims (~150 h)

Build only after the hospital supplies real payer rules. Do not invent generic “insurance support.”

| # | Task | Touches | Done when |
|---|---|---|---|
| 13.1 | Add payer, plan, contract, coverage, and tariff versions | Payer, Contract | Service date selects the correct immutable price/rule version |
| 13.2 | Add patient coverage and eligibility | Coverage | Identity, policy, validity, limits, and authorization are recorded |
| 13.3 | Add preauthorization workflow | Authorization | Requested/approved/denied/expired states and evidence are clear |
| 13.4 | Add claim construction and validation | Claim, ClaimLine | Claim traces to clinical service and invoice without duplicate billing |
| 13.5 | Add submission, rejection, correction, and resubmission | ClaimEvent | Every exchange and reason is retained |
| 13.6 | Add remittance and payment allocation | Remittance | Payer payment, adjustment, patient liability, and write-off reconcile |
| 13.7 | Add contract and receivable reports | reports | Outstanding, denied, aged, and recovered amounts are explainable |
| 13.8 | Validate each payer separately | UAT | Real test claims complete the payer lifecycle |

---

## Phase 14 — Interoperability, documents & notifications (~160 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 14.1 | Define stable external identifiers and code systems | schema, terminology | Facility/patient/encounter/order/result identifiers are never reused |
| 14.2 | Add integration message inbox/outbox | IntegrationMessage | Delivery, retry, deduplication, quarantine, and replay are controlled |
| 14.3 | Add versioned FHIR/HL7 adapters where partners require them | integration service | Conformance tests pass against agreed profiles |
| 14.4 | Add terminology versioning and mapping | ICD, medicines, labs | Code-system source/version and local mapping are visible |
| 14.5 | Add configurable document templates and versioning | DocumentTemplate | Issued documents remain reproducible after template changes |
| 14.6 | Add SMS/email notification service with consent and redaction | Notification | Retries, delivery status, opt-out, and privacy-safe content are enforced |
| 14.7 | Add import staging and validation | ImportJob | Bad rows are quarantined; imports are resumable and fully audited |
| 14.8 | Add export packages with purpose, minimization, expiry, and audit | ExportJob | Large exports are approved, encrypted, expiring, and reviewable |
| 14.9 | Add integration health dashboard and runbooks | operations | Staff can see and recover stuck interfaces without DB edits |

---

## Phase 15 — Reporting, quality & management intelligence (~160 h)

| # | Task | Touches | Done when |
|---|---|---|---|
| 15.1 | Create governed metric definitions | data dictionary | Census, revenue, wait, occupancy, mortality, and turnaround have one definition |
| 15.2 | Separate operational reporting workload from transactional paths | reporting architecture | Heavy reports cannot stall registration or medication administration |
| 15.3 | Add IPD census, occupancy, length-of-stay, and discharge reports | reports | Figures reconcile to encounters and beds |
| 15.4 | Add medication, lab, radiology, and safety indicators | reports | Overdue/critical/amended/adverse events are actionable |
| 15.5 | Add stock, expiry, consumption, purchasing, and variance reports | reports | Store ledger and finance totals reconcile |
| 15.6 | Add finance, claims, till, refund, and discount reports | reports | Every total drills to immutable source transactions |
| 15.7 | Add role-scoped dashboards | web, policy | No dashboard broadens access beyond source permissions |
| 15.8 | Add scheduled reports without PHI leakage | jobs | Delivery audience, format, retention, and failure are controlled |
| 15.9 | Add data-quality and audit-compliance reports | reports | Missing signatures, invalid transitions, and overdue acknowledgements are visible |
| 15.10 | Validate every report against a manual sample | QA | Report has owner, definition, test dataset, and reconciliation evidence |

---

## Phase 16 — Observability, performance & resilience (~180 h) 🔒

| # | Task | Touches | Done when |
|---|---|---|---|
| 16.1 | Add structured logs and correlation IDs | API/web/proxy/jobs | One request can be traced without exposing PHI |
| 16.2 | Add metrics for HTTP, DB, auth, audit, queues, jobs, storage, and backups | monitoring | Dashboards show health before users call |
| 16.3 | Add actionable alerts and escalation | monitoring/on-call | Every alert has threshold, owner, severity, and runbook |
| 16.4 | Add readiness/liveness/startup health semantics | containers | Traffic reaches only dependencies-ready instances |
| 16.5 | Add timeouts, circuit breakers, bounded retries, and idempotency | API/integrations | Dependency failure cannot create a retry storm or duplicate write |
| 16.6 | Add DB pool, lock, slow-query, and storage monitoring | PostgreSQL | Saturation and deadlock risks alert before outage |
| 16.7 | Replace unbounded reads/in-memory filtering | services | Every list/report/export has safe bounds and pagination |
| 16.8 | Establish capacity model and production-like load suite | performance | Normal peak, burst, report, and degraded scenarios meet SLOs |
| 16.9 | Run soak, failover, and resource-exhaustion tests | staging | No leak or irreversible backlog appears over multi-day simulation |
| 16.10 | Add maintenance mode and downtime/reconciliation workflows | operations | Care continues safely during planned/unplanned outage |
| 16.11 | Add clock synchronization and facility-time monitoring | infrastructure | Time drift cannot corrupt ordering, audit, or sequence interpretation |

---

## Phase 17 — DevSecOps, QA, recovery & production launch (~220 h) 🔒

This phase supplies the evidence that every earlier phase can be trusted and operated.

| # | Task | Touches | Done when |
|---|---|---|---|
| 17.1 | Add protected-branch CI quality gates | CI | Build, lint, unit, integration, E2E, migration, and frontend tests are mandatory |
| 17.2 | Add SAST, dependency, secret, license, IaC, and container scanning | CI/security | Release has reviewed findings and an SBOM |
| 17.3 | Build immutable versioned release artifacts | deployment | Same signed artifact moves staging → production |
| 17.4 | Add controlled deployment, migration, rollback, and roll-forward | release pipeline | Failed release recovery is rehearsed without hand-edited production state |
| 17.5 | Build frontend component/browser/accessibility/visual regression suites | web tests | Critical workflows and print layouts are covered across supported browsers |
| 17.6 | Add property, concurrency, fault-injection, and security tests | test suites | Invariants hold under hostile ordering and dependency failure |
| 17.7 | Create encrypted local + off-site + immutable backups | backup system | Retention tiers and keys meet approved policy |
| 17.8 | Automate backup integrity and isolated restore verification | recovery environment | Restore test runs on schedule and alerts on any mismatch |
| 17.9 | Complete disaster-recovery and business-continuity drills | runbooks | Independent operator restores within RPO/RTO and staff reconcile downtime data |
| 17.10 | Harden hosts, network, TLS, secrets, and admin access | infrastructure | Benchmarked configuration and penetration test have no open P0/P1 |
| 17.11 | Test actual printers, scanners, barcode devices, UPS, and power loss | hardware QA | Hospital hardware passes documented acceptance tests |
| 17.12 | Create SOPs and role-based training | operations/training | Staff pass scenario-based competency checks |
| 17.13 | Run clinical safety validation and hazard review | safety case | Every high-risk hazard has evidence-backed control and residual-risk acceptance |
| 17.14 | Run privacy, security, and jurisdictional compliance review | governance | Required policies, contracts, notices, retention, and access processes are approved |
| 17.15 | Run staging dress rehearsal with production-scale data | staging | Full hospital day, closing, backup, restore, and next-day startup pass |
| 17.16 | Run shadow mode and controlled parallel operation | hospital pilot | No missing record, unexplained cash variance, or unreconciled workflow remains |
| 17.17 | Go live by department with explicit rollback criteria | production | Each wave is approved before the next begins |
| 17.18 | Operate hypercare and post-implementation review | support | Incidents, defects, adoption, performance, and lessons are formally closed |

> **🚩 G5:** “all tests green” is necessary but not sufficient. Production requires signed
> clinical, security, finance, privacy, operational, and management acceptance.

---

## Cross-cutting Definition of Done

Every task that changes behavior is done only when all applicable statements are true:

1. Workflow and exception paths are approved by the real role that performs them.
2. Database invariants and migration behavior are defined.
3. API authorization and facility/resource scoping are enforced server-side.
4. Sensitive reads and all mutations have the correct audit/domain events.
5. Concurrency, retries, double-clicks, and partial failure have explicit behavior.
6. UI supports keyboard use, loading, empty, offline, stale, conflict, and error states.
7. English, Dari, Pashto, RTL, print, date, number, and timezone behavior are verified.
8. Unit/integration/E2E/authorization tests cover positive and negative paths.
9. Logs, metrics, alerts, and support diagnostics exist without leaking PHI.
10. Backup, migration, rollback/roll-forward, and downtime impact are documented.
11. User help, SOP, training, and release notes are updated.
12. Product, clinical, security, QA, and operations owners accept the evidence.

---

## The cut list

If schedule or budget slips, cut or defer only modules that are outside the declared release scope:

1. Insurance/claims for facilities without active payer contracts (Phase 13)
2. PACS/analyzer/FHIR integrations when no partner endpoint exists (6.10, 10.7, 14.3)
3. SMS/email notifications (14.6)
4. Advanced scheduled analytics (15.8)
5. Hardware fingerprint licensing or other copy-protection work
6. Optional specialty forms not needed for the pilot department

**Never cut or defer:**

- Phase 1 integrity repairs
- Transactional audit and authorization tests
- Clinical correction/amendment history
- Payment/receipt/reconciliation integrity
- Medication-order and MAR safety controls
- Lab/specimen identity controls
- Backup plus verified restore
- Security testing and production monitoring
- Downtime procedures and parallel run
- Clinical UAT and signed release gates

> Features can be deferred. Safety properties cannot. If a required safety property does not fit
> the date, move the date or reduce the release scope.

---

## Before you write a line of v2 code

Answer and sign off these questions. They materially change the architecture and build order:

1. Is one database deployed per hospital, or must one installation host multiple facilities?
2. Which exact modules define **v2.0**, **v2.1**, and **v2.2** for the first hospital?
3. Which national privacy, health-record, pharmacy, laboratory, blood-bank, tax, and retention rules apply?
4. Who is the clinical safety owner with authority to approve medication, lab, emergency, and IPD workflows?
5. Must result verification use a second person, and which tests permit self-verification?
6. Does the hospital operate a blood bank, theatre, radiology service, ICU, maternity unit, and ambulance service?
7. Which existing analyzers, PACS, printers, barcode scanners, payment terminals, and external systems must integrate?
8. Which pharmacy units, stores, batch/expiry rules, controlled drugs, suppliers, and approval limits are real?
9. Which insurers/panels exist, and can they provide actual contract, tariff, and claim specifications?
10. What are the measured peak users, encounters/day, admissions/day, lab volume, images/day, and five-year growth?
11. What RPO, RTO, uptime, support hours, and downtime-paper process can the hospital sustain?
12. Who may break glass, approve refunds/discounts/stock adjustments, amend results, and reopen closed records?
13. Which documents must be bilingual, legally numbered, signed, stamped, or retained on paper?
14. Will remote access exist? If yes, through which managed devices, VPN, MFA, and support process?
15. What historical data will migrate, who owns cleansing, and what evidence proves migration completeness?
16. Who signs the final go-live decision for clinical safety, finance, security, privacy, operations, and management?

---

## Final rule

REDMARS is production-ready only when the hospital can answer all four questions with evidence:

1. **Can staff provide safe care during normal use, mistakes, concurrency, and downtime?**
2. **Can every clinical and financial fact be trusted, corrected without erasure, and reconstructed?**
3. **Can the system resist attack, expose the minimum necessary data, and reveal abuse?**
4. **Can an independent operator restore and run it when the original developers are unavailable?**

Until all four are true, the product is still a release candidate—regardless of how many screens exist.
