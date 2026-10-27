# Finance foundations: tasks 0.2–0.5

Implemented 2026-09-27. User acceptance is pending. The two supplied finance
references remain unchanged. This work does not start Layer 1.

## What to test

Open Finance → **Accounts & periods**. Select **1404**: Hamal through Hoot must
show twelve months, with six 31-day months, five 30-day months and 29 days in Hoot.
1405 is also available in the local books. A finance manager can create another
complete year with **Create all 12 periods**. Duplicate years are refused.

Finance posting, expense, supplier, statement and report date inputs use Shamsi
`YYYY-MM-DD`. Invalid dates are rejected. Journals show their fiscal period label;
reports have a fiscal-period selector and a custom Shamsi date range.

The local cutover remains 2026-09-21 Gregorian (1405-06-30 Shamsi). Do not change
it to test historical entries. Mizan 5 of 1404 is verified in the isolated tests;
the live books correctly refuse dates before their established cutover.

## Calendar and UTC storage

- `FiscalYear` maps to `fiscal_year`. `FiscalPeriod` maps to the existing
  `finance_period` table. Both belong to one facility.
- Years have a numeric Shamsi year, label and exact UTC boundaries. Periods have
  their year, month, label (`1404-07`), name and exact boundaries.
- Fiscal intervals are **[start, end)**: start included, end excluded. Hamal 1404
  begins `2025-03-20T19:30:00.000Z`; Mizan begins
  `2025-09-22T19:30:00.000Z` and ends `2025-10-22T19:30:00.000Z`.
- A manual JE dated 1404-07-05 stores `2025-09-26T19:30:00.000Z` and belongs to
  1404-07. Imported hospital events retain their precise source event instant.
- Finance dates/timestamps and billing, catalog, outbox and audit timestamps use
  PostgreSQL `timestamptz(3)`. Old event timestamps are explicitly interpreted as
  UTC; old business dates become Kabul midnight. Unrelated clinical civil dates
  such as birthdays remain date-only values.
- Wire dates remain Gregorian Kabul civil-date strings for API compatibility;
  conversion happens at the finance UI boundary. `effectiveAt`, `startsAt` and
  `endsAt` expose UTC ISO instants. Database session timezone cannot move a JE
  into a neighbouring month. Reports include the entire selected final day.
- Year creation is atomic. Database guards require all twelve months, immutable
  verified boundaries and the correct period for every journal, including drafts.
  Calendar anchors in the migration were generated from the verified shared
  wrapper for its supported 1350–1499 range.
- Create years with `POST /finance/fiscal-years` and `{year, idempotencyKey}`.
  The old arbitrary Gregorian `POST /finance/periods` route is retired. Existing
  finance configuration permission and audited transactions apply.

## Migration and existing books

`20260927090000_finance_foundations` is transactional. It preserves prior periods
in the immutable `finance_legacy_period` archive, links existing journals to
their original period through `legacyPeriodId`, and assigns them to Shamsi months.
Prior closed date ranges remain blocked at the service and database layers,
including portions of a Shamsi month. The UI lists those ranges separately.
Posted journal identity, status, numbers, amounts, actor and event timestamps,
audit history and reconciliation matches remain intact.

The migration seeds 1404, the current year, the cutover year and every year
containing existing periods or journals for each initialized facility. Unsupported
historical records fail the migration rather than being silently reassigned.
New finance setup creates 1404 and its cutover year; later years are explicit.

A local database backup was taken before applying the migration:
`.test-runtime/redmars-before-finance-foundations-20260927.dump` (gitignored).
No test transactions were added to the local hospital books.

## Facility isolation

Every finance table has a non-null `facility_id`. Composite foreign keys bind
period/year, journal/period, journal lines/accounts, suppliers/bills/payments,
statements/matches, reversals, legacy-period links and finance actors to the same
facility. The reversal link previously referenced only the journal ID; it now
also references the facility. Hospital source-event references are checked by
the database guard. API reads and mutations remain scoped to the signed-in user.

## Money policy

- Stored finance amounts remain `numeric(18,2)`; API amounts remain decimal
  strings. Entered finance amounts allow at most twelve whole digits and two
  fractional digits. Excess precision is rejected, never silently rounded by
  the application. Non-finite values are rejected in code and by DB constraints.
- Calculations use Decimal, with 40 significant digits for finance arithmetic.
  `decimal.js` 10.6.0 is pinned for shared/browser arithmetic. Decimal constructors
  used by finance reject JS number inputs.
- Calculated AFN amounts round to two decimals using **ROUND_HALF_UP** (ties away
  from zero: `1.005 → 1.01`, `-1.005 → -1.01`). Round once at a posting boundary;
  do not round intermediate sums. Balance/matching comparisons are exact and
  have no epsilon tolerance. PostgreSQL numeric scale rounding uses the same tie
  rule; application input validation rejects extra digits before storage.
- Discount authorization compares against the exact calculated ceiling. The
  reception preview floors the maximum allowed amount to whole cents so it
  does not advertise a discount above the permission ceiling. Percentage-derived
  discount amounts use the standard half-up amount rule.
- Finance, reception, invoice/payment, pharmacy and lab previews no longer
  convert currency to JS numbers. Formatting groups decimal text directly.
  Receipt wording uses exact BigInt groups. Revenue chart geometry converts only
  dimensionless ratios after Decimal division; currency labels remain strings.
- Future FX, tax, payroll and allocation features must use this policy. Where
  multiple rounded allocations leave a cent remainder, that future workflow
  must assign and record it explicitly; it must never weaken balance enforcement.

## Verification

- Shared calendar/money tests cover independent calendar verification of all
  54,787 supported days, known/leap boundaries, all 150 fiscal-year partitions,
  ESM/CommonJS exports, three host timezones, cent precision and signed rounding.
- 19 finance integration tests pass: the existing 12 accounting cases plus seven
  foundation cases covering UTC boundaries, last-instant reporting, Shamsi
  assignment, year atomicity, SQL tampering, facility references and Decimal.
- Full API regression: 825 cases across 60 suites. The first run passed 822;
  three clinical cases required the standard ICD seed in the fresh test database.
  All three affected suites (51 cases) passed after that seed.
- API unit check, API build, web build and targeted web lint pass.
- A second disposable database was built with the previous migrations and
  `apps/api/test/fixtures/finance-legacy.sql`, then upgraded. Assertions in
  `finance-upgrade-assert.sql` verified preservation of a posted journal, its
  amounts/timestamps, a closed period and a finalized matched bank statement.
- Test databases are `finance_foundation_test` and `finance_upgrade_test`.
  Both contain synthetic fixtures, separate from the local hospital books.

Existing period reopening, year-end close, auto-draft review, hierarchical COA
and multicurrency lines remain work for their later roadmap tasks.
