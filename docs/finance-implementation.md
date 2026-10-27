# AXON finance and accounting

Status: initial AFN release implemented; verification results are recorded below.
This document is not a production sign-off.

The hospital requested an internal accounting module on 2026-09-20. This extends
the original build plan, which assumed an external general ledger. Finance stays
within the modular monolith and consumes the existing audited billing events.

## Initial release scope

- AFN base currency; every entry carries a currency. Never combine currencies.
- Chart of accounts: assets, liabilities, equity, revenue and expenses.
- Accounting periods, draft journals, posting, numbered entries and reversals.
- General ledger, trial balance, income statement and balance sheet.
- Hospital invoice, collection and refund integration with visible reconciliation.
- Expense vouchers, supplier bills and supplier payments.
- Cash/bank accounts and statement reconciliation.
- Dedicated finance permissions, audit records and isolated regression tests.

Payroll calculation, inventory valuation, fixed-asset depreciation, tax filing,
foreign-exchange revaluation and historical-data import require separate scopes.
HR/payroll and IPD will post through the same accounting boundary when implemented.

## Accounting controls

Amounts use decimal arithmetic, with exactly two decimal places. Posting requires
at least two lines, positive amounts on one side per line, matching total debits
and credits, active accounts belonging to the same facility, and an open period.
Posted journals and lines cannot be edited or deleted; corrections are separate
reversal journals. Closed periods reject new postings. System control accounts
cannot be used to bypass invoice or supplier subledgers through manual journals.

Hospital invoices establish receivables and revenue. Positive payment rows settle
receivables against the mapped collection account; negative rows reverse that
settlement. A change to the original payment's reversal flag is not another cash
movement. Cancellation or discount changes adjust invoice recognition separately.
Posting is idempotent by source event. Failed or unsupported events remain visible
for reconciliation, rather than being silently acknowledged.

Setup needs an accountant to approve the chart, opening balances, cutover date,
period calendar, non-cash payment mappings and approval responsibilities. Software
tests do not replace their reconciliation of the actual hospital books.

## Delivery sequence

1. Ledger schemas, database constraints, contracts and posting tests.
2. Finance roles, APIs and working account/journal/period/report screens.
3. Billing integration and exception reporting.
4. Expenses, suppliers/payables and cash/bank reconciliation.
5. Full regression, local walkthrough and operating guide.

## Using the module

1. An administrator enables **Finance & accounting** in Modules. Sign in again
   to refresh the menu. Assign `accountant` or `finance_manager` through Users.
2. Open Finance and initialize its chart with the agreed cutover date. Initialization
   is permanent. Existing hospital transactions before that date are excluded;
   later activity on pre-cutover invoices is held for an opening-receivables review.
3. Create non-overlapping accounting periods using explicit Gregorian dates.
   Enter approved opening balances as a manual draft, then post them. The default
   chart is a starting template, not a representation of actual opening balances.
4. Use Journals for drafts and adjustments. Accountants can prepare drafts; managers
   post them. System control accounts are populated through their source workflows.
   Posted journals remain intact; the reversal action creates an opposite entry.
5. Use Expenses for a paid expense, and Suppliers & payables for an unpaid bill.
   Partial supplier payments cannot exceed the remaining balance. Reverse supplier
   payments before reversing their bill; both corrections remain visible.
6. Use **Process hospital activity** to post up to 100 pending updates per batch.
   Repeat while updates remain. This is an explicit batch operation, not a scheduled
   background worker. Financial reports show only posted entries. Resolve failures
   before closing the affected period; a failed event is never silently discarded.
7. Enter a cash/bank statement with its real opening balance, closing balance and
   signed movements. Deposits are positive and withdrawals negative. Match each
   line to the same ledger account and amount. A ledger line can be matched once.
   Finalization checks the statement against matched books, preserving outstanding
   book items. It prevents backdated postings into that reconciled date range.
8. Review trial balance, period profit/loss, balance sheet and individual account
   ledgers. Balance sheet profit includes unclosed cumulative results; period
   closing does not generate a year-end retained-earnings transfer automatically.
9. Close a period only after resolving draft journals and pending billing activity.
   Closed periods cannot be reopened in this release. Enter subsequent corrections
   in the next open period with a traceable description.

## Collection mappings

| Billing method | Debit for a positive receipt | Credit |
|---|---|---|
| Cash | Cash on hand | Patient receivables |
| Bank transfer | Bank account | Patient receivables |
| Card | Card clearing | Patient receivables |
| Mobile money | Mobile money | Patient receivables |
| Panel | Panel receivables | Patient receivables |
| Waiver | Patient waivers expense | Patient receivables |

Refunds invert these entries. Panel and waiver methods are not cash receipts.
Actual panel remittance/insurance-claim workflows are outside this release. Card
clearing can be transferred into a bank account with a reviewed manual journal.
Invoice recognition is posted as net hospital service revenue and patient
receivables. Department-level revenue allocation is a later enhancement.

## Current operating limits

- AFN only. Foreign-currency events stay pending with an explicit error; there is
  no invented exchange rate, FX revaluation or combined-currency total.
- Opening patient/payable subledgers and legacy history import need a separate
  reconciliation procedure. Manual control-account postings are deliberately refused.
- The screen shows 100 recent journals with drafts first. An account ledger is
  limited to 2,000 displayed lines and explicitly requests a narrower date range
  when truncated. Cash/bank matching shares this display limit.
- The new finance forms are in English; navigation/role names also have Dari and
  Pashto labels. Full translation review remains separate acceptance work.
- These reports are operational accounting reports, not certified statutory or
  tax submissions. Payroll, fixed assets, inventory valuation, cash-flow statement
  classification and mandatory two-person approval remain separate scopes.
- The invoice-line payment-allocation ledger identified in the foundation guide
  remains prerequisite work for future IPD deposits and split settlement. Finance
  posts invoice/payment source totals; it does not repair that clinical billing gap.

## Verification — 21 September 2026

- PostgreSQL 16: all 20 migrations applied to the isolated test database. The two
  finance migrations were then applied to the local development database after
  saving a backup at `.test-runtime/redmars-before-finance.dump`.
- Full API regression: 59 suites, 816 tests passed. After two additional finance
  cases were added, the focused finance suite passed all 12 tests. Coverage includes
  balanced posting, immutability, idempotency, permissions, facility boundaries,
  duplicate references, supplier overpayment races, billing/refund integration,
  currency rejection, bank reconciliation and period closure.
- The transactional audit unit test, shared build, API TypeScript build, finance
  ESLint checks and web production build passed. The web build retains the existing
  large JavaScript bundle warning.
- Browser walkthrough against the isolated test database: created and posted a
  1,000 AFN test opening journal and a 125 AFN test expense. Reports showed 875 AFN
  cash, 125 AFN expenses, balanced 1,125 AFN debit/credit movement and a zero balance
  sheet difference. All seven finance sections rendered, with report layout checked
  visually. These sample entries were not written to the hospital database.
- Local application: Finance enabled, updated roles seeded, API health/database,
  administrator authentication and browser access verified. Initialization and the
  permanent cutover date remain pending the hospital/accountant's choice. No real
  opening balances or historical subledger imports were entered.

The development app runs at `http://127.0.0.1:5173/finance`, with its API on port
3000 and PostgreSQL in Docker on local port 5433. PostgreSQL is containerized;
the API and web development server currently run as local Node processes.
