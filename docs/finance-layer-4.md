# Layer 4 — Payroll

Implemented 2026-10-11 for roadmap tasks 4.1–4.10. The user confirmed Afghan
income-tax withholding. No staff attendance module was found; this release
accepts manual monthly absence and overtime totals.

## What is available

| Task | Implementation |
|---|---|
| 4.1 | Facility employee records, English/Dari names, employment dates, monthly basic pay, allowances, overtime rate, AFN currency and department/cost centre. |
| 4.2 | Decimal calculation of basic, allowances, overtime and bonuses. |
| 4.3 | Absence, loan/advance repayments, other deductions and configurable marginal wage tax. Negative net pay is rejected. |
| 4.4 | Loan/advance issue drafts, monthly installments, reserved deductions, posted repayments and remaining principal. The last installment is capped at the remaining balance. |
| 4.5 | Manual attendance totals and notes are stored in the run. Saved adjustments can be loaded for recalculation. |
| 4.6 | One run per facility/Shamsi period: calculated → reviewed → independently approved. Recalculation invalidates review. Payments require approval and a posted accrual. |
| 4.7 | Approval creates one balanced draft: salary expense by centre, wage tax payable, other deductions payable, loan receivable reduction and net salary payable. The accountant posts through the existing journal queue. |
| 4.8 | Partial salary payments debit net payable and credit cash/bank. Drafts reserve the amount; concurrent overpayment is rejected. Posted salary payments can be reversed through Journals. |
| 4.9 | English/Dari payslips with employer, employee, period and pay breakdown; browser printing/PDF saving; payroll history, CSV export and salary-payment status. |
| 4.10 | Each employee has a cost centre. Salary expense is grouped by centre in the journal and displayed in the run report. |

## First use

1. In **Finance → Suppliers & payables**, create the department cost centres.
2. In **Finance → Payroll → Tax settings**, a finance manager saves the tax
   schedule. The Afghan monthly preset is already shown.
3. Add employees and their pay structures. Employees do not need login accounts.
4. Issue loans/advances when needed, then have a different accountant post their
   issue journals before calculating payroll.
5. Select the Shamsi period and accrual date. Enter attendance, bonuses and other
   deductions; calculate and open the run. If correcting an unapproved run,
   load its saved adjustments before changing and recalculating it.
6. Mark the run reviewed. A different administrator or finance manager approves
   it. The preparer cannot approve their own payroll, including administrators.
7. Post the accrual in **Journals**. Its creator remains the payroll preparer,
   so the independent approver can also post it.
8. Create salary payment drafts, then post them through Journals. Export the
   payroll CSV or open an employee payslip and choose English or Dari.

## Calculation policy

- Monthly AFN payroll, at most 500 employees per facility/run. All monetary
  arithmetic uses decimal text and decimal arithmetic, rounded half up to two
  decimal places. Calendar arithmetic alone uses numeric day counts.
- Basic and allowances are prorated by eligible calendar days for joiners and
  leavers. Absence reduces basic pay using the actual Shamsi month's day count;
  allowances remain payable for eligible employment days. Overtime uses the
  employee's explicit hourly rate.
- Taxable gross is basic + allowances + overtime + bonus − absence. Loan and
  other deductions do not reduce the wage-tax base.
- The monthly preset uses 0% through AFN 5,000, 2% on the next AFN 7,500,
  10% on the next AFN 87,500 and 20% above AFN 100,000. Source: Ministry of
  Finance / Afghanistan Revenue Department, *Guide 05 — Wage Withholding Tax*,
  [published guide copy](https://www.acbar.org/upload/145984549848.pdf), checked
  2026-10-10. This is a published historical schedule; the rate editor allows
  the hospital to apply updates. Each calculated run stores its own schedule.
- Other deductions are recorded as a separate liability, not as reduced salary
  expense. Loan repayments reduce staff loan receivables when accrual is posted.
- Calculated drafts do not commit loan repayments. Approval reserves them;
  posting applies them. Earlier approved payroll must be posted before its
  outstanding loan balance can feed a later calculation.

## Controls and scope

- Composite foreign keys keep every employee, cost centre, period, payroll item,
  loan, repayment and payment in one facility. Money dates are UTC timestamptz.
- Payroll writes and rejected commands are audited. Database triggers prevent
  approved source changes, mismatched source journals and salary overpayments.
  Existing journal balance, immutable-posting and separate-poster rules apply.
- A dedicated `payroll_officer` can prepare and read payroll but cannot configure
  tax, approve, post or pay. Accountants can prepare and pay; administrators and
  finance managers can approve/configure. Management has read-only access.
  Payroll officers also have the existing finance read permission for the
  workspace and journal references; they have no finance mutation permissions.
- Unapproved payroll blocks period close. Approval and posting reject closed
  periods. Accruals use the selected payroll period and its Shamsi boundaries.
- Unposted loan and salary-payment drafts can be removed in Journals. Posted
  payments can be reversed. Loans allocated to payroll and approved accruals
  cannot be reversed in this release; a controlled payroll correction workflow
  remains a limitation. Do not approve a run until its employee breakdown has
  been checked. The generic journal reversal cannot invalidate payroll history.
- There is no external attendance connector, bank payment transmission,
  non-cash benefit valuation, treaty exemption handling or statutory filing
  workflow in this layer. Salary payment records are bookkeeping entries.
  Payslips use browser printing; Dari payroll forms beyond payslips are not yet
  fully translated. No real employee data or salary runs were seeded.

## Verification

- 40 existing finance integration tests and 9 payroll integration tests passed
  against the isolated `finance_foundation_test` database.
- 23 shared calendar, money and payroll tests passed, including tax thresholds,
  the official AFN 20,000 example, 29/30/31-day calculations and invalid net pay.
- API and web production builds passed; targeted payroll API/web lint passed.
- The API transactional-audit unit test passed. Browser checks verified the
  local employee form and populated English/Dari payslips in an isolated preview.
  Printing uses a separate document element so hidden workspace content does
  not add blank pages to payslips.
- Local database backup was validated before applying the two payroll migrations:
  `.test-runtime/redmars-before-payroll-20261011.dump`.
- Accountant acceptance on hospital payroll remains pending. Automated tests
  establish implementation behavior, not acceptance of actual salaries or tax
  treatment for individual employees.
