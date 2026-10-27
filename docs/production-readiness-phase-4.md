# Production readiness — Phase 4: password management

Date: 2026-10-27. Branch: `redmars-v2`.

| Task | Status | Evidence / Required Action |
|---|---|---|
| Change your own password | Verified | Authenticated endpoint and screen require the current password, a different new password of at least 12 characters, and matching confirmation in the browser. API tests cover success, wrong current password, validation, and five-attempts-per-minute limiting. |
| First-login enforcement | Verified | Accounts issued through Users, HR, and practitioner onboarding are temporary. The server denies business endpoints until the password is changed; the browser redirects to `/change-password`. Refreshing tokens cannot bypass the restriction. |
| Administrator temporary passwords | Verified | Users page and existing HR reset use the same audited, facility-scoped transaction. Only `user.reset_password` holders may reset another account. Self-reset is refused; use the self-service screen instead. |
| Revoke replaced credentials | Verified | Password changes and resets increment a credential version and revoke all refresh sessions atomically. Old access tokens, refresh tokens, and replaced passwords fail regression tests. Login rechecks credentials inside its transaction to prevent issuing a session after a concurrent reset. |
| Demo-password controls | Verified | API credential issuance rejects recognized development/common demo defaults. Production hospital/demo seed refusal and the clean database gate still pass. The local Axon rehearsal has zero users or other hospital records. Never copy development credentials or a development database into production. |
| Audit and error privacy | Verified | Reset/change audits identify the actor without passwords or hashes. Credential-route error tests verify submitted values/driver arguments are not persisted or logged. |
| Additive database upgrade | Verified | Migration 51 applies without drift. Before/after checks on a disposable copy preserved existing records in all 119 tables, including 27 users' credentials. |
| Local development application | Verified | Backup created and its archive directory verified before migration. API rebuilt/restarted; API health and web each return HTTP 200. No existing user password was reset. |
| Actual VPS deployment | Postponed | Phase 2 awaits the user's VPS details. No cloud deployment, TLS, or reboot verification is claimed. |
| Real hospital accounts/configuration | Postponed | Phase 5 requires the hospital configuration file and explicit authorization. |

## Test evidence

- Separate clean source copy and disposable test database on local port 5434;
  no regression tests ran against development or the clean Axon rehearsal database.
- 76 API integration suites / **989 tests passed**, including 13 dedicated password
  cases and the additional HR reset regression.
- **13 API unit tests** and **41 shared tests** passed.
- API/shared/web builds passed. Final web build and lint were repeated after the
  password hint correction. Lint has one existing Fast Refresh warning; the web
  build has its existing large-bundle warning. No unresolved test failures.
- Fresh migration deployment, migration status, and schema drift checks passed.
- The separate local Axon rehearsal database now has all **51 migrations**, zero
  application records, and unchanged reference-only rows. Production seeding
  refusal and explicit clean-target guards were rechecked.
- Browser checks on isolated ports 3014/5174 verified the temporary-login redirect,
  direct-navigation restriction, normal account access to the change screen, and
  the administrator's target-specific temporary-password form. Credential writes
  were verified through automated HTTP integration tests; final browser password
  submission was not performed.
- Local evidence: `.test-runtime/phase4-logs/`,
  `.test-runtime/phase4-clean-db-logs/`. Backups and test credentials are ignored
  and are not part of the Git commit.

## Operational notes

The additive migration preserves existing passwords and defaults existing users
to unrestricted standing. It cannot infer which historical passwords were
temporary. Any existing account that needs a temporary credential must use the
administrator reset workflow. Production starts with a separate empty database;
historical development/demo users must not be imported.

Administrators privately deliver temporary credentials to the intended staff
member. Staff change them at first sign-in. Successful changes require signing in
again; no plaintext password is returned or written to a credential report.
New password-screen text uses English fallback where translations are absent;
Dari/Pashto wording still requires the Phase 9 staff review.

The existing `redmars-v2-rc.1` tag remains the Phase 1 snapshot and does not include
this phase. Hosted Linux CI has not been run; these are local Windows test results.

Phase 5 stays postponed. The next phase is Phase 6 financial verification and
acceptance preparation. Overall production readiness remains **NOT READY** until
the VPS, real hospital configuration, accountant acceptance, hospital UAT/pilot,
and the remaining mandatory production gates pass.
