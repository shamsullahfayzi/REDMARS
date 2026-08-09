# Installing REDMARS on Farhat's server

Task 7.13 landed: `apps/api` and `apps/web` build into real Docker images
(`apps/api/Dockerfile`, `apps/web/Dockerfile`) — the whole stack, DB included,
is one `docker compose` command.

Step 0 gets a Linux shell + Docker + the code onto the box; everything after
that assumes it's already there. `docs/server-hardening.md` and
`docs/https-lan.md` cover the *why* behind several steps here; this is the
*what, in order*.

**Status note (2026-08-07): fully verified end to end** — `pnpm deploy:up`
brings up all 6 containers healthy, migrate+seed run correctly inside the
`api` container, real HTTP confirmed through Caddy on both ports. Details in
`phase-7-13-containerize.md` (project memory) if you hit something this doc
doesn't cover.

## 0. Full server bootstrap — WSL2, Docker, Node, the code

Everything in this section runs once, in order, on a genuinely fresh Windows
server. If something here half-worked before (e.g. Docker installed "another
way"), see **0.2's cleanup note** before installing again — a half-present
Docker install is a common cause of the next install silently doing the wrong
thing.

### 0.1 Get a real Linux shell — WSL2, not Docker Desktop

**Not Docker Desktop.** Docker Desktop *also* runs on WSL2 under the hood, but
it adds a GUI, a tray icon, and (for larger orgs) a commercial license the
hospital doesn't need. Installing Docker Engine directly inside a WSL2 Ubuntu
distro skips all of that and gets you the real Linux box every step below
already assumes — no separate "Windows instructions" branch to maintain.

This is also the actual security win, not just a technical detail: the
containers, the database, and the compiled app all live inside the WSL2 VM's
own filesystem, not on the Windows side. Someone browsing `C:\` in Explorer or
checking Task Manager on the hospital server sees a `wsl.exe`/`vmmem` process,
not "here's a Postgres and a Node app, here's a folder of code." It does NOT
stop someone with actual admin access to that Windows box — `wsl -l -v`, enter
the distro, `docker ps`, and it's all visible again. That's expected: hiding a
running service from a local admin is not a real security boundary, it's
housekeeping. The actual protection against someone copying this install to
run unlicensed elsewhere is task 7.14 (signed license token), not this.

```powershell
# Run as Administrator, in PowerShell, on the hospital server itself:
wsl --install -d Ubuntu
# Reboot if prompted. Then open the new "Ubuntu" app once to finish setup
# (creates a Linux username/password — this is separate from Windows' own).
```

Confirm the version and update the base image before installing anything else:
```sh
lsb_release -a          # confirm which Ubuntu release you actually got
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg git openssl
```

Everything from here on runs inside this Ubuntu shell, not PowerShell.

### 0.2 Install Docker Engine (official apt repo — the debuggable method)

If a previous attempt used the `get.docker.com` convenience script (or
anything else) and it "didn't work," **remove whatever's there first** —
running a second install on top of a half-finished first one is a common
cause of confusing failures (wrong `docker` binary on `PATH`, a systemd unit
pointing at a package that no longer matches, etc.):
```sh
# Safe to run even if nothing is installed — every line no-ops on "not found."
sudo systemctl stop docker docker.socket 2>/dev/null
sudo apt -y remove docker docker-engine docker.io docker-ce docker-ce-cli \
  containerd containerd.io docker-buildx-plugin docker-compose-plugin runc
sudo rm -rf /var/lib/docker /var/lib/containerd
```
This does NOT touch `/opt/redmars` or anything under the repo checkout — only
Docker's own binaries/state.

Now install fresh, straight from Docker's official apt repository (the same
thing `get.docker.com` automates, but each step is visible so a failure points
at exactly what broke — GPG key fetch, repo add, or the apt install itself):
```sh
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
# log out of the Ubuntu shell and back in (or `newgrp docker`) for the group change to apply
docker compose version   # confirms the plugin is present
docker run hello-world   # confirms the daemon actually works end to end
```

**If `curl -fsSL https://download.docker.com/...` itself times out or can't
resolve** — that's the hospital network blocking `download.docker.com`
specifically (firewall/proxy), not a WSL2 problem. Fallback: Ubuntu's own
`docker.io` package, older but works entirely from Ubuntu's default mirrors:
```sh
sudo apt -y install docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

### 0.3 Install Node + pnpm on the host (for the `pnpm deploy:*` shortcuts)

The app itself runs entirely inside containers — the host doesn't need Node
to *run* REDMARS. It needs Node only to type `pnpm deploy:up` instead of the
longer raw `docker compose -f ... up -d --build --wait` (`package.json`'s
`scripts` block is what `pnpm deploy:*` resolves). Skip this whole section and
use the raw `docker compose` commands (given inline at each step below) if
you'd rather not install Node on the server at all.

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# close and reopen the shell (or: source ~/.bashrc) so `nvm` is on PATH
nvm install 22
nvm use 22
node -v          # v22.x
corepack enable
corepack prepare pnpm@11.13.0 --activate   # matches the version pinned in package.json
pnpm -v           # 11.13.0
```

### 0.4 Get the code onto the server

```sh
git clone <your-remote> /opt/redmars
cd /opt/redmars
```

Any path works; nothing below assumes `/opt/redmars` specifically now that
there are no systemd units pointing at a fixed path (that was the host-run
approach — see "What changed" at the bottom). Source is present on disk at
clone time, but what actually RUNS is the compiled image `docker build`
produces — `apps/api/Dockerfile`'s runtime stage copies `dist/`, never
`src/**/*.ts` or `apps/web/src/**/*.ts`. `.ts` source is still readable in the
git checkout itself, which is fine on hospital-owned hardware for a pilot, not
for handing the box to someone outside that trust boundary.

Keep the clone INSIDE the WSL2 filesystem (`/home/<user>/redmars` or
`/opt/redmars`, not `/mnt/c/...`) — cloning onto the Windows-mounted drive
works but is slower for Docker builds and puts the checkout somewhere Windows
Explorer can browse to directly via `\\wsl$\`.

**Re-running this on a box that already has an older clone** (e.g. picking up
this session's Docker/corepack fixes): `cd /opt/redmars && git pull`, then
skip to step 3 (Build and start everything) — no need to re-clone or redo 0.1–0.4.

### 0.5 Confirm disk headroom before the first build

```sh
df -h
```
The image builds pull ~1GB+ of layers each; a build that dies mid-way from a
full disk can leave Docker itself in a bad state, not just a failed build.
WSL2's virtual disk grows dynamically but doesn't shrink back on its own — if
this server is disk-constrained, that's worth knowing before step 3, not
after a confusing failure during it.

## 1. Environment files

Two `.env` files, both gitignored:

```sh
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

**Root `.env`** (`docker compose` reads this — this is now also where the
containerized API gets its DB credentials FROM, see "What changed" below):
- `POSTGRES_PASSWORD` — replace `change-me` with a real generated password
  (`openssl rand -base64 24`)
- `POSTGRES_PORT` / `ADMINER_PORT` — defaults (5433/8081) are fine unless something
  else on the box already owns them
- `CADDY_HTTPS_PORT=443`, `CADDY_API_PORT=8443` — leave at the real defaults; the
  local-dev overrides in the comment are for a Windows box with XAMPP, not this server
- `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `TZ=Asia/Kabul` — defaults are sane
- `VITE_API_URL` — set to `https://<server-lan-ip-or-hostname>:8443`. This is a
  BUILD-time value baked into the web bundle (Vite), so get it right before
  step 3 — changing it after means rebuilding the `web` image, not just
  restarting a container.

**`apps/api/.env`**: fill in —
- `CORS_ORIGIN="https://<server-lan-ip-or-hostname>"` — must match the origin
  browsers actually load the app from
- `JWT_SECRET` — generate fresh on THIS box (`openssl rand -base64 48`), never
  copied from the dev `.env` — see `docs/server-hardening.md`'s "no default
  passwords" section for why
- Leave `DATABASE_URL` as the template's default — the containerized `api`
  service overrides it anyway (see below); this value only matters if you ever
  run the API as a host process instead.

## 2. LAN TLS certificate

```sh
scripts/gen-lan-cert.sh redmars.local <server-lan-ip>
```
Use the SAME hostname/IP here as `VITE_API_URL` above. This writes
`certs/redmars.crt` / `certs/redmars.key` — gitignored, install-specific.

## 3. Build and start everything

```sh
pnpm deploy:up
```
Skipped 0.3 (no Node on this box)? Run the same thing directly instead:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```
Either way, this is the whole thing — one command. It:
- builds `redmars-api` and `redmars-web` from their Dockerfiles
- starts Postgres, Adminer, the backup sidecar, `api`, `web`, and Caddy (now
  pointed at the `api`/`web` containers by service name — `Caddyfile.prod`,
  not the base `Caddyfile`)
- the `api` container's own startup runs `prisma migrate deploy` then `prisma
  db seed` before starting the server (see `apps/api/Dockerfile`'s `CMD`) —
  both idempotent, safe on every restart

**Watch the logs for the admin password the FIRST time** — the seed prints it
once, to stdout, and there is no second way to retrieve it:
```sh
pnpm deploy:logs
```
Look for a line from the `api` container around `admin user: 'admin' created`.
(Optional, if also testing the Medi-Pro migration data from this session:
`docker compose exec api pnpm db:seed:drugs-medipro` and the `services-medipro`
/ `lab-tests` equivalents — see `medipro-data-migration.md` in project memory
for what each covers and what it doesn't, namely prices.)

To stop everything: `pnpm deploy:down`. To rebuild after a code change:
`pnpm deploy:up` again — compose only rebuilds what changed.

**If the build fails during `pnpm install --frozen-lockfile` with something
like `[23] The operation was aborted due to timeout` / `TimeoutError`** — this
is NOT a bandwidth problem (seen even on a fast link). It's WSL2's network
stack dropping longer-lived TCP connections to the npm registry (MTU/DNS
flakiness under the hood). Two fixes already checked in for this:
- root `.npmrc` raises pnpm's fetch timeout/retries and caps concurrency
- both Dockerfiles use a BuildKit cache mount (`--mount=type=cache`) for the
  pnpm store, so a retry doesn't redownload packages already fetched

Just re-run `pnpm deploy:up` — it'll resume from cache and usually gets
through on the second or third attempt. If it keeps failing, restart WSL2 from
Windows PowerShell (`wsl --shutdown`, reopen Ubuntu) before retrying — this
resets its network stack and clears most MTU-related hangs.

**If the build fails with `Corepack is about to download
https://registry.npmjs.org/pnpm/-/pnpm-<some-other-version>.tgz` followed by
`ETIMEDOUT`/`ENETUNREACH`** — this is a DIFFERENT bug from the one above, and
`.npmrc` doesn't help it (corepack's own download path ignores `.npmrc`).
Already fixed in this repo: root `package.json` now pins `"packageManager":
"pnpm@11.13.0"` and both Dockerfiles set `COREPACK_DEFAULT_TO_LATEST=0` — so
corepack uses the version already prepared in the image instead of trying to
fetch whatever's newest on the registry. If you still see this, `git pull` to
confirm you actually have that fix (`grep packageManager package.json`).

