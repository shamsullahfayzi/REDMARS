# REDMARS Testing VPS Deployment Guide
Prepared 28 October 2026; reviewed source b7aad9c.

## REDMARS on your testing VPS

A step-by-step guide to Ubuntu, Docker, domain and DNS setup, trusted HTTPS, a separate testing database, first login, nightly backups, restore rehearsal, and staff testing.

Deployment target | This guide
Operating system | Ubuntu Server 24.04 LTS, 64-bit
Audience | The VPS owner/operator; no credentials need to be shared
Purpose | Staff testing/UAT with synthetic data - not a production launch
Backup schedule | Every night at 02:00 Asia/Kabul; 14-day local retention
Reviewed source | redmars-v2, commit b7aad9c, 51 migrations
Prepared | 28 October 2026

Read this first

This guide does not access your VPS, change your DNS, deploy services, or import hospital records. You perform those steps manually. The accompanying ZIP contains inspectable configuration and helper scripts; it does not contain application source, real passwords, or hospital data.

Use a fresh testing database. Do not restore your development database into it. Actual hospital configuration remains separate and postponed. A real production launch still needs the outstanding technical fixes and hospital acceptance gates.

Assumption: a dedicated Ubuntu VPS that is not already hosting another service on ports 80/443. If your VPS runs Windows, another Linux distribution, or existing websites, stop and adapt the OS/proxy instructions before proceeding.

## 1. What you will build

Two subdomains point to the same VPS. Caddy terminates public HTTPS and forwards traffic privately to the compiled web application and API. PostgreSQL has no published network port. The application still uses its normal login and role permissions.

Item | Example / treatment
Web hostname | test.example.org - replace with your actual subdomain
API hostname | test-api.example.org - a different subdomain
VPS address | YOUR_VPS_IP - use your provider public IPv4 address
Public application ports | TCP 80 for HTTP/ACME; TCP 443 for HTTPS
Private services | No host publishing of 3000, 5173, 5432, 5433, 8080 or 8443
Application files | /opt/redmars/app
Testing deployment files | /opt/redmars-testing
Secret configuration | /etc/redmars-testing/stack.env - root-only
Local database backups | /var/backups/redmars-testing - root-only

The suggested 6 vCPU / 12 GB RAM VPS is a reasonable starting point for staff testing. This is an assessment, not a load guarantee; watch memory, CPU and disk during simultaneous staff use. Prefer SSD/NVMe storage and leave space for images, database growth and backups.

## 2. Checklist and navigation

Stage | What you complete
A. Prepare | VPS access, Ubuntu, a named sudo user, firewall and Docker
B. Connect | Two DNS records, a source checkout and the deployment kit
C. Start | Generate secrets, build images, migrate, bootstrap a test admin
D. Verify | HTTPS, API, login, permissions, staff PCs and printers
E. Protect | 02:00 backup timer, optional encrypted off-server copies, restore test
F. Operate | Reboot recovery, updates, rollback, troubleshooting and UAT records

Have these ready - keep them private

- VPS provider console and SSH access.
- Domain registrar/DNS dashboard access.
- The public IPs from which administrators and staff will connect.
- The application source at the reviewed commit, or the current branch after review.
- This PDF and REDMARS_Testing_VPS_Kit.zip.
- A password manager for unique server, application and backup credentials.

Terminal labels used below

YOUR PC means Windows PowerShell on your own computer. VPS means the remote Ubuntu shell. Root-only deployment commands are run after sudo -i. Do not paste Linux commands into PowerShell or PowerShell commands into Linux.

Deployment checkpoint

Keep a private installation record: VPS OS, source commit, hostnames, public IP, date, image tags, backup location, next timer run and test results. Store credentials separately. This guide includes example hostnames only; it never needs your actual VPS details.

Important distinction

The API runs with NODE_ENV=production so it uses compiled server behavior. The environment and database are still testing-only. No production hospital configuration or financial acceptance is implied.

## 3. Prepare Ubuntu and SSH access

VPS provider console: provision Ubuntu Server 24.04 LTS, attach your public SSH key, and note the public IPv4 address. Check the provider firewall as well as the Ubuntu firewall. Keep the provider rescue/console access available while configuring SSH.

YOUR PC: create a dedicated SSH key if you need one

```
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\redmars_test"
Get-Content "$env:USERPROFILE\.ssh\redmars_test.pub"
```

Upload only the .pub content to the VPS provider. Choose a passphrase locally. If the file already exists, do not overwrite it; choose another filename. Never upload or share the private key.

```
ssh -i "$env:USERPROFILE\.ssh\redmars_test" root@YOUR_VPS_IP
```

VPS: create a named administrator if the provider did not supply one

