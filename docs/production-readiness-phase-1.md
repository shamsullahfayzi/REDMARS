# Production readiness — Phase 1

Date: 2026-10-27. Branch: `redmars-v2`.

Release-candidate tag: `redmars-v2-rc.1`.

This record covers release stability. It does not establish VPS deployment,
production database readiness, accountant acceptance, hospital UAT, or completion
of the postponed hospital configuration phase.

## Inventory and review

The starting Git status contained **128 modified/deleted tracked paths and 142
grouped untracked entries**. Expanding untracked directories produced 501 paths.
Of these, 185 were unrelated ICPC/generated files under `output/` and `tmp/`;
they are preserved and excluded from the release commit. The original 316
in-scope paths, plus Phase 1 corrections and review evidence, are recorded in
`production-readiness-phase-1-inventory.tsv`.

Review combined path/scope classification, credential-pattern scanning, schema
and migration comparison, type/build checks, regression tests, and inspection
of critical authorization, transaction, billing, clinical snapshot, account,
and audit paths. This is a technical release review, not an independent
penetration test or hospital acceptance.

## Corrections

- Aligned Prisma foreign-key names, referential actions, missing actor relations,
  and financial-audit defaults with the database produced by the 50 migrations.
  Applied migration files were preserved.
- Added schema validation, migration status and zero-drift checks to CI.
- Prevented concurrent practitioner-account creation from overwriting account
  links or leaving an extra account behind.
- Rechecked HR account eligibility and ownership in the onboarding transaction;
  refused onboarding/reactivation for exited or suspended staff through HR and
  generic user controls; revoked sessions on deactivation and employee exit.
- Redacted private employee-document content and descriptive fields from new
  audit snapshots. Existing audit data was preserved.
- Corrected appointment rescheduling so the old interval is released atomically,
  CRM source links survive, and an unavailable replacement restores the original.
- Removed local credential/workbook file writes from finance regression setup;
  corrected the synthetic legacy chart and exited-employee fixtures.
- Excluded local environment files, test runtimes and unrelated generated files
  from Docker build context. A harmless marker check confirmed Docker cannot
  copy the excluded test runtime.
- Corrected the HR assessment's claim that every clinical account is HR-linked:
  the existing administrator route for legacy practitioner profiles remains.

## Verification

| Task | Status | Evidence / Required Action |
|---|---|---|
| Starting change inventory | Verified | All 501 starting paths classified; 185 unrelated generated paths preserved outside release. |
| Existing migration history | Verified | All 50 local migration checksums match the recorded development history; no failed/rolled-back migrations. |
| Fresh migration replay | Verified | All 50 migrations applied to an empty isolated PostgreSQL 16 database. |
| Schema consistency | Verified | Prisma validation passes; comparison of migrated database to schema reports no difference. |
| Legacy upgrade preservation | Verified | All 50 migrations replayed with a synthetic legacy fixture; posted amounts, dates, closed periods, immutable entries and finalized bank reconciliation preserved. |
| Test database protection | Verified | Six positive/negative guard checks pass; missing connection and hospital-like database names are refused. |
| Focused account/report regression | Verified | Four suites, 36 tests pass after account, audit and finance-test corrections. |
| Final clean CI-equivalent cycle | Verified | Clean dependency install; Prisma generation/validation; migration deploy/status/drift; 41 shared tests; API/web builds; web lint; 10 unit tests; 75 API regression suites / 975 tests all pass. |
| Reviewed release commit and candidate | Verified | `redmars-v2-rc.1` identifies the reviewed release commit on `redmars-v2`. Unrelated `output/` and `tmp/` files remain outside the commit. |

The clean cycle runs on Windows with Node 22 and pnpm 11.13.0 against an isolated
PostgreSQL 16 Docker service. The checked-in GitHub workflow targets Ubuntu;
no GitHub-hosted run has been claimed. Logs and source fingerprints are retained
locally in ignored `.test-runtime/phase1-final-logs/`. Migration/upgrade/context
evidence is in `.test-runtime/phase1-logs/`.

Web lint reports one existing Fast Refresh export warning in
`apps/web/src/components/ui/button.tsx`. The web build reports a large-bundle
warning. Neither is a test failure. Prisma also reports its existing config
deprecation warning; upgrading Prisma is outside this phase.

## Release boundary

Phase 5 remains postponed. No VPS deployment or real hospital import occurred.
The development database, its synthetic demo facility, and hospital records were
not used as test targets. Later production and hospital acceptance gates remain
required. Overall production readiness remains **NOT READY**.
