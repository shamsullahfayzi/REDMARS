# Layer 1 implementation and acceptance plan

Prepared 2026-09-27 for the request to implement tasks 1.1–1.12.
This records the reviewed scope; it does not mark implementation or acceptance complete.

## Prerequisites and decisions

The current implementation has been reviewed against both supplied finance
references and the roadmap assessment. Existing account IDs, journal numbers,
posted amounts, source links, reconciliation records and hospital data must survive
the changes.

The project instructions require confirmation of the Axon clinical pilot before
Layer 1 implementation. Its status is unconfirmed. The user has been asked to
confirm completion or explicitly authorize proceeding before the pilot.

Two policy decisions are also pending:

- Extend the current hospital chart, or import an accountant-approved chart.
- Keep posting with managers/admins, or also grant accountants posting authority.

The feature specification requests different preparers and approvers. Current
permissions explicitly allow an authorized user to post their own draft. Resolve
that policy before implementing posting authorization, including how it applies
to entries generated from clinical activity.

No opening-balance workbook has been supplied. An importer can be implemented
and tested with isolated fixtures, but real balances and accountant acceptance
require the source books.

## Work and verification by roadmap task

| Task | Implementation | Acceptance evidence |
|---|---|---|
| 1.1 | Add account parents, debit/credit normal balance and a distinction between group and posting accounts. Keep parent links inside one facility. | Valid hierarchy loads; cycles, foreign parents and journals against group accounts fail. Contra accounts retain their explicit normal balance. |
| 1.2 | Adopt the selected chart while preserving existing account IDs and system mappings. Preview any imported structure and validation errors before applying it. | Repeating setup/import does not duplicate accounts. Existing balances and source mappings remain intact. Accountant reviews the resulting structure. |
| 1.3 | Add currency, AFN conversion rate and AFN base debit/credit to journal lines. Backfill existing AFN lines at rate 1 with identical amounts. | Decimal rounding, finite positive rates and currency/base consistency are enforced in both service and database. Existing posted amounts remain unchanged. |
| 1.4 | Extend existing posting checks to AFN base amounts. Preserve positive balanced totals, valid accounts and open-period checks. | API and direct database attempts to post unbalanced entries fail, including rounding edge cases and concurrent writes. |
| 1.5 | Preserve versioned draft editing and posted immutability. Persist rejected API mutation attempts outside the rolled-back business transaction. | Posted header/line edit and delete attempts fail; the original stays unchanged and the rejected attempt remains attributable in audit history. |
| 1.6 | Preserve linked opposite entries and exact original monetary metadata. Route reversals through review and recheck dependencies at posting time. | Original plus posted reverse net to zero; pending reversals do not remove the original from reports. Duplicate reversal and invalid supplier dependencies fail. |
| 1.7 | Extend the existing manual journal screen with account hierarchy, line metadata, validation and the agreed posting authority. | Authorized users prepare, edit, review and post an adjusting entry. Unauthorized posting fails. |
| 1.8 | Replace the 2,000-line cutoff with pagination and complete-range totals. Compute each page's running balance from all preceding posted lines. | A ledger larger than 2,000 lines has no omissions or duplicates and has the same closing balance on every page. Date and facility filters remain exact. |
| 1.9 | Derive trial balance from posted AFN base amounts. Keep Shamsi date selection and account hierarchy without double counting group totals. | Drafts are excluded; closing debit and credit totals agree; facility and as-of boundaries are tested. Accountant reconciles against real books. |
| 1.10 | Protect finance audit records against modification/deletion and expose actor, time, source and before/after history. Define coverage for direct database writes. | Successful changes and rejected application mutations have durable history. Attempts to alter protected audit records fail. Rollback behavior is explicitly tested. |
| 1.11 | Retain generated entries as drafts; add a paginated review queue. Apply agreed approval rules and preserve idempotent source consumption. | Sync, expenses, bills and payments wait for review. Repeated generation creates no duplicates. Pending payments reserve amounts without being counted as posted payments. |
| 1.12 | Add opening-balance import with a template, validation preview, source identity and reviewed draft creation at the cutover date. Permit control-account openings only through this explicit workflow. | Unknown accounts, invalid amounts, unbalanced totals and duplicate imports are rejected. A verified source workbook reconciles to the posted opening trial balance. |

## Dependencies that must change together

### Generated drafts and supplier balances

Changing `automatic()` to return a draft affects existing supplier workflows.
An unposted bill must not be payable. Pending payments reserve amounts to prevent
duplicate payments, while paid totals include only posted settlements. Posting
must recheck the available amount within the transaction. A pending reversal
must not count as a completed reversal. These rules need concurrency tests.

Clinical integration receipts and generated drafts must be committed together.
Deleting or cancelling a generated draft must not silently discard a consumed
clinical event. Editing source amounts requires a defined correction workflow.

### Audit failures and transaction rollback

An audit insert inside a failed transaction is rolled back too. Rejected
application attempts therefore need a separate durable write, with sanitized
attempt details and facility checks. Direct SQL failures require a separate
database logging mechanism; a trigger cannot retain an ordinary audit-table
insert after its transaction aborts. Document and verify those boundaries.

### Reporting and reconciliation

General ledger pagination must retain full-range opening and closing balances.
Cash reconciliation must also be able to find older eligible entries after the
current 2,000-line limit is removed. Trial balance, reporting and reconciliation
must all use the same AFN base amounts.

## Delivery and validation order

1. Resolve the pilot prerequisite and accounting policies.
2. Implement account hierarchy, chart adoption and line monetary fields.
3. Extend database guards, lifecycle, reversals and audit history.
4. Update generated drafts, supplier calculations, review queue and permissions together.
5. Complete manual entry, full ledger and trial balance screens.
6. Implement and verify opening-balance import using isolated test data.
7. Run migration preservation checks and finance regression tests in isolated databases.
8. Back up the local application database before applying a verified migration.
9. Start the updated app for user testing; reconcile actual opening books with the accountant.

Use the existing isolated finance test databases. Never run fixture cleanup,
reset or seed routines against the hospital database. Migration verification must
include posted journals, closed legacy periods and finalized bank statements.

After Layer 1, stop for accountant use and acceptance as required by the roadmap.
Do not mark tasks 1.9 or 1.12 accepted on real data based only on synthetic tests.
