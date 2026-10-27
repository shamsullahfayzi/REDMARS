# REDMARS HMIS — Roles & Permissions Matrix (v1, OPD)

> **Status:** draft for review with Axon / AXON staff.
> Rows marked ❓ are open questions — confirm with Dr. Hafizullah before building.

## Roles

| Code | Role | Summary |
|---|---|---|
| `admin` | Administrator | Configuration, users, prices, reports, read-all. **Cannot write clinical records.** |
| `receptionist` | Receptionist / Cashier | Registration, visits, billing, payments. **No clinical access.** |
| `nurse` | Nurse | Vitals, triage, allergies. Limited clinical read. |
| `doctor` | Doctor / Consultant | Full clinical record. Prescribes, diagnoses, orders labs. |
| `lab_tech` | Lab technician | Lab queue, samples, results. |
| `pharmacist` | Pharmacist | Dispensing, pharmacy till. Sees drugs + allergies **only**. |
| `management` | CEO / Management | Read-only reports and audit. No patient-level clinical access. |
| `call_center` | Call center | Confirms upcoming follow-ups by phone. Sees only the recall list — never the clinical record (R13). |

**Legend:** ✅ allowed · ⚠️ allowed with condition (see Rules) · ❌ denied

**`call_center` is absent from every table below except §6a.** It holds exactly two
permissions in the whole matrix (`follow_up.read`, `follow_up.respond`) — adding an
all-❌ eighth column to ten tables of unrelated sections would say nothing a reader
cannot already infer from "absence is denial," the rule this whole document runs on.

---

## 1. Authentication & Users

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `auth.login` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `user.create` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `user.edit` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `user.deactivate` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `user.reset_password` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `role.assign` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 2. Configuration

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `facility.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `department.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `room.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `practitioner.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `service.manage` (consultation fees) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `price.change` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `drug.manage` (formulary) | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ R9 | ❌ |
| `labtest.manage` (catalog) | ✅ | ❌ | ❌ | ❌ | ⚠️ R9 | ❌ | ❌ |
| `panel.manage` (insurance) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `template.manage.own` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `template.manage.shared` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `setting.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 3. Patient

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `patient.create` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patient.edit_demographics` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patient.search` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | *(task 6b.9 — lab/pharm work their own queue, never the register)* |
| `patient.read_demographics` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **`patient.read_clinical`** | ⚠️ R2 | ❌ | ⚠️ R7 | ✅ R1 | ⚠️ R8 | ⚠️ R6 | ❌ |
| `patient.read_history` (> 1 month) | ⚠️ R2 | ❌ | ❌ | ✅ R1 R3 | ❌ | ❌ | ❌ |
| `patient.merge_duplicates` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patient.void` (entered_in_error) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patient.delete` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | *(R4 — nobody, ever)* |
| `allergy.record` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **`allergy.read`** | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | *(R6 — pharmacist MUST see this)* |

## 4. Visit & Queue

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `visit.create` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `visit.read_queue` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `visit.change_status` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `visit.cancel` | ✅ | ⚠️ R5 | ❌ | ❌ | ❌ | ❌ | ❌ |
| `visit.reassign_practitioner` | ✅ | ⚠️ R5 | ❌ | ❌ | ❌ | ❌ | ❌ |
| `visit.void` (entered_in_error) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `appointment.create` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `appointment.cancel` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4a. Reception coordination

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `reception.read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `reception.coordinate` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `reception.manage_beds` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `reception.clinical_review` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `reception.supervise` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Reception coordination creates requests and operational records. It does not grant the receptionist
authority to approve admission, transfer, discharge, queue-priority or duplicate-merge decisions.
The requester cannot approve their own clinical request or till discrepancy.

## 5. Clinical record

> This is the confidentiality core. Axon is a **psychiatric hospital** — a leaked diagnosis
> does real harm in a small community. Default to denial.

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `vitals.record` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `vitals.read` | ⚠️ R2 | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `diagnosis.record` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **`diagnosis.read`** | ⚠️ R2 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `clinical_note.write` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **`clinical_note.read`** | ❌ R2 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `attachment.upload` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `attachment.read` | ⚠️ R2 | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

## 6. Prescription

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `prescription.write` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `prescription.read` | ⚠️ R2 | ❌ | ⚠️ R7 | ✅ | ❌ | ✅ R6 | ❌ |
| `prescription.print` | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `prescription.cancel` | ❌ | ❌ | ❌ | ⚠️ R5 | ❌ | ❌ | ❌ |

## 6a. Follow-up (recall list)

