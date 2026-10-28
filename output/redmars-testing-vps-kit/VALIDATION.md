# Local validation and limits

Prepared 28 October 2026 against redmars-v2 at b7aad9c.

## Successfully checked locally

- Standalone Docker Compose configuration parses with dummy environment values.
- Caddy 2 configuration validates using example hostnames; no certificates were
  requested and no public listener or VPS deployment was started by this check.
- The three Bash entry scripts pass `bash -n` syntax checking.
- The current API builds locally on Windows.
- All 51 migrations apply to a separate disposable PostgreSQL 16 database.
- The provided bootstrap creates only one synthetic facility and administrator,
  applies the current code's 12 roles / 135 permissions / 334 grants, and requires
  a first-login password change. A second bootstrap invocation is refused.
- A custom-format PostgreSQL dump was created, its archive directory validated,
  and the dump restored into another separate database with `--exit-on-error`.
- Migration and representative row counts match after restore: 51 migrations,
  one testing facility, one testing account, and zero patients, employees or
  financial journals. No real hospital or development data was used.
- The 24-page PDF was rendered to images and visually inspected; text geometry
  checks found zero out-of-margin words.

## Not claimed as verified

- Your VPS OS, DNS, firewall, public certificate issuance, Linux application image
  build/runtime, resource capacity, hospital connectivity and printers.
- Actual systemd execution at 02:00, reboot recovery, or a following-night backup.
- An off-server repository, credentials, upload, pruning or recovery from that
  repository. Configure and verify those manually if enabling the optional path.
- Actual hospital UAT, real financial opening balances, unpaid-invoice carry-forward,
  production configuration or financial acceptance.

The backup script's shell syntax and PostgreSQL dump/restore operations were
checked; its exact root-path/systemd integration must be tested on Ubuntu using
the guide. An enabled timer alone is not backup verification. An archive listing
alone is not a full restore test. These limits are why the guide includes manual
deployment, overnight, restore, reboot and staff-device checkpoints.

The repository's application code and existing deployment files were not changed.
Only guide/kit artifacts were created. The optional Linux image build attempted
locally is not evidence that your VPS deployment has been verified.
