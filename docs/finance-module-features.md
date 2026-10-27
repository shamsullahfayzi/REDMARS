# REDMARS ERP — Finance & Accounting Module: Feature Specification

> **What this document is.** The complete reference of *what* the finance module does —
> every capability, in plain language, grouped by area. It is the "0 to 100" picture.
> The companion `finance-build-order.md` says *in what order* to build it and why.
>
> **What this is not.** A promise to build all of it in v1. Read the sequencing note below
> before you treat any section as immediate work.

---

## The one thing to understand before reading further

You have specified a **general-ledger accounting system** — the same category as QuickBooks,
Xero, or Odoo Accounting. This is bigger than the clinical HMIS you just built, and the
reason is unforgiving correctness: a queue screen that's slightly off is a nuisance; a
trial balance that's off by 4,000 AFN is worthless, and finding *why* is the whole job.

So this module is built in **layers**, each shippable and useful on its own, each proven
before the next is stacked on it. The posting engine (Layer 1) must be correct before
anything else exists, because everything posts through it.

**Two architectural rules that come from your two answers, and touch everything below:**

1. **Separate entities, flat by `facility_id`.** Each hospital is a complete, self-contained
   set of books. Every journal entry lives entirely within one facility — no entry ever
   straddles two hospitals. Each facility's trial balance must balance on its own.
   Consolidation is a **reporting-time roll-up** across facilities, never a structural layer.
   Money moving between hospitals = two entries (one per entity) through a due-to/due-from
   account, never one cross-entity entry.

2. **Hijri Shamsi is the fiscal calendar, not a date format.** Store every timestamp as UTC
   underneath (`timestamptz`). Shamsi is the calendar layer that defines period boundaries
   and all human-facing dates. A `FiscalPeriod` row carries both the precise UTC range and
   the Shamsi label (e.g. 1404-07 / Mizan 1404). Reports group, close, and compare by
   Shamsi period. The Shamsi↔Gregorian conversion library is a hard dependency to choose
   carefully and verify — a wrong leap-year rule silently misfiles entries into the wrong month.

---

## 1. The Accounting Engine (the core — Layer 1)

The non-negotiable foundation. Everything else is a client of this.

- **Chart of Accounts (COA)** — the hospital's list of accounts, hierarchical (Assets,
  Liabilities, Equity, Income, Expenses → sub-accounts). Per facility. Adopt the accountant's
  existing structure rather than inventing one.
- **Account types & normal balances** — each account knows whether it's debit-normal or
  credit-normal; the engine enforces it.
- **Double-entry journal entries** — every transaction is one entry with ≥2 lines whose
  debits equal credits. The engine **refuses to post an unbalanced entry.** This is the
  single most important rule in the module.
- **Entry lifecycle** — `draft → posted → (reversed)`. Drafts can be edited; **posted entries
  are immutable** — you never edit or delete a posted entry, you post a *reversing* entry.
  This is what makes the books audit-grade.
- **Manual journal entries** — the accountant can post adjusting entries directly (accruals,
  corrections, opening balances).
- **Auto-posting from source documents** — invoices, payments, bills, payroll, depreciation
  generate draft entries automatically (see §9).
