# syntax=docker/dockerfile:1
# REDMARS API — task 7.13. Multi-stage: the final image ships COMPILED JS
# (dist/) plus the operational Prisma scripts, never the app's own TypeScript
# source (src/, test/) — "no clean git clone of your commented TS on the
# hospital PC." prisma/*.ts (seed scripts) DO ship as source and run via
# ts-node: they're bootstrap/ops data, not the application's business logic,
# and ts-node has to be present anyway to run migrate+seed on container start.
#
# Build from the REPO ROOT (needed for the pnpm workspace — @redmars/shared
# and the lockfile live above apps/api):
#   docker build -f apps/api/Dockerfile -t redmars-api .
# docker-compose.yml does this automatically (context: ., dockerfile: apps/api/Dockerfile).

FROM node:22-alpine AS build
# Without root package.json's `packageManager` field, newer corepack falls back to
# fetching the LATEST pnpm from the registry on every invocation (COREPACK_DEFAULT_TO_LATEST)
# instead of the version `prepare --activate` just pinned below — silent network dependency
# on every single `pnpm` call. Disable that fallback outright; `packageManager` pins the
# version corepack actually uses either way (devEngines is a separate, informational field).
ENV COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

# Manifests first so `pnpm install` layer-caches across source-only changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# Cache mount: a retried install (see .npmrc's fetch-timeout comment) reuses
# already-fetched packages from the store instead of redownloading everything.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @redmars/shared build
# prisma generate BEFORE nest build — the client's generated types are an
# import the build itself type-checks against.
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api build

FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
# `npx prisma` from a subdirectory does NOT reliably walk up to find a local
# install — observed it silently ignoring the pinned 6.19.3 install and
# fetching the latest prisma (7.x) fresh from the registry instead, which
# promptly failed on a v7 schema-format breaking change. Putting the real
# .bin on PATH makes plain `prisma ...` (no npx) resolve the LOCAL pinned
# version deterministically, network or no network. pnpm's workspace layout
# puts apps/api's OWN devDependency binaries in apps/api/node_modules/.bin
# (not hoisted to the root node_modules/.bin) — that directory has to be
# copied into the image at all for this to exist, see below.
ENV PATH="/app/apps/api/node_modules/.bin:${PATH}"
WORKDIR /app

# The whole workspace's node_modules (pnpm's store-and-symlink layout doesn't
# survive being cherry-picked apart — copying it as one tree from the SAME
# stage that installed it keeps every symlink valid). Deliberately not
# pruned to --prod: ts-node/typescript stay, for the seed scripts below.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/tsconfig.json apps/api/tsconfig.json
COPY --from=build /app/apps/api/tsconfig.seed.json apps/api/tsconfig.seed.json
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/scripts apps/api/scripts
# The seed scripts (run via ts-node, not the nest build) import exactly two
# small, non-sensitive files out of src/ — the permission matrix (already
# fully public in roles-and-permissions.md) and a generic CSV parser. Copying
# just these two, not the rest of src/, keeps the "no readable business logic
# on disk" goal intact for everything that actually matters (controllers,
# services) while still letting the seed scripts run unmodified.
COPY --from=build /app/apps/api/src/auth/permissions.ts apps/api/src/auth/permissions.ts
COPY --from=build /app/apps/api/src/modules/drug/csv.ts apps/api/src/modules/drug/csv.ts

WORKDIR /app/apps/api
EXPOSE 3000

# migrate deploy (never `migrate dev` — this only applies migrations already
# committed to the repo, no prompts, no generating new ones) then the base
# seed. Both are idempotent/upsert-based by design (see seed.ts, seed-*.ts
# docblocks) — safe to run on every container start, and it means required
# base data (departments/roles/permissions/admin) is never a manual step
# someone forgot. The Medi-Pro migration seeds (drugs/services/lab-tests)
# are NOT run here — those are a deliberate one-time act, not boot plumbing.
CMD ["sh", "-c", "prisma migrate deploy && prisma db seed && node dist/main.js"]
