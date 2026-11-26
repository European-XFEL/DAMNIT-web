#!/usr/bin/env bash
# Compare the vite and nginx proxy paths, then run `nginx -t` on the frontend
# template as the nginx image renders it. Run from frontend/: pnpm check:nginx

# No -e: a failed comparison must still let `nginx -t` run and report.
set -uo pipefail

frontend=$(cd "$(dirname "$0")/.." && pwd)
# NGINX_FRONTEND_TEMPLATE and NGINX_PROXY_CONF point the check at copies with
# a seeded fault, to prove it fails.
template=$(realpath "${NGINX_FRONTEND_TEMPLATE:-$frontend/nginx/templates/default.frontend.conf.template}")
proxy_conf=$(realpath "${NGINX_PROXY_CONF:-$frontend/nginx/proxy_api.conf}")
image=docker.io/library/nginx:stable-alpine
runtime=$(command -v docker || command -v podman) || {
  echo "FAIL nginx -t needs docker or podman"
  exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

export NGINX_API_URL=http://127.0.0.1:30200
export NGINX_SERVER_NAME=127.0.0.1
export NGINX_APP_BASE_PATH=/app
export NGINX_DEMO_BASE_PATH=/demo

node "$frontend/nginx/compare-proxies.mts" "$template"
status=$?

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 \
  -keyout "$work/cert.key" -out "$work/cert.bundle" 2>/dev/null || {
  echo "FAIL openssl could not make a test certificate"
  exit 1
}

# Rootless podman maps no uid 101, so nginx's workers run as root, and docker
# does the same so both test one config. nginx refuses a second `user` line.
"$runtime" run --rm "$image" cat /etc/nginx/nginx.conf 2>/dev/null \
  | sed 's/^user .*;/user root;/' > "$work/nginx.conf" || {
  echo "FAIL could not read nginx.conf from $image"
  exit 1
}

output=$("$runtime" run --rm --network none --tmpfs /var/log/webserver \
  -v "$work/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$template:/etc/nginx/templates/default.conf.template:ro" \
  -v "$proxy_conf:/etc/nginx/proxy_api.conf:ro" \
  -v "$work:/etc/nginx/certs:ro" \
  -e NGINX_API_URL -e NGINX_SERVER_NAME \
  -e NGINX_APP_BASE_PATH -e NGINX_DEMO_BASE_PATH \
  "$image" nginx -t 2>&1)
if [ $? -ne 0 ]; then
  echo "FAIL nginx -t: $(grep -m1 -o '\[emerg\].*' <<< "$output" || echo "$output")"
  status=1
fi

exit $status
