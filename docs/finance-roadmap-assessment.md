# Finance roadmap assessment

Initial review: 2026-09-26. Latest update: 2026-10-27.

## Production-readiness review — 2026-10-27

Phase 6 inspected the current implementation and reran the seven existing finance
suites plus three cutover checks in a separate disposable database. See
[Phase 6 evidence and acceptance dependencies](production-readiness-phase-6.md).
The original layer tables below remain a historical baseline, not a current gap list.

**Opening receivables are a confirmed production blocker.** The user confirmed on
2026-10-27 that unpaid patient/panel invoices must carry forward. General opening
CSV journals can populate AR controls but cannot allocate them to individual
invoices. The trial balance can balance while the AR comparison differs, and
period close correctly refuses that state. A receipt on a pre-cutover invoice
remains a failed pending event; synchronization stops before later events.
Do not treat a general opening journal as a complete receivable migration.

The accountant/financial approver and cutover date remain **pending**, as confirmed
by the user. No real balances or configuration were imported or approved. A
controlled legacy-AR migration/receipt workflow is still required before accepting
the production cutover. Clinical-pilot status has been requested under the Layer 1
prerequisite; the user confirmed its status is **not yet confirmed**. This
verification does not establish pilot completion or authorize bypassing the gate.

HR now exists, superseding the older payroll notes below. Finance payroll remains
the single salary engine, with manual attendance adjustments. The HR-to-payroll
employee link is still an integration gate, as documented in the HR assessment.
No second payroll system or automatic HR integration was introduced.

Generic reporting, Excel export and configurable layouts exist. Official report
formats, hospital-specific mappings, actual printing, and accountant acceptance
remain unverified. These are not established by synthetic regression tests.

## Current implementation update

Tasks **6.1–6.10** now have implemented workflows; see
[Layer 6 capabilities and controls](finance-layer-6.md). All 67 finance integration
tests passed, with the existing large-ledger timeout passing on an isolated rerun.
The exact regulatory/donor/tax formats and real consolidated-access recipients
remain unconfirmed. No real grants or official filing templates were invented.
The configurable report builder and source-facility access workflow are available.
Real-data acceptance remains pending; PDF output uses browser Save as PDF.

Tasks **5.1–5.8** are implemented for a new asset register, as confirmed by the user.
See [Layer 5 workflows and controls](finance-layer-5.md). This adds nine integration
tests and two depreciation calculation tests; all 58 finance integration tests
and all 25 shared tests pass. Real-asset setup and accountant acceptance remain pending.


Tasks **4.1–4.10** are implemented, including the user-confirmed Afghan wage-tax
preset. Manual attendance is used because no staff attendance module exists.
See [Layer 4 workflows, controls and limitations](finance-layer-4.md). Payroll
adds 9 passing database integration tests and 5 shared calculation tests.
The local database was backed up before applying payroll migrations. Real
employee setup, payroll acceptance and individual tax treatment remain pending.

The user explicitly authorized continuing through Layers 1, 2, 3, 4, 5 and 6. This does
not establish clinical-pilot completion or accountant acceptance.

Layers 1 and 2 now include hierarchical accounts, a hospital starter chart,
AFN base-amount columns, a separate-preparer posting queue, immutable audit,
paginated journals/GL, opening CSV import, mapped revenue drafts, patient/panel
AR, statements, till counts, deposits and source links. The panel workflow was
explicitly confirmed by the user. The earlier Layer 1/2 tables below describe
the initial gaps and are retained as historical assessment, not current status.
Actual opening balances and acceptance on hospital books remain unverified.

Tasks **3.1–3.7** are implemented for the confirmed Excel/paper procurement
workflow. See [Layer 3 capabilities, controls and testing](finance-layer-3.md).
All 40 finance integration tests pass across four suites, including the new AP
and procurement tests. All 18 shared calendar/money tests and the API unit test
pass. No whole layer is marked accepted on real financial data.

Update: task **0.1** is implemented and its 13 calendar tests pass, including
54,787 independently checked dates. See [engine notes and manual acceptance](finance-shamsi-engine.md).
Update 2026-09-27: tasks **0.2–0.5** are implemented and available in the running
local app. See [foundation changes, verification and manual checks](finance-foundations.md).
User acceptance of Layer 0 is pending.
The assessment below describes the initial baseline except where updated.

## Conclusion