## 4. If this box already has test data on it: clean it before real use

Skip this on a genuinely fresh install — a brand-new database has nothing to
clean, step 3's seed already leaves it in the right state. This step is for
turning an EXISTING install that was used for testing (dev accounts, load-test
patients, stray manually-created departments, etc.) into a real starting
point, without losing the catalog work (the migrated drug/service/lab-test
data, roles/permissions).

```sh
pnpm db:backup   # always, first — this is a real delete, not a soft one
docker compose exec api sh -c \
  "RESET_CONFIRM=yes-wipe-transactional-data npx ts-node -P tsconfig.seed.json scripts/reset-to-clean.ts"
docker compose exec api npx prisma db seed
```
`reset-to-clean.ts` (`apps/api/scripts/`) deletes every patient, visit,
invoice, prescription, lab order, user, session, and audit row — everything
this project's build-and-test history accumulated — but leaves departments,
drugs, services, lab tests + reference ranges, ICD codes, drug interactions,
roles/permissions, specialities, and the facility record untouched. It also
resets the MRN/visit/invoice/receipt/lab-order counters to zero (so the first
real patient gets `MRN-000001`, not wherever testing left off) and strips the
handful of load-test-only rows those kept tables picked up (a placeholder
service, three lab tests' load-test-only prices, any non-real department
codes). Refuses to run without the `RESET_CONFIRM` env var — that's the
confirmation, there is no interactive prompt.

