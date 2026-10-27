# REDMARS HMIS — HR Module Build Order

**Scope: the smallest HR module that is genuinely useful at a 24-staff hospital.**

| | |
|---|---|
| Document | HR module build order |
| Audience | AI coding agent working in the REDMARS repository |
| Site | AXON NURA — 24 staff today, 50 planned |
| Position in the roadmap | After Waves 1–3 are live; shipped as weekly releases |
| Duration | 4 weeks (5 if the optional salary sheet is built) |
| Module | `src/modules/staff/` (extends the existing module — no new top-level module) |

---

## 0. Scope decision — read this before writing code

A full HR system is six months of work. Axon has **24 staff**, one administrative and finance manager, and a director who knows every employee personally. Most of what HR software does — recruitment pipelines, competency frameworks, 360° appraisals, self-service portals, org charts — would be built, demonstrated once, and never opened again.

So this module answers five questions and nothing else:

1. **Who works here, and what do we hold on file for them?**
2. **Whose licence, certificate or contract is about to expire?**
3. **Who was present today?**
4. **Who is on leave, and how much do they have left?**
5. **Who is on duty tonight?**

### In scope

| Stage | Capability | Why it earns its place |
|---|---|---|
| 1 | Employee record, documents, user-account lifecycle | Single source of truth for staff; closes the security gap where a leaver keeps a login |
| 2 | Credentials, certificates and expiry reminders | Accreditation requirement, and an expired clinical licence is a real risk |
| 3 | Attendance and leave | The daily administrative pain, and the only HR data anyone asks for weekly |
| 4 | Duty roster | A 24-hour ward needs one; it also feeds on-call escalation later |
| 5 *(optional)* | Monthly salary sheet | Only if the manager asks. Not payroll — a sheet. |

### Explicitly out of scope — do not build these

- **Payroll** with tax tables, loans, advances, bank files, statutory deductions. Stage 5 produces a *sheet*, not a payroll engine.
- **Recruitment** — vacancies, applications, shortlisting, interview scoring. At 24 staff this happens by phone call.
- **Performance appraisal** — weighted scorecards, objectives, review cycles. For a hospital this size it is theatre.
- **Training management** — course catalogue, enrolment, calendar, assessments. Stage 2 records *that* a training was completed and when it expires. That is the accreditation requirement; the rest is not.
- **Employee self-service portal.** Staff ask the manager. Build a read-only "my record" view in Stage 3 instead.
- **Biometric device integration.** Revisit when a device exists. Until then, attendance is marked by a supervisor.
- **Org chart visualisation, succession planning, headcount budgeting, disciplinary workflow engines.**

> If the director asks for one of these, add it to `docs/BACKLOG.md` and say it is a later release. Do not widen a stage that is in progress.

---

## 1. Design decisions (settle these before Stage 1)

| # | Decision | Reasoning |
|---|---|---|
| D1 | `Employee` and `User` are **separate tables**, linked by a nullable `user_id` | Cleaners, guards, kitchen and laundry staff are employees with no login. An employee is a person; a user is an account. |
| D2 | Attendance is a **daily record per employee per shift**, marked by a supervisor — not clock-in/clock-out punches | There is no biometric device. A supervisor marking a department in one screen takes 30 seconds; a punch system that nobody punches produces worse data than paper. |
| D3 | Leave balance is **computed**, never stored as a mutable number | Entitlement minus approved leave in the period. A stored balance drifts and then nobody trusts it. |
| D4 | Expiry reminders use the **existing notification and automation engine**, not a new scheduler | One scheduler in the system, as established in Phase 0. |
| D5 | Salary is a **restricted field**, visible to the director and the administrative/finance manager only; an employee may see their own | Everything else in the employee record is visible to HR-permitted roles. |
| D6 | All HR periods run on the **Jalali calendar** — leave years, attendance months, salary months | Afghan hospital administration runs on Shamsi months. Storing UTC and displaying Jalali, per the Phase 0 calendar service. |
| D7 | Leave entitlements, weekly rest day and public holidays are **configuration**, not code | Confirm the actual figures with the administrative manager; do not hard-code any number from this document. |
| D8 | The employee record is **never deleted** — employees are marked as exited, with a date and reason | Employment history is a legal record. |

