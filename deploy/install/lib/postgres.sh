#!/usr/bin/env bash
# postgres.sh — install + configure PostgreSQL 16 tuned for 1GB VPS.
# Sources common.sh. Idempotent.

# shellcheck disable=SC2034

postgres_install() {
  if command -v psql >/dev/null 2>&1 && systemctl is-active --quiet postgresql 2>/dev/null; then
    log "postgresql already installed and active"
    return 0
  fi

  case "${OS_ID}" in
    ubuntu)
      apt_install postgresql postgresql-contrib
      ;;
    debian)
      apt_install postgresql postgresql-contrib
      ;;
  esac

  systemctl enable --now postgresql
}

postgres_apply_tuning() {
  local tuning_src="${1:?tuning_src required}"
  local conf_dir
  conf_dir="$(sudo -u postgres psql -tAc "SHOW config_file" | xargs dirname)"
  local override="${conf_dir}/conf.d/megazpanel.conf"

  install -d -m 0755 "${conf_dir}/conf.d"
  install -m 0644 "${tuning_src}" "${override}"

  # Ensure conf.d is included.
  if ! grep -q "include_dir = 'conf.d'" "${conf_dir}/postgresql.conf"; then
    echo "include_dir = 'conf.d'" >> "${conf_dir}/postgresql.conf"
  fi

  # Bind to localhost only.
  sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = '127.0.0.1'/" "${conf_dir}/postgresql.conf"

  systemctl restart postgresql
  wait_for_port 127.0.0.1 5432 30
}

postgres_create_database() {
  local db="$1" user="$2" password="$3"

  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${user}'" | grep -q 1; then
    log "postgres role '${user}' exists; updating password"
    sudo -u postgres psql -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"${user}\" WITH LOGIN PASSWORD '${password}'"
  else
    log "creating postgres role '${user}'"
    sudo -u postgres psql -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE \"${user}\" WITH LOGIN PASSWORD '${password}'"
  fi

  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    log "postgres database '${db}' already exists"
  else
    log "creating postgres database '${db}'"
    sudo -u postgres createdb -O "${user}" "${db}"
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${db}" \
    -c "GRANT ALL PRIVILEGES ON DATABASE \"${db}\" TO \"${user}\";" \
    -c "GRANT ALL ON SCHEMA public TO \"${user}\";"
}
