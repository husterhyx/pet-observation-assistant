#!/usr/bin/env bash
set -Eeuo pipefail

# Interactive, repeatable deployment for a fresh Debian/Ubuntu or Fedora/RHEL host.
# Every prompt can also be supplied as an environment variable with the same name.

VALIDATE_ONLY="${VALIDATE_ONLY:-0}"

if [[ "$VALIDATE_ONLY" != "1" && "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run this script as root (for example: sudo bash deploy/server/install.sh)." >&2
  exit 1
fi

SOURCE_DIR="${SOURCE_DIR:-}"
INSTALL_CONFIG="${INSTALL_CONFIG:-/etc/pet-observation-installer.conf}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"

if [[ -f "$INSTALL_CONFIG" ]]; then
  # Load saved defaults without overriding values supplied by the caller.
  while IFS= read -r config_line; do
    config_key="${config_line%%=*}"
    case "$config_key" in
      REPOSITORY_URL|REPOSITORY_REF|APP_SLUG|APP_DISPLAY_NAME|APP_USER|DOMAIN|CERTBOT_EMAIL|DEPLOY_DEV|PROD_PATH|PROD_PORT|DEV_PATH|DEV_PORT|ENABLE_DIRECT|DIRECT_DOMAIN|DIRECT_HTTPS_PORT|NODE_VERSION)
        if [[ ! -v "$config_key" ]]; then
          eval "$config_line"
        fi
        ;;
    esac
  done <"$INSTALL_CONFIG"
fi

prompt() {
  local variable="$1"
  local label="$2"
  local default_value="$3"
  local current_value="${!variable:-$default_value}"
  local answer=""
  if [[ "$NON_INTERACTIVE" == "1" || ! -t 0 ]]; then
    printf -v "$variable" '%s' "$current_value"
    return
  fi
  read -r -p "$label [$current_value]: " answer
  printf -v "$variable" '%s' "${answer:-$current_value}"
}

prompt_yes_no() {
  local variable="$1"
  local label="$2"
  local default_value="$3"
  local current_value="${!variable:-$default_value}"
  if [[ "$NON_INTERACTIVE" == "1" || ! -t 0 ]]; then
    printf -v "$variable" '%s' "$current_value"
    return
  fi
  local hint="y/N"
  [[ "$current_value" == "1" ]] && hint="Y/n"
  local answer=""
  read -r -p "$label [$hint]: " answer
  case "${answer,,}" in
    y|yes) printf -v "$variable" '%s' "1" ;;
    n|no) printf -v "$variable" '%s' "0" ;;
    '') printf -v "$variable" '%s' "$current_value" ;;
    *) echo "Please answer y or n." >&2; exit 2 ;;
  esac
}

prompt REPOSITORY_URL "Open-source repository URL" "https://github.com/husterhyx/pet-observation-assistant.git"
prompt REPOSITORY_REF "Git branch or tag to deploy" "server"
prompt APP_SLUG "Service name (lowercase letters, digits and hyphens)" "pet-observation"
prompt APP_DISPLAY_NAME "Service display name" "Pet Observation Assistant"
prompt APP_USER "Linux service account" "$APP_SLUG"
prompt DOMAIN "Public domain (DNS must already point to this server)" "pet.example.com"
prompt CERTBOT_EMAIL "Let's Encrypt email (leave empty to register without email)" ""
prompt_yes_no DEPLOY_DEV "Deploy a separate development instance" "1"
prompt PROD_PATH "Production URL path without slashes" "pet"
prompt PROD_PORT "Production loopback port" "3100"
if [[ "$DEPLOY_DEV" == "1" ]]; then
  prompt DEV_PATH "Development URL path without slashes" "pet-dev"
  prompt DEV_PORT "Development loopback port" "3101"
else
  DEV_PATH=""
  DEV_PORT=""
fi
prompt_yes_no ENABLE_DIRECT "Add an optional direct HTTPS hostname/port" "0"
if [[ "$ENABLE_DIRECT" == "1" ]]; then
  prompt DIRECT_DOMAIN "Direct-access domain" "api.example.com"
  prompt DIRECT_HTTPS_PORT "Direct HTTPS port" "8443"
else
  DIRECT_DOMAIN=""
  DIRECT_HTTPS_PORT=""
