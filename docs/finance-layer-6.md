# Layer 6 — statements, consolidation and closing

Implemented 2026-10-13 against the two user-designated finance references.

## Capabilities

| Task | Available workflow |
|---|---|
| 6.1 | Accrual P&L by Shamsi month, year or custom dates; posted entries only. Year-end transfer entries are excluded from operating results. |
| 6.2 | Balance sheet through the selected Kabul day, including unclosed earnings and a balance difference check. |
| 6.3 | Direct cash-flow statement: operating, investing, financing, opening imports, and visibly unclassified movements. |
| 6.4 | Cash P&L, external receipts/payments and per-account cash position from the same ledger. Supplier payments trace their bills, salaries trace payroll, and asset proceeds are investing flows. |
| 6.5 | Department P&L, with unassigned entries shown separately. |
| 6.6 | Authorized facility roll-up. Each source administrator grants a named eligible viewer access; every request rechecks grants, role and module availability. No journals cross facilities. |
| 6.7 | Month-end checklist, close, lock and logged reopen with reasons and immutable history. Adjustments use the existing independently reviewed journal workflow. |
| 6.8 | Year-end preparation, independent posting/finalization, retained-earnings transfer, twelve locked months and creation of the next Shamsi year. Balances carry forward cumulatively without duplicate opening entries. |
| 6.9 | Versioned report layouts with named rows, accounts, department filters, movement/closing/debit/credit measures and debit/credit signs. |
| 6.10 | Management totals, genuine OpenXML Excel exports, print layouts for browser Save as PDF, and a read-only auditor role. |

Open **Finance → Financial reports**. General ledger and trial balance remain
available in their own tab. Accounts & periods links to the close checklist.

## Closing controls

Closing requires an ended month, no draft journals, approved payroll and submitted
till counts, no pending hospital billing events, a balanced trial balance, cash
statements finalized through month end, AP/AR/salary control reconciliation, and
posted depreciation. Reopening does not unlock finalized bank reconciliations.
Prepared year-end records freeze journal writes, including direct database writes.
An unposted preparation can be cancelled with a reason. A finalized year cannot
be reopened through this workflow. Posted year-end journals cannot be reversed.

## Report interpretation and setup still needed

- Group reports add authorized books **without inter-facility eliminations**.
  No real access grants were created. Facility/viewer choices remain unconfirmed.
- The hospital has not supplied the exact regulatory, donor or tax forms.
  The configurable builder is available; no official filing format is claimed.
- Cash classifications are versioned, reconciled to journal cash, and audited.
  Mixed cash journals and movements without a reliable source allocation are
  explicitly flagged. Review these before relying on cash P&L. Corrections to
  classifications in closed periods require a logged reopen.
- Department filtering affects accrual P&L; cash and balance-sheet reports cover
  the selected facility. Exports state the scope and retain report warnings.
- Excel money cells contain exact decimal text to preserve amounts beyond Excel's
  numeric precision and avoid formula injection. PDF uses the browser's print
  dialog and Save as PDF; it is not a server-generated PDF download.
- Accountant acceptance on real hospital balances remains pending. Neither the
  clinical pilot nor a regulatory filing has been inferred from automated tests.

## Verification

- 67 finance integration tests passed across seven suites. The existing large
  ledger test timed out in the concurrent build run and passed when rerun alone.
- Nine new integration tests cover statement arithmetic, drafts, partial AP,
  cash transfers, mixed cash/reversal classification, disposal proceeds, custom
  layouts, grant revocation, auditor permissions, reconciliation, audited reopening,
  year-end review, immutable preparation and carry-forward.
- All 25 shared tests and the transactional audit unit test passed.
- API and web production builds and targeted lint passed.
- An independent OpenXML reader loaded all eight sheets from the exported workbook.
- Browser verification showed populated P&L and balance-sheet totals, finalized
  year status, and immutable close/lock/reopen history. The in-app preview tab
  suspended during export verification, so a saved PDF file was not visually
  verified; browser Save as PDF remains an acceptance check.
- All synthetic transactions and browser test accounts use
  `finance_foundation_test`; none were added to the hospital database.
- Before applying the two Layer 6 migrations to `redmars`, a validated backup was
  saved as `.test-runtime/redmars-before-statements-20261013.dump` (394,432 bytes).

The original reference documents remain unchanged.