- **Review/approval queue** — auto-generated entries land as **draft** for the accountant to
  review and post. Auto-posting straight to a locked ledger is how accountants stop trusting
  a system; the queue keeps them in control (this is your spec's "accountant retains control").
- **General Ledger** — every account's full transaction history, running balance.
- **Subsidiary ledgers** — per-customer (patient/panel) AR detail, per-supplier AP detail,
  reconciling to their control accounts in the GL.
- **Trial Balance** — all account balances, debits = credits, as of any date, per facility.
- **Multi-currency-ready lines** — every monetary line stores transaction currency, exchange
  rate, and AFN base amount. AFN-only in v1 UI; the columns exist so USD/EUR slot in later
  without a migration.
- **Complete audit trail** — every entry records who, when, from which source document, with
  before/after. Immutable and append-only.

## 2. Fiscal Periods & Period Close

- **Shamsi fiscal year & periods** — year and 12 months defined in Shamsi, each mapped to a
  precise UTC range.
- **Period states** — `open → closed → locked`. Posting into a closed period is blocked
  (accountant can reopen with a logged reason).
- **Period-end close** — checklist, control-account reconciliation, closing entries.
- **Year-end close** — roll net income to retained earnings, carry balances forward, open
  the new Shamsi year.
- **Opening balances** — migrate balances from the Excel books at go-live.

## 3. Patient Revenue & Accounts Receivable

Connects to the clinical `Invoice`/`Payment` tables you already built.

- **Revenue recognition** — clinical charges (consultation, lab, pharmacy, procedures) post
  to income accounts, mapped by service type.
- **Invoices & receipts** — already generated clinically; finance consumes them.
- **Discounts & refunds** — post to contra-revenue; the 10%-ceiling + approval rule already
  exists in RBAC.
- **Patient AR** — unpaid/partially-paid patient balances, aging (30/60/90 in Shamsi periods).
- **Panel / institutional AR** — receivables from NGOs/employers/insurers; statements,
  aging, collection tracking. *(Only if panels exist — still an open clinical question.)*
- **Cash collection & daily reconciliation** — per till, per user, per shift; expected vs
  counted; over/short logged. This is the operational cash control the CEO cares about most.
- **Bank deposits** — record deposits of collected cash, reconcile to bank.

## 4. Expenses & Accounts Payable

- **Suppliers/vendors** — master records, terms, opening balances.
- **Expense entry** — direct operating expenses (rent, utilities, fuel, maintenance…).
- **Supplier bills** — record what's owed; post to AP + expense/asset.
- **AP & aging** — what's owed to whom, when due.
- **Payments** — pay bills fully/partially; multiple bills per payment.
- **Procurement link** — Purchase Order → Goods Received → Supplier Bill → AP → Payment
  (procurement/inventory is a separate ERP module; finance consumes its output).
- **Pharmacy & lab purchases** — inventory purchases flow here as payables/COGS.
- **Expense categorization** — mapped to COA and, where used, to cost centres/departments.

## 5. Payroll (its own sub-system — Layer 3)

Integrated with HR/attendance; posts to the ledger on approval.

- **Employee payroll records** — basic salary, allowances, currency.
- **Earnings** — basic, allowances, overtime, bonuses.
- **Deductions** — tax (configurable), absence, loan/advance repayments, other.
- **Advances & loans** — issue, track, auto-deduct over months.
- **Attendance adjustments** — from the attendance module (absences, overtime).
- **Net pay calculation** — earnings − deductions.
- **Payroll run** — per period, per facility: calculate → review → approve → pay.
- **Approval workflow** — no payment before approval.
- **Payslips** — per employee, Dari/English.
- **Auto journal entries** — approved payroll posts salary expense, tax payable, net payable;
  payment clears the payable.
- **Expense allocation** — salaries allocated to departments/cost centres.
- **Payroll history & reports** — per employee, per period, per facility.

## 6. Fixed Assets & Depreciation (Layer 4)

- **Asset register** — equipment, furniture, vehicles, medical devices; per facility.
- **Acquisition** — capitalize from a supplier bill.
- **Depreciation** — straight-line minimum; scheduled, auto-posting monthly.
- **Disposal/write-off** — gain/loss on disposal.
- **Asset reports** — register, net book value, depreciation schedule.

## 7. Banking & Cash

- **Bank & cash accounts** — multiple, per facility.
- **Bank reconciliation** — match ledger against statements; clear items.
- **Transfers** — cash↔bank, account↔account (within one facility).
- **Cash position / bank position** — real-time balances.

## 8. Budgeting (Layer 4)

- **Budgets** — per account/department/period, per facility, in Shamsi periods.
- **Budget vs actual** — variance reports.
- **Optional soft controls** — warn on over-budget spend.

## 9. Integration with HMIS/ERP (the "automatic" spec)

The point of building this *inside* the ERP rather than buying QuickBooks. Each operational
event proposes a draft accounting entry:

```
Patient billing:   Register → Service → Charge → Invoice → Payment/Receivable → draft JE
Procurement:       PO → Goods Received → Supplier Bill → AP → Payment → draft JE
Payroll:           Attendance → Calc → Approve → Salary Payable → Payment → draft JE
Depreciation:      Asset → monthly schedule → draft JE
```

- **Source-document traceability** — every JE links back to the invoice/bill/payroll/asset
  that created it. You can walk from a number on a financial statement back to the patient
  visit or supplier bill that produced it. This is your "complete audit trail from
  operational source to final entry."
- **Mapping tables** — service-type→income-account, expense-type→expense-account,
  etc., so operations staff never touch the COA.
- **Idempotency** — a source document posts once; re-processing never double-posts.

## 10. Financial Statements & Reporting (Layer 5)

Per facility, and consolidated across facilities.

- **Trial Balance**
- **Profit & Loss (Income Statement)** — by Shamsi period; accrual, with a cash-basis view.
- **Balance Sheet** — as of any date.
- **Cash Flow Statement**
- **AR & AP aging**
- **Cash & bank reports** — receipts, payments, position (the cash-basis management views).
- **Department/cost-centre P&L** — profitability per clinic/department.
- **Budget vs actual**
- **Consolidated group reports** — all facilities rolled up for management.
- **Management dashboards** — revenue, expenses, cash, receivables at a glance.
- **Regulatory/donor/tax reports** — configurable, because rules change (MoPH, donors, tax).
- **Export** — Excel/PDF for the accountant and external audit.

## 11. Controls, Security & Audit

- **Role-based access** — accountant, cashier, payroll officer, auditor, management; scoped
  by facility. Extends the existing RBAC.
- **Segregation of duties** — the person who enters isn't the person who approves.
- **Immutable posted entries** — corrections via reversal only.
- **Full audit log** — every financial action, who/when/what, append-only.
- **Approval workflows** — journals, payments, payroll, above-threshold discounts.
- **Period locking** — closed periods can't be altered without a logged reopen.
- **Data isolation** — users see only their facility unless granted consolidated access.

---

## Cash-basis vs accrual (your section 6, made concrete)

One engine, not two. The ledger is **accrual** — revenue when earned, expense when incurred,
AR/AP/accruals/prepayments/depreciation all real. **Cash-basis is a reporting lens** over the
same data: cash receipts, cash payments, cash position, cash-flow. You never keep two sets of
books; you present the accrual truth two ways. That is exactly what your spec asked for.

---

## Open questions (answer before the layer that needs them)

1. **Does a chart of accounts already exist** in the accountant's Excel? Adopt it. *(Layer 1)*
2. **Approval queue** — confirm auto-posted entries should land as draft for accountant review.
   *(Strongly recommended; Layer 1.)*
3. **Panels/institutional AR** — do NGO/employer payers exist? *(Still open from clinical; §3)*
4. **Attendance/HR module** — does one exist to feed payroll, or must payroll own employee
   records too? *(Layer 3)*
5. **Afghan income-tax withholding** — in scope for payroll v1, or deferred? *(Layer 3)*
6. **Fixed-asset register** — does one exist to migrate, or build from zero? Methods beyond
   straight-line? *(Layer 4)*
7. **Inter-facility transactions** — will hospitals ever pay for / transfer to each other?
   Designed-for now, built when needed. *(§1)*
8. **Tax/regulatory report formats** — which exact reports must be produced? *(Layer 5)*
