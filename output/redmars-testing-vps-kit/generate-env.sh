#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
dest=/etc/redmars-testing/stack.env
[[ ! -e $dest ]] || { echo 'Configuration exists; refusing to replace secrets.' >&2; exit 1; }
read -rp 'Web hostname, e.g. test.example.org: ' web
read -rp 'API hostname, e.g. test-api.example.org: ' api
read -rp 'Your certificate contact email: ' email
web=${web,,}
api=${api,,}
domain='^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
[[ $web =~ $domain && $api =~ $domain && $web != "$api" ]] || { echo 'Supply two different DNS hostnames, without https:// or paths.' >&2; exit 1; }
[[ $email =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'Invalid email format.' >&2; exit 1; }
release=$(git -C /opt/redmars/app rev-parse --short=12 HEAD)
install -d -m 700 /etc/redmars-testing
cat > "$dest" <<EOF
POSTGRES_USER=redmars_test_owner
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 48)
WEB_DOMAIN=$web
API_DOMAIN=$api
ACME_EMAIL=$email
RELEASE_TAG=$release
EOF
chmod 600 "$dest"
echo 'Saved root-only testing configuration. Secrets were not printed.'