The second command (`prisma db seed`) is what actually creates the one real
admin account — `app_user` is empty after the reset, so this prints a freshly
generated password **once, to the terminal you're watching**. Write it down
immediately; there is no second way to retrieve it.

**Note for anyone reading this after an earlier session already ran this
reset**: it was run once already, on 2026-08-07, against the dev/staging
database this repo was built against — not necessarily the actual Farhat
server, which nobody running these tools has direct access to. If Farhat's
server has its own separate install with its own test data, someone with
hands on that box needs to run the three commands above there too.

## 5. Trust the certificate on every test device

Every browser that opens the app will show "Not secure" until it trusts
`certs/redmars.crt` — one-time, per device, covered fully in
`docs/https-lan.md`. Copy that file (it's public, not a secret) to each test
device and follow the OS-specific steps there.

## 6. Verify

```sh
curl -k https://localhost:8443/health     # API — {"status":"ok",...}
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```
All six services should show healthy/running. Then from an actual LAN client
(not the server itself), with the cert trusted: `https://<server-lan-ip>`
should load the app, and logging in as `admin` with the password from step 3
(fresh install) or step 4 (reset existing install) should work. If step 5
hasn't been done on that device yet, expect a browser warning but a working
app underneath it — known, documented gap, not a broken install.

## What changed vs before 7.13 (for anyone who used the old host-run flow)

- `apps/api`/`apps/web` are no longer run with `pnpm dev:api` / `pnpm dev:web`
  on the server — they're images now (`apps/api/Dockerfile`,
  `apps/web/Dockerfile`), built and run by `docker compose`.