The current ERP contains a substantial AFN accounting implementation, including
a posting engine, manual journals, invoice/payment integration, expenses, supplier
payables, cash/bank reconciliation, and basic statements. Preserve and extend it.
Layers 0–5 now have implemented workflows ready for user testing. Reconcile
opening balances and exercise the review queue with the accountant before
treating these books as accepted. Later roadmap layers remain outside this work.

## References and scope

- [Build order](finance-build-order.md): authoritative sequence, Layers 0–6.
- [Feature specification](finance-module-features.md): target capabilities.
- [Earlier implementation record](finance-implementation.md): useful operating
  details and historical verification, not acceptance against the new roadmap.

The feature document uses older layer labels for payroll, assets, budgets and
reports. This assessment uses the build-order numbering: payroll 4, assets/banking/
budgets 5, statements/consolidation/close 6. Neither supplied document was edited.

Reviewed the working tree, including its existing uncommitted finance changes:
Prisma schema and migrations, shared contracts, finance services/controller,
integration and audit code, RBAC, FinancePage, clinical collections/till code,
and the finance test suite. No application code or database data was changed.
Repository copies of the references and an AGENTS.md instruction preserve the
user's requirement to read both references before writing code.

**Status meanings:** Present = implementation found for the stated capability;
Partial = useful implementation exists but roadmap requirements remain;
Missing = no implementation found in the inspected source. Present does not mean
accepted on real hospital data or freshly verified in a running environment.

## Existing screens and integration

`/finance` provides seven sections: Overview, Journals, Accounts & periods,
Expenses, Suppliers & payables, Cash & bank, and Financial reports. Finance is
enabled per facility. Initialization installs a fixed 12-account AFN chart and
sets a permanent cutover date.

There are ten finance models: settings, accounts, periods, journals, journal
lines, suppliers, bills, settlements, statements and statement lines. Finance
amounts use PostgreSQL Decimal(18,2), decimal arithmetic in the backend, and
decimal strings in API contracts.

Hospital billing integration consumes audited Invoice changes and Payment
creation events in manually triggered batches of up to 100. It uses unique
consumer receipts and transactional writes to prevent repeated processing.
Failures remain pending and are returned to the operator. It currently creates
and posts journals in the same operation.

## Layer 0 — Foundations

| Task | Status | Evidence and remaining work |
|---|---|---|
| 0.1 Shamsi fiscal engine | Implemented; awaiting user acceptance | Pinned jalaali-js 2.0.1 behind a shared wrapper; both conversion directions, Kabul UTC day bounds, validation, Afghan month names and read-only Finance converter. All 13 tests pass, including every supported day (1350–1499) against independent ICU data and three host timezones. See finance-shamsi-engine.md. |
| 0.2 Fiscal years and periods | Implemented; awaiting user acceptance | FiscalYear and FiscalPeriod store Shamsi labels and exact half-open UTC boundaries. Atomic 12-month creation, database boundary/completeness guards and year/month selectors. Local 1404 and 1405 each have twelve months. Legacy periods and closed ranges are preserved. |
| 0.3 UTC timestamp discipline | Implemented; awaiting user acceptance | Finance and billing event timestamps use TIMESTAMPTZ(3). Kabul business dates migrate explicitly to UTC; source events keep precise instants. Shamsi UI dates, UTC serialization and exclusive fiscal/report bounds. Tests verify Mizan 5 → 1404-07 and both sides of midnight under a non-UTC DB timezone. |
| 0.4 Facility isolation | Implemented; awaiting user acceptance | All twelve finance models have required facilityId. Composite foreign keys now cover reversals, year/period, legacy links and finance actors as well as existing account/document/match links. Raw database and API tests reject foreign references. |
| 0.5 Decimal and rounding discipline | Implemented; awaiting user acceptance | Decimal calculations, decimal-string transport/formatting, exact comparisons and explicit two-place half-up rounding. Removed currency Number conversions from Finance and billing/payment/lab/pharmacy/reception previews and shared validation. DB rejects nonfinite money. Tests cover high-value cents, 0.1+0.2, partial amounts and signed rounding. |

## Layer 1 — Posting engine

