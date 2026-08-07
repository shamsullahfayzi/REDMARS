# REDMARS HMIS — Roles & Permissions Matrix (v1, OPD)

> **Status:** draft for review with Farhat / AXON staff.
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

## 5. Clinical record

> This is the confidentiality core. Farhat is a **psychiatric hospital** — a leaked diagnosis
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

1. **Who verifies lab results?** Right now the same tech enters and verifies. Real labs separate these (tech enters, senior verifies). Does Farhat have a lab supervisor? If yes → new role `lab_supervisor`.
2. **Is the receptionist also the cashier?** The workflow doc implies yes. Confirmed → keep merged.
3. **Do nurses assist in consultations?** If yes, R7 needs loosening.
4. **Is Dr. Hafizullah `admin` or `management`?** He'll want to see everything — but as CEO he probably shouldn't be the one creating users at 2am. Consider giving him both roles, and note that `clinical_note.read` is denied to admin (R2) but he *is* a psychiatrist, so he'd hold `doctor` too.
5. **Do panels/insurance exist at Farhat?** If not, drop the Panel table from v1.
6. **Discount ceiling — is 10% right?** Should there be a per-day total cap per user?
7. **Emergency access ("break glass")?** If a patient arrives unconscious and the treating doctor isn't the assigned one — should any doctor be able to force access with a written reason, heavily logged? Standard in hospitals. Recommended.

---

## Implementation note

These rows map 1:1 to the `Permission` table (`resource` + `action`). Seed them; wire them to `Role` via `RolePermission`; enforce with a **NestJS guard**.

**Enforce on the backend, always.** Hiding a button in React is a courtesy, not a control.
