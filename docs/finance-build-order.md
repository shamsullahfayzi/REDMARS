# REDMARS ERP — Finance & Accounting: Build Order

> Companion to `finance-module-features.md` (the *what*). This is the *order* and the *why*.
> Same rules as the clinical build order: build in dependency order, in **layers**, each one
> shippable and proven before the next stacks on it. Don't build "all the tables."
>
> **Roles added:** `accountant` · `cashier` (may = receptionist) · `payroll_officer` · `auditor`
> (read-only) — all extending the existing RBAC, all scoped by `facility_id`.

---

## Read this before estimating anything

This is a **general-ledger system** — QuickBooks-class, and bigger than the clinical HMIS.
Done properly it is a **months-long build, not a 9-week one.** Two reasons it can't be rushed
the way the clinical side was:

1. **Correctness is binary.** A trial balance balances or the module is worthless. There is no
   "80% right" for double-entry.
2. **The accountant isn't blocked today.** Unlike the doctors on the old MIS, your accountant
   has working Excel. The finance pain is real but not on fire — so the *right* sequence is
   clinical-pilot-first, then finance in layers, not a race.

**Hard sequencing rule:** finish and pilot the clinical HMIS at Axon **before** starting
Layer 1. Finance connects *to* a live clinical system; building it against a not-yet-live one
means chasing two moving targets.

---

## Layer 0 — Foundations (the calendar & entity spine)

Everything financial depends on these two being right. Get them wrong and every entry above
is wrong.

| # | Task | Done when |
|---|---|---|
| 0.1 | **Shamsi fiscal engine.** Pick + **verify** a Shamsi↔Gregorian library against known leap years. Wrap it so nothing else calls it directly. | Hamal 1 1404 ↔ correct UTC instant, both directions, leap years right |
| 0.2 | `FiscalYear` + `FiscalPeriod` tables (Shamsi label + precise UTC start/end) | 1404 exists as 12 periods with correct UTC boundaries |
| 0.3 | Store all money timestamps as `timestamptz` (UTC); Shamsi is display/period layer only | A JE dated Mizan 5 files into period 1404-07, never a neighbour |
| 0.4 | Confirm `facility_id` on every finance table; every entry lives in exactly one facility | Schema review passes: no cross-facility entry is representable |
| 0.5 | Money type discipline: `Decimal` everywhere, never float; define rounding rules | No float touches a currency value anywhere |

> **0.1 is the highest-risk task in the whole module.** A wrong leap-year rule silently
> misfiles entries into the wrong month and you find out at year-end close. Verify it with a
> table of known dates before you build one thing on top of it.

---

## Layer 1 — The Posting Engine ⭐ (prove this before anything else)

The heart. Everything in every later layer posts through here. If this is right, the rest is
labour; if it's wrong, the rest inherits the wrong.

| # | Task | Done when |
|---|---|---|
| 1.1 | `Account` (COA) — hierarchical, typed, normal-balance, per facility | COA loads; each account knows debit/credit-normal |
| 1.2 | Import the accountant's existing COA (or build from a standard hospital COA) | Real account structure in the DB |
| 1.3 | `JournalEntry` + `JournalLine` — lines carry currency, rate, AFN base amount | Model holds a balanced multi-line entry |
| 1.4 | **Balance enforcement** — engine refuses to post if debits ≠ credits | Unbalanced entry is rejected, always |
| 1.5 | **Entry lifecycle** — draft (editable) → posted (immutable). No edit/delete of posted | Posted entry cannot be mutated; attempt is blocked + logged |
| 1.6 | **Reversal** — correct a posted entry only by posting its reverse | Reversal leaves both entries visible and nets to zero |
| 1.7 | Manual journal entry screen (accountant) | Accountant posts an adjusting entry by hand |
| 1.8 | **General Ledger** — per-account history + running balance | GL for any account, any date range |
| 1.9 | **Trial Balance** — per facility, any date; debits = credits | TB balances on real data |
| 1.10 | Audit trail on every entry (who/when/source/before-after), append-only | Every post leaves an immutable trail |
| 1.11 | **Approval/review queue** — entries can land as draft for accountant to post | Accountant reviews then posts; nothing auto-locks |
| 1.12 | Opening balances — load starting balances from the Excel books | Facility opens with correct balances |

> **🚩 MILESTONE.** After 1.12 you have a working double-entry ledger the accountant can post
> to and trust. **Stop and let the accountant use it** for manual entries before you automate
> anything. If the engine earns their trust here, everything after is additive. If it doesn't,
> you fix it now — before ten other things depend on it.

---

## Layer 2 — Patient Revenue & AR (first automation)

Now connect the clinical `Invoice`/`Payment` you already generate. This is the cheapest,
highest-value automation because the source data already exists.

| # | Task | Done when |
|---|---|---|
| 2.1 | Mapping: service-type → income account | Consultation revenue hits the right account |
| 2.2 | **Auto-draft JE from a clinical invoice** (idempotent — posts once) | Invoice creates a balanced draft entry, exactly once |
| 2.3 | Auto-draft JE from a payment; clears the receivable | Payment posts cash + clears AR |
| 2.4 | Discounts/refunds → contra-revenue entries | A refund reverses cleanly |
| 2.5 | Patient AR subsidiary ledger + aging (Shamsi 30/60/90) | "Who owes us and how old" report |
| 2.6 | Panel/institutional AR + statements *(only if panels exist)* | Deferred until the panel question is answered |
| 2.7 | Daily cash reconciliation per till/user/shift (expected vs counted, over/short) | Reception & pharmacy tills reconcile at close |
| 2.8 | Bank deposit recording + cash→bank transfer | Collected cash deposited and reconciled |
| 2.9 | Source-document traceability: statement figure → back to the visit | Click a GL line, land on the originating invoice |

