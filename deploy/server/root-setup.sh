#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

app_user="hua"
app_home="/home/hua"
nginx_bin="/etc/nginx/sbin/nginx"
nginx_site="/etc/nginx/conf/conf.d/v2ray.conf"
location_file="/etc/nginx/conf/pet-observation-locations.conf"
include_line="        include /etc/nginx/conf/pet-observation-locations.conf;"

for required in "$nginx_bin" "$nginx_site" "$app_home/.config/pet-observation/dev.env" "$app_home/.config/pet-observation/prod.env"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path is missing: $required" >&2
    exit 1
  fi
done

loginctl enable-linger "$app_user"

cat >"$location_file" <<'EOF'
location = /pet-dev {
    return 308 /pet-dev/;
}

location /pet-dev/ {
    client_max_body_size 15m;
    proxy_buffering off;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_pass http://127.0.0.1:3101/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /pet {
    return 308 /pet/;
}

location /pet/ {
    client_max_body_size 15m;
    proxy_buffering off;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_pass http://127.0.0.1:3100/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
EOF

if ! grep -Fq "$include_line" "$nginx_site"; then
  backup_path="${nginx_site}.before-pet-observation.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$nginx_site" "$backup_path"
  sed -i "/error_page 400 = \/400.html;/a\\$include_line" "$nginx_site"
  echo "Nginx backup created: $backup_path"
fi

"$nginx_bin" -t
systemctl reload nginx

repair_certbot_python() {
  if /usr/bin/certbot --version >/dev/null 2>&1; then
    return 0
  fi
  local error_output
  error_output="$(/usr/bin/certbot --version 2>&1 || true)"
  if [[ "$error_output" != *"idna<2.8"* ]]; then
    echo "$error_output" >&2
    echo "Certbot is broken for an unknown reason; no Python packages were changed." >&2
    exit 1
  fi
  shopt -s nullglob
  local conflicting=()
  local candidate
  for candidate in \
    /usr/local/lib/python3.6/site-packages/idna \
    /usr/local/lib/python3.6/site-packages/idna-*.dist-info; do
    [[ -e "$candidate" || -L "$candidate" ]] && conflicting+=("$candidate")
  done
  if [[ ${#conflicting[@]} -gt 0 ]]; then
    local backup_dir="/root/certbot-python-backup-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$backup_dir"
    mv "${conflicting[@]}" "$backup_dir/"
    echo "Conflicting Python idna package moved to: $backup_dir"
  fi
  shopt -u nullglob

  if ! /usr/bin/python3 -c 'import idna; assert tuple(map(int, idna.__version__.split("."))) < (2, 8)' >/dev/null 2>&1; then
    echo "The RPM-managed idna files are missing; reinstalling python3-idna..."
    if ! /usr/bin/dnf reinstall -y python3-idna; then
      echo "DNF reinstall failed; installing the compatible idna 2.7 package without dependencies..."
      /usr/bin/python3 -m pip install --no-deps --prefix /usr/local 'idna==2.7'
    fi
  fi
  /usr/bin/certbot --version
}

configure_certificate_renewal() {
  local live_dir="/etc/letsencrypt/live/yuxiang66.top"
  local hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
  local hook="$hook_dir/pet-observation-copy-cert.sh"
  repair_certbot_python
  if [[ ! -f "$live_dir/fullchain.pem" || ! -f "$live_dir/privkey.pem" ]]; then
    mkdir -p /home/wwwroot/3DCEList/.well-known/acme-challenge
    /usr/bin/certbot certonly \
      --noninteractive \
      --agree-tos \
      --register-unsafely-without-email \
      --webroot \
      --webroot-path /home/wwwroot/3DCEList \
      --domains yuxiang66.top \
      --cert-name yuxiang66.top \
      --keep-until-expiring
  fi
  mkdir -p "$hook_dir"
  cat >"$hook" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
install -m 0644 /etc/letsencrypt/live/yuxiang66.top/fullchain.pem /data/v2ray.crt
install -m 0600 /etc/letsencrypt/live/yuxiang66.top/privkey.pem /data/v2ray.key
/etc/nginx/sbin/nginx -t
/bin/systemctl reload nginx
EOF
  chmod 700 "$hook"
  "$hook"

  local override_dir="/etc/systemd/system/certbot-renew.service.d"
  mkdir -p "$override_dir"
  cat >"$override_dir/pet-observation.conf" <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/certbot renew --noninteractive --no-random-sleep-on-renew --deploy-hook "$hook"
EOF
  systemctl daemon-reload
  systemctl enable --now certbot-renew.timer
  if ! /usr/bin/certbot renew --dry-run --cert-name yuxiang66.top --deploy-hook "$hook"; then
    echo "Warning: Certbot dry-run renewal failed. The live certificate and scheduled renewal remain configured; retry the dry-run later." >&2
  fi
}

configure_certificate_renewal

dev_key="$(sed -n 's/^DEVICE_API_KEY=//p' "$app_home/.config/pet-observation/dev.env")"
prod_key="$(sed -n 's/^DEVICE_API_KEY=//p' "$app_home/.config/pet-observation/prod.env")"

verify_https() {
  local path="$1"
  local api_key="$2"
  local attempt
  for attempt in {1..10}; do
    if curl -fsS --resolve yuxiang66.top:443:127.0.0.1 \
      -H "Authorization: Bearer $api_key" \
      "https://yuxiang66.top/$path/api/ready" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "HTTPS verification failed for $path after 10 attempts." >&2
  return 1
}

verify_https pet-dev "$dev_key"
verify_https pet "$prod_key"

echo "Root setup completed successfully."
echo "Development API: https://yuxiang66.top/pet-dev"
echo "Production API:  https://yuxiang66.top/pet"
echo "No API key was printed. Read the environment files as user hua when needed."
