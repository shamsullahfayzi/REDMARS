# Production readiness — Phase 6: financial verification and acceptance

Date: 2026-10-27. Branch: `redmars-v2`. **Overall: NOT READY.**

Inspected the finance build order, feature specification, assessment, layer notes,
current services/controllers, HR integration assessment, and existing finance tests.
Reference documents remain unchanged. No finance application logic or schema was
changed in this phase; only verification tests and assessment/acceptance records.

## Results

| Task | Status | Evidence / Required Action |
|---|---|---|
| 6.1 Chart of accounts support | Verified | Existing hierarchical typed accounts, normal balances, posting/group rules and facility ownership pass tests. Hospital chart adoption still needs the accountant's account list and mappings. |
| 6.1 General opening-balance support | Verified | CSV validation, exact balancing, cutover-date entry, provenance, duplicate protection and independent posting are tested. This is a GL import, not complete opening-subledger migration. |
| Opening patient/panel receivables | Blocked | User confirms unpaid invoices must carry forward. No opening-invoice allocation/legacy-receipt workflow exists. Implement and verify that workflow before production cutover; the user confirms the required clinical-pilot status is not yet confirmed. |
| 6.2 Suppliers and payables | Verified | Supplier terms/opening invoices, AP aging/control comparison, partial multi-bill payments, concurrency, reversal order and procurement source trace pass tests. |
| 6.2 Operational patient/panel receivables | Verified | Post-cutover charges, payments, discounts, refunds, panel transfers/remittances, historical aging and control comparisons pass. Legacy opening AR is separately blocked above. |
| 6.3 Cash/bank accounting | Verified | Till counts/approval, deposits, transfers, statement matching/finalization, duplicate matching and backdating controls pass. |
| 6.3 Payroll accounting | Verified | Calculation, manual adjustments, independent review/approval, loans, salary accrual/payment, control balances and reversal guards pass. HR-to-payroll employee linking and automatic attendance feed remain unavailable; the current supported route is manual finance payroll. |
| 6.3 Asset accounting | Verified | Cash/bill capitalization, allocation limits, straight-line depreciation, catch-up, disposal, reversals and source guards pass. Real asset setup and historical balances are not accepted. |
| 6.4 Generic financial reports and Excel | Verified | Accrual/cash views, balance sheet, cash flow, department totals, custom layouts, access grants, year-end carry-forward and genuine Excel output pass technical tests. |
| 6.4 Official report formats and PDF/printing acceptance | Blocked | Need accountant-approved statutory/donor/tax layouts and mappings. PDF uses browser Print/Save as PDF; no saved PDF or real printer output was verified in this phase. |
| 6.4 Cutover-date safeguards | Verified | Date persists after setup; resetting it and pre-cutover journals are refused. Failed legacy receipts remain pending rather than being silently consumed. |
| 6.5 Trial balance and related accounts | Verified | Exact debit/credit equality, posted-only reports, AP/AR/salary control checks, finalized cash statements, close/lock/reopen and year-end controls pass on synthetic fixtures. The new negative test proves that a balanced TB does not establish allocated opening AR. |
| 6.6 Actual financial data requirements | Completed | Required schedules are listed below. No real data supplied or imported. |
| 6.7 Accountant verification and formal acceptance | Blocked | Accountant/approver and cutover date are pending, confirmed by the user. Require reconciled real figures and explicit accountant acceptance when available. |
| Real hospital configuration / VPS deployment | Postponed | Phases 5 and 2 remain deferred by the user. No live deployment or real configuration performed. |

## Verification evidence

- Fresh disposable database: `redmars_finance_acceptance_test`, local test
  PostgreSQL port 5434. All 51 migrations applied; schema drift check passed.
- **70 integration tests across eight finance suites passed**: 67 existing cases
  plus three cutover cases. The final extended cutover case was rerun separately.
- **41 shared tests passed**, including calendar, decimal, payroll and depreciation
  calculations. Full API/shared/web builds passed in the immediately preceding
  Phase 4 run; no application logic changed afterward.
- New cutover evidence verifies immutable setup/backdate rejection, unallocated
  opening AR despite a balanced TB, and rejection of receipts on older invoices.
  The latter also leaves later events pending because synchronization stops on
  the first failure. These passing safety tests document an unresolved workflow
  limitation; they do not mean legacy-AR migration is implemented.
- An initial extended test expected two failure objects; inspection showed the
  existing worker stops on its first failure. The assertion was corrected to
  verify one failure, two pending events, zero receipts and zero generated entries.
- Local evidence: `.test-runtime/phase6-logs/`. Fixtures and credentials are ignored.
  No test transactions were added to development, the clean Axon rehearsal, or a VPS.

## Required from Axon before real financial acceptance

1. **Responsible accountant and cutover:** named preparer/reviewer/approver,
   agreed cutover day in Shamsi and Gregorian, last old-system closing date, and
   rules for receipts, adjustments and refunds crossing that boundary. Both the
   approver and date are currently pending. Confirm clinical-pilot status before
   extending the Layer 1 opening workflow.
2. **Chart and trial balance:** approved account codes, names, hierarchy, types,
   normal balances, department mappings, and a signed closing trial balance in
   AFN with debit/credit columns. Identify which controls are populated through
   detailed schedules to prevent duplicate imports.
3. **Patient/panel AR:** each unpaid original invoice reference, patient/panel
   identifier, issue/due date, original amount, credits/receipts, remaining balance
   at cutover, and subsequent receipts/refunds. Reconcile both control totals and
   the complete invoice allocation; aggregate GL openings alone are insufficient.
4. **Supplier AP:** supplier identifiers/terms and each unpaid bill's reference,
   dates, amount, credits/payments and remaining balance. Separate opening AP
   invoices from general opening CSV rows to avoid double counting.
5. **Cash/banks:** account and till/custodian mappings, counted cash, bank statements,
   opening/closing balances, outstanding deposits/cheques and other reconciling items.
6. **Payroll:** approved HR/payroll employee crosswalk, pay terms, department,
   absence/overtime adjustments, approved tax/deduction policy, outstanding loans,
   unpaid salaries and deduction liabilities. Confirm manual payroll operation
   until the separate HR integration gate is satisfied.
7. **Assets and other balances:** approved cost, accumulated depreciation, NBV,
   acquisition/start dates, residual value, useful life, location/department and
   source bill, plus supporting schedules for other material balance-sheet accounts.
8. **Reports and acceptance:** required P&L/balance-sheet/cash-flow layouts and
   exact regulatory/donor/tax forms, approved mappings and rounding conventions,
   reconciled trial balance/subledgers/bank statements, and written accountant
   sign-off identifying the date, report versions and any unresolved differences.

Do not import real records until the user explicitly approves the import. Phase 5
master data remains postponed. Do not create guessed balances, bypass failed
receivable reconciliation, skip failed accounting events, or accept the reports
on behalf of the accountant. Financial production acceptance remains blocked.