**Confirm with the hospital before Stage 3:** annual leave entitlement, sick leave entitlement and whether a medical certificate is required, maternity provision, the weekly rest day, the public holiday list, and whether leave accrues monthly or is granted annually.

---

## 2. Data model

Ten tables. Add them to `schema.prisma` following `CONVENTIONS.md`, with `facility_id` and the standard audit and void columns on every one.

```
employee
  id, facility_id, employee_no, user_id?(unique)
  first_name, father_name, grandfather_name, last_name?
  sex, date_of_birth?, national_id?, photo_url?
  phone, phone_alt?, address_province, address_district, address_village?
  emergency_contact_name, emergency_contact_phone, emergency_contact_relation
  department_id, position_id, reports_to_employee_id?
  employment_type        enum: full_time | part_time | contract | daily_wage | volunteer
  joined_on, contract_start?, contract_end?
  status                 enum: active | on_leave | suspended | exited
  exited_on?, exit_reason?
  base_salary_minor?, salary_currency      -- RESTRICTED FIELD
  notes?

position              -- reference: job titles (psychiatrist, nurse, receptionist, guard, cook …)
  id, facility_id, title_en, title_fa, title_ps, category, is_clinical, is_active

employee_document     -- scanned files on the employee file
  id, employee_id, doc_type (enum: contract | national_id | qualification | licence |
       certificate | photo | police_clearance | other)
  title, file_url, issued_on?, expires_on?, note?

credential            -- anything that expires and matters
  id, employee_id
  credential_type       enum: professional_licence | qualification | mandatory_training |
                              certification | contract
  name, issuing_authority?, reference_no?
  issued_on, expires_on?, document_id?
  status                computed: valid | expiring_soon | expired | not_required
  blocks_clinical_work  boolean      -- true for a professional licence

attendance_day
  id, facility_id, employee_id, work_date (date), shift_type_id?
  status    enum: present | absent | late | half_day | on_leave | holiday | weekly_rest | sick
  minutes_late?, marked_by_user_id, marked_at, note?
  UNIQUE (employee_id, work_date, shift_type_id)

leave_type            -- reference, configurable
  id, facility_id, name_en, name_fa, name_ps
  annual_entitlement_days?, is_paid, requires_document, requires_approval_by_role
  counts_against_balance, is_active

leave_request
  id, facility_id, employee_id, leave_type_id
  from_date, to_date, days_requested, reason?, document_url?
  status    enum: draft | submitted | approved | rejected | cancelled
  requested_by_user_id, decided_by_user_id?, decided_at?, decision_note?
  covering_employee_id?

shift_type            -- reference: morning / evening / night / on-call, with times
  id, facility_id, name_en, name_fa, starts_at, ends_at, crosses_midnight, is_active

roster_entry
  id, facility_id, employee_id, duty_date, shift_type_id, department_id
  role_on_shift?   -- e.g. shift in-charge
  status  enum: planned | confirmed | swapped | absent
  swapped_with_employee_id?, note?
  UNIQUE (employee_id, duty_date, shift_type_id)

salary_sheet / salary_line     -- Stage 5 only, see that stage
```

**Indexes:** `(facility_id, status)` on employee; `(employee_id, work_date)` on attendance; `(facility_id, duty_date)` on roster; `(expires_on)` on credential; `(employee_id, status)` on leave_request.

---

## 3. Permissions

Register these in the permission registry built in Phase 0 (`P0-T14`) and add them to `PERMISSION_MATRIX.md`.

```
hr.employee.view            hr.attendance.view
hr.employee.create          hr.attendance.mark
hr.employee.edit            hr.leave.request
hr.employee.exit            hr.leave.approve
hr.salary.view              hr.roster.view
hr.salary.edit              hr.roster.edit
hr.document.manage          hr.report.view
hr.credential.manage        hr.self.view        -- own record only
```

**Suggested assignment** (confirm with the director):

| Role | Permissions |
|---|---|
| Director / رئیس | all, including salary |
| Administrative & finance manager | all except `hr.employee.exit` approval, including salary |
| Chief physician / سرطبیب | employee.view, credential.manage, roster.*, leave.approve, report.view |
| Nursing manager / مدیر پرستاری | employee.view (nursing only), attendance.mark, roster.edit, leave.approve (nursing) |
| Department heads | attendance.mark and roster.view for their department |
| All other staff | `hr.self.view` and `hr.leave.request` only |