| Task | Status | Evidence and remaining work |
|---|---|---|
| 1.1 Chart of accounts | Partial | Per-facility codes, five account types, active/control/cash flags exist. No parent hierarchy or explicit normal-balance field. |
| 1.2 Real chart/import | Partial | Setup seeds 12 default accounts and users can add accounts. No Excel importer or evidence that the accountant's actual chart has been adopted. |
| 1.3 Journal and monetary lines | Partial | Multi-line AFN journals exist. Currency is on the journal only; line-level currency, exchange rate and AFN base-amount fields are missing. |
| 1.4 Balance enforcement | Present | Service and database trigger require at least two lines, equal positive debit/credit totals and valid posting metadata. |
| 1.5 Lifecycle and immutability | Partial | Manual drafts can be edited/deleted with version checks. Database triggers block changing posted journals/lines. Persistent logging of rejected tampering attempts is not established. |
| 1.6 Reversals | Present | Linked opposite journals preserve originals. Hospital corrections originate in billing; supplier settlements must be reversed before their bill. Finalized statement restrictions apply. |
| 1.7 Manual journal screen | Present | Create/edit/remove drafts, post and reverse controls exist. Accountant can prepare; finance_manager/admin can post. Requested accountant posting authority needs role alignment. |
| 1.8 General ledger | Present | Account/date filters, opening balance and running balances. Display is limited to 2,000 lines with a truncation warning. |
| 1.9 Trial balance | Partial | Account opening/movement/closing balances and debit/credit checks exist. Date selection is Gregorian; acceptance on real reconciled books is unverified. |
| 1.10 Append-only audit trail | Partial | Successful audited writes record actor, entity and before/after snapshots in the same transaction. No audit-log UPDATE/DELETE protection found in migrations or deployment scripts. Failed mutations roll back their transaction; logging rejected finance edits needs explicit coverage. |
| 1.11 Review queue | Partial / conflicting behavior | Manual drafts can be reviewed and posted. automatic() immediately calls postIn(), including hospital activity, expenses and supplier workflows. No retained auto-generated draft queue or enforced different preparer/approver. |
| 1.12 Opening balances | Partial | Manual non-control opening journals are possible. No Excel migration or AR/AP opening-subledger workflow. Manual control-account postings are intentionally refused. Actual balances are unverified. |

**Layer 1 milestone is not met.** Existing controls are valuable, but Shamsi
foundations, account/line structure, review behavior, audit hardening and opening
balances must be completed and proven before accountant acceptance.

## Layer 2 — Patient revenue and AR

| Task | Status | Evidence and remaining work |
|---|---|---|
| 2.1 Service-to-revenue mapping | Missing | All recognized invoice totals currently use one hospital revenue system account. No service-type mapping table. |
| 2.2 Invoice to draft journal | Partial / conflicting behavior | Idempotent invoice-event recognition exists; it immediately posts instead of retaining a reviewable draft. |
| 2.3 Payment to draft journal | Partial / conflicting behavior | Payment-method mapping settles patient receivables; generated entries immediately post. Panel and waiver methods are distinct from cash. |
| 2.4 Discounts/refunds | Partial | Invoice-total changes adjust net revenue; negative payments reverse settlement. No dedicated contra-revenue mapping/workflow. |
| 2.5 Patient AR and aging | Partial | Clinical invoices retain balances and collections lists unpaid lab/pharmacy bills. No complete finance patient subledger, control-account reconciliation or Shamsi 30/60/90 aging. |
| 2.6 Panel AR/statements | Partial, conditional scope | Panel payment method and panel receivable account exist. Institutional payer master, statements, aging and remittance workflow are missing. Confirm whether panels exist before extending. |
| 2.7 Till/shift reconciliation | Partial | Existing clinical TillService reports signed collections/refunds by day, user and payment method. No persisted shifts, counted cash, over/short or close approval. |
| 2.8 Deposits and cash-to-bank | Partial | Cash/bank accounts, manual transfer journals and bank statement matching are available. No dedicated deposit record/workflow or till-to-bank link. |
| 2.9 Source traceability | Partial | Journals retain sourceType/sourceId; hospital sourceId identifies an IntegrationEvent that identifies the source invoice/payment. The finance UI lacks click-through from ledger/statement to the originating invoice/visit. |

## Layer 3 — Expenses and AP