fi
prompt NODE_VERSION "Node.js version" "v24.20.0"

if [[ "$NON_INTERACTIVE" == "1" ]]; then
  [[ "$DOMAIN" != "pet.example.com" ]] || {
    echo "Set DOMAIN to a real hostname when using NON_INTERACTIVE=1." >&2
    exit 2
  }
  if [[ "$ENABLE_DIRECT" == "1" && "$DIRECT_DOMAIN" == "api.example.com" ]]; then
    echo "Set DIRECT_DOMAIN to a real hostname when using NON_INTERACTIVE=1." >&2
    exit 2
  fi
fi

validate_slug() {
  [[ "$1" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || {
    echo "Invalid service/account name: $1" >&2
    exit 2
  }
}
validate_domain() {
  [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]] || {
    echo "Invalid domain: $1" >&2
    exit 2
  }
}
validate_path() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
    echo "Invalid URL path: $1" >&2
    exit 2
  }
}
validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 1 <= 10#$1 && 10#$1 <= 65535 )) || {
    echo "Invalid port: $1" >&2
    exit 2
  }
}
validate_repository() {
  [[ "$1" =~ ^https://[^[:space:]]+(/[^[:space:]]+)+(.git)?$ ]] || {
    echo "REPOSITORY_URL must be a public HTTPS Git repository URL." >&2
    exit 2
  }
  [[ "$2" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] && \
    [[ "$2" != *..* && "$2" != *'@{'* && "$2" != *//* ]] || {
    echo "Invalid Git branch or tag: $2" >&2
    exit 2
  }
}

validate_repository "$REPOSITORY_URL" "$REPOSITORY_REF"
validate_slug "$APP_SLUG"
validate_slug "$APP_USER"
validate_domain "$DOMAIN"
validate_path "$PROD_PATH"
validate_port "$PROD_PORT"
if [[ "$DEPLOY_DEV" == "1" ]]; then
  validate_path "$DEV_PATH"
  validate_port "$DEV_PORT"
  [[ "$DEV_PATH" != "$PROD_PATH" ]] || { echo "Development and production paths must differ." >&2; exit 2; }
  [[ "$DEV_PORT" != "$PROD_PORT" ]] || { echo "Development and production ports must differ." >&2; exit 2; }
fi
if [[ "$ENABLE_DIRECT" == "1" ]]; then
  validate_domain "$DIRECT_DOMAIN"
  validate_port "$DIRECT_HTTPS_PORT"
  [[ "$DIRECT_DOMAIN" != "$DOMAIN" || "$DIRECT_HTTPS_PORT" != "443" ]] || {
    echo "The direct endpoint duplicates the primary endpoint." >&2
    exit 2
  }
fi
if [[ -n "$SOURCE_DIR" && (! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/db/migrations/0001_local_sqlite.sql") ]]; then
  echo "SOURCE_DIR is not a complete project checkout: $SOURCE_DIR" >&2
  exit 2
fi

if [[ "$VALIDATE_ONLY" == "1" ]]; then
  echo "Deployment configuration is valid. No system changes were made."
  exit 0
fi

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      ca-certificates curl git openssl xz-utils tar build-essential python3 nginx certbot
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git openssl xz tar gcc-c++ make python3 nginx
    if ! dnf install -y certbot; then
      dnf install -y epel-release
      dnf install -y certbot
    fi
  else
    echo "Supported package managers: apt-get and dnf." >&2
    exit 3
  fi
}

prepare_source() {
  if [[ -n "$SOURCE_DIR" ]]; then
    echo "Using local source checkout: $SOURCE_DIR"
    return
  fi
  SOURCE_DIR="$(mktemp -d -t "$APP_SLUG-source.XXXXXX")"
  trap 'rm -rf "${SOURCE_DIR:-}"' EXIT
  echo "Downloading the minimal server source from $REPOSITORY_URL ($REPOSITORY_REF)..."
  git clone --depth 1 --filter=blob:none --sparse \
    --branch "$REPOSITORY_REF" --single-branch "$REPOSITORY_URL" "$SOURCE_DIR"
  git -C "$SOURCE_DIR" sparse-checkout set api contracts db src
  [[ -f "$SOURCE_DIR/package.json" && -f "$SOURCE_DIR/db/migrations/0001_local_sqlite.sql" ]] || {
    echo "The downloaded repository does not contain the expected server project." >&2
    exit 3
  }
}

install_node() {
  local machine_arch node_arch node_folder node_archive temp_dir expected actual
  machine_arch="$(uname -m)"
  case "$machine_arch" in
    x86_64|amd64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *) echo "Unsupported CPU architecture: $machine_arch" >&2; exit 3 ;;
  esac
  node_folder="node-${NODE_VERSION}-linux-${node_arch}"
  node_archive="${node_folder}.tar.xz"
  NODE_ROOT="/opt/$APP_SLUG/runtime/$node_folder"
  NODE_BIN="/opt/$APP_SLUG/runtime/node/bin/node"
  NPM_BIN="/opt/$APP_SLUG/runtime/node/bin/npm"
  if [[ ! -x "$NODE_ROOT/bin/node" ]]; then
    temp_dir="$(mktemp -d)"
    trap 'rm -rf "${temp_dir:-}"' RETURN
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt"
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$node_archive" -o "$temp_dir/$node_archive"
    expected="$(awk -v file="$node_archive" '$2 == file { print $1 }' "$temp_dir/SHASUMS256.txt")"
    actual="$(sha256sum "$temp_dir/$node_archive" | awk '{ print $1 }')"
    [[ -n "$expected" && "$expected" == "$actual" ]] || {
      echo "Node.js checksum verification failed." >&2
      exit 3
    }
    mkdir -p "/opt/$APP_SLUG/runtime"
    tar -xJf "$temp_dir/$node_archive" -C "/opt/$APP_SLUG/runtime"
    rm -rf "$temp_dir"
    trap - RETURN
  fi
  ln -sfn "$NODE_ROOT" "/opt/$APP_SLUG/runtime/node"
  "$NODE_BIN" --version
}

save_config() {
  local config_dir
  config_dir="$(dirname "$INSTALL_CONFIG")"
  install -d -m 0700 "$config_dir"
  umask 077
  {
    printf 'REPOSITORY_URL=%q\n' "$REPOSITORY_URL"
    printf 'REPOSITORY_REF=%q\n' "$REPOSITORY_REF"
    printf 'APP_SLUG=%q\n' "$APP_SLUG"
    printf 'APP_DISPLAY_NAME=%q\n' "$APP_DISPLAY_NAME"
    printf 'APP_USER=%q\n' "$APP_USER"
    printf 'DOMAIN=%q\n' "$DOMAIN"
    printf 'CERTBOT_EMAIL=%q\n' "$CERTBOT_EMAIL"
    printf 'DEPLOY_DEV=%q\n' "$DEPLOY_DEV"
    printf 'PROD_PATH=%q\n' "$PROD_PATH"
    printf 'PROD_PORT=%q\n' "$PROD_PORT"
    printf 'DEV_PATH=%q\n' "$DEV_PATH"
    printf 'DEV_PORT=%q\n' "$DEV_PORT"
    printf 'ENABLE_DIRECT=%q\n' "$ENABLE_DIRECT"
    printf 'DIRECT_DOMAIN=%q\n' "$DIRECT_DOMAIN"
    printf 'DIRECT_HTTPS_PORT=%q\n' "$DIRECT_HTTPS_PORT"
    printf 'NODE_VERSION=%q\n' "$NODE_VERSION"
  } >"$INSTALL_CONFIG"
  chmod 600 "$INSTALL_CONFIG"
}

create_service_account() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    local nologin_shell
    nologin_shell="$(command -v nologin || true)"
    [[ -n "$nologin_shell" ]] || nologin_shell="/bin/false"
    useradd --system --home-dir "/var/lib/$APP_SLUG" --create-home --shell "$nologin_shell" "$APP_USER"
  fi
}

build_release() {
  local release_id
  release_id="$(date -u +%Y%m%dT%H%M%SZ)"
  RELEASE_DIR="/opt/$APP_SLUG/releases/$release_id"
  install -d -m 0755 "$RELEASE_DIR"
  tar -C "$SOURCE_DIR" \
    --exclude='.git' --exclude='.idea' --exclude='.env' --exclude='data' \
    --exclude='dist' --exclude='node_modules' --exclude='src-tauri/target' \
    -cf - . | tar -C "$RELEASE_DIR" -xf -
  (
    cd "$RELEASE_DIR"
    export PATH="/opt/$APP_SLUG/runtime/node/bin:$PATH"
    "$NPM_BIN" ci --no-audit --no-fund
    "$NPM_BIN" run build
    "$NPM_BIN" prune --omit=dev --no-audit --no-fund
    "$NODE_BIN" -e "const Database=require('better-sqlite3'); new Database(':memory:').close()"
  )
  chown -R root:root "$RELEASE_DIR"
  ln -sfn "$RELEASE_DIR" "/opt/$APP_SLUG/current"
}

write_environment() {
  local environment="$1" port="$2" public_path="$3"
  local env_file="/etc/$APP_SLUG/$environment.env"
  local data_dir="/var/lib/$APP_SLUG/$environment"
  local api_key=""
  if [[ -f "$env_file" ]]; then
    api_key="$(sed -n 's/^DEVICE_API_KEY=//p' "$env_file" | head -n 1)"
  fi
  [[ ${#api_key} -ge 64 ]] || api_key="$(openssl rand -hex 32)"
  install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$data_dir" "$data_dir/uploads"
  umask 077
  {
    echo "NODE_ENV=production"
    echo "APP_MODE=server"
    echo "HOST=127.0.0.1"
    echo "PORT=$port"
    echo "DATA_DIR=$data_dir"
    echo "DEVICE_API_KEY=$api_key"
    echo "PUBLIC_BASE_URL=https://$DOMAIN/$public_path"
  } >"$env_file"
  chown root:"$APP_USER" "$env_file"
  chmod 640 "$env_file"
}

write_unit() {
  local environment="$1"
  cat >"/etc/systemd/system/$APP_SLUG-$environment.service" <<EOF
[Unit]
Description=$APP_DISPLAY_NAME ($environment)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=/opt/$APP_SLUG/current
EnvironmentFile=/etc/$APP_SLUG/$environment.env
ExecStart=/opt/$APP_SLUG/runtime/node/bin/node /opt/$APP_SLUG/current/dist/boot.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/$APP_SLUG/$environment
MemoryMax=384M
TasksMax=96

[Install]
WantedBy=multi-user.target
EOF
}

nginx_locations() {
  local output_file="$1"
  append_location "$output_file" "$PROD_PATH" "$PROD_PORT"
  if [[ "$DEPLOY_DEV" == "1" ]]; then
    append_location "$output_file" "$DEV_PATH" "$DEV_PORT"
  fi
}

append_location() {
  local output_file="$1" public_path="$2" port="$3"
  cat >>"$output_file" <<EOF
    location = /$public_path { return 308 /$public_path/; }
    location /$public_path/ {
        client_max_body_size 15m;
        proxy_buffering off;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_pass http://127.0.0.1:$port/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

EOF
}

write_http_nginx() {
  NGINX_CONFIG="/etc/nginx/conf.d/$APP_SLUG.conf"
  CHALLENGE_ROOT="/var/www/$APP_SLUG-letsencrypt"
  install -d -m 0755 "$CHALLENGE_ROOT/.well-known/acme-challenge"
  cat >"$NGINX_CONFIG" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN${DIRECT_DOMAIN:+ $DIRECT_DOMAIN};
    location ^~ /.well-known/acme-challenge/ { root $CHALLENGE_ROOT; }
    location / { return 404; }
}
EOF
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

obtain_certificate() {
  local cert_args=(certonly --webroot --webroot-path "$CHALLENGE_ROOT" --non-interactive --agree-tos --keep-until-expiring --cert-name "$DOMAIN" -d "$DOMAIN")
  if [[ -n "$DIRECT_DOMAIN" ]]; then
    cert_args+=(--expand -d "$DIRECT_DOMAIN")
  fi
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    cert_args+=(--email "$CERTBOT_EMAIL")
  else
    cert_args+=(--register-unsafely-without-email)
  fi
  certbot "${cert_args[@]}"
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat >"/etc/letsencrypt/renewal-hooks/deploy/$APP_SLUG-reload-nginx.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
nginx -t
systemctl reload nginx
EOF
  chmod 0755 "/etc/letsencrypt/renewal-hooks/deploy/$APP_SLUG-reload-nginx.sh"
}

write_https_nginx() {
  local locations_file direct_locations_file
  locations_file="$(mktemp)"
  direct_locations_file="$(mktemp)"
  trap 'rm -f "${locations_file:-}" "${direct_locations_file:-}"' RETURN
  nginx_locations "$locations_file"
  nginx_locations "$direct_locations_file"
  cat >"$NGINX_CONFIG" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $CHALLENGE_ROOT; }
    location / { return 308 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
$(cat "$locations_file")
    location / { return 404; }
}
EOF
  if [[ -n "$DIRECT_DOMAIN" ]]; then
    cat >>"$NGINX_CONFIG" <<EOF

server {
    listen 80;
    listen [::]:80;
    server_name $DIRECT_DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $CHALLENGE_ROOT; }
    location / { return 308 https://\$host:$DIRECT_HTTPS_PORT\$request_uri; }
}

server {
    listen $DIRECT_HTTPS_PORT ssl http2;
    listen [::]:$DIRECT_HTTPS_PORT ssl http2;
    server_name $DIRECT_DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
$(cat "$direct_locations_file")
    location / { return 404; }
}
EOF
  fi
  nginx -t
  systemctl reload nginx
  systemctl enable --now certbot.timer 2>/dev/null || true
  rm -f "$locations_file" "$direct_locations_file"
  trap - RETURN
}

verify_instance() {
  local environment="$1" path="$2" port="$3"
  local api_key code
  api_key="$(sed -n 's/^DEVICE_API_KEY=//p' "/etc/$APP_SLUG/$environment.env")"
  curl -fsS --retry 10 --retry-delay 1 \
    -H "Authorization: Bearer $api_key" \
    "http://127.0.0.1:$port/api/ready" >/dev/null
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --resolve "$DOMAIN:443:127.0.0.1" \
    -H "Authorization: Bearer $api_key" \
    "https://$DOMAIN/$path/api/ready")"
  [[ "$code" == "200" ]] || { echo "$environment HTTPS readiness returned HTTP $code." >&2; exit 4; }
  echo "$environment is ready: https://$DOMAIN/$path"
  if [[ -n "$DIRECT_DOMAIN" ]]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' \
      --resolve "$DIRECT_DOMAIN:$DIRECT_HTTPS_PORT:127.0.0.1" \
      -H "Authorization: Bearer $api_key" \
      "https://$DIRECT_DOMAIN:$DIRECT_HTTPS_PORT/$path/api/ready")"
    [[ "$code" == "200" ]] || { echo "$environment direct HTTPS readiness returned HTTP $code." >&2; exit 4; }
    echo "$environment direct endpoint: https://$DIRECT_DOMAIN:$DIRECT_HTTPS_PORT/$path"
  fi
}

echo "Installing system dependencies..."
install_packages
save_config
prepare_source
create_service_account
install_node
install -d -m 0755 "/opt/$APP_SLUG/releases" "/etc/$APP_SLUG"
build_release
write_environment prod "$PROD_PORT" "$PROD_PATH"
write_unit prod
if [[ "$DEPLOY_DEV" == "1" ]]; then
  write_environment dev "$DEV_PORT" "$DEV_PATH"
  write_unit dev
fi
systemctl daemon-reload
systemctl enable "$APP_SLUG-prod.service"
systemctl restart "$APP_SLUG-prod.service"
if [[ "$DEPLOY_DEV" == "1" ]]; then
  systemctl enable "$APP_SLUG-dev.service"
  systemctl restart "$APP_SLUG-dev.service"
elif [[ -f "/etc/systemd/system/$APP_SLUG-dev.service" ]]; then
  systemctl disable --now "$APP_SLUG-dev.service" || true
  rm -f "/etc/systemd/system/$APP_SLUG-dev.service"
  systemctl daemon-reload
fi
write_http_nginx
obtain_certificate
write_https_nginx
verify_instance prod "$PROD_PATH" "$PROD_PORT"
if [[ "$DEPLOY_DEV" == "1" ]]; then
  verify_instance dev "$DEV_PATH" "$DEV_PORT"
fi

echo
echo "Deployment completed. Device keys were not printed."
echo "Configuration: $INSTALL_CONFIG"
echo "Instance secrets: /etc/$APP_SLUG/*.env"
echo "Data: /var/lib/$APP_SLUG/"
echo "Re-run the same command to deploy an updated checkout while preserving data and keys."