---

## Layer 3 — Expenses & Accounts Payable

The other half of the P&L. Lets you finally answer "did the hospital make money."

| # | Task | Done when |
|---|---|---|
| 3.1 | `Supplier` master (terms, opening balance) | Suppliers exist |
| 3.2 | Direct expense entry (rent, utilities, fuel…) → expense + cash/AP | An expense posts a balanced entry |
| 3.3 | Supplier bills → AP + expense/asset | A bill creates a payable |
| 3.4 | AP subsidiary ledger + aging | "What we owe and when" |
| 3.5 | Supplier payments (partial, multi-bill) clear AP | Paying a bill clears the payable |
| 3.6 | Procurement link: PO → GRN → Bill → AP *(consumes procurement module output)* | Purchases flow to finance without re-keying |
| 3.7 | Expense mapping to COA + cost centre/department | Expenses land in the right account & centre |

> **🚩 MILESTONE.** After Layer 3 you can produce a real **P&L** and **Balance Sheet** per
> facility. That's the first moment the module answers the CEO's core question.

---

## Layer 4 — Payroll

Its own sub-system. Big enough to be a project. Posts to the ledger on approval.

| # | Task | Done when |
|---|---|---|
| 4.1 | Employee payroll records (basic, allowances, currency) | Employees exist with pay structure |
| 4.2 | Earnings: basic, allowances, overtime, bonuses | Gross computes |
| 4.3 | Deductions: absence, loan/advance, other; tax (configurable) | Net computes |
| 4.4 | Advances & loans: issue, track, auto-deduct over months | A loan repays itself across periods |
| 4.5 | Attendance feed *(if an attendance module exists; else manual entry)* | Absences/overtime reach payroll |
| 4.6 | Payroll run per facility/period: calc → review → **approve** → pay | No payment before approval |
| 4.7 | Approved payroll → auto JE (salary expense, tax payable, net payable) | Payroll posts a balanced draft entry |
| 4.8 | Salary payment clears net-payable | Paying staff clears the liability |
| 4.9 | Payslips (Dari/English) + payroll reports | Each employee gets a payslip |
| 4.10 | Expense allocation to departments/cost centres | Salary cost lands per department |

---

## Layer 5 — Assets, Banking, Budgeting

| # | Task | Done when |
|---|---|---|
| 5.1 | Fixed-asset register per facility | Assets recorded |
| 5.2 | Capitalize asset from a supplier bill | Bill → asset on the books |
| 5.3 | Straight-line depreciation, scheduled, auto-posting monthly | Depreciation posts itself each period |
| 5.4 | Asset disposal/write-off with gain/loss | Disposal computes gain/loss |
| 5.5 | Bank/cash accounts + bank reconciliation | Ledger reconciles to a statement |
| 5.6 | Account-to-account & cash↔bank transfers (within a facility) | Transfers post correctly |
| 5.7 | Budgets per account/department/period (Shamsi) | Budget entered for 1404 |
| 5.8 | Budget vs actual variance reports | Over/under-spend visible |

---

## Layer 6 — Statements, Consolidation, Close

The reporting payoff and the controls that make it audit-grade.

| # | Task | Done when |
|---|---|---|
| 6.1 | P&L (accrual) by Shamsi period, per facility | Correct P&L on real data |
| 6.2 | Balance Sheet as of any date | Balances; assets = liabilities + equity |
| 6.3 | Cash Flow statement | Produced from the ledger |
| 6.4 | **Cash-basis reporting views** over the same accrual data | Cash P&L / receipts / payments / position |
| 6.5 | Department / cost-centre P&L | Profit per clinic |
| 6.6 | **Consolidated group reports** — roll up all facilities | Axon hospital and future branches combined for management |
| 6.7 | **Period close** — reconcile, closing entries, lock; reopen is logged | Mizan 1404 closes and locks |
| 6.8 | **Year-end close** — net income → retained earnings, carry forward, open new year | 1404 → 1405 rolls over correctly |
| 6.9 | Configurable regulatory/donor/tax reports | The reports the hospital must file |
| 6.10 | Management dashboards + Excel/PDF export for external audit | CEO dashboard; auditor gets exports |

---

## The cut list (if time-pressed)

Ship in this order of value; defer from the bottom:

1. **Layers 0–1** (engine) — never cut. Without it there is no module.
2. **Layer 2** (patient revenue/AR) — highest value, cheapest, source data already exists.
3. **Layer 3** (expenses/AP) — unlocks the P&L.
4. **Layer 6.1–6.4, 6.7** (statements + close) — makes it a real accounting system.
5. **Layer 4** (payroll) — high value but self-contained; can lag.
6. **Layer 5** (assets/budgeting) — defer comfortably.
7. **6.6 consolidation, 6.9 regulatory** — last; need multiple facilities live first.

**Never cut:** balance enforcement (1.4), posted-entry immutability (1.5), the audit trail
(1.10), period locking (6.7). Those four are what separate an accounting system from a
spreadsheet — and what an auditor checks first.

---

## Answer before the layer that needs it

- **Layer 1:** Does a chart of accounts already exist in Excel? (adopt it) · Confirm the
  draft-review-queue approach.
- **Layer 2:** Do panels/institutional payers exist?
- **Layer 4:** Is there an attendance/HR module to feed payroll? · Is Afghan income-tax
  withholding in scope for v1?
- **Layer 5:** Does a fixed-asset register exist to migrate? Depreciation methods beyond
  straight-line?
- **Layer 6:** Which exact regulatory/donor/tax report formats must be produced?
