# Updating the testing VPS and moving it to app.axon.af

Companion to `output/redmars-testing-vps-kit/GUIDE.md` (sections 6, 9, 10, 11, 19).
Paths and the `redmars-test` wrapper are the ones that guide installs. Run VPS
commands as root (`sudo -i`).

## 0. Why the VPS still shows old behaviour

The web app is compiled into a Docker image at build time. Pushing to GitHub
changes nothing on the VPS until you pull the code and rebuild the images. The
HR Settings "Add position" button that does nothing on the VPS is an old build:
the fix (explicit `type="submit"`, commit `70497a0`) is already in this branch.

## 1. Ship a new version

**On your PC** (Git Bash or PowerShell, repo root):

```sh
git status --short            # nothing you care about should be unstaged
git push origin redmars-v2
```

**On the VPS:**

```sh
ssh redmarsctl@YOUR_VPS_IP
sudo -i

# 1. Back up first
systemctl start redmars-testing-backup.service
ls -lt /var/backups/redmars-testing | head -3

# 2. Pull the new code (fast-forward only; stops if the VPS copy has local edits)
git -C /opt/redmars/app fetch origin
git -C /opt/redmars/app log --oneline HEAD..origin/redmars-v2     # review
git -C /opt/redmars/app merge --ff-only origin/redmars-v2
git -C /opt/redmars/app rev-parse --short HEAD                    # note this id

# 3. Label the build with the new commit id
nano /etc/redmars-testing/stack.env        # set RELEASE_TAG=<the id from above>

# 4. Rebuild and restart (API applies new migrations on startup)
redmars-test build api web
redmars-test up -d
redmars-test ps
redmars-test logs --tail=60 api
curl --fail https://YOUR_API_DOMAIN/health
```

Then hard-refresh the browser (Ctrl+Shift+R). Never use `down -v` or
`docker volume prune` — they erase the database.

## 2. Replace the sslip.io addresses with app.axon.af

The kit uses two hostnames: one for the web app and one for the API. The web
bundle has the API address compiled in, so changing the hostname means a rebuild
of `web`. Use:

| Purpose | Hostname |
|---|---|
| Web app | `app.axon.af` |
| API | `api.axon.af` |

### 2a. DNS (at whoever hosts the DNS for axon.af)

Create two **A** records, TTL 300 / Auto, both pointing to the VPS public IPv4
(the same IP that is inside your current `...sslip.io` names):

| Type | Name | Value |
|---|---|---|
| A | `app` | YOUR_VPS_IP |
| A | `api` | YOUR_VPS_IP |

- Enter only the IP: no `https://`, no port.
- If you use Cloudflare, set both to **DNS only** (grey cloud) until HTTPS works.
- Delete any old `AAAA` record for these two names unless the VPS really has IPv6.
- Do not touch MX/email records.

Wait until both resolve to your VPS from the VPS itself:

```sh
dig +short A app.axon.af @1.1.1.1
dig +short A api.axon.af @1.1.1.1
```

Do not continue until both print your VPS IP. Ports 80 and 443 must be open
(Caddy gets the certificates over them).

### 2b. Switch the stack

```sh
# back up first
systemctl start redmars-testing-backup.service

nano /etc/redmars-testing/stack.env
#   WEB_DOMAIN=app.axon.af
#   API_DOMAIN=api.axon.af
#   (ACME_EMAIL = a real address you read; certificate warnings go there)

redmars-test config --quiet && echo config ok     # --quiet: do not print secrets
redmars-test build web          # VITE_API_URL is compiled in, rebuild is required
redmars-test up -d              # recreates web, api (new CORS_ORIGIN) and caddy
redmars-test logs --tail=80 caddy   # look for "certificate obtained successfully"
```

### 2c. Verify

```sh
curl -I https://app.axon.af/login
curl --fail https://api.axon.af/health
curl -i -X OPTIONS https://api.axon.af/auth/login \
  -H 'Origin: https://app.axon.af' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Then open `https://app.axon.af` and sign in. In the browser Network tab the
login request must go to `https://api.axon.af`, not an sslip.io name.

Notes:
- The old sslip.io addresses stop working after this (CORS and certificates are
  for one pair of names only). Tell staff the new address.
- Browser sessions do not carry over (a different site address), so everyone
  signs in again.
- If Caddy cannot get a certificate: check DNS first, then ports 80/443 in both
  the VPS firewall (`ufw status`) and the hosting provider's firewall.

## 3. Reset the VPS database to one admin + the drug list

Only if you really want to throw away everything on the VPS. This is a real
delete. `bootstrap-testing.cjs` refuses a database that already has a facility
or user, so the database has to be emptied first.

```sh
systemctl start redmars-testing-backup.service      # keep this backup

redmars-test stop caddy web api

# empty database, same name and owner
redmars-test exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres \
     -c "DROP DATABASE redmars_testing WITH (FORCE);" \
     -c "CREATE DATABASE redmars_testing OWNER \"$POSTGRES_USER\";"'

# schema
redmars-test run --rm --no-deps --entrypoint sh api -c 'prisma migrate deploy'

# the one admin (user: staging.admin; password typed hidden, 16+ characters)
read -rsp 'New admin password: ' SEED_ADMIN_PASSWORD; echo
export SEED_ADMIN_PASSWORD
redmars-test run --rm --no-deps -T -e SEED_ADMIN_PASSWORD \
  --entrypoint node api /ops/bootstrap-testing.cjs
unset SEED_ADMIN_PASSWORD

# the Medi-Pro drug list (1201 drugs) into that facility
redmars-test run --rm --no-deps -e SEED_FACILITY_CODE=REDMARS_TEST_ONLY \
  --entrypoint ts-node api -P tsconfig.seed.json prisma/seed-drugs-medipro.ts

redmars-test up -d
```

Use `db:seed:drugs-medipro` only — never the plain `db:seed:drugs` (small
starter list; it duplicates entries). First login will ask for a permanent
password. Afterwards, as admin: enable the modules you need
(Modules page), add departments, price the services/drugs, create users.
The bootstrap creates no departments, services or lab tests.
