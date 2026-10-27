# REDMARS HR roadmap assessment

Last updated: 2026-10-27

## Release stability review — 2026-10-27

Account onboarding now rechecks employee eligibility and account ownership inside
the transaction. Exited/suspended employees cannot receive or reactivate a login,
including through the generic Users screen. Employee exit revokes active sessions.
Concurrent practitioner-account creation cannot overwrite an existing account link.
Private employee-document contents, titles, filenames and notes are redacted from
new audit snapshots. Existing audit records have not been rewritten.

The administrator's existing practitioner-account route remains available for
legacy doctor profiles. It does not create an HR employee. The earlier statements
below that all clinical account creation is forced through HR were too broad;
generic user creation blocks clinical roles, while HR onboarding and the legacy
practitioner route are separate supported administrator workflows. Existing
accounts need hospital identity reconciliation before production use.

Technical release results are recorded in `production-readiness-phase-1.md`.
Hospital configuration, staff identity verification and pilot acceptance remain pending.

Source of truth: `docs/REDMARS_HR_MODULE_BUILD_ORDER.md` (byte-identical copy of the user-supplied roadmap). This assessment records implementation state; it does not modify the roadmap.

## Release boundary

HR is implemented inside the existing staff domain and uses the existing facility tenancy, users, roles, permissions, audit trail, Shamsi conversion, number sequences, departments and finance payroll. The HR release does not introduce a competing identity system, scheduler, notification service or payroll ledger.

The operational implementation covers Stages 1–4. Stage 5 uses the existing finance payroll as the hospital's salary engine and remains an explicit integration gate: a second salary-sheet implementation was not created. Linking HR employees to existing payroll employee rows is still required before HR becomes the payroll master-data source.

## Status by roadmap task

| Task | State | Evidence and remaining gate |
|---|---|---|
| HR-T01 schema and references | Built and applied locally | Prisma models cover positions, employees, private documents, credentials/reminder idempotency, attendance, leave, holidays, shifts, roster and in-app HR notifications. The human-reviewed `20261026090000_hr_staff_foundation` migration was applied to the local database on 2026-10-26. Employee numbers use the existing atomic number sequence. |
| HR-T02 employee CRUD and exit | Built | Facility-scoped list/filter/detail/create/edit; salary fields are stripped unless authorized or viewing one's own record; exit is non-destructive and disables the linked user plus active sessions in one transaction. |
| HR-T03 protected documents | Built | PDF/JPEG/PNG uploads are private database objects, limited to 10 MB, permission-checked, audited on download and never exposed by a public URL. Delete is a void operation. Metadata editing and document replacement can be added after pilot feedback. |
| HR-T04 account lifecycle | Built | Account creation, enable/disable, reset and orphan reporting are employee-linked. Generic user creation refuses clinical roles so a clinical account cannot bypass the employee flow. |
| HR-T05 HR workspace | Built | `/hr` includes employee list/create/detail, salary visibility, document upload/download and credential entry. Navigation is module- and role-aware. English, Dari and Pashto navigation labels are present; the workspace's detailed copy is currently English and should receive staff-validated Dari/Pashto wording during UAT. |
| HR-T06 credentials | Built | Credential status is computed with exact 90/60/30/0/overdue boundaries and supports linked evidence plus clinical-block flag. |
| HR-T07 reminders | Core built; scheduling integration pending | Idempotent threshold records and in-app notifications exist, with a permission-protected runner. The foundation has no generic notification/scheduler engine to attach to, so automatic daily invocation is not fabricated inside HR. This is an integration item for the platform automation service. |
| HR-T08 credential dashboard/export | Built | HR UI filters credentials by exact expiry state and exports the visible register as UTF-8 CSV or an Excel-readable workbook. Department/role filters can follow pilot feedback. |
| HR-T09 leave and calendar config | Built | Leave types, configurable weekly rest days, public holidays, backdating window and entitlement settings are editable. No Afghan holiday or Friday assumption is hard-coded. |
| HR-T10 leave workflow | Built | Self/admin request, overlap protection, attachment rule, computed workdays, balance enforcement, approve/reject/cancel and attendance creation/removal are implemented. |
| HR-T11 computed balances | Built | Remaining balance is derived from approved requests for the current Jalali year; no mutable balance counter exists. Carryover policy remains intentionally absent until hospital confirmation. |
| HR-T12 attendance | Built | Daily grid, bulk marking, leave protection, generated rest/holiday rows and audited backdating are implemented. The first release uses one daily row when no shift is specified and supports per-shift rows when supplied. |
| HR-T13 attendance reports | Built | Date-range status/tardiness aggregation is exported from the HR workspace as UTF-8 CSV or an Excel-readable workbook. Printable leave summaries can follow pilot feedback. |
| HR-T14 shift types | Built | Editable shift codes/names/times/colors and automatic midnight-crossing calculation. |
| HR-T15 roster | Built | Assignment, weekly copy, publish/confirm, affected-employee notifications, leave-conflict prevention, consecutive-night warnings, configurable minimum-coverage warnings and weekly date-range view are present. |
| HR-T16 operational integration | Built | `onDuty` handles normal and midnight-crossing shifts in Kabul time; `StaffOperationsService.onDuty` is reusable by IPD/emergency modules. |
| HR-T17 salary sheet | Existing finance payroll retained | Finance already implements payroll employees, monthly runs, adjustments, loans, review/approval, payments and accounting journals. The remaining HR task is a controlled HR-employee-to-payroll-employee link, after the administrative manager confirms HR should become the master. |

## Security and control review

- All HR controllers require the `hr` facility module and exactly one registered permission per route.
- Tenant scope is applied to reads and writes; related departments, positions, employees, shifts and credentials are revalidated inside the actor's facility.
- Employee rows are never deleted. Documents and attendance corrections use void metadata.
- Base salary is an integer minor-unit field in AFN and is omitted from ordinary employee responses.
- Generic clinical account creation uses the employee record; legacy doctor profiles also have an administrator-only practitioner-account route, as described above.
- The migration grants least-privilege permissions to existing roles. The current role catalog has no separate chief physician, nursing manager or department-head roles; these require an RBAC design decision rather than silently mapping them to broad admin access.

## Acceptance gates still requiring hospital participation

1. Configure Axon's real positions, leave types, weekly rest days, public holidays and shifts. No hospital master data or test fixtures were inserted.
2. Import and verify the 24 real employee records, including duplicate/identity checks and confidential-file access.
3. Run the roadmap's two-week supervisor attendance pilot and clinical on-duty handoff checks.
4. Validate Dari/Pashto wording with hospital staff and complete UAT/sign-off.
5. Connect the idempotent reminder runner to the platform scheduler/notification engine when that shared foundation exists.
6. Decide whether HR is the payroll master and, if approved, add the explicit employee-to-payroll link rather than duplicate salary records.

## Verification completed

- Prisma schema validates.
- Prisma Client generates successfully.
- Shared contracts build.
- API production build passes.
- Web TypeScript and production Vite build pass.
- HR rule tests pass for credential thresholds and configurable rest-day/holiday leave counting.
- A pre-migration local backup was created at `backups/redmars-20261026-014251.sql.gz`.
- Migration 47 (`20261026090000_hr_staff_foundation`) applied successfully.
- Live database verification found all 12 HR tables, all 16 HR permissions and the enabled AXON HR module.
- Live HTTP checks passed for API health, the `/hr` browser route and unauthenticated protection of `/employees`.
- Migration verification confirmed no employee or HR master data was inserted.
