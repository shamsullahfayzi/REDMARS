# Installing REDMARS for LAN access (plain Windows + Docker Desktop)

For a hospital server that other PCs on the LAN (reception, pharmacy, nursing
stations) need to reach, using **Docker Desktop** instead of raw WSL2 +
Docker Engine. Simpler than `docs/install-lan-wsl2.md` — Docker Desktop
publishes container ports directly on the Windows host's own network
adapter, so there's no WSL2-mirrored-networking / `netsh portproxy` step to
get right. Trade-off: Docker Desktop's GUI/tray footprint and (for larger
orgs) its commercial licensing terms — irrelevant for a single hospital
install, but see `docs/install-lan-wsl2.md`'s intro if that ever matters.

If this box is a single standalone PC that NO other device needs to reach,
use `docs/install-simple-pc.md` instead — same tool, but everything binds to
`localhost` and skips the firewall/static-IP work below entirely.

Read `docs/farhat-server-setup.md` first if you haven't already — it covers
picking the machine, giving it a static LAN IP, and what happens to this
install across a reboot/power-cut. This document is only the *software*
install once that groundwork is done.

All commands below run in **Git Bash** (installed together with Git for
Windows) — not PowerShell, except the few steps explicitly marked
PowerShell (firewall rules, static IP). The repo's helper scripts are `sh`
scripts and expect a POSIX shell; Git Bash also bundles `openssl`, which
PowerShell doesn't have.

## 0. Before you start: this server needs a static LAN IP

