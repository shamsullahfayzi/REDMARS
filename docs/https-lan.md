# HTTPS on the hospital LAN (task 7.2)

REDMARS has no public domain and no internet-reachable path for a real
certificate authority (Let's Encrypt etc.) — it runs on a hospital's own LAN.
Caddy terminates TLS with a self-signed certificate instead. This gets you a
green padlock with zero ongoing cost, at the price of one manual step per
client device: telling that device's browser to trust the certificate.

## What's running

- `Caddyfile` — two sites, both self-signed:
  - `:443` → the web app (`apps/web`)
  - `:8443` → the API (`apps/api`)

  Split by port rather than path because the web app calls the API on a full
  origin (`VITE_API_URL`), not a same-origin `/api/*` prefix, and the API has
  no global route prefix — a path-routed split would collide with the SPA's
  own client-side routes.

- `scripts/gen-lan-cert.sh` — generates `certs/redmars.crt` / `certs/redmars.key`
  (gitignored — install-specific, contains a private key). Re-run it if the
  hospital's LAN hostname or IP changes:
  ```sh
  scripts/gen-lan-cert.sh redmars.local 192.168.1.50
  docker compose restart caddy
  ```

**Not** `caddy tls internal` (Caddy's own automatic self-signed issuer). That
issuer's on-demand `GetCertificate` callback was found, during 7.2's build,
to send a fatal TLS `internal_error` alert the moment a ClientHello carries
an ALPN extension — which is every real TLS client (browsers, curl, Node all
offer `h2,http/1.1` ALPN by default). This was verified failing identically
across curl, Node's `https`, and Windows schannel, and succeeding on all
three once swapped for a plain loaded cert. If a future Caddy version is
tried again, retest specifically with ALPN offered
(`openssl s_client -alpn h2,http/1.1 -connect host:port`) — a bare
`s_client` handshake with no ALPN will not catch this; it passes either way.

## One-time step per LAN client (this is what removes the browser warning)

The Caddy config alone does not stop the "Not secure" warning — a browser
warns on any certificate it doesn't already trust, self-signed or not. What
removes the warning is installing `certs/redmars.crt` into that specific
device's trust store, once, after which every REDMARS origin (both ports) is
trusted with no further per-cert step. Copy `certs/redmars.crt` to the device
(USB, LAN file share, whatever's convenient — it is a public certificate, not
a secret) and:

- **Windows**: double-click the `.crt` → *Install Certificate* → *Local
  Machine* → *Place all certificates in the following store* → *Trusted Root
  Certification Authorities*.
- **Android**: Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate.
- **Chrome/Edge on any OS**: importing into the OS store above is enough —
  both read the OS trust store on Windows/Android. Firefox keeps its own
  store: `about:preferences#privacy` → Certificates → View Certificates →
  Authorities → Import.

Every hospital device that opens REDMARS in a browser needs this done once.
A device that skips it still works — the connection is exactly as encrypted
either way — it just keeps the browser warning.

## Verifying it worked (what was actually checked before shipping this)

No browser automation tool was available this session, so the check ran
one layer down: proved the TLS handshake, certificate chain, ALPN
negotiation, and reverse-proxy path are all correct using curl, Node's
`https` module, and Windows schannel directly against both ports, with the
generated cert supplied as the trust anchor (`--cacert` / a Node `ca` option)
rather than installed system-wide. All three returned real application
responses (the SPA's HTML shell on `:443`, a genuine validated 400 from the
NestJS auth controller on `:8443`) with the certificate chain verified, not
skipped with `-k`/insecure flags. This proves everything up to the browser
itself; actually opening a hospital-LAN browser and confirming the padlock
is still a real gap to close before go-live — same disclosed limitation as
the print QA task (7.5), which needs the actual hospital hardware this
session did not have access to.

## Local dev note

Port 443 is commonly already taken on a Windows dev box (XAMPP, IIS, Skype,
etc.). `.env` has `CADDY_HTTPS_PORT` / `CADDY_API_PORT` overrides for
exactly this — see the comment there. A real hospital server won't have
XAMPP installed, so the defaults in `.env.example` stay at 443/8443.