| Task | Status | Evidence and remaining work |
|---|---|---|
| 3.1 Supplier master | Implemented; acceptance pending | Terms, contacts, audited edits and per-invoice opening AP. Real balances still need accountant reconciliation. |
| 3.2 Direct expenses | Implemented | Paid and unpaid entry, mapped categories, cash/AP counterparts and reviewed draft journals. |
| 3.3 Supplier bills | Implemented | Expense or non-cash asset debit, AP credit, supplier due-date terms and immutable posted sources. |
| 3.4 AP detail and aging | Implemented | Historical balances/statements, due-date aging, CSV exports and reconciliation to posted AP control. |
| 3.5 Supplier payments | Implemented | Partial multi-bill allocation within a supplier, draft reservations, concurrent overpayment guards, reviewed posting and reversals. |
| 3.6 Procurement integration | Implemented for Excel/paper | CSV/manual received-goods intake; preserved PO/GRN references; receipt-to-bill generation and source trace. Live procurement-module integration awaits that upstream module. |
| 3.7 Expense account/cost centre | Implemented | Configurable category-to-account/centre mapping and facility-scoped journal-line centres preserved on reversal. |

## Layer 4 — Payroll

Tasks 4.1–4.10 are implemented: employee pay structures, earnings, deductions,
advances/loans, manual attendance, payroll calculation/review/approval, draft ledger
entries, partial salary settlement, bilingual payslips and department allocation.
The user confirmed Afghan withholding for this layer. The approved-payroll
correction workflow and external attendance integrations remain limitations.

AppUser and Practitioner records exist, but no HR employee-payroll or staff
attendance subsystem was found. Patient follow-up attendance is unrelated.

## Layer 5 — Assets, banking and budgets

| Task | Status | Evidence and remaining work |
|---|---|---|
| 5.1–5.4 Fixed assets | Implemented | New per-facility register, bill/cash acquisition drafts, scheduled monthly straight-line depreciation, gain/loss disposal, posted NBV, schedules and CSV. See Layer 5 notes. |
| 5.5 Cash/bank and reconciliation | Present | Multiple cash-marked asset accounts; statement balances/movements; exact same-account/amount matching; one-time matching; finalization; protection against subsequent backdated postings. |
| 5.6 Transfers | Implemented | Dedicated same-facility cash/bank transfer drafts with review, reversal and existing statement matching. |
| 5.7–5.8 Budgets/variance | Implemented | Versioned account/department/Shamsi-month budgets, including 1404; posted-ledger variance and unbudgeted activity with CSV. |

## Layer 6 — Statements, consolidation and close

| Task | Status | Evidence and remaining work |
|---|---|---|
| 6.1 Accrual P&L | Partial | Revenue, expenses and net income are derived from posted ledger movements per facility and Gregorian range. No Shamsi reporting periods or detailed statement layout. |
| 6.2 Balance sheet | Present | As-of-date assets, liabilities, equity, cumulative unclosed result and zero-difference check. Real-book reconciliation remains unverified. |
| 6.3 Cash-flow statement | Missing | Account ledgers and till totals are not a classified cash-flow statement. |
| 6.4 Cash-basis views | Partial | Clinical cash collection reports and cash account ledgers exist. No complete cash-basis P&L/receipts/payments/position reporting over the accrual ledger. |
| 6.5 Department P&L | Missing | Journal lines have no department/cost-centre dimension. |
| 6.6 Consolidation | Missing | Finance reports are facility-scoped; no authorized group roll-up or due-to/due-from workflow. |
| 6.7 Period close | Partial | Drafts and pending in-period billing events block closing; closed periods reject postings. Only open/closed is represented; no separate locked state, logged reopening or full close checklist/control-account reconciliation. |
| 6.8 Year-end close | Missing | No retained-earnings transfer, carry-forward process or new fiscal-year opening. Balance sheet currently includes cumulative unclosed result. |
| 6.9 Regulatory/donor/tax | Missing | No configurable statutory report definitions or agreed formats. |
| 6.10 Dashboard/exports | Partial | Overview and revenue/expense/net-income cards exist. No finance Excel/PDF export or complete CEO cash/receivables dashboard found. Clinical receipts/reports do not substitute for ledger exports. |

## Cross-cutting controls and important differences

1. **Review before posting:** the largest workflow difference is immediate
   posting of generated journals. Moving to reviewable drafts also requires
   defining how unposted bills/payments affect operational balances and pending
   events; changing automatic() alone would be incomplete.
2. **Roles:** accountant and finance_manager exist; management has read access;
   reception/pharmacy perform cashier functions clinically. Dedicated auditor
   and payroll_officer roles are missing. Managers/admins can create and post
   their own journals, so segregation of duties is not enforced.