```
adduser redmarsctl
usermod -aG sudo redmarsctl
install -d -m 700 -o redmarsctl -g redmarsctl /home/redmarsctl/.ssh
cp /root/.ssh/authorized_keys /home/redmarsctl/.ssh/authorized_keys
chown redmarsctl:redmarsctl /home/redmarsctl/.ssh/authorized_keys
chmod 600 /home/redmarsctl/.ssh/authorized_keys
```

This example assumes your provider placed your key in /root/.ssh/authorized_keys. Otherwise install your own public key in the named user account. Set the user password when adduser prompts; sudo uses it.

YOUR PC: verify a second session before closing the first

```
ssh -i "$env:USERPROFILE\.ssh\redmars_test" redmarsctl@YOUR_VPS_IP
sudo -v
```

Continue through the named user. Do not disable root/password SSH login until key-based access and sudo both work in a second session. Record the actual SSH port if it is not 22.

## 4. Update the OS and set network access

VPS: update packages and verify time

```
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git unzip openssl ufw dnsutils nano
sudo timedatectl set-timezone Asia/Kabul
timedatectl
cat /etc/os-release
```

If Ubuntu reports that a reboot is required, reboot now and reconnect before installing the application. The backup timer also explicitly names Asia/Kabul, so it remains tied to Kabul time.

VPS: configure host firewall without locking yourself out

```
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

If SSH uses another port, allow that actual TCP port before enabling UFW. In your provider firewall, allow SSH from your administrator IP, HTTP 80 for certificate validation, and HTTPS 443 for staff access. Match any intended IPv6 rules too.

After initial HTTPS verification, restrict TCP 443 at the provider firewall to the hospital public IP and approved remote tester IPs if practical. Keep port 80 reachable for ACME renewals. Staff on unlisted mobile/home connections will then need their IP added. Do not rely on noindex as access control.

Docker-published ports can bypass ordinary UFW rules [S1]. This kit publishes only Caddy 80/443; PostgreSQL, API, Vite and Adminer are not exposed. Do not add public database/admin ports while troubleshooting.

## 5. Install Docker Engine and Compose

Use Docker Engine on the Ubuntu VPS; Docker Desktop is for your local workstation. The following follows Docker's official apt-repository method [S1]. Run one block at a time.

```
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Expected: hello-world prints a success message and docker compose reports its version. If an older Docker/containerd installation already exists, use Docker's conflict-removal guidance rather than installing over it blindly.

Use root for the deployment commands from here

```
sudo -i
install -d -m 755 /opt/redmars/app /opt/redmars-testing
install -d -m 700 /etc/redmars-testing /var/backups/redmars-testing
```

You do not need to install Node, pnpm, PostgreSQL or Caddy directly on the VPS. The existing application Dockerfiles build Node/pnpm inside images, and Compose runs the database and reverse proxy. Initial builds need outbound Internet access.

## 6. Point the two hostnames at your VPS

In the DNS zone that is authoritative for your domain, create two records [S4]. If DNS is not hosted at your registrar, edit the records at the active DNS provider instead. You do not need to change nameservers just to add subdomains.

Type | Name / host | Value | Initial setting
A | test | YOUR_VPS_IP | TTL 300 or Auto
A | test-api | YOUR_VPS_IP | TTL 300 or Auto

For a domain example.org, these create test.example.org and test-api.example.org. Some dashboards want the full hostname; others append the zone automatically. Do not enter https://, a path, or a port in an A record. Do not change unrelated MX/email records.

If using Cloudflare, use DNS only for the initial installation. Do not use Flexible SSL. An optional CDN proxy is a later configuration decision after direct HTTPS works. If you publish AAAA records, they must point to working VPS IPv6 with matching firewall rules; remove stale AAAA records for these testing names.

VPS: verify resolution before starting Caddy

```
dig +short A test.example.org @1.1.1.1
dig +short A test-api.example.org @1.1.1.1
dig +short AAAA test.example.org @1.1.1.1
dig +short AAAA test-api.example.org @1.1.1.1
```

Expected: both A lookups return your VPS IPv4. No AAAA response is fine if you do not use IPv6. Check your normal local resolver too. DNS changes may take time because of caches and prior TTLs; continue only when the records resolve correctly.

How trusted HTTPS will work

Caddy will request and renew public certificates for both hostnames [S2]. It needs correct public DNS, reachable challenge ports and persistent /data storage. The kit provides persistent Caddy volumes. No self-signed certificate, local CA installation or manual Certbot command is required.

## 7. Transfer the application source

Use one source-transfer method. Do not upload .env files, node_modules, database dumps, certs, backups, tmp or output. The reviewed checkout for this guide is redmars-v2 at b7aad9c. If the source changes later, review and test the new commit before using the same instructions.

