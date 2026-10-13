# REDMARS API

NestJS + Prisma backend for [REDMARS HMIS](../../README.md).

```bash
pnpm --filter api start:dev     # dev server on :3000
pnpm --filter api test          # unit tests
pnpm --filter api test:e2e      # end-to-end tests
pnpm --filter api load-test     # 40-concurrent-patient load test
```

Seed scripts: `db:seed`, `db:seed:drugs`, `db:seed:icd`, `db:seed:interactions`, `db:seed:lab-tests`.
Environment variables are documented in [`.env.example`](.env.example).
