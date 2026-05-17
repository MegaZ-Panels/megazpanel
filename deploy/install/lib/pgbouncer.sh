#!/usr/bin/env bash
# pgbouncer.sh — install and configure PgBouncer in transaction-pooling mode.

pgbouncer_install() {
  if command -v pgbouncer >/dev/null 2>&1; then
    log "pgbouncer already installed"
    return 0
  fi
  apt_install pgbouncer
}

# pgbouncer_configure DB USER PASSWORD INI_TEMPLATE
pgbouncer_configure() {
  local db="$1" user="$2" password="$3" template="$4"

  install -d -m 0750 -o postgres -g postgres /etc/pgbouncer

  render_template "$template" /etc/pgbouncer/pgbouncer.ini \
    DB_NAME="$db" \
    DB_USER="$user"
  chmod 0640 /etc/pgbouncer/pgbouncer.ini
  chown postgres:postgres /etc/pgbouncer/pgbouncer.ini

  # SCRAM-SHA-256 auth requires the hashed password, but PgBouncer also accepts
  # md5 and plain. We use plain (escaped) here since the file is mode 0600.
  cat > /etc/pgbouncer/userlist.txt <<EOF
"${user}" "${password}"
EOF
  chmod 0600 /etc/pgbouncer/userlist.txt
  chown postgres:postgres /etc/pgbouncer/userlist.txt

  systemctl enable --now pgbouncer
  systemctl restart pgbouncer
  wait_for_port 127.0.0.1 6432 30
}
