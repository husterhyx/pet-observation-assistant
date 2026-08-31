#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -un)" != "hua" ]]; then
  echo "This script must run as user hua." >&2
  exit 1
fi

release_archive="${1:-$HOME/pet-observation-release.tar.gz}"
if [[ ! -f "$release_archive" ]]; then
  echo "Release archive not found: $release_archive" >&2
  exit 1
fi

node_version="v24.20.0"
node_folder="node-${node_version}-linux-x64"
node_archive="${node_folder}.tar.xz"
node_root="$HOME/.local/$node_folder"
node_link="$HOME/.local/node"
app_root="$HOME/apps/pet-observation"
config_root="$HOME/.config/pet-observation"
data_root="$HOME/.local/share/pet-observation"
unit_root="$HOME/.config/systemd/user"

install_node() {
  if [[ ! -x "$node_root/bin/node" ]]; then
    temp_dir="$(mktemp -d)"
    trap 'rm -rf "$temp_dir"' RETURN
    curl -fsSL "https://nodejs.org/dist/${node_version}/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt"
    curl -fsSL "https://nodejs.org/dist/${node_version}/${node_archive}" -o "$temp_dir/$node_archive"
    expected="$(awk -v file="$node_archive" '$2 == file { print $1 }' "$temp_dir/SHASUMS256.txt")"
    actual="$(sha256sum "$temp_dir/$node_archive" | awk '{ print $1 }')"
    if [[ -z "$expected" || "$expected" != "$actual" ]]; then
      echo "Node.js checksum verification failed." >&2
      exit 1
    fi
    mkdir -p "$HOME/.local"
    tar -xJf "$temp_dir/$node_archive" -C "$HOME/.local"
    rm -rf "$temp_dir"
    trap - RETURN
  fi
  ln -sfn "$node_root" "$node_link"
  "$node_link/bin/node" --version
}

write_environment() {
  local environment="$1"
  local port="$2"
  local public_path="$3"
  local env_file="$config_root/$environment.env"
  local data_dir="$data_root/$environment"

  mkdir -p "$data_dir/uploads"
  chmod 700 "$data_dir" "$data_dir/uploads"
  if [[ ! -f "$env_file" ]]; then
    local api_key
    api_key="$("$node_link/bin/node" -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
    umask 077
    {
      echo "NODE_ENV=production"
      echo "APP_MODE=server"
      echo "HOST=127.0.0.1"
      echo "PORT=$port"
      echo "DATA_DIR=$data_dir"
      echo "DEVICE_API_KEY=$api_key"
      echo "PUBLIC_BASE_URL=https://yuxiang66.top/$public_path"
    } >"$env_file"
  fi
  grep -q '^HOST=' "$env_file" || echo "HOST=127.0.0.1" >>"$env_file"
  chmod 600 "$env_file"
}

prepare_sqlite_binding() {
  local release_dir="$1"
  local sqlite_root="$release_dir/node_modules/better-sqlite3"
  if "$node_link/bin/node" -e "const Database=require('$sqlite_root'); new Database(':memory:').close()" 2>/dev/null; then
    return 0
  fi

  echo "Compiling better-sqlite3 for the server's glibc and compiler..."
  export PATH="$node_link/bin:$PATH"
  if [[ ! -x "$HOME/.local/node-tools/bin/node-gyp" ]] || \
     [[ "$("$HOME/.local/node-tools/bin/node-gyp" --version)" != "v9.4.1" ]]; then
    npm install -g node-gyp@9.4.1 --prefix "$HOME/.local/node-tools" --no-audit --no-fund
  fi
  local node_gyp="$HOME/.local/node-tools/bin/node-gyp"
  local node_headers="$HOME/.cache/node-gyp/${node_version#v}/include/node/common.gypi"
  PYTHON=/usr/bin/python3 "$node_gyp" install "${node_version#v}"
  sed -i 's/gnu++20/gnu++2a/g; s/c++20/c++2a/g' "$node_headers"
  sed -i 's/gnu++20/gnu++2a/g; s/c++20/c++2a/g' "$sqlite_root/binding.gyp"
  if [[ -f "$sqlite_root/prebuilds/linux-x64.node" ]]; then
    mv "$sqlite_root/prebuilds/linux-x64.node" "$sqlite_root/prebuilds/linux-x64.node.incompatible-glibc-2.28"
  fi
  (
    cd "$sqlite_root"
    PYTHON=/usr/bin/python3 "$node_gyp" rebuild --release
  )
  "$node_link/bin/node" -e "const Database=require('$sqlite_root'); new Database(':memory:').close()"
}

write_unit() {
  local environment="$1"
  local unit_file="$unit_root/pet-observation-$environment.service"
  cat >"$unit_file" <<EOF
[Unit]
Description=Pet Observation Assistant ($environment)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$app_root/current
EnvironmentFile=$config_root/$environment.env
ExecStart=$node_link/bin/node $app_root/current/dist/boot.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$data_root/$environment
MemoryMax=320M
TasksMax=64

[Install]
WantedBy=default.target
EOF
}

verify_service() {
  local environment="$1"
  local port="$2"
  local env_file="$config_root/$environment.env"
  local api_key
  api_key="$(sed -n 's/^DEVICE_API_KEY=//p' "$env_file")"
  curl -fsS --retry 10 --retry-delay 1 \
    -H "Authorization: Bearer $api_key" \
    "http://127.0.0.1:$port/api/ready" >/dev/null
  echo "$environment service is ready on 127.0.0.1:$port"
}

install_node
mkdir -p "$app_root/releases" "$config_root" "$data_root" "$unit_root"
chmod 700 "$config_root" "$data_root"

release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="$app_root/releases/$release_id"
mkdir -p "$release_dir"
tar -xzf "$release_archive" -C "$release_dir"

if [[ ! -f "$release_dir/dist/boot.js" || ! -f "$release_dir/db/migrations/0001_local_sqlite.sql" ]]; then
  echo "Release archive is incomplete." >&2
  exit 1
fi

prepare_sqlite_binding "$release_dir"
ln -sfn "$release_dir" "$app_root/current"
write_environment dev 3101 pet-dev
write_environment prod 3100 pet
write_unit dev
write_unit prod

systemctl --user daemon-reload
systemctl --user enable --now pet-observation-dev.service pet-observation-prod.service
verify_service dev 3101
verify_service prod 3100

echo
echo "User-level deployment is complete."
echo "API keys remain in:"
echo "  $config_root/dev.env"
echo "  $config_root/prod.env"
echo "Do not copy these files into Git or chat."
