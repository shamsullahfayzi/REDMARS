# Environment variable inventory

Names only; no secret values copied. Includes application source, seed/test helpers and tracked deployment/backup templates. Script-local variables can appear as candidates; they are not automatically mandatory deployment settings. Test-only variables must not be treated as production configuration.

| Variable | Meaning / scope | Sources |
| --- | --- | --- |
| ACME_EMAIL | Certificate-account contact email. | `output/redmars-testing-vps-kit/Caddyfile.testing:2`; `output/redmars-testing-vps-kit/compose.testing.yml:64`; `output/redmars-testing-vps-kit/generate-env.sh:23` |
| ADMINER_PORT | Legacy loopback database UI port; default 8080. | `docker-compose.yml:37` |
| ALLOW_TEST_BOOTSTRAP | Testing-only opt-in; YES_TEST_ONLY plus exact database name; not production provisioning. | `output/redmars-testing-vps-kit/compose.testing.yml:36` |
| API_DOMAIN | API FQDN without scheme/port; distinct from web. | `output/redmars-testing-vps-kit/Caddyfile.testing:9`; `output/redmars-testing-vps-kit/compose.testing.yml:54`; `output/redmars-testing-vps-kit/compose.testing.yml:63`; `output/redmars-testing-vps-kit/generate-env.sh:22` |
| AWS_ACCESS_KEY_ID | Offsite S3 credential; secret. | `output/redmars-testing-vps-kit/offsite.env.example:6` |
| AWS_DEFAULT_REGION | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `output/redmars-testing-vps-kit/offsite.env.example:8` |
| AWS_SECRET_ACCESS_KEY | Offsite S3 credential; secret. | `output/redmars-testing-vps-kit/offsite.env.example:7` |
| BACKUP_RETENTION_DAYS | Legacy backup retention; default 14 days. | `docker-compose.yml:58`; `scripts/backup.sh:11` |
| BACKUP_SCHEDULE | Legacy cron expression; default 0 2 * * *. | `docker-compose.yml:78`; `docker-compose.yml:79` |
| CADDY_API_PORT | Legacy LAN API TLS port, default 8443. | `docker-compose.yml:99` |
| CADDY_HTTPS_PORT | Legacy LAN web TLS port, default 443. | `docker-compose.yml:98` |
| CORS_ORIGIN | Exact browser web origin; local default localhost:5173 must be replaced on VPS. | `apps/api/src/main.ts:21`; `apps/api/src/config/env.validation.ts:29`; `output/redmars-testing-vps-kit/compose.testing.yml:34` |
| DATABASE_URL | Secret database URL; required PostgreSQL connection. | `docker-compose.prod.yml:27`; `apps/api/src/config/env.validation.ts:14`; `output/redmars-testing-vps-kit/compose.testing.yml:30` |
| DELETED | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `scripts/backup.sh:33`; `scripts/backup.sh:34`; `scripts/backup.sh:35` |
| DEPARTMENTS | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `apps/api/prisma/seed.ts:251` |
| DEV_PASSWORD | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `apps/api/prisma/dev-seed.ts:85` |
| JWT_ACCESS_TTL_SECONDS | Access-token lifetime; default 900 seconds. | `apps/api/src/auth/auth.module.ts:25`; `apps/api/src/auth/auth.service.ts:186`; `apps/api/src/auth/auth.service.ts:251`; `apps/api/src/config/env.validation.ts:51`; `output/redmars-testing-vps-kit/compose.testing.yml:32` |
| JWT_REFRESH_TTL_DAYS | Refresh-session lifetime; API default 7 days, testing kit overrides 1 day. | `apps/api/src/auth/auth.service.ts:130`; `apps/api/src/config/env.validation.ts:57`; `output/redmars-testing-vps-kit/compose.testing.yml:33` |
| JWT_SECRET | Secret HS256 signing key, minimum 32 characters; generated per deployment. | `apps/api/src/auth/auth.module.ts:23`; `apps/api/src/config/env.validation.ts:39`; `output/redmars-testing-vps-kit/compose.testing.yml:31`; `output/redmars-testing-vps-kit/generate-env.sh:20` |
| NODE_ENV | Runtime validation mode; compiled testing VPS uses production mode but synthetic data. | `apps/api/src/modules/finance/finance-assets.service.ts:54`; `apps/api/src/modules/finance/finance-revenue.service.ts:25`; `apps/api/prisma/dev-seed.ts:36`; `apps/api/prisma/seed.ts:449`; `apps/api/src/config/env.validation.ts:11`; `output/redmars-testing-vps-kit/compose.testing.yml:28` |
| OFFSITE_ENABLED | Optional testing kit Restic copy switch; false/no file means VPS-only backup. | `output/redmars-testing-vps-kit/backup-testing.sh:24`; `output/redmars-testing-vps-kit/offsite.env.example:3` |
| PARTIAL | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `scripts/backup.sh:14`; `scripts/backup.sh:23`; `scripts/backup.sh:24`; `scripts/backup.sh:25`; `scripts/backup.sh:29` |
| PGDATABASE | Legacy libpq target database. | `docker-compose.yml:57`; `scripts/restore.sh:32`; `scripts/restore.sh:35`; `scripts/restore.sh:43`; `scripts/restore.sh:45` |
| PGHOST | Legacy libpq host. | `docker-compose.yml:53`; `scripts/restore.sh:32` |
| PGPASSWORD | Legacy libpq secret. | `docker-compose.yml:56` |
| PGPORT | Legacy libpq port. | `docker-compose.yml:54`; `scripts/restore.sh:32` |
| PGUSER | Legacy libpq role. | `docker-compose.yml:55` |
| PORT | API listen port; default 3000. | `apps/api/src/main.ts:25`; `apps/api/src/config/env.validation.ts:12`; `output/redmars-testing-vps-kit/compose.testing.yml:29` |
| POSTGRES_DB | Database name; testing kit fixes redmars_testing. | `docker-compose.yml:20`; `docker-compose.yml:24`; `docker-compose.yml:57`; `docker-compose.prod.yml:27`; `output/redmars-testing-vps-kit/backup-testing.sh:14`; `output/redmars-testing-vps-kit/compose.testing.yml:9`; `output/redmars-testing-vps-kit/compose.testing.yml:14` |
| POSTGRES_PASSWORD | Secret database password; do not print or commit. | `docker-compose.yml:19`; `docker-compose.yml:56`; `docker-compose.prod.yml:27`; `output/redmars-testing-vps-kit/compose.testing.yml:8`; `output/redmars-testing-vps-kit/compose.testing.yml:30`; `output/redmars-testing-vps-kit/generate-env.sh:19` |
| POSTGRES_PORT | Legacy loopback host PostgreSQL port; default 5433. | `docker-compose.yml:16`; `docker-compose.prod.yml:23` |
| POSTGRES_USER | Database role; testing kit generated config. | `docker-compose.yml:18`; `docker-compose.yml:24`; `docker-compose.yml:55`; `docker-compose.prod.yml:27`; `output/redmars-testing-vps-kit/backup-testing.sh:14`; `output/redmars-testing-vps-kit/compose.testing.yml:7`; `output/redmars-testing-vps-kit/compose.testing.yml:14`; `output/redmars-testing-vps-kit/compose.testing.yml:30`; `output/redmars-testing-vps-kit/generate-env.sh:18` |
| RELEASE_TAG | Reviewed commit/image tag; record before updates. | `output/redmars-testing-vps-kit/compose.testing.yml:22`; `output/redmars-testing-vps-kit/compose.testing.yml:49`; `output/redmars-testing-vps-kit/generate-env.sh:24` |
| RESTIC_PASSWORD_FILE | Path to encryption password stored outside the backed-up config directory. | `output/redmars-testing-vps-kit/backup-testing.sh:26`; `output/redmars-testing-vps-kit/offsite.env.example:5` |
| RESTIC_REPOSITORY | Offsite repository location; keep credentials private. | `output/redmars-testing-vps-kit/backup-testing.sh:25`; `output/redmars-testing-vps-kit/offsite.env.example:4` |
| RETENTION_DAYS | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `scripts/backup.sh:10`; `scripts/backup.sh:33`; `scripts/backup.sh:35` |
| ROLES | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `apps/api/prisma/seed.ts:430` |
| SEED_ADMIN_PASSWORD | Transient bootstrap password; not needed for ordinary API startup. Do not store in Git or chat. | `apps/api/prisma/seed.ts:284` |
| SEED_ADMIN_USERNAME | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `apps/api/prisma/seed.ts:269` |
| SEED_FACILITY_CODE | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `apps/api/prisma/seed-drug-interactions.ts:45`; `apps/api/prisma/seed-drugs-medipro.ts:28`; `apps/api/prisma/seed-drugs.ts:34`; `apps/api/prisma/seed-lab-tests.ts:41`; `apps/api/prisma/seed-services-medipro.ts:26` |
| STAMP | ⚠️ UNVERIFIED variable scope/default: inspect cited source before setting | `scripts/backup.sh:12`; `scripts/backup.sh:13` |
| TZ | System/backup timezone; use Asia/Kabul as configured. | `docker-compose.yml:60`; `output/redmars-testing-vps-kit/compose.testing.yml:10`; `output/redmars-testing-vps-kit/compose.testing.yml:35` |
| VITE_API_URL | Public browser-reachable API origin; baked at web build time. | `apps/web/src/lib/api.ts:20`; `docker-compose.prod.yml:46`; `apps/web/Dockerfile:17`; `output/redmars-testing-vps-kit/compose.testing.yml:54` |
| WEB_DOMAIN | Web FQDN without scheme/port; DNS must reach VPS. | `output/redmars-testing-vps-kit/Caddyfile.testing:4`; `output/redmars-testing-vps-kit/compose.testing.yml:34`; `output/redmars-testing-vps-kit/compose.testing.yml:62`; `output/redmars-testing-vps-kit/generate-env.sh:21` |