- `deploy/redmars-api.service` / `deploy/redmars-web.service` (systemd units
  for the old host-process approach) are no longer the recommended path — a
  container's own `restart: unless-stopped` replaces what those gave you.
  Left in the repo as a fallback, not deleted, in case containers are ever
  undesirable on a specific box.
- The base `docker-compose.yml` + base `Caddyfile` are UNCHANGED and still
  drive local Windows dev exactly as before (`pnpm dev`, host-run, Caddy
  pointed at `host.docker.internal`) — `docker-compose.prod.yml` +
  `Caddyfile.prod` are a pure ADD-ON layered on top only for a real install,
  never required for dev.
- `apps/api/.env`'s `DATABASE_URL` is only read as-is for a host-run API now
  (local dev, or the old systemd approach). The containerized `api` service
  gets `DATABASE_URL` from `docker-compose.prod.yml`'s own `environment:`
  block instead, built from root `.env`'s `POSTGRES_*` vars pointed at the
  `postgres` service by container name — see that file's comments.

## What this does NOT cover yet

- **7.5** — printer QA. Deprioritized — a known, simple fix once there's a
  real printer to test against.
- **7.6** — legacy Medi-Pro patient-ID migration. Skipped, confirmed: Farhat
  does not want old patient IDs migrated. Departments/drugs/services/lab-tests
  were migrated instead (see `medipro-data-migration.md`).
- **A host firewall** (`ufw`) — documented and ready to run in
  `docs/server-hardening.md`, not yet executed anywhere (needs the real box).
  Runs inside the WSL2 Ubuntu shell same as everything else in that doc.
- **7.14/7.15** (signed license token, optional hardware-fingerprint binding)
  — not built. This is the real answer to "stop someone from copying this
  install and running it unlicensed elsewhere," which step 0's WSL2 note
  above deliberately does NOT claim to solve on its own.
- **7.9/7.10/7.11** (staff training, parallel run, go-live) — blocked on this
  doc actually being run against the real server once, which hasn't happened
  yet.