Every client's browser and every cert are pinned to one address. If this
server's IP can change (DHCP), logins break the next time the DHCP lease
renews with a different address. Set a static IP (or a DHCP reservation on
the hospital's router, which amounts to the same thing) before continuing —
covered in `docs/farhat-server-setup.md` step 2. Have that IP (e.g.
`192.168.1.50`) ready; every step below uses it.

## 1. Install Docker Desktop + Git for Windows

1. Install **Docker Desktop for Windows**:
   https://www.docker.com/products/docker-desktop/
   Default install options are fine — it enables the WSL2 backend
   automatically, you never need to touch WSL yourself for this setup.
   Reboot if the installer asks. Open Docker Desktop once and let it finish
   starting (whale icon in the tray goes steady, not animating).
2. In Docker Desktop → **Settings → General**, confirm **"Start Docker
   Desktop when you sign in"** is checked. This matters more here than on a
   dev laptop — see `docs/farhat-server-setup.md`'s reboot-persistence
   section for why, and the Windows auto-login step that goes with it.
3. Install **Git for Windows**: https://git-scm.com/download/win
   Default options are fine. This is what gives you Git Bash.
4. Confirm both from Git Bash:
   ```sh
   docker --version
   docker compose version
   git --version
   openssl version
   ```

### Optional: Node + pnpm on the host

Only needed to type `pnpm deploy:up` instead of the longer raw `docker
compose` command in step 5 — the app itself runs entirely in containers
either way. Skip this whole box if you're fine with the longer command.
```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# close and reopen Git Bash so `nvm` is on PATH
nvm install 22
nvm use 22
corepack enable
corepack prepare pnpm@11.13.0 --activate   # matches package.json's pin
```

## 2. Open the firewall for LAN clients

Docker Desktop publishes the app's ports on this machine's real network
adapter, but Windows Firewall still blocks unsolicited inbound connections
from other PCs by default. Run as **Administrator**, in **PowerShell**:
```powershell
netsh advfirewall firewall add rule name="REDMARS HTTPS" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="REDMARS API" dir=in action=allow protocol=TCP localport=8443
```
If this PC's active network profile is **Public** rather than
**Private/Domain** (check: Settings → Network & Internet → the connected
network's properties), Windows applies stricter default blocking regardless
of the rules above on some Windows versions — set the hospital LAN
connection to **Private** there.

## 3. Get the code

```sh
git clone <your-remote> ~/redmars
cd ~/redmars
```

## 4. Environment files

Two `.env` files, both gitignored:
```sh
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

**Root `.env`**:
- `POSTGRES_PASSWORD` — replace `change-me` with a real generated password:
  `openssl rand -hex 24` (hex only — a base64 password can contain `/`,
  which breaks Prisma's connection-string parser; see `docs/farhat-server-setup.md`
  if you hit `P1013` anyway)
- `POSTGRES_PORT` / `ADMINER_PORT` — defaults are fine unless something else
  on the box already owns 5433/8081
- `CADDY_HTTPS_PORT=443`, `CADDY_API_PORT=8443` — leave at defaults
- `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `TZ=Asia/Kabul` — defaults are sane
- `VITE_API_URL=https://<server-lan-ip>:8443` — use the STATIC IP from step 0
  (or a LAN hostname if this network resolves one), never `localhost` —
  this value is baked into the web bundle at BUILD time and sent to every
  client's browser; `localhost` from a client machine means that client, not
  this server. Changing it later means rebuilding the `web` image, not just
  restarting a container.

**`apps/api/.env`**: fill in —
- `CORS_ORIGIN="https://<server-lan-ip>"` — same IP as above, must match the
  origin the browser actually loads the app from
- `JWT_SECRET` — generate fresh: `openssl rand -base64 48`
- Leave `DATABASE_URL` as the template default — the containerized `api`
  service overrides it (see `docker-compose.prod.yml`'s comments)

## 5. TLS certificate

```sh
scripts/gen-lan-cert.sh redmars.local <server-lan-ip>
```
Use the SAME IP here as `VITE_API_URL` above. Writes `certs/redmars.crt` /
`certs/redmars.key` (gitignored, install-specific).

## 6. Build and start everything

```sh
pnpm deploy:up
```
Skipped the optional Node install above? Run the same thing directly:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```
This builds `redmars-api`/`redmars-web` from their Dockerfiles and starts
Postgres, Adminer, the backup sidecar, `api`, `web`, and Caddy (TLS on 443,
API on 8443, both published on this machine's real network adapter — no
extra step needed for LAN clients to reach them once the firewall is open).
The `api` container runs `prisma migrate deploy` then `prisma db seed` on
every start (idempotent, safe to re-run).

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

## 7. Trust the certificate on every client device

Every browser that opens the app will show "Not secure" until it trusts
`certs/redmars.crt` — one-time, per device. Copy `certs/redmars.crt` (it's
public, not a secret — USB stick or a LAN file share both work) to each
device and follow `docs/https-lan.md`'s OS-specific steps.

## 8. Verify

From the server itself:
```sh
curl -k https://localhost:8443/health     # {"status":"ok",...}
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```
All six services should show healthy/running. Then from an ACTUAL LAN
client (not the server), with the cert trusted: `https://<server-lan-ip>`
should load the app, and logging in as `admin` with the password from step 6
should work.

**If `curl` on the server works but a LAN client gets nothing at all** (not
even a cert warning — connection just times out): that's step 2 (Windows
Firewall), not a Docker or app problem. Re-check the network profile is
Private, not Public, and that the two `netsh` rules from step 2 are actually
present: `netsh advfirewall firewall show rule name="REDMARS HTTPS"`.

## 9. If this box already has test data on it: clean it before real use

Skip on a genuinely fresh install.
```sh
pnpm db:backup   # always first — this is a real delete, not a soft one
docker compose exec api sh -c \
  "RESET_CONFIRM=yes-wipe-transactional-data npx ts-node -P tsconfig.seed.json scripts/reset-to-clean.ts"
docker compose exec api npx prisma db seed
```
See `docs/install-lan-wsl2.md`'s equivalent section for the full detail on
what `reset-to-clean.ts` does and doesn't touch — identical here, this isn't
WSL-specific behavior. The second command prints a fresh admin password once,
to the terminal — write it down immediately.

## What this setup does NOT give you

- Everything from `docs/install-lan-wsl2.md`'s closing section still applies
  here: 7.5 (printer QA), 7.14/7.15 (license token / hardware binding) not
  built yet, a host firewall beyond the two Windows rules above not
  independently reviewed.
- **Reboot/power-cut recovery** depends on Docker Desktop actually starting
  after the machine restarts, which needs someone logged into Windows (Docker
  Desktop is a per-user application, not a Windows service) — see
  `docs/farhat-server-setup.md`'s reboot-persistence section before relying
  on this for unattended recovery from a power outage.
