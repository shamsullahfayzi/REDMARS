# Setting up the REDMARS server at Axon Hospital

This is the site-specific guide: which machine, what network settings, and
what to check before and after the software install so every PC on the
hospital LAN (reception, pharmacy, nursing stations, doctors' rooms) can
reach REDMARS. It does NOT cover installing REDMARS itself — that's one of
two separate guides, picked in step 3 below. Read this document first,
start to finish, then follow whichever install guide it points you to.

## 1. Pick the server machine

Needs to stay on, on the network, all day — this isn't a workstation that
gets shut off at night. Minimum practical spec for this app's load
(confirmed against `apps/api/scripts/load-test.ts` — see `phase-7-7-load-test.md`
project memory, 40 concurrent users clean):
- 4+ CPU cores, 8GB+ RAM, an SSD (Postgres + Docker images both want fast
  disk, not a spinning drive)
- Windows 10/11 Pro or Windows Server — Home editions can't join a domain
  and some steps below (Group Policy autologon in a hospital's managed
  environment) assume Pro or better
- Wired Ethernet, not Wi-Fi — a server whose LAN link drops when someone
  microwaves lunch nearby is a bad foundation for anything a nurse relies on
  mid-shift
- Plugged into a UPS if the building has one available. A hospital's power
  is not guaranteed clean; an ungraceful shutdown mid-write is the one class
  of failure Postgres itself can't fully protect against on its own.

## 2. Give it a static LAN IP

Every client browser and the TLS certificate are pinned to one address.
Whatever address you pick, it must never change on its own — a DHCP lease
renewal that hands the server a different IP silently breaks every client
still pointed at the old one.

Two ways to get this, pick whichever the hospital's network setup allows:

- **DHCP reservation on the router/switch** (preferred if you have access to
  it) — reserve an address for this machine's MAC address, so it always
  receives the same IP from DHCP without touching Windows' own network
  config. Ask whoever manages the hospital's router/switch to do this if
  that's not you.
- **Static IP set directly on the Windows box**, if there's no router access:
  Settings → Network & Internet → Ethernet → the connected network → IP
  assignment → **Edit** → **Manual** → IPv4 on. Pick an address OUTSIDE the
  router's DHCP range (check the router's DHCP settings for that range
  first — assigning an address the router might also hand out to another
  device causes an IP conflict) but inside the same subnet as the client
  PCs (same first three octets for a typical `/24`, e.g. clients on
  `192.168.1.x` → server also `192.168.1.x`, e.g. `192.168.1.50`).

Write this address down — every step from here on refers to it as
`<server-lan-ip>`.

## 3. Choose how to install: WSL2 or plain Windows + Docker Desktop

Both reach the same end state — LAN clients hitting `<server-lan-ip>` over
HTTPS — and both are fully documented, pick either:

- **`docs/install-lan-windows.md`** — Docker Desktop. Simpler: ports are
  published directly on the Windows network adapter, no extra networking
  step. Trade-off: Docker Desktop is a per-user desktop app, which affects
  reboot recovery (see step 6 below).
- **`docs/install-lan-wsl2.md`** — raw WSL2 + Docker Engine, no Docker
  Desktop GUI. One extra networking step (mirrored networking or a port
  proxy, covered in its 0.6) to make WSL2's ports reachable from the LAN,
  in exchange for the app and database living inside the WSL2 Linux
  filesystem rather than being visible from ordinary Windows tools.

If you're not sure: use `docs/install-lan-windows.md`. It's the shorter path
and the one this document's reboot-recovery section (6) assumes by default;
WSL2 is worth it mainly if someone on staff is already comfortable with a
Linux shell and prefers not to have Docker Desktop's tray icon/GUI on the
server.

Go run the chosen guide now, all the way through its own verify step, then
come back here for steps 4–7.

## 4. Confirm the router/switch isn't blocking it

Before troubleshooting the app itself, rule out the network in between.
Client PCs and the server must be on the same LAN segment (or a segment
where inter-VLAN routing is explicitly allowed) — if the hospital's network
has clinical/admin devices split across VLANs for other reasons, someone
with access to that config needs to confirm `<server-lan-ip>` on ports 443
and 8443 is reachable across that boundary before assuming the app is
broken. A quick test from any client PC:
```powershell
Test-NetConnection <server-lan-ip> -Port 443
Test-NetConnection <server-lan-ip> -Port 8443
```
`TcpTestSucceeded : True` on both means the network path is fine and any
remaining issue is TLS-trust or app-level, not network — narrows down
exactly what the install guide's own "verify" troubleshooting notes cover.

## 5. Trust the certificate on every device that will use REDMARS