3. **Audit:** transactional write snapshots exist, but append-only storage and
   rejected-attempt logging need work before satisfying the specification.
4. **Facility boundaries:** most accounting references use composite keys.
   Include the reversal link and polymorphic source links in the Layer 0 schema
   review; do not equate the presence of facilityId with complete enforcement.
5. **Localization:** finance forms are primarily English. Role/navigation labels
   have local translations; finance Shamsi dates and full Dari coverage remain.
6. **Operational limits:** up to 100 events per sync batch, 100 recent journals
   in the workspace and 2,000 lines in an account-ledger response. Plan pagination
   and exports as the module grows.

## Verification and confidence

- Inspected current source and the two finance migrations; this is a code-level
  baseline, not proof of what is deployed or initialized at the hospital.
- The checked local historical artifact
  `.test-runtime/finance-final-results.json` records **12 passed, 0 failed**.
  The implementation guide attributes that focused run to 2026-09-21 and also
  records an earlier full API run of 59 suites / 816 tests. The broader run was
  not repeated for this assessment.
- Existing finance tests cover permissions, module access, clinical separation,
  period overlap, control accounts, balance enforcement, posted immutability,
  idempotency, reversals, supplier overpayment races, invoice/payment/refund
  integration, bank reconciliation, facility ownership and closing restrictions.
- No fresh database tests were run: the existing isolated PostgreSQL endpoint
  at 127.0.0.1:15439 was unreachable during this assessment. Docker inspection
  also lacked access to the Docker Desktop pipe. No database was started,
  migrated, reset or used for test fixtures.
- Hospital initialization, real opening balances, deployed migration state,
  accountant acceptance and Axon clinical-pilot completion remain unverified.
- Many finance files and related foundation changes are currently uncommitted;
  preserve that work and review it before any later commit/release.

## Proposed continuation when implementation is requested

1. Complete Layer 0: verify the Shamsi calendar against known dates and leap
   years; model fiscal years/periods and UTC boundaries; review all facility
   references; define decimal and rounding rules across backend and frontend.
2. Before Layer 1, confirm the clinical pilot status required by the roadmap,
   obtain the accountant's COA and opening balances, and settle posting roles
   and review responsibilities.
3. Complete the existing Layer 1: hierarchical typed accounts/normal balances,
   monetary line metadata, generated draft review, enforced approval rules,
   append-only audit, rejected-attempt logging and opening-balance migration.
4. Prove the ledger with isolated regression tests and reconciled real opening
   data, then let the accountant use manual entries as the roadmap requires.
5. Extend existing Layer 2 and Layer 3 work in order, then continue with the
   later layers and the roadmap's stated priority/cut list.

Questions about panels, payroll tax, asset migration and statutory formats can
wait until their respective layers. The documents' clinical-pilot requirement
does not prevent this assessment or Layer 0 planning.

## Primary code evidence

- `apps/api/prisma/schema.prisma`: finance models at lines 245–428.
- `apps/api/prisma/migrations/20260920190000_finance_core/migration.sql`:
  finance tables, composite references, balance/immutability/period guards.
- `apps/api/prisma/migrations/20260921210000_finance_controls/migration.sql`:
  additional journal-line, source-record, account and reconciliation guards.
- `apps/api/src/modules/finance/finance-ledger.service.ts`: setup (97),
  periods (136), close (160), posting (312), automatic posting (368), reports (482).
- `apps/api/src/modules/finance/finance-operations.service.ts`: supplier (144),
  expense (166), bill (198), settlement (247), sync (306), statements (442).
- `packages/shared/src/finance.ts`: decimal string contracts and report shape.
- `apps/api/src/auth/permissions.ts`: finance permissions at lines 102–107.
- `apps/api/src/prisma/transactional-audit.ts` and
  `apps/api/src/integration/integration.service.ts`: audit/event transactions.
- `apps/web/src/pages/FinancePage.tsx`: implemented screens, Gregorian forms,
  numeric display/matching, and missing source navigation.
- `apps/api/src/modules/till/till.service.ts` and
  `apps/api/src/modules/collections/collections.service.ts`: existing clinical
  cash totals and unpaid-bill worklist.
- `apps/api/test/finance.e2e-spec.ts`: existing 12 accounting-integrity cases.