Method A: Git checkout on the VPS

```
git clone --branch redmars-v2 \
  https://github.com/shamsullahfayzi/REDMARS.git /opt/redmars/app
git -C /opt/redmars/app rev-parse --short HEAD
git -C /opt/redmars/app status --short
```

The target directory must be empty. If the repository is private, use a read-only SSH deploy key on the VPS and the SSH repository URL instead. Add only its public key to GitHub; never place an access token in a clone URL or paste credentials into the PDF/chat.

Method B: upload a tracked-source archive from YOUR PC

```
cd D:\remdars\REDMARS
git status --short
git archive --format=tar.gz `
  --output="$env:USERPROFILE\Downloads\redmars-source.tar.gz" HEAD
```

The preceding block is PowerShell: the continuation character is a backtick. git archive includes committed files only. It does not include uncommitted work; commit/review any intended change first.

```
scp -i "$env:USERPROFILE\.ssh\redmars_test" `
  "$env:USERPROFILE\Downloads\redmars-source.tar.gz" `
  redmarsctl@YOUR_VPS_IP:~/
```

VPS root shell: extract only into the fresh empty directory

```
find /opt/redmars/app -mindepth 1 -maxdepth 1 -print
# Continue only if the preceding command prints nothing.
tar -xzf /home/redmarsctl/redmars-source.tar.gz -C /opt/redmars/app
test -f /opt/redmars/app/pnpm-lock.yaml
```

An archive checkout has no .git directory. The environment generator below expects Git metadata; for archive transfers, follow the release-ID note on the next page.

## 8. Install the companion deployment kit

YOUR PC: upload the ZIP delivered with this PDF

```
scp -i "$env:USERPROFILE\.ssh\redmars_test" `
  "D:\remdars\REDMARS\output\REDMARS_Testing_VPS_Kit.zip" `
  redmarsctl@YOUR_VPS_IP:~/