One-time per device, covered fully in `docs/https-lan.md`. Do this for:
reception PCs, pharmacy PC(s), nursing station PCs, any doctor's own
workstation, and any tablet. Skipping it on a device doesn't break anything
functionally — the connection is exactly as encrypted either way — it just
leaves a permanent "Not secure" browser warning on that device.

## 6. Make it survive a reboot / power cut

The install being "done" once is not the same as it surviving the server
rebooting unattended after, say, a power outage overnight. What actually
restarts automatically differs by which install guide you followed:

**If you used `docs/install-lan-windows.md` (Docker Desktop):** containers
themselves are set to `restart: unless-stopped`, so once Docker Desktop's
engine is running, all six services come back on their own. The gap is
Docker Desktop itself — it's a per-user desktop application, not a Windows
service, so it only starts once someone logs into Windows. For an
unattended server:
1. Create a dedicated local Windows account for this (not a real staff
   member's login) — e.g. `redmars-svc`, standard user is fine.
2. Confirm Docker Desktop's **"Start Docker Desktop when you sign in"** is
   enabled for that account (Settings → General — see the install guide's
   step 1).
3. Enable Windows auto-logon for that account so it signs in automatically
   after a reboot, without anyone physically at the console:
   ```powershell
   # Run as Administrator:
   $regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
   Set-ItemProperty $regPath "AutoAdminLogon" -Value "1"
   Set-ItemProperty $regPath "DefaultUsername" -Value "redmars-svc"
   Set-ItemProperty $regPath "DefaultPassword" -Value "<that account's password>"
   ```
   This stores the password in the registry in plaintext — acceptable only
   because this account has no privileges beyond running Docker Desktop and
   the machine itself is physically secured (server room / locked office,
   not a public-access PC). Do not do this on a shared or publicly
   accessible machine.
4. In the BIOS/UEFI, enable "restore power state on AC power loss" (setting
   name varies by manufacturer — usually under Power Management) so the
   machine itself powers back on after an outage instead of staying off
   until someone physically presses the button.

**If you used `docs/install-lan-wsl2.md` (raw WSL2 + Docker Engine):** WSL2
distros don't auto-start at Windows boot by default, even with
`docker.service` enabled inside them. Two things needed:
1. Enable systemd inside the Ubuntu distro (Ubuntu 22.04+ on WSL2 supports
   this) so Docker's own service starts once the distro is running:
   ```sh
   # inside the Ubuntu shell, if not already set:
   echo -e "[boot]\nsystemd=true" | sudo tee /etc/wsl.conf
   # then, from PowerShell: wsl --shutdown, reopen Ubuntu once to apply
   sudo systemctl is-enabled docker   # should say "enabled"
   ```
2. Trigger the distro to actually boot on Windows startup — WSL2 has no
   built-in "start at boot," so use Task Scheduler:
   Task Scheduler → Create Task → **Trigger**: "At startup" → **Action**:
   Start a program, `wsl.exe`, arguments `-d Ubuntu -e true` →
   **Run whether user is logged on or not**, and check **"Run with highest
   privileges."** This needs a Windows account's credentials saved into the
   task (Task Scheduler prompts for them when you save) — same auto-logon
   trade-off as the Docker Desktop path above, but scoped to just this one
   scheduled task instead of a full interactive auto-logon.
3. Same BIOS/UEFI "restore power state on AC power loss" setting as above.

Either path: after setting this up, actually test it — reboot the server
once (during a maintenance window, not mid-shift) and confirm from a client
PC that the app comes back on its own within a few minutes, without anyone
touching the server physically.

## 7. Day-2 operations cheat sheet

Run from the repo root on the server (Git Bash for the Docker Desktop path,
the Ubuntu shell for WSL2):
```sh
pnpm deploy:logs      # tail logs from all containers
pnpm deploy:down      # stop everything
pnpm deploy:up        # start (or rebuild+start after a code change)
pnpm db:backup        # manual backup, on top of the automatic BACKUP_SCHEDULE
pnpm db:backups       # list existing backups
```
Automatic backups run on `BACKUP_SCHEDULE` (root `.env`, a cron expression —
defaults are sane for a daily backup) via the `backup` container — confirm
at least once that `pnpm db:backups` actually shows a growing list over a
few days, not just that the container is running.

## What this does NOT cover

- The actual software install — that's `docs/install-lan-windows.md` or
  `docs/install-lan-wsl2.md`, step 3 above.
- `docs/https-lan.md` — the certificate mechanics and why it's self-signed.
- `docs/server-hardening.md` — OS-level hardening (non-root service
  accounts, host firewall) beyond the two port rules the install guides add.
- 7.14/7.15 (signed license token, hardware-fingerprint binding) — not
  built. Nothing here stops the install from being copied to another
  machine; that's a known, disclosed gap, not an oversight.
