# Layer 3 — Expenses and accounts payable

Implemented 2026-10-05 against tasks 3.1–3.7 in the user's build order.
The user confirmed that PO and goods-received records currently come from Excel or paper.

## What is available

| Task | Implementation |
|---|---|
| 3.1 | Facility-scoped supplier master with contact details, payment terms, active status, audited edits and opening invoices. Opening invoices debit opening equity and credit supplier AP at the cutover date. |
| 3.2 | Paid expenses debit an expense account and credit cash/bank. Unpaid expenses create supplier bills. All entries remain drafts for a different accountant to review. |
| 3.3 | Supplier bills debit expense or non-cash asset accounts and credit AP. Due dates can default from supplier terms. Inventory and equipment purchases can be recorded without treating them as expenses. |
| 3.4 | As-of AP subsidiary ledger, supplier statements, current/1–30/31–60/61–90/over-90 aging, CSV exports, and comparison with the facility's posted AP control account. |
| 3.5 | One payment can allocate partial amounts to up to 50 bills for one supplier. Draft allocations reserve balances; posting clears AP. Bill locks and database posting checks prevent concurrent overpayment. |
| 3.6 | Excel CSV or manual paper receipt intake preserves PO, GRN, supplier, received date, quantities, costs and categories. A receipt generates one supplier bill without retyping its lines. Journal source details show PO → GRN → bill and payment allocations. |
| 3.7 | Expense categories map to COA accounts and optional department/cost centres. Cost centres are stored on journal lines, validated within the facility, displayed on journal details and preserved on reversals. |

## Where to test

Open **Finance → Suppliers & payables**:

1. **Supplier records:** add a supplier and terms. Select a supplier to edit its details.
2. **Expense mapping & cost centres:** add the hospital's real departments and category mappings. Only finance managers/admins configure mappings.
3. **Bills & payments:** prepare a supplier bill, then have another accountant post it in Journals. Select the supplier and allocate a payment across its posted bills. Post the payment with another accountant.
4. **AP aging & statements:** choose a Shamsi as-of date. A payment changes the balance only after posting. Earlier dates retain the historical balance. Export aging or a supplier statement to CSV.
5. **Purchase receipts:** download the empty CSV template and save Excel data using the exact headers `sourceLineId,description,quantity,unitCost,category`. Review imported rows, complete the supplier/PO/GRN/date, and save. Paper records use the same form. Choose the receipt to generate its bill.
6. **Expenses:** record paid expenses or switch to unpaid supplier bills. Select a mapped category or an explicit expense/asset account.

No real suppliers, opening amounts, departments or purchase receipts were invented or loaded.
Real-book reconciliation and accountant acceptance remain pending.

## Accounting and correction rules

- AFN amounts remain decimal strings. Receipt quantity × unit cost rounds half-up to two decimals per line; the bill total is the sum of those rounded lines.
- AP aging measures elapsed Kabul calendar days after the due date. Due today is current. Dates are shown in Shamsi and stored as UTC timestamps.
- Draft bills do not create posted AP. Draft payments reserve allocations but do not reduce AP. Aging and statements use posting dates and include reversals only as of their effective dates.
- The control comparison covers all suppliers even when a supplier filter is selected. A difference exposes unallocated AP, including a general opening CSV that has no supplier allocation.
- Opening supplier invoices create AP themselves. Exclude those AP amounts and their opening-equity offsets from a general opening CSV to avoid double counting. Each supplier invoice reference is unique for that supplier.
- In Journals, remove an incorrect unposted expense, opening import, supplier bill or supplier payment and enter its replacement. Removing a draft payment releases its reservations. Removing a draft procurement bill releases its receipt for billing again.
- Unbilled goods receipts may be removed and re-entered. Audit history remains append-only. Posted sources cannot be removed; corrections use reviewed reversal journals. Reverse supplier payments before reversing their bill.
- A posted procurement bill continues to occupy its receipt even after reversal, preventing accidental reuse of the same goods. Enter a clearly referenced correcting bill after the reversal when needed.
- Finance consumes received-goods records; it does not approve purchase orders or update warehouse stock. An automated connection to a future procurement module is outside this Excel/paper handoff. One receipt maps to one bill; split deliveries use distinct GRNs.
- This layer stores cost centres. Department P&L, fixed-asset registers and depreciation remain in their later roadmap layers.

## Verification

- All **40 finance integration tests** pass across four suites on `finance_foundation_test`.
- New tests cover terms/opening balances, expense and inventory mapping, cost-centre reversals, partial multi-bill payments, historical cutoffs, aging boundaries, concurrent allocations, cross-facility restrictions, role/module permissions, raw SQL tampering, CSV validation, receipt rounding/deduplication, transactional rollback and audited draft cancellation.
- Shared calendar/money tests: **18 passed**. API unit test: **1 passed**.
- API and production web builds pass; targeted API lint passes. Supplier/AP, bill/payment and purchase-receipt screens were inspected in the signed-in local browser without entering financial records.
- The local database was backed up before migration: `.test-runtime/redmars-before-layer3-20261004.dump`. Migrations were applied to the isolated database and then the local ERP database. No production/test database reset was used.

Key implementation files: `finance-payables.service.ts`, `finance-payables.controller.ts`,
`financePayables.ts`, `FinancePayables.tsx`, and `finance-payables.e2e-spec.ts`.
