# Installing REDMARS — pick your setup

**Setting up the real Axon hospital server?** Start at
`docs/axon-server-setup.md` instead — machine choice, static IP, firewall,
and reboot recovery, before any of the guides below.

Otherwise, three separate, self-contained guides, 0 → running app. Pick one,
don't mix steps between them — the TLS cert and `VITE_API_URL` are set up
differently in each and aren't interchangeable after the fact.

- **`docs/install-simple-pc.md`** — one PC, nobody else needs to reach it.
  Docker Desktop, everything on `localhost`, no networking setup.
- **`docs/install-lan-windows.md`** — a server other PCs on the hospital LAN
  need to reach, using Docker Desktop (plain Windows, no WSL2 networking
  step needed).
- **`docs/install-lan-wsl2.md`** — same LAN goal, using WSL2 + Docker Engine
  + Caddy instead of Docker Desktop. Includes the WSL2-to-LAN networking
  step that's easy to miss; skip this one unless you specifically want to
  avoid Docker Desktop's GUI.

Not sure which. If a second device will ever load the app from this
install, use one of the two LAN guides — switching from simple-PC to LAN
later means regenerating the cert and rebuilding the `web` image with a real
LAN `VITE_API_URL`, not a quick toggle. Between the two LAN guides, default
to `docs/install-lan-windows.md` unless you have a specific reason to prefer
a WSL2-only setup (see that doc's intro).