**Scoping rule:** a department head sees only their own department's employees. Enforce it in the service layer, not in the UI.

---

# STAGE 1 — Employee record and account lifecycle

**Week 1 · ~4 days**

## HR-T01 — Schema and reference data

**Do.** Add `employee`, `position` and `employee_document` to the schema. Seed `position` with the real Axon job titles in English and Dari. Seed departments if they are not already present from the Axon configuration seed.

**Acceptance.** Migration reviewed and applied locally; seed produces the real position list; `prisma validate` clean.

## HR-T02 — Employee CRUD service and API

**Do.**
- `POST /api/v1/employees`, `GET /employees` (filter: department, position, status, search), `GET /employees/:id`, `PATCH /employees/:id`, `POST /employees/:id/exit`.
- `employee_no` generated by the shared identifier service with a configurable prefix.
- Salary fields stripped from every response unless the caller holds `hr.salary.view`; reading them writes a sensitive-read audit entry.
- Exit is a status change plus date and reason — never a delete. Exiting an employee **revokes the linked user account in the same transaction**.
- Department-scoped list filtering per the scoping rule above.

**Acceptance.** A user without `hr.salary.view` never receives a salary field in any response — proven by test. Exiting an employee disables their login immediately — proven by test.

## HR-T03 — Document upload on the employee file

**Do.** Upload, list, replace and remove documents against an employee. Store files through the existing file service with signed URLs. Types per the enum. Capture `issued_on` and `expires_on` where relevant — a document with an expiry automatically offers to create a credential record in Stage 2.

**Acceptance.** Documents are not publicly reachable by URL guessing; every download writes an audit entry.

## HR-T04 — User account lifecycle

**Do.**
- From the employee detail screen: "Create user account" — pre-fills name from the employee, asks for role and username, creates the account and links it.
- "Disable account" and "Reset password" actions.
- Exit automatically disables the account (HR-T02).
- An orphan report: user accounts with no employee, and active employees with a clinical position but no account.

**Acceptance.** No route exists to create a clinical user account outside this flow. The orphan report returns correct results on seeded data.

## HR-T05 — Employee screens

**Do.** Build on the Phase 0 templates and components.
- **Employee list** (`ListPage`): photo, name in Dari, employee number, position, department, status chip, joined date. Filter by department, position, status. Search by name and employee number.
- **Employee detail** (`DetailPage`): header with photo, name, position, department, status; tabs — Profile · Documents · Credentials · Attendance · Leave · Roster · Salary. Tabs for stages not yet built show an empty state saying so; the Salary tab is hidden without the permission.
- **New employee form** (`FormPage`): one page, sectioned — identity, contact, emergency contact, employment, salary (permission-gated). No multi-step wizard; it is one form.
- **My record** (`hr.self.view`): read-only view of own profile, documents, credentials and leave balance.

**Acceptance.** Full flow works in Dari RTL. Every string from the i18n catalogue. Salary section absent — not merely hidden by CSS — without the permission.

---

# STAGE 2 — Credentials and expiry reminders

**Week 2 · ~2 days**

> Small stage, high value. This is the accreditation evidence and the licence-expiry safety control.

## HR-T06 — Credential records

**Do.** CRUD for credentials against an employee, optionally linked to an uploaded document. Status computed from `expires_on` against configurable thresholds (default: expiring soon at 90 days). `blocks_clinical_work` marks a professional licence.

**Acceptance.** Status computes correctly at the boundaries — 91, 90, 1, 0 and −1 days.

## HR-T07 — Expiry reminder job

**Do.** A scheduled job on the **existing** automation engine that, each morning, finds credentials expiring in 90 / 60 / 30 days, on the expiry date, and overdue, and notifies: the employee's manager, the administrative manager, and — for a clinical licence — the chief physician. One notification per threshold per credential; never repeat the same threshold twice.

**Acceptance.** Seed credentials at each threshold; run the job twice; confirm each notification fires exactly once.