```

If you downloaded the ZIP elsewhere, replace the local path with its actual location. The ZIP has a single redmars-testing-vps-kit directory containing readable configuration and scripts.

VPS root shell

```
unzip /home/redmarsctl/REDMARS_Testing_VPS_Kit.zip -d /home/redmarsctl
cp -a /home/redmarsctl/redmars-testing-vps-kit/. /opt/redmars-testing/
chmod 755 /opt/redmars-testing/*.sh
install -m 755 /opt/redmars-testing/redmars-test /usr/local/bin/redmars-test
cd /opt/redmars-testing
sha256sum -c SHA256SUMS
```

File | Purpose
compose.testing.yml | Standalone testing stack; does not merge the LAN compose files
Caddyfile.testing | Two public hostnames with automatic HTTPS
redmars-test | Consistent Compose wrapper for every operation
generate-env.sh | Prompts for hostnames/email and generates secrets on your VPS
bootstrap-testing.cjs | One synthetic facility and temporary administrator, once
backup-testing.sh + timer/service | Validated nightly PostgreSQL dump and retention
offsite.env.example | Optional encrypted S3-compatible backup configuration

Archive transfer only: generate-env.sh normally derives RELEASE_TAG from Git. Edit its release= line to release=b7aad9c (or your actual archived commit) before running it. Do not initialize a fake repository or label a different source revision as reviewed.

Use only the redmars-test wrapper in this guide. Do not run pnpm deploy:up or merge docker-compose.prod.yml: those existing files expect the LAN certificate/port configuration.

## 9. Generate private configuration on the VPS

```
/opt/redmars-testing/generate-env.sh
```

Enter your actual web hostname, API hostname and certificate-contact email. The script creates a root-only configuration file and prints no passwords. It refuses to overwrite an existing file so a rerun cannot silently rotate database credentials.

Variable | How it is used
POSTGRES_USER / POSTGRES_PASSWORD | Separate testing database owner and generated 64-hex password
JWT_SECRET | Generated 96-hex signing secret; do not reuse local development values
WEB_DOMAIN | Exact browser hostname; determines CORS_ORIGIN
API_DOMAIN | Exact API hostname; determines the Vite build-time URL
ACME_EMAIL | Your certificate contact address
RELEASE_TAG | Source revision used to label API and web images

Verify safely - do not print the secret-bearing resolved config

```
stat -c '%a %U:%G %n' /etc/redmars-testing/stack.env
redmars-test config --quiet
redmars-test config --services
```

Expected: mode 600, owner root, and four services: postgres, api, web, caddy. The database name is deliberately fixed to redmars_testing. There is no Adminer container and no database host port.

Avoid running redmars-test config without --quiet in a recorded/shared terminal: full configuration output contains resolved secrets. Do not copy your existing root .env or apps/api/.env to this VPS. The testing Compose file supplies the API environment explicitly.

VITE_API_URL is compiled into the browser bundle. Changing API_DOMAIN later requires rebuilding web. CORS_ORIGIN is exactly https://WEB_DOMAIN; do not add a trailing path or use a wildcard.

SEED_ADMIN_PASSWORD is not retained in stack.env. You will type a unique temporary administrator password into a hidden prompt for the one-time bootstrap.

## 10. Build images and apply the schema

VPS root shell: build from the checked source

```
redmars-test build api web
redmars-test up -d postgres
redmars-test ps
redmars-test run --rm --no-deps --entrypoint sh api \
  -c 'prisma migrate deploy && prisma migrate status'
redmars-test run --rm --no-deps \
  -e CLEAN_DATABASE_NAME=redmars_testing --entrypoint ts-node api \
  -P tsconfig.seed.json scripts/verify-clean-database.ts
```

Wait until postgres is healthy before the migration command. The final command is intentionally long; copy it from the kit README if your PDF viewer wraps it. Expected at the reviewed revision: 51 migrations and no application records. Reference role/permission rows are allowed by the clean verifier.

If the build fails, read the failed stage before retrying. The API and web Dockerfiles use the pinned pnpm version and frozen lockfile. Do not run pnpm dev, Vite dev or a Nest watch process as your VPS application service.

No automatic hospital seeding

The API image applies migrations at normal startup but does not seed hospital data. The repository's development seed refuses NODE_ENV=production. Do not bypass that guard, switch the server to development mode to run it, or import the local AXON_DEMO_10 database.

Failure handling

```
redmars-test logs --tail=100 postgres
redmars-test run --rm --no-deps --entrypoint sh api \
  -c 'prisma migrate status'
df -h
free -h
```

Do not delete migrations, mark a failed migration applied, or remove the database volume to force progress. Save a redacted error and investigate. No production data exists in this new testing database, but its integrity should still be preserved.

## 11. Create the one-time testing administrator

This helper creates REDMARS TESTING - SYNTHETIC ONLY and staging.admin. It reuses the code's role/permission matrix, not guessed permissions. It creates no departments, real staff, services, patients or financial records. Optional modules remain off until you enable them for testing.

VPS root shell: enter a new password without echoing it

```
read -rsp 'Unique temporary test-admin password (16+ characters): ' SEED_ADMIN_PASSWORD
echo
export SEED_ADMIN_PASSWORD
redmars-test run --rm --no-deps -T -e SEED_ADMIN_PASSWORD \
  --entrypoint node api /ops/bootstrap-testing.cjs
unset SEED_ADMIN_PASSWORD
```

Keep this unique temporary password in your password manager. It is not printed, returned by the helper, or written to the guide. The helper accepts only the exact redmars_testing database and refuses an existing facility or account; it is not a password-reset utility.

Start the full stack

```
redmars-test up -d
redmars-test ps
redmars-test logs --tail=80 api
redmars-test logs --tail=80 caddy
```

Caddy may take a short time to obtain the certificates. If it fails, check DNS, stale AAAA records, port conflicts and both firewall layers. Do not proceed by bypassing a browser certificate warning.

First browser login

Open https://YOUR_WEB_DOMAIN/login. Sign in as staging.admin with your temporary password. You should be redirected to Change password before any business workflow is available. Choose a different permanent password of at least 12 characters, then sign in again. Test both required fields and a wrong current password with synthetic accounts only.

Do not give everyone the administrator account. Create individual testing users with the intended roles and unique temporary passwords. A doctor account belongs to its HR employee/clinical profile, not an unrelated generic login.

## 12. Verify HTTPS, API routing and browser access

VPS root shell: substitute your real hostnames

```
curl -I http://test.example.org
curl -I https://test.example.org/login
curl --fail https://test-api.example.org/health
curl -i -X OPTIONS https://test-api.example.org/auth/login \
  -H 'Origin: https://test.example.org' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
redmars-test ps
```

Expected: HTTP redirects to HTTPS; the login route returns 200; health returns status ok and database up; preflight permits the exact web origin; postgres and api are healthy. Do not add curl -k: certificate verification is part of the test.

From a staff device on the hospital connection

Open the same web hostname, confirm the browser certificate is trusted, and log in with an assigned testing account. No local certificate installation should be necessary. Use browser Network tools if login fails: requests must go to your API hostname, never localhost, api:3000, redmars.local or an old :8443 address.

Browser cannot reach API, but health works from VPS

Check DNS and firewall access from that staff device. Recheck CORS_ORIGIN and the compiled VITE_API_URL. If the hostname changed, follow the rebuild procedure below. A successful VPS curl alone does not prove hospital connectivity.

Do not combine proxy Basic Auth with the existing Bearer flow

This guide uses normal REDMARS authentication plus optional provider IP restrictions. Adding a blanket HTTP Basic Auth gate to the API can conflict with the application's Authorization: Bearer header. Do not add that extra gate as a quick fix.

## 13. Prepare a staff testing environment

Staff and devices are available, so assign a coordinator and test one complete workflow per department. Every person, patient, invoice and amount used here must be fictional and clearly marked TEST. Do not import actual hospital master data while Phase 5 remains postponed.

Area | Setup and verification
Admin / permissions | Create individual accounts; verify temporary-password change, deactivation and denied access for other roles.
Reception / doctors | Create fictional departments/services/prices and HR employee/clinical profiles. Test registration, visit, queue, consultation and billing links.
Lab / pharmacy | Enable the installed modules in Modules; create synthetic catalogs. Test order, result, verification, dispensing and charge/refund paths.
Finance | Enable Finance for synthetic books only. Use separate preparer/reviewer accounts. Test drafts, posting, reversals, AR/AP, till/bank matching and statements.
HR | Enable HR. Add fictional employees, positions, shift types, roster and attendance. Plan the two-week attendance/roster pilot.
CRM / IPD | Exercise only workflows installed in this revision. Log unfinished functions; a visible menu is not proof the whole module is complete.

Finance's real unpaid-invoice carry-forward workflow remains a known blocker. Do not use invented production opening balances or skip failed accounting events to make a dashboard look correct. Testing the current limitations is useful; it does not resolve them.

HR-to-payroll employee linking is not automatic. Payroll currently accepts its own finance employee records and manual adjustments. Record any manual crosswalk and do not maintain two independent salary ledgers.

Give the testing URL only to assigned testers. The synthetic facility name is the environment marker; this kit does not add an application-wide staging banner.

## 14. Enable automatic nightly backups

The supplied timer runs at 02:00 Asia/Kabul every night, even if the VPS system timezone is later changed. Persistent=true catches a missed scheduled run when the timer is next active [S5]. Database dumps are consistent PostgreSQL custom-format archives [S3].

VPS root shell

```
install -m 644 /opt/redmars-testing/redmars-testing-backup.service \
  /etc/systemd/system/redmars-testing-backup.service
install -m 644 /opt/redmars-testing/redmars-testing-backup.timer \
  /etc/systemd/system/redmars-testing-backup.timer
systemctl daemon-reload
systemctl enable --now redmars-testing-backup.timer
systemctl start redmars-testing-backup.service
systemctl status redmars-testing-backup.service --no-pager
systemctl list-timers --all redmars-testing-backup.timer
journalctl -u redmars-testing-backup.service -n 30 --no-pager
ls -lh /var/backups/redmars-testing
```

Expected: the manual run completes, a .dump and matching .sha256 exist, and the timer shows the next 02:00 Kabul run. A completed oneshot service may display inactive (dead); check its exit result/log, not just that label.

What the script does

It locks against concurrent runs, uses umask 077, writes to a .partial file, checks that pg_dump succeeded, checks the archive directory with pg_restore --list, renames only after validation, then writes a checksum. Local completed backups older than 14 days are removed only after a successful run. This avoids relying on a pipeline where compression could mask a dump failure.

One nightly backup means up to approximately 24 hours of changes could be lost. A VPS-local backup does not survive loss of the VPS or its disk; configure the optional off-server copy on the next page if you need that protection. Check tomorrow's actual run rather than assuming an enabled timer succeeded.

## 15. Optional encrypted off-server backup

Choose a separate S3-compatible bucket/storage account. The endpoint, bucket, access key and secret remain yours. Use a restricted backup credential. Restic encrypts snapshots using a separate repository password [S6]. Keep that password recoverable outside the VPS; without it, the off-server backups cannot be restored.

VPS root shell

```
apt install -y restic
umask 077
openssl rand -hex 32 > /root/redmars-restic-password
chmod 600 /root/redmars-restic-password
install -m 600 /opt/redmars-testing/offsite.env.example \
  /etc/redmars-testing/offsite.env
nano /etc/redmars-testing/offsite.env
```

Replace every REPLACE value. Keep RESTIC_PASSWORD_FILE pointing to /root/redmars-restic-password. Copy the password securely into your password manager; never send it to me. The script backs up stack.env and offsite.env encrypted, but deliberately stores the repository password outside that backed-up directory.

```
set -a
source /etc/redmars-testing/offsite.env
set +a
restic init
restic check
systemctl start redmars-testing-backup.service
restic snapshots --tag redmars-testing
journalctl -u redmars-testing-backup.service -n 30 --no-pager
```

Run restic init only for a new repository; use restic snapshots/check if it already exists. If off-site setup is incomplete, move offsite.env out of the active path or set OFFSITE_ENABLED=false until corrected; local nightly backups can continue. Logs explicitly state when no off-server copy is configured.

The job keeps 14 daily, 8 weekly and 6 monthly snapshot references. It does not run automatic restic prune; review storage and run prune during a maintenance window when needed. Preserve at least one known-good recovery point. Backups do not create an external email/SMS alert: review failures daily or connect your own monitor.

## 16. Restore rehearsal into a separate database

Do this before relying on backups and after major changes. The following restores a local backup to a new database in the testing PostgreSQL service. It does not overwrite redmars_testing. Do not use the repository's restore.sh here: that script drops the target schema.

VPS root shell: choose a completed dump

```
ls -lt /var/backups/redmars-testing/*.dump
BACKUP=/var/backups/redmars-testing/REPLACE_WITH_ACTUAL_FILE.dump
cd /var/backups/redmars-testing
sha256sum -c "$(basename "$BACKUP").sha256"
CHECK_DB="redmars_restore_check_$(date -u +%Y%m%d%H%M%S)"
export CHECK_DB
redmars-test exec -T -e CHECK_DB postgres sh -ec \
  'createdb -U "$POSTGRES_USER" "$CHECK_DB"'
redmars-test exec -T -e CHECK_DB postgres sh -ec \
  'pg_restore -U "$POSTGRES_USER" --exit-on-error --no-owner --no-acl -d "$CHECK_DB"' \
  < "$BACKUP"
redmars-test exec -T -e CHECK_DB postgres sh -ec \
  'psql -U "$POSTGRES_USER" -d "$CHECK_DB" -v ON_ERROR_STOP=1' <<'SQL'
SELECT count(*) AS migrations FROM _prisma_migrations
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) AS users FROM app_user;
SELECT count(*) AS patients FROM patient;
SELECT count(*) AS journals FROM finance_journal;
SELECT count(*) AS unvalidated_constraints
 FROM pg_constraint WHERE connamespace = 'public'::regnamespace
 AND NOT convalidated;
SQL
```

Expected: restore exits 0 and the schema/migration and representative record counts are plausible for that backup. At the reviewed revision there are 51 completed migrations. Review any unvalidated constraints; do not blindly accept a nonzero count. If users were active during the backup, present-day counts may differ; compare known test records and backup-time expectations.

Keep the restore database while recording evidence. It uses disk space; later remove only the specifically named rehearsal database after checking its name. Never replace CHECK_DB with redmars_testing or run a blanket database/volume cleanup.

## 17. Check the restored application connection

A successful database restore is necessary but not the whole check. This optional one-off API points only at the restored database and publishes only a loopback port. It does not change the main API configuration.

VPS root shell, same session as the restore rehearsal

```
set -a
source /etc/redmars-testing/stack.env
set +a
: "${CHECK_DB:?Run the restore rehearsal first}"
[[ $CHECK_DB == redmars_restore_check_* ]] || exit 1
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}"
DATABASE_URL+="@postgres:5432/${CHECK_DB}"
export DATABASE_URL
redmars-test run -d --no-deps --name redmars-restore-check-api \
  -p 127.0.0.1:13000:3000 -e DATABASE_URL \
  --entrypoint node api dist/main.js
sleep 10
curl --fail http://127.0.0.1:13000/health
docker logs --tail=40 redmars-restore-check-api
docker rm -f redmars-restore-check-api
unset DATABASE_URL POSTGRES_PASSWORD JWT_SECRET
```

Do not run this if CHECK_DB is unset. The health response should report database up. If startup needs more time, inspect logs and retry health; do not treat ten seconds as a guaranteed readiness deadline. The helper API may run normal background jobs against the restore copy; it never targets the main testing database.

If the VPS itself is lost

Provision a replacement VPS, reinstall Docker and the reviewed source/kit, and recover root-only configuration from your password manager or encrypted backup. With the separately retained restic password and storage credentials, run restic snapshots, then restic restore SNAPSHOT_ID --target /root/redmars-recovery. Inspect the recovered paths before copying them into place.

Restore the database using matching PostgreSQL tools while the normal API is stopped, then verify schema, roles, test records and application health. Only repoint DNS after the recovered system passes checks. Caddy can reissue certificates if its data volume is unavailable, subject to ACME limits.

The logical dump covers database-resident records. The reviewed API does not write uploaded documents to a separate filesystem. If you later introduce file/object storage, external logos or attachments, add their independent backup and restore steps; this database job cannot back up external URLs.

## 18. Reboot recovery and reconnection

Run this only when staff have paused their testing. Save an outstanding test form first, take a manual backup, and keep provider console access ready.

VPS root shell

```
systemctl is-enabled docker
systemctl is-enabled redmars-testing-backup.timer
redmars-test ps
systemctl start redmars-testing-backup.service
reboot
```

YOUR PC: reconnect once the VPS is back

```
ssh -i "$env:USERPROFILE\.ssh\redmars_test" redmarsctl@YOUR_VPS_IP
sudo -i
redmars-test ps
systemctl list-timers --all redmars-testing-backup.timer
curl --fail https://test-api.example.org/health
```

From a staff device, reload the web URL and log in. Confirm an earlier synthetic record is still present, open the relevant module, and complete a small test transaction. A lost browser connection during reboot is expected; successful reconnection and preserved data are the result to record.

restart: unless-stopped restarts containers that were running before reboot. Containers deliberately stopped with Compose do not necessarily restart automatically; use redmars-test up -d when resuming a deliberately stopped stack. Docker service enablement and a successful provider reboot test both matter.

Record the actual result

Write down reboot time, time of first successful health request, web/login result, preserved record identifier and next backup time. Do not mark recovery verified merely because a restart policy is present in YAML. VPS outages are tested here; hospital UPS and local server power-loss tests are outside this cloud deployment.

## 19. Update the testing release safely

Do this during a testing maintenance window. Updates are operator actions; nothing in this guide automatically pulls or deploys new code.

Before changing the source

```
systemctl start redmars-testing-backup.service
redmars-test ps
git -C /opt/redmars/app rev-parse HEAD
git -C /opt/redmars/app status --short
docker image ls 'redmars-testing-*'
```

Record the current commit/image tags and the new backup filename. For a Git checkout, fetch and inspect the intended revision; do not discard unexplained local changes. For an archive install, preserve the previous source tree/archive and use a separately reviewed new archive.

Git checkout example after review

```
git -C /opt/redmars/app fetch origin
git -C /opt/redmars/app log --oneline HEAD..origin/redmars-v2
# Continue only after reviewing the intended changes.
git -C /opt/redmars/app merge --ff-only origin/redmars-v2
nano /etc/redmars-testing/stack.env
# Set RELEASE_TAG to the newly reviewed commit ID.
redmars-test build api web
redmars-test up -d
redmars-test ps
redmars-test logs --tail=80 api
```

The API startup applies pending committed migrations. Check migration status and repeat login, role, finance/source and backup checks after an update. If a hostname changes, edit the matching values, rebuild web, recreate the affected services and recheck DNS/CORS/HTTPS.

Rollback rule

If no incompatible schema migration occurred, restore the previous source/tag and start the previously built images with redmars-test up -d --no-build. If the schema changed, do not simply run an older API against it. Rehearse a matched code-and-database recovery from the pre-update backup, understanding it discards later test changes. Preserve the failed state for diagnosis first.

Never use docker compose down -v, docker volume prune or a schema-drop restore as a routine update command. Those operations can erase the testing database and its evidence.

## 20. Troubleshooting by symptom

Symptom | Checks / action
Domain does not resolve | Check authoritative DNS, exact host field, A value, DNS caches and stale AAAA. DNS records contain no scheme or port.
Certificate warning | Check both DNS names, 80/443 reachability, Caddy logs, system time, CAA restrictions and ACME limits. Do not bypass the warning.
502 / API unhealthy | Run redmars-test ps and logs api/postgres. Check migrations, database health, secrets and disk. An upstream may still be starting.
Web opens; login network error | Browser Network request URL must be the API hostname. Check build-time VITE_API_URL, CORS_ORIGIN and staff-side firewall/DNS. Rebuild web after URL changes.
403 for a module | Verify intended role and module enablement. Reserved/uninstalled modules cannot be enabled merely by changing their flag.
Password-change loop | Use the current temporary password, a different 12+ character permanent password, then sign in again. Do not rerun bootstrap to reset it.
Bootstrap refuses | Check exact testing database, 16+ character unique temporary password, applied schema and zero facility/user count. It refuses reruns by design.
Migration fails | Keep the database and error evidence. Check status and source version. Do not edit applied migrations or use migrate reset.
Backup missing | Check timer NEXT/LAST, journalctl exit messages, disk, PostgreSQL health, file permissions and optional restic credentials.
Slow / out of memory | Check free -h, df -h and docker stats. Build outside staff testing hours; inspect logs and observed concurrency before resizing.

Useful commands - redact before sharing output

```
redmars-test logs --tail=100 api caddy postgres
docker stats --no-stream
df -h
free -h
journalctl -u redmars-testing-backup.service --since yesterday --no-pager
```

Logs can contain usernames, routes and synthetic record details. Do not share configuration files, docker inspect output, connection strings or unredacted password/token-bearing error messages.

## 21. Staff testing and device checklist

Use this as an execution checklist, not a pre-signed acceptance record. Keep a defect log with source revision, role, synthetic case, steps, expected/actual result and screenshot where useful.

Check | Pass evidence to retain
Connectivity | Web and API resolve and work from each approved hospital network/device.
Access | Each role can do its assigned workflow and is denied unauthorized clinical/finance/HR access.
Reception to consultation | Fictional registration, visit, queue, doctor action and resulting bill/source links match.
Lab and pharmacy | Ordered items, entered/verified results, dispensing and charges match the intended workflow.
Finance | Independent review, exact ledger balance, AR/AP source detail, till/bank reconciliation and reversals match synthetic expectations. Record opening-AR limitation.
HR pilot | Two-week roster/attendance plan, daily owner and discrepancy log; do not claim completion until the full pilot occurred.
Printers | Actual receipts, labels, reports, PDF Save as PDF, paper sizes, margins and Dari/Pashto glyphs are checked on each real printer/browser.
Resilience | Controlled VPS reboot, browser reconnection, preserved data and restored-backup API health have recorded results.
Backups | Manual run, next scheduled run, following-night successful run, checksum and restore evidence exist.
Language / SOPs | Staff review wording and approve workflow, downtime and escalation instructions.

Staff/device availability lets you begin these tests now. It does not mean they have passed. Have each department identify its tester and reviewer, record unresolved defects, and retest fixes. A testing deployment is ready for controlled UAT when access, isolation, login, backup and recovery checks pass - not when every production blocker has disappeared.

## 22. Final handover and evidence limits

The owner should be able to answer yes to all of these

- Only the approved testing environment and synthetic data are in use.
- Both hostnames resolve to the VPS and have trusted HTTPS.
- PostgreSQL/API/Vite/Adminer ports are not public.
- Separate staff accounts and first-login changes work.
- The nightly timer actually produced a restorable backup.
- An off-server copy is configured, or its absence is explicitly understood.
- Reboot recovery and staff-device access have been demonstrated.
- The source revision, secrets recovery method and defect log are recorded.

What was validated locally for this guide

See the companion VALIDATION.md for exact completed checks and any limitations. Local template/script checks do not establish your DNS, certificate issuance, VPS resource capacity, nightly scheduler operation or hardware acceptance. Those checks require execution on your VPS and hospital devices.

What remains outside this testing deployment

No live hospital deployment, actual hospital-data import, financial sign-off or production readiness is claimed. The unpaid-invoice carry-forward gap, unconfirmed clinical pilot, pending accountant/cutover date and remaining project acceptance items still apply. Staff testing can proceed on isolated synthetic books while these are resolved.

Private operations record

Record | Fill in privately
Source revision / date | ________________________________________
Web / API domain | ________________________________________
Administrator / test coordinator | ________________________________________
Backup last success / next run | ________________________________________
Restore and reboot evidence | ________________________________________
Known issues / escalation owner | ________________________________________

Keep this guide and its kit with your installation records. Keep passwords, private keys and the restic repository password in your password manager, not in those records.

## 23. References and companion files

Primary references checked on 28 October 2026. Commands and configuration were tailored to the inspected REDMARS repository rather than copied from a generic VPS tutorial.

[S1] Docker Engine on Ubuntu

[S2] Caddy automatic HTTPS

[S3] PostgreSQL 16 SQL dump and restore

[S4] Cloudflare DNS record management (provider example)

[S5] systemd timer units

[S6] Restic backup operations

Project references inspected

docker-compose.yml; docker-compose.prod.yml; Caddyfile.prod; API and web Dockerfiles; API environment validation; current RBAC matrix; Prisma schema/migrations; clean database verifier; backup/restore scripts; Phase 4 and Phase 6 reports. The older axon-server-setup.md is LAN-oriented and is not the cloud procedure in this PDF.

Companion ZIP

REDMARS_Testing_VPS_Kit.zip contains the standalone YAML/Caddy configuration, Compose wrapper, local secret generator, one-time synthetic bootstrap, nightly backup script and timer/service, off-site configuration example, readable guide text, validation notes and SHA256SUMS. Extract and inspect it before running commands. It does not modify the existing application modules or replace the repository's LAN deployment files.

The files use Linux LF line endings. Keep paths in the guide unless you deliberately adapt every reference, mount and systemd unit. Install operations scripts with executable permissions; ZIP extraction alone may not preserve them.