> Not the appointment book (§4's `appointment.*`) — who was TOLD to come back, not who
> booked a slot. See task 4.15 / `packages/shared/src/followUp.ts` for why the two are
> kept separate.

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt | Call Ctr |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `follow_up.read` | ⚠️ R2 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ R13 |
| `follow_up.respond` (log coming/not-coming/a note after a call) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ R13 |

## 7. Laboratory

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `lab_order.create` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `lab_order.read_queue` | ✅ | ⚠️ R8 | ❌ | ✅ | ✅ | ❌ | ❌ |
| `lab.collect_sample` | ❌ | ❌ | ⚠️ R9 | ❌ | ✅ | ❌ | ❌ |
| `lab.enter_result` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `lab.verify_result` | ❌ | ❌ | ❌ | ❌ | ✅ ❓ | ❌ | ❌ |
| `lab.print_result` | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `lab_result.read` | ⚠️ R2 | ❌ | ⚠️ R7 | ✅ | ✅ | ❌ | ❌ |
| `lab.amend_result` | ❌ | ❌ | ❌ | ❌ | ⚠️ R4 | ❌ | ❌ |

## 8. Pharmacy

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `pharmacy.read_queue` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `pharmacy.dispense` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `pharmacy.return_medicine` | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ R5 | ❌ |

## 9. Billing

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `invoice.create` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `invoice.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ R12 | ✅ |
| `invoice.list` (facility register, browsable by day) | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ R12 | ✅ | *(task 6b.9 — split off invoice.read; reception would back into revenue by browsing it)* |
| `invoice.print` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `payment.receive` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `payment.refund` | ✅ | ⚠️ R5 | ❌ | ❌ | ❌ | ⚠️ R5 | ❌ |
| `refund.print` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **`discount.apply`** | ✅ | ⚠️ R10 | ❌ | ❌ | ❌ | ⚠️ R10 | ❌ |
| `discount.approve_over_threshold` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `invoice.void` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lab_charge.read` (a lab order's own bill) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | *(a pharmacist's own invoice grants above are R12-excluded from lab origin; this is the lab till's own door, and it has none)* |
| `lab_charge.collect` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 10. Reports, audit & data

| Action | Admin | Recep | Nurse | Doctor | Lab | Pharm | Mgmt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `report.operational` (census, wait times) | ✅ | ⚠️ R8 | ❌ | ❌ | ❌ | ❌ | ✅ |
| `report.financial` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `report.clinical_aggregate` (counts, no names) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `audit_log.read` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `error_log.read` (task 7.8 — every 5xx, with its stack trace) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `data.export` | ⚠️ R11 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Rules

**R1 — Every clinical read is audited, none are blocked.**
A doctor is never made to ask permission to read the record of a patient sitting in front of them. Instead, every clinical read writes an `AuditLog` row (`action: read`). Deterrence, not obstruction. *Obstruction in clinical software gets routed around, and the workaround is always less safe than the thing it replaced.*

**R2 — Admin can read, but never write, clinical data.**
Separation of duties. The admin configures the system and can audit it; they cannot alter a medical record. Admin clinical reads are audited like anyone's. `clinical_note.read` is **denied even to admin** — psychiatric notes are the most sensitive artefact in the building.

**R3 — Replaces the "admin approval for records older than one month" rule.**
That rule would have made doctors prescribe blind. A patient's history — what was tried, what failed, past risk assessments — is *clinically essential*, especially in psychiatry where care is longitudinal. Doctors get unrestricted historical access, fully logged. The gate stays only on **bulk export** (R11).

**R4 — Nothing is ever hard-deleted.**
Corrections mark `entered_in_error` and write a new record. `lab.amend_result` creates an amendment, never an overwrite — the original stays visible.

**R5 — Time-boxed reversals.**
`visit.cancel`, `visit.reassign_practitioner`, `prescription.cancel`, `payment.refund`, `pharmacy.return_medicine`: allowed same-day, before the next step has occurred (can't cancel a dispensed prescription; can't refund a completed lab; can't reassign a visit the doctor has already started). Outside the window → admin only. All logged with a mandatory reason.

**R6 — Pharmacist sees drugs and allergies. Nothing else.**
The drug list and the allergy list — because dispensing without allergies is dangerous. **Never** the diagnosis, never the clinical note. A pharmacist does not need to know a patient is schizophrenic to hand them a box of tablets.

**R7 — Nurse sees vitals and allergies, plus the drug list. Not the notes.**
❓ Confirm with the hospital — this may be too tight if nurses assist in consultations.

**R8 — Task-scoped reads.**
The receptionist sees the *test names and prices* on a lab order so she can bill it — not the clinical note explaining why it was ordered. The lab tech sees the clinical note on their own order (they need the indication) — not the patient's wider record.

**R9 — Propose, don't commit.**
Pharmacist/lab may *propose* additions to the formulary or test catalog; admin approves. Prevents price and drug-list drift.

**R10 — Discount ceiling.**
Receptionist and pharmacist may discount up to **10%** (configurable). Anything above requires admin approval, in-app. Every discount records who, how much, and **why** (mandatory free-text reason). *Uncapped discount authority at the till is the standard way hospitals leak cash — your original matrix let a receptionist zero out any bill with no oversight and no admin able to do it.*

**R11 — Bulk export requires a reason and is heavily audited.**
Admin only. This is the real defence against someone walking off with the patient list — not blocking doctors from their own patients' histories.

**R12 — A pharmacist's `invoice.read`/`invoice.list` is scoped to pharmacy-origin bills only.**
Positive scope, not a subtraction: a bill must carry a `prescription_item` line — the one condition `originOf` ever reads as 'pharmacy' — to be visible at all. Originally written as "excludes lab-origin bills," which left reception's own OPD bill visible too; that was a gap, not the intent — the reasoning is the same as R6, a pharmacist has no operational reason to see what reception or the lab is owed, and giving them a second, unrelated till's money to browse is exposure with no job behind it. A lab order's own bill is `lab_charge.read`/`lab_charge.collect`, and the pharmacist holds neither.

**R13 — Call center sees the recall list and nothing else.**
`follow_up.read` already carries only a name, a phone number and a date — no diagnosis, no note, no prescription, the same list a receptionist already works. `follow_up.respond` is the one write this role holds: coming / not coming / a free-text note, timestamped and attributed, never editable after the fact (a correction is a new row, not an overwrite — R4). Same shape as R6/R7/R8: a role built around one task gets exactly the data that task needs, never the record it sits next to.

---

## Open questions for Dr. Hafizullah / the hospital

1. **Who verifies lab results?** Right now the same tech enters and verifies. Real labs separate these (tech enters, senior verifies). Does Axon have a lab supervisor? If yes → new role `lab_supervisor`.
2. **Is the receptionist also the cashier?** The workflow doc implies yes. Confirmed → keep merged.
3. **Do nurses assist in consultations?** If yes, R7 needs loosening.
4. **Is Dr. Hafizullah `admin` or `management`?** He'll want to see everything — but as CEO he probably shouldn't be the one creating users at 2am. Consider giving him both roles, and note that `clinical_note.read` is denied to admin (R2) but he *is* a psychiatrist, so he'd hold `doctor` too.
5. **Do panels/insurance exist at Axon?** If not, drop the Panel table from v1.
6. **Discount ceiling — is 10% right?** Should there be a per-day total cap per user?
7. **Emergency access ("break glass")?** If a patient arrives unconscious and the treating doctor isn't the assigned one — should any doctor be able to force access with a written reason, heavily logged? Standard in hospitals. Recommended.

---

## Implementation note

### Internal finance module (2026-09)

The hospital commissioned internal AFN accounting. Two dedicated roles are added:
`accountant` prepares and reviews journals, maintains suppliers and reconciles statements;
`finance_manager` also configures accounts/periods and closes periods.
Neither role receives clinical permissions. Finance source views expose billing
references, patient names/MRNs and visit numbers for accounting traceability. Both receive
`auth.login` and `auth.me`.

| Permission | Admin | Accountant | Finance manager | Management |
|---|---|---|---|---|
| finance.read | Yes | Yes | Yes | Yes |
| finance.write | Yes | Yes | Yes | No |
| finance.configure | Yes | No | Yes | No |
| finance.post | Yes | Yes | Yes | No |
| finance.close | Yes | No | Yes | No |
| finance.reconcile | Yes | Yes | Yes | No |
| finance.export | Yes | Yes | Yes | Yes |
| finance.consolidation.manage | Yes | No | No | No |

All finance routes additionally require the facility's finance module to be enabled.
The Layer 6 `auditor` role receives only `auth.login`, `auth.me`, `finance.read`
and `finance.export`. It has no finance mutation, payroll-detail or clinical
permissions. A source facility's administrator may grant consolidated report
access to a named active admin, finance manager, management user or auditor at
another facility. The recipient's current role, active grant and each facility's
enabled finance module are checked on every consolidated request. Grants are
audited to the source facility and can be revoked immediately.
Posting requires a different user from the preparer, including admins. Editing a
manual draft makes that editor its current preparer; the original history remains
in the audit trail. Generated journals and reversals wait for review. A till count
also requires a different accountant's approval before a linked bank deposit.

These rows map 1:1 to the `Permission` table (`resource` + `action`). Seed them; wire them to `Role` via `RolePermission`; enforce with a **NestJS guard**.

**Enforce on the backend, always.** Hiding a button in React is a courtesy, not a control.
# Payroll permissions — Layer 4 (2026-10-11)

`payroll_officer` prepares employee pay records, attendance, loans and runs.
It receives `auth.login`, `auth.me`, `finance.read`, `payroll.read` and
`payroll.write`. It cannot approve payroll, pay salaries or post journals.

| Permission | Roles |
|---|---|
| payroll.read | admin, accountant, finance_manager, payroll_officer, management |
| payroll.write | admin, accountant, finance_manager, payroll_officer |
| payroll.configure | admin, finance_manager |
| payroll.approve | admin, finance_manager |
| payroll.pay | admin, accountant, finance_manager |

Payroll approval always requires a different user from the preparer. Salary
payment requires approved payroll and a posted accrual. All permissions remain
facility-scoped and require the Finance module. Management has read-only access.
## CRM Foundation — Module 1

| Permission | Administrator | Call center | Other roles |
|---|---|---|---|
| `crm.read` | Allowed | Allowed | Denied |
| `crm.configure` | Allowed | Denied | Denied |
| `crm.contacts.write` | Allowed | Allowed | Denied |
| `crm.contacts.authorize` | Allowed | Denied | Denied |
| `crm.leads.write` | Allowed | Own leads and explicit claims | Denied |
| `crm.leads.assign` | Allowed | Denied | Denied |
| `crm.interactions.write` | Allowed | Allowed | Denied |
| `crm.interactions.correct` | Allowed | Own entries only | Denied |
| `crm.calls.write` | Allowed | Allowed | Denied |

All CRM permissions require CRM to be enabled for the signed-in facility. Settings
are facility-scoped and audited; callers cannot supply another facility ID.
Call-center users also hold `auth.login` and `auth.me` for their existing account
and navigation. Their clinical permissions remain unchanged. R13 permits the
existing follow-up queue and the CRM workspace's operational guidance; it does
not grant general patient, clinical note, prescription or financial record access.
CRM configuration is stored in the existing Setting table as `crm.settings`.

Module 2 adds facility-scoped contacts, preferences, consent decisions and caller
checks. Only administrators link existing patients and approve/revoke relationship
scopes. Call-center staff cannot browse the patient registry. Minimal linked
patient name/MRN is visible to agents only after a successful check of caller
identity and authority, valid for that staff member for 15 minutes and invalidated
by contact changes. Consent is scoped by contact, patient relationship, purpose,
channel and destination. Shared phones never establish identity. No clinical
notes, diagnoses or financial details are returned by CRM endpoints.

Module 3 adds leads with an optional CRM contact, source, service interest,
qualification and stage history. Agents create leads assigned to themselves,
edit their own open leads and may claim an unassigned open lead. Administrators
may reassign leads to active eligible CRM staff in their facility. Only admins
can reopen a closed lead, with a reason. Qualification requires an active
contact, an eligible owner, service interest and both administrative confirmations.
This does not authorize contacting anyone or establish clinical eligibility.
Leads never create patients, appointments or financial records. Source is retained
from creation, version checks reject stale updates, and audit snapshots redact
inquiry text and status-change reasons.

Module 4 adds interaction timelines under leads and contacts. Entries with an
authorized patient relationship are filtered by that relationship's purpose,
active contact/patient and the agent's successful unexpired caller check for the
current contact version. Counts, details and revisions apply the same filter.
Administrators with `crm.contacts.authorize` bypass the caller check but cannot
read patient entries through a revoked relationship. Only patient name/MRN are
projected. Agents correct their own active entries; administrators may correct
others. Corrections append a revision, require a reason and reject stale versions.
Withdrawal preserves history. No CRM deletion endpoint exists.

CRM configuration includes interaction visibility retention (30–3650 days,
default 365). New entries expire from their event time; existing expiry dates do
not change when the setting changes. Expired entries and revisions are hidden.
Physical database/backup deletion is a separate operational procedure.

Module 5 adds manual call records and a pending-action queue. Call reads reuse
`crm.read` and the timeline's facility, relationship, caller-check and retention
filters. `crm.calls.write` permits logging calls and completing pending actions
with a note and version check. Call notes use timeline correction permissions;
call facts and outcome are immutable. Unknown callers need no contact or patient
registration. Callback attempts retain the original subject and phone. Audit
snapshots redact caller phones and action/completion notes. No dialing, provider
credentials or new clinical access is granted.