## HR-T08 — Expiring-credentials view

**Do.**
- A dashboard widget for the administrative manager and chief physician: counts of expired / expiring in 30 / expiring in 90, each clicking through to a filtered list.
- A list screen: employee, credential, type, expiry, days remaining, status chip.
- Export to Excel for accreditation evidence.

**Acceptance.** Widget figures match the list. Export opens correctly with Dari text intact.

> **Do not** build a training calendar, enrolment, trainer assignment or assessment scoring. A completed training is a credential row with an expiry date. That is the whole feature.

---

# STAGE 3 — Attendance and leave

**Week 2–3 · ~5 days**

## HR-T09 — Leave configuration

**Do.** `leave_type` reference management. Seed with the hospital's actual types once confirmed — typically annual, sick, maternity, unpaid, compassionate, and hajj — each with entitlement, paid flag, document requirement and approving role. Also configure the weekly rest day and a Jalali public-holiday calendar.

**Acceptance.** Types and the holiday calendar are editable by the administrative manager with no developer involvement.

## HR-T10 — Leave request and approval

**Do.**
- Request: employee or manager on their behalf; leave type, date range, reason, optional document, covering employee. Days calculated excluding weekly rest days and public holidays.
- Validation: no overlap with an existing approved request; warn (do not block) when the balance is insufficient; block a past-dated request beyond a configurable window.
- Approval inbox for approvers, with approve / reject plus a note.
- Approved leave writes `on_leave` attendance rows for the covered dates automatically.
- Cancellation of an approved future request, with the attendance rows reversed.

**Acceptance.** Overlap is prevented. Approval creates the attendance rows. Cancellation removes them. Day counting is correct across a Jalali month boundary and across a public holiday.

## HR-T11 — Leave balance

**Do.** Computed balance per employee per leave type for the current Jalali leave year: entitlement, taken, approved-but-future, remaining. Never stored.

**Acceptance.** The balance recomputes correctly after approval, rejection and cancellation. Verified by hand against a worked example in the test.

## HR-T12 — Attendance marking

**Do.**
- A **daily attendance grid**: pick date, department and shift; the screen lists the employees rostered or assigned to that department; mark each as present / absent / late / half-day / sick; leave and holiday statuses pre-fill automatically and are read-only.
- Bulk action: "mark all present", then adjust the exceptions. This is how it will actually be used.
- Back-dating allowed within a configurable window, and audited.
- A monthly view per employee: a grid of the Jalali month with status per day.

**Acceptance.** Marking a 24-person department takes fewer than 10 interactions. Leave and holidays pre-fill and cannot be overwritten. Every back-dated change is audited.

## HR-T13 — Attendance and leave reports

**Do.** Three reports, each exportable to Excel:
1. **Monthly attendance summary** per employee — days present, absent, late, leave, sick — for the Jalali month.
2. **Leave balance report** — all employees, all leave types.
3. **Absence report** — who was absent, on which dates, with any pattern flagged (for example, repeated absence adjacent to the weekly rest day).

**Acceptance.** Report totals reconcile with the underlying attendance rows for a seeded month.

---

# STAGE 4 — Duty roster

**Week 3–4 · ~4 days**

## HR-T14 — Shift types and roster entries

**Do.** `shift_type` reference management (morning, evening, night, on-call, with times and midnight-crossing handled). CRUD for roster entries per employee, date, shift and department.

**Acceptance.** A night shift crossing midnight reports its hours correctly and appears on the correct calendar day.

## HR-T15 — Roster screen

**Do.**
- A **weekly grid**: rows are employees of a department, columns are the seven days, cells hold shift assignments. Click to assign, drag or keyboard to move.
- Copy last week's roster as the starting point for the new week — this is the single feature that makes the nursing manager adopt it.
- Publish the roster, which notifies the affected staff.
- Warnings, not blocks: an employee rostered while on approved leave, more than a configured number of consecutive nights, or no staff assigned to a required shift.
- A read-only "who is on duty now" view for the whole hospital, including the on-call clinician.

**Acceptance.** The nursing manager can produce next week's roster for the ward in under 10 minutes starting from a copy. Leave conflicts are flagged visibly.

## HR-T16 — Roster to attendance and escalation

