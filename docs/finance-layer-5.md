# Layer 5 — assets, banking and budgets

Implemented 2026-10-12 for roadmap tasks 5.1–5.8. The user confirmed a **new asset register**, so no historical register was imported. AFN only.

## Workflows

- **5.1 Register:** Finance → Fixed assets. Record tag, name, category, location, cost, residual, useful life in months, first Shamsi depreciation period and optional department. The register reports posted depreciation and net book value and exports CSV. Each asset shows its planned schedule and journal history.
- **5.2 Capitalization:** choose a posted supplier-bill debit line and an amount within its unallocated balance. Draft acquisitions reserve that balance. The entry debits registered fixed assets and credits the original bill account, preserving the bill line's department on that credit. Supplier AP is unchanged. A cash/bank purchase instead credits its payment account. Links connect the asset, acquisition journal and original bill.
- **5.3 Depreciation:** full-month straight-line from the selected Shamsi starting month; no daily proration. Residual is never depreciated. Each installment rounds half-up to two decimals, with the final installment absorbing the remainder. The API checks every minute while running and catches up after restart, up to twelve missing months per asset per pass. Missing fiscal years or closed periods appear as errors. Idle checks do not create command receipts. The schedule uses the acquisition preparer as its initiating actor; another accountant must post the drafts. The manual “Prepare due depreciation” action uses the same engine.
- **5.4 Disposal/write-off:** prepare an entry with disposal date, reason and proceeds (zero for a write-off). All completed months must be generated and posted first. The entry removes gross cost and accumulated depreciation, records proceeds and recognizes the gain or loss. The register changes only when it posts. A pending disposal reserves the asset and stops further scheduling. Reverse later events before earlier ones; finish pending reversals before further asset activity. Eligible drafts can be discarded from Journals. Asset terms remain immutable; correcting them requires reversing/removing the acquisition and registering a corrected asset.
- **5.5 Banking/reconciliation:** retained the existing cash/bank accounts, statement entry, exact line matching, reconciliation finalization and protection against backdated changes. Configure additional cash/bank accounts in Accounts & periods.
- **5.6 Transfers:** Cash & bank now has a dedicated transfer form. It debits the receiving account and credits the sending account, in the same facility. Generated drafts use the existing review queue and are reversible. Use the existing till-deposit workflow for deposits tied to a shift.
- **5.7 Budgets:** Budgets & variance supports 1404 and other configured Shamsi years. Finance managers/admins enter expense or revenue budgets per account and month, optionally by department. Revisions require the current version and are audited. Closed months cannot be changed. For each account/month choose a whole-facility budget or department budgets; overlapping totals are rejected.
- **5.8 Variance:** actuals include posted journals and posted reversals only. Variance is actual minus budget: positive expense variance is unfavorable, positive revenue variance is favorable. Unbudgeted activity remains visible. CSV export includes scope, amounts and result.

## Controls and operational limits

Automatic accounting produces **reviewable drafts**, as required by the feature specification; it never silently posts to the locked ledger. Period close rejects missing asset depreciation. Asset sources, posted entries and audit history are immutable. Composite foreign keys enforce facility ownership; database posting guards independently compare asset journals to their source amounts, accounts and departments. Concurrent monthly runs retry serialization conflicts and cannot duplicate active entries.

The API must be running for scheduled work; it catches up when restarted. Create future fiscal years before they are needed. Asset correction entries that would require regeneration in a closed month need an accountant-led correction workflow; this release does not add period reopening or historical schedule restatement. Only straight-line and full-month convention are provided. No automatic tax depreciation schedule, historical register import, alternative currency, or spending-blocking budget control was requested.

## Verification

- All **58 finance integration tests** passed across six suites, including nine Layer 5 tests against the isolated `finance_foundation_test` database.
- All **25 shared tests** passed, including depreciation residual/rounding and tiny-value cases.
- Tests cover independent review, source tampering, bill allocation limits, concurrent generation, scheduled catch-up, disposal gain/loss and reversal order, transfer idempotence/facility scope, 1404 budgets, posted-only actuals, revision conflicts, and period-close protection.
- Main database changes require a validated backup before migration. Test fixtures are kept outside hospital books. User/accountant acceptance on real assets remains pending.

## Local release verification

The local database was backed up and the three Layer 5 migrations were applied successfully (35 migrations total). Validated backup: `.test-runtime/redmars-before-assets-20261012.dump` (361,080 bytes). API and web production builds, targeted lint, and the API audit unit test passed. The web build retains the existing large-bundle warning. Populated asset and 1404 budget screens, posted amounts and journal/source navigation were checked in an isolated browser preview; its temporary servers were stopped afterward. The main API health check reports database up and the main web app responds at `http://127.0.0.1:5173/finance`.
