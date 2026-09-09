# Installing REDMARS on a single PC (Docker Desktop, no LAN)

For a clinic that only ever runs REDMARS on ONE machine — no other PC in the
building needs to reach it. Everything binds to `localhost`; there's no LAN
IP, no WSL2 networking gotcha, no port-forwarding. If a second device (another
front-desk PC, a tablet) DOES need to reach this install over the network,
use `docs/install-lan-wsl2.md` instead — that's a different setup, not an
extra step on top of this one.

All commands below run in **Git Bash** (installed together with Git for
Windows, see 0.1) — not PowerShell. The repo's helper scripts are `sh`
scripts and expect a POSIX shell; Git Bash also bundles `openssl`, which
PowerShell doesn't have. Once Docker Desktop is installed, `docker` is on
PATH in Git Bash too, so this one shell covers everything.

## 0. Install Docker Desktop + Git for Windows

1. Install **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
   Default install options are fine — it enables the WSL2 backend
   automatically, you never need to touch WSL yourself for this setup. Reboot
   if the installer asks. Open Docker Desktop once and let it finish starting
   (whale icon in the tray goes steady, not animating).
2. Install **Git for Windows**: https://git-scm.com/download/win
   Default options are fine. This is what gives you Git Bash.
3. Confirm both from Git Bash:
   ```sh
   docker --version
   docker compose version
   git --version
   openssl version
   ```

### Optional: Node + pnpm on the host

Only needed to type `pnpm deploy:up` instead of the longer raw `docker
compose` command in step 3 — the app itself runs entirely in containers
either way. Skip this whole box if you're fine with the longer command.
```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# close and reopen Git Bash so `nvm` is on PATH
nvm install 22
nvm use 22
corepack enable
corepack prepare pnpm@11.13.0 --activate   # matches package.json's pin
```

## 1. Get the code

```sh
git clone <your-remote> ~/redmars
cd ~/redmars
```
Any path works. Avoid `/mnt/c/...`-style paths if you ever open this same
clone from WSL later — not relevant here since Docker Desktop handles the
Windows/container boundary itself.

## 2. Environment files

Two `.env` files, both gitignored:
```sh
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

**Root `.env`**:
- `POSTGRES_PASSWORD` — replace `change-me` with a real generated password:
  `openssl rand -base64 24`
- `POSTGRES_PORT` / `ADMINER_PORT` — defaults are fine unless something else
  on the PC already owns 5433/8081
- `CADDY_HTTPS_PORT=443`, `CADDY_API_PORT=8443` — leave at defaults
- `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `TZ` — defaults are sane
- `VITE_API_URL=https://localhost:8443` — this is baked into the web bundle
  at BUILD time (Vite), so set it correctly before step 4; changing it later
  means rebuilding the `web` image, not just restarting a container. Because
  this machine is both server and client, `localhost` is correct here —
  unlike the LAN setup, there's no second device for `localhost` to mean the
  wrong thing to.

**`apps/api/.env`**: fill in —
- `CORS_ORIGIN="https://localhost"` — must match the origin the browser
  actually loads the app from
- `JWT_SECRET` — generate fresh: `openssl rand -base64 48`
- Leave `DATABASE_URL` as the template default — the containerized `api`
  service overrides it (see `docker-compose.prod.yml`'s comments)

## 3. TLS certificate

```sh
scripts/gen-lan-cert.sh
```
No hostname/IP arguments needed — the script's default SAN already covers
`localhost` and `127.0.0.1`, exactly what this setup needs. Writes
`certs/redmars.crt` / `certs/redmars.key` (gitignored, install-specific).

## 4. Build and start everything

```sh
pnpm deploy:up
```
Skipped the optional Node install above? Run the same thing directly:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```
This builds `redmars-api`/`redmars-web` from their Dockerfiles and starts
Postgres, Adminer, the backup sidecar, `api`, `web`, and Caddy (TLS on 443,
API on 8443). The `api` container runs `prisma migrate deploy` then `prisma
db seed` on every start (idempotent, safe to re-run).

**Watch the logs for the admin password the first time** — printed once to
stdout, no second way to retrieve it:
```sh
pnpm deploy:logs
```
Look for a line from the `api` container like `admin user: 'admin' created`.

**Now seed the full catalog** — the base seed above only creates the
facility, departments, roles, and the admin account. Run these once
(idempotent, safe to re-run) so this install has every department,
medicine, service, and lab test from day one — real Medi-Pro migrated data,
not test fixtures:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api pnpm db:seed:icd
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api pnpm db:seed:drugs-medipro
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api pnpm db:seed:services-medipro
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api pnpm db:seed:lab-tests
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api pnpm db:seed:interactions
```
See `medipro-data-migration.md` in project memory for exactly what each
covers — 1201 drugs, 355 services, 264 lab tests, ICD codes, drug-interaction
pairs. **None of it has price data** — no old export had prices — so admin
must bulk-price drugs/services before real invoicing works. Do not run plain
`pnpm db:seed:drugs` instead of `db:seed:drugs-medipro` — that's a small
curated psychiatric-focused starter list from an earlier task, not the real
formulary; running it alongside `drugs-medipro` just duplicates entries.

To stop: `pnpm deploy:down`. To rebuild after a code change: `pnpm deploy:up`
again — compose only rebuilds what changed.

**If the build fails during `pnpm install --frozen-lockfile`** with something
like `[23] The operation was aborted due to timeout` — re-run `pnpm
deploy:up`; root `.npmrc` (raised fetch timeout/retries) plus a BuildKit
cache mount in both Dockerfiles mean a retry resumes instead of starting
over, and usually gets through on the second or third attempt.

**If the build fails with `Corepack is about to download
.../pnpm-<version>.tgz` then `ETIMEDOUT`/`ENETUNREACH`** — confirm you have
the fix: `grep packageManager package.json` should show
`"packageManager": "pnpm@11.13.0"`. If it's missing, `git pull` first.

## 5. Trust the certificate on this PC

Only one device to do this on. Covered fully in `docs/https-lan.md`
("Windows" section) — copy `certs/redmars.crt` isn't even necessary since
it's already local; just import it into the Windows certificate store as
that doc describes, then restart the browser.

## 6. Verify

```sh
curl -k https://localhost:8443/health     # {"status":"ok",...}
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```
All six services should show healthy/running. Then open
`https://localhost` in a browser on this PC and log in as `admin` with the
password from step 4.

## 7. If this box already has test data on it: clean it before real use

Skip on a genuinely fresh install. For turning an existing test install into
a real starting point without losing catalog data (drugs/services/lab
tests/roles):
```sh
pnpm db:backup   # always first — this is a real delete, not a soft one
docker compose exec api sh -c \
  "RESET_CONFIRM=yes-wipe-transactional-data npx ts-node -P tsconfig.seed.json scripts/reset-to-clean.ts"
docker compose exec api npx prisma db seed
```
See `docs/install-lan-wsl2.md`'s equivalent section for the full detail on
what `reset-to-clean.ts` does and doesn't touch — identical here, this isn't
LAN-specific behavior. The second command prints a fresh admin password once,
to the terminal — write it down immediately.

## What this setup does NOT give you

- **No other device can reach this install.** Everything binds to
  `localhost` on this one PC. If that changes later, switching to
  `docs/install-lan-wsl2.md` means regenerating the cert and rebuilding the
  `web` image with a real LAN `VITE_API_URL` — not a config toggle.
- Same open items as the LAN setup: 7.5 (printer QA), 7.14/7.15 (license
  token / hardware binding) — see `docs/install-lan-wsl2.md`'s closing
  section.
