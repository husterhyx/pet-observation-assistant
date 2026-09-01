#!/usr/bin/env bash
set -euo pipefail

domain="pet-api.yuxiang66.top"
origin_ip="104.168.175.53"
config_dir="/etc/nginx/conf/conf.d"
config_file="$config_dir/pet-api-direct.conf"
challenge_root="/var/www/letsencrypt"
certificate_dir="/etc/letsencrypt/live/$domain"
deploy_hook="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
nginx_bin="/etc/nginx/sbin/nginx"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ ! -x "$nginx_bin" ]]; then
  echo "Nginx executable not found: $nginx_bin" >&2
  exit 1
fi

resolved="$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)"
if ! grep -Fxq "$origin_ip" <<<"$resolved"; then
  echo "$domain does not resolve to $origin_ip yet." >&2
  printf 'Resolved IPv4 addresses:\n%s\n' "$resolved" >&2
  exit 1
fi

install -d -m 0755 "$challenge_root/.well-known/acme-challenge" "$config_dir"

backup=""
if [[ -e "$config_file" ]]; then
  backup="$config_file.before-$timestamp"
  cp -a "$config_file" "$backup"
  echo "Nginx backup created: $backup"
fi

restore_on_error() {
  status=$?
  if [[ $status -ne 0 ]]; then
    if [[ -n "$backup" ]]; then
      cp -a "$backup" "$config_file"
    else
      rm -f "$config_file"
    fi
    "$nginx_bin" -t >/dev/null 2>&1 && systemctl reload nginx || true
  fi
  exit "$status"
}
trap restore_on_error EXIT

cat >"$config_file" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    location ^~ /.well-known/acme-challenge/ {
        root $challenge_root;
        default_type text/plain;
    }

    location / {
        return 308 https://\$host:8443\$request_uri;
    }
}
EOF

"$nginx_bin" -t
systemctl reload nginx

if [[ ! -s "$certificate_dir/fullchain.pem" || ! -s "$certificate_dir/privkey.pem" ]]; then
  certbot certonly \
    --webroot \
    --webroot-path "$challenge_root" \
    --domain "$domain" \
    --cert-name "$domain" \
    --non-interactive \
    --agree-tos
fi

cat >>"$config_file" <<EOF

server {
    listen 8443 ssl http2;
    listen [::]:8443 ssl http2;
    server_name $domain;

    ssl_certificate $certificate_dir/fullchain.pem;
    ssl_certificate_key $certificate_dir/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;

    include /etc/nginx/conf/pet-observation-locations.conf;

    location / {
        return 404;
    }
}
EOF

install -d -m 0755 "$(dirname "$deploy_hook")"
cat >"$deploy_hook" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
/etc/nginx/sbin/nginx -t
systemctl reload nginx
EOF
chmod 0755 "$deploy_hook"

"$nginx_bin" -t
systemctl reload nginx

dev_key="$(sed -n 's/^DEVICE_API_KEY=//p' /home/hua/.config/pet-observation/dev.env)"
prod_key="$(sed -n 's/^DEVICE_API_KEY=//p' /home/hua/.config/pet-observation/prod.env)"

verify_ready() {
  local path="$1"
  local key="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --resolve "$domain:8443:127.0.0.1" \
    --header "Authorization: Bearer $key" \
    "https://$domain:8443/$path/api/ready")"
  if [[ "$code" != "200" ]]; then
    echo "$path readiness check returned HTTP $code." >&2
    return 1
  fi
  echo "$path readiness: HTTP $code"
}

verify_ready pet-dev "$dev_key"
verify_ready pet "$prod_key"

trap - EXIT
echo "Direct API enabled: https://$domain:8443"
