# Production readiness — Phase 3: clean database

Date: 2026-10-27. Branch: `redmars-v2`.

Phase 2 is postponed at the user's request until VPS configuration is supplied.
This phase prepares and verifies a **local clean-database rehearsal**. It is not
a deployed or verified VPS production database.

## Changes and separation

- Created local PostgreSQL container `redmars-axon-clean-postgres` with its own
  named volume `redmars_axon_clean_pgdata` and database `axon_production`.
  Its database port is bound to loopback only (`127.0.0.1:5435`). The development
  container, database, volume and records were preserved.
- Applied only the 50 committed migrations. No development dump, test fixture,
  hospital configuration, patient, employee, opening balance or account was
  imported into the clean database.
- Removed `prisma db seed` from production container startup. Startup now applies
  migrations and starts the API. The legacy seed is blocked when
  `NODE_ENV=production` because it contains development hospital configuration.
- Added `apps/api/scripts/verify-clean-database.ts`, a read-only verifier that
  requires an explicit database connection and matching `CLEAN_DATABASE_NAME`.
  It checks the full migration sequence and checksums, and counts every Prisma
  model. It refuses nonempty business tables instead of deleting their data.
- Preserved the one-hospital-per-database architecture. The clean database has no
  facility until the approved Phase 5 configuration is supplied. Existing global
  roles/permissions inserted by migrations are schema reference data.

## Results

| Task | Status | Evidence / Required Action |
|---|---|---|
| Cloud VPS deployment — Phase 2 | Postponed | User requested postponement until VPS configuration is available. |
| Separate local clean database | Verified | Dedicated container/volume; `axon_production` created without reusing development storage. |
| Schema and migration consistency | Verified | All 50 migrations applied; status current; zero schema drift; repeated migration deploy makes no changes. |
| Exclude synthetic/business records | Verified | 119 models checked; zero facilities, users, patients, employees and financial journals; every non-reference model is empty. |
| Refuse contaminated databases | Verified | A separate `phase3_contamination_test` database containing a synthetic `AXON_DEMO_10` facility is rejected. Nothing is deleted by the verifier. |
| Explicit connection safety | Verified | Missing expected database name, missing connection, and malformed connection are refused without printing a connection string. |
| Production seed protection | Verified | Legacy base seed, developer-account seed and synthetic-demo script all refuse the production target; clean counts remain zero. |
| Production startup configuration | Completed | Docker CMD reviewed and checked to contain migrations plus API only. Full production image/startup verification remains part of postponed Phase 2. |
| VPS production database | Blocked | Requires the VPS details and resumption of Phase 2; create a fresh database on that VPS and repeat these checks. |
| Actual hospital configuration — Phase 5 | Postponed | Requires the user's actual configuration file and authorization. No facility/admin account is created here. |

The migration-created reference rows are: 2 roles, 41 permissions and 13 role
grants. They are not staff accounts. Login and hospital operations are not ready
on this empty database; authorized hospital/bootstrap configuration is still required.

Fourteen migration/verification/negative checks and two additional seed refusal
checks passed locally. Expected refusal commands return a nonzero exit status;
these are passing negative tests. Evidence is retained in ignored
`.test-runtime/phase3-logs/`. No failed check remains.

## VPS procedure when Phase 2 resumes

1. Provision a fresh PostgreSQL database and separate persistent volume on the VPS.
   Do not restore the development database or copy a test database/volume into it.
2. Supply the production `DATABASE_URL` securely and set
   `CLEAN_DATABASE_NAME=axon_production` (or the exact approved database name).
3. Apply committed migrations using `pnpm --filter api exec prisma migrate deploy`.
4. Verify migration status and schema consistency as in CI, then run:

   ```text
   pnpm --filter api exec ts-node -P tsconfig.seed.json scripts/verify-clean-database.ts
   ```

5. Keep generic/demo seeds disabled. Apply hospital master data only after the
   Phase 5 file and authorization are available; create staff credentials through
   the approved account workflow. Configure a restricted runtime database role
   during VPS provisioning; local rehearsal credentials are not production secrets.

The clean verifier is a **pre-configuration gate**. After authorized hospital
data is loaded, it is expected to reject a populated database. It is never a
cleanup/reset utility.

Overall production readiness remains **NOT READY**. The VPS database has not
been provisioned or tested, and the hospital acceptance gates remain open.