**Do.**
- The attendance grid (HR-T12) pre-loads the rostered staff for the chosen date and shift.
- Expose a `getOnCallFor(department, datetime)` service method for the escalation engine to call, so clinical alerts reach whoever is actually on duty rather than a fixed name.

**Acceptance.** The escalation engine resolves the correct on-call clinician for a night-shift timestamp — proven by test, including the midnight-crossing case.

---

# STAGE 5 *(optional)* — Monthly salary sheet

**Week 4–5 · ~4 days · build only if the administrative manager asks for it**

> This is a **sheet**, not payroll. No tax tables, no loan schedules, no bank file generation, no statutory filing. If those are needed later they are a separate project with the finance manager, not an extension of this stage.

## HR-T17 — Salary sheet generation

**Do.**
```
salary_sheet   id, facility_id, jalali_year, jalali_month, status (draft|approved|paid),
               generated_by, approved_by?, approved_at?, total_minor
salary_line    id, sheet_id, employee_id, base_minor, absence_deduction_minor,
               allowance_minor, other_deduction_minor, advance_minor, net_minor, note?
```
- Generate a draft for a Jalali month: every active employee with their base salary, plus an absence deduction computed from unpaid absence days in that month.
- Manual lines for allowances, other deductions and advances already paid — entered by the manager, not derived.
- `net = base − absence_deduction + allowance − other_deduction − advance`, all in integer minor units through the shared money service.
- Approve the sheet; an approved sheet is locked and any correction is a new adjustment line, never an edit.
- Mark as paid with a date and method.

**Acceptance.** Generated totals match a hand calculation for a seeded month including one employee with three unpaid absences and one with an advance. An approved sheet cannot be edited.

## HR-T18 — Payslip and sheet export

**Do.** A per-employee payslip printable in Dari showing the Jalali month, the lines and the net, with hospital letterhead. The whole sheet exportable to Excel for the finance manager.

**Acceptance.** Payslip prints correctly in Dari RTL with the net amount legible and the Jalali month correct.

---

# Delivery and verification

## Weekly release mapping

| Release | Contents | Who it serves |
|---|---|---|
| Week 1 | Stage 1 — employee records, documents, accounts | Administrative manager |
| Week 2 | Stage 2 — credentials and expiry reminders | Chief physician, accreditation |
| Week 3 | Stage 3 — attendance and leave | Administrative manager, all staff |
| Week 4 | Stage 4 — duty roster | Nursing manager |
| Week 5 | Stage 5 if requested | Administrative manager |

Each release follows the standard process: staging first, backup, Friday-morning window, release note in Dari.

## Module exit verification

| # | Check | Evidence |
|---|---|---|
| 1 | All 24 employees entered with complete records | Count on the list screen |
| 2 | Every clinical employee has a linked user account, every non-clinical one is correctly without | Orphan report empty |
| 3 | Exiting an employee disables the login in the same transaction | Passing test |
| 4 | Salary is invisible in API responses without the permission | Passing test |
| 5 | Every professional licence recorded with its expiry | Credential list |
| 6 | Expiry reminders fire once per threshold | Job run twice, notifications counted |
| 7 | A department of 24 is marked present in under 10 interactions | Timed demonstration |
| 8 | Leave balance matches a hand calculation | Worked example in the test |
| 9 | Day counting correct across holidays and a Jalali month boundary | Passing test |
| 10 | Next week's ward roster produced in under 10 minutes from a copy | Timed with the nursing manager |
| 11 | Escalation resolves the correct on-call clinician at 02:00 | Passing test |
| 12 | Every screen works in Dari RTL, both densities | Kitchen-sink and manual review |
| 13 | Sensitive reads (salary, documents) are audited | Audit query output |

## Guardrails

- Everything in `docs/CONVENTIONS.md` and the Phase 0 hard rules applies unchanged.
- One task per branch, one task per PR, the standard PR template.
- Every migration reviewed line by line by the human before it runs anywhere.
- No new top-level module — this extends `modules/staff/`.
- No new scheduler — reminders use the existing automation engine.
- Every new route carries a permission decorator, or the application will refuse to boot.
- If a stage grows past its day estimate, stop and report rather than absorbing scope silently.
