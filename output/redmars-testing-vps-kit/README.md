# REDMARS testing VPS kit

Use the accompanying 24-page PDF or GUIDE.md in order. Target: a fresh dedicated
Ubuntu Server 24.04 LTS VPS and synthetic staff testing, not live hospital use.
Reviewed repository revision: redmars-v2 at b7aad9c (28 October 2026).

Nothing in this ZIP contacts your VPS or DNS provider. There are no actual VPS
details, passwords, patient records, or production configuration in it.

## Paths on the VPS

- Application source: `/opt/redmars/app`
- Extract this kit into `/opt/redmars-testing`
- Install `redmars-test` into `/usr/local/bin/redmars-test` with mode 755
- Secrets are generated on the VPS in `/etc/redmars-testing/stack.env`, mode 600
- Backups: `/var/backups/redmars-testing`, private to root

Use only the provided standalone Compose file and wrapper. Do not layer it onto
the repository's LAN Compose files. Source, package-manager lockfile, and both
existing application Dockerfiles are still needed; this kit is not the app.

## Installation order

1. Set up the VPS, SSH, firewall, Docker and two A records.
2. Transfer a reviewed source checkout or tracked-source archive.
3. Install this kit, verify SHA256SUMS, then set Linux executable permissions.
4. Generate configuration, build images, migrate and run the clean-db verifier.
5. Run the one-time testing bootstrap with a unique password entered privately.
6. Start services, verify HTTPS/API/CORS, and change the temporary login password.
7. Install and enable the 02:00 Asia/Kabul backup timer; perform a manual backup.
8. Configure optional encrypted off-server storage, then rehearse a separate restore.
9. Test reboot recovery, staff access, devices and complete assigned UAT cases.

Every long command is available as text in GUIDE.md. Never import a development
database or run the hospital development seed to obtain a test login. The bootstrap
creates only a synthetic facility and administrator. It refuses a populated target.

The nightly backup job does not install itself. Follow the systemd installation
steps in the guide. Off-server backups do not activate until you configure your
own storage and encryption-password recovery. See VALIDATION.md for local checks
and the checks you still need to perform on your actual VPS.
