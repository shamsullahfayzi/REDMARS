# REDMARS Web — task 7.13. Builds the SPA, then serves the static output with
# Caddy (already the base image the front-door proxy uses elsewhere in this
# stack — reusing it here means no new server technology enters the project
# just to serve static files).
#
# VITE_API_URL is a BUILD-time value (Vite bakes `import.meta.env.*` into the
# bundle) — it must be the URL a BROWSER can reach the API at, i.e. the
# front-door Caddy's :8443, not the internal `api:3000` service name docker
# networking uses between containers.
#
# Build from the REPO ROOT, same reason as apps/api/Dockerfile:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://redmars.local:8443 -t redmars-web .

FROM node:22-alpine AS build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# See apps/api/Dockerfile's comment on this same line — devEngines' caret range
# trips corepack's own auto-read, so pin explicitly.
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @redmars/shared build
RUN pnpm --filter web build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
