# Server hardening (task 7.3)

Three things: firewall, non-root, no default passwords. What's done and what
still needs the real Linux server (this was built/tested on a Windows dev
box — a `ufw` recipe can be written and reasoned about here, but not actually
run and verified until there's a real Linux host).

## No default passwords — already true before this task

- `JWT_SECRET` has no default; `apps/api/src/config/env.validation.ts` refuses
  to boot without one at least 32 chars (task 1.1).
- The seed admin password is never hardcoded — `apps/api/prisma/seed.ts`
  generates a random one (`randomBytes(18)`) unless `SEED_ADMIN_PASSWORD` is
  explicitly set, and prints it once.
- `POSTGRES_PASSWORD` has no default in `docker-compose.yml`
  (`${POSTGRES_PASSWORD}`, no `:-fallback`) — `.env.example` documents it as
  `change-me`, a placeholder to replace, not a value that ships live.

Checked as part of this task, not newly built.

## Non-root

- **Caddy** ran as root by default (needed to bind the privileged port 443).
  Now runs as `65534:65534` (alpine's `nobody` — the image ships no dedicated
  `caddy` user) with only `cap_add: NET_BIND_SERVICE` added back, the one
  capability that specific privilege was for. Verified: `docker exec
  redmars-caddy id` → `uid=65534(nobody)`, and the HTTPS front door (7.2)
  still binds and serves both ports correctly under it.
- **Backup sidecar** ran `crond` as root for its whole life (needed root to
  write another user's crontab file once at startup). Now writes
  `/etc/crontabs/postgres` and execs `su-exec postgres crond -f`, dropping to
  the same uid 70 the `postgres:16-alpine` image already runs its own server
  process as — `pg_dump` is a network client, it never needed filesystem
  privilege. Verified: `docker exec redmars-backup ps aux` shows `crond`
  owned by `postgres`, and a manual `pnpm db:backup` still produces a valid
  dump under this user.
- **Postgres** already runs its server process as the `postgres` user via the
  official image's own entrypoint (`gosu`/`su-exec` dance before exec) —
  nothing to change.
- **Adminer** already runs as its own `adminer` user in the official image.

## Firewall

Two different things, both needed:

**1. Docker's own network exposure (done, testable now).** `postgres` and
`adminer` were bound to `0.0.0.0` — reachable from any device on the
hospital LAN, not just the server itself. A DB and a full DB-admin UI have no
business being LAN-reachable. Both are now bound to `127.0.0.1` only in
`docker-compose.yml`:
```yaml
ports:
  - '127.0.0.1:${POSTGRES_PORT:-5433}:5432'
  - '127.0.0.1:${ADMINER_PORT:-8080}:8080'
```
Caddy's `443`/`8443` stay on `0.0.0.0` — that's the intended LAN front door.
Verified via `netstat` on the dev box: both now show `127.0.0.1:PORT`, not
`0.0.0.0:PORT`.

**2. Host firewall on the real Linux server (documented, not yet run).**
`docker` writes its own `iptables`/`nftables` rules for published ports —
`ufw` (or `firewalld`) does **not** see or block traffic Docker has published,
even with `ufw enable` and default-deny. The 127.0.0.1 binding above is what
actually stops LAN reach for postgres/adminer; a host firewall would not have
caught it on its own. That said, a host firewall is still worth having for
everything Docker *isn't* fronting (SSH, and a safety net if some future
service publishes a port without thinking about it first):
```sh
ufw default deny incoming
ufw default allow outgoing
ufw allow from <admin-workstation-IP> to any port 22 proto tcp
ufw allow 443/tcp
ufw allow 8443/tcp
ufw enable
# Confirm Docker-published ports are genuinely not additionally open:
# iptables -L DOCKER-USER -n   (add DROP rules here, not to ufw, if a
# container ever needs blocking — this chain runs before Docker's own rules)
```
This has not been run or tested — there is no Linux server in this session
to run it against. Flag as a real gap to close during actual server setup,
same category as the print QA (7.5) and browser-warning check (7.2): verified
as far as tooling here allows, not yet verified on the real target.
