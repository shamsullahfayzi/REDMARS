#!/bin/sh
# Generates the self-signed cert Caddy uses for LAN HTTPS (task 7.2).
#
# Deliberately NOT `caddy tls internal`'s on-demand issuer: that issuer's
# GetCertificate callback sends a fatal TLS "internal_error" alert on this
# stack the moment a client's ClientHello carries an ALPN extension — which
# is every real client (browsers, curl, Node all offer h2/http1.1 ALPN by
# default). A plain static cert, loaded once at startup, does not hit that
# code path and was verified to work identically across curl, Node, and
# Windows' schannel. If a future Caddy version fixes this, `tls internal`
# would be simpler — re-test ALPN specifically before switching back
# (`openssl s_client -alpn h2,http/1.1 ...`; no ALPN offered is not enough
# to catch it).
#
# Run once per install, or whenever the hospital's LAN hostname/IP changes.
# Usage: scripts/gen-lan-cert.sh [extra-hostname-or-ip ...]
#   scripts/gen-lan-cert.sh redmars.local 192.168.1.50
set -eu

OUT_DIR="$(dirname "$0")/../certs"
mkdir -p "$OUT_DIR"

SAN="DNS:localhost,IP:127.0.0.1"
for name in "$@"; do
  case "$name" in
    *[0-9].*[0-9].*[0-9].*[0-9]) SAN="${SAN},IP:${name}" ;;
    *) SAN="${SAN},DNS:${name}" ;;
  esac
done

echo "Generating cert with SAN: ${SAN}"

# Everything goes through -config rather than -subj/-addext: on Windows
# git-bash, a bare "/CN=..." argument gets silently rewritten as a Windows
# path by the shell's own POSIX-path translation (same class of bug as the
# docker-compose exec calls elsewhere in this repo needing MSYS_NO_PATHCONV).
# A config file has no such argument to mangle, so this works the same
# whether it's invoked directly, via `pnpm certs:gen`, or from Linux.
GEN_CNF="${OUT_DIR}/.gen.cnf"
cat >"${GEN_CNF}" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = redmars-lan

[ext]
subjectAltName = ${SAN}
EOF

openssl req -x509 \
  -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "${OUT_DIR}/redmars.key" \
  -out "${OUT_DIR}/redmars.crt" \
  -days 3650 \
  -config "${GEN_CNF}"

rm -f "${GEN_CNF}"

echo "Wrote ${OUT_DIR}/redmars.crt and ${OUT_DIR}/redmars.key"
echo "Next: restart the caddy service, then install ${OUT_DIR}/redmars.crt as a"
echo "trusted certificate on every LAN client — see docs/https-lan.md."
