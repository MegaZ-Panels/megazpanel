#!/usr/bin/env bash
# install-panel.sh — interactive (Pterodactyl-style) installer for the panel
# host. Does everything end-to-end: apt baseline, UFW, Postgres + 1GB tuning,
# PgBouncer, Bun, Go, Node, backend env, Prisma migrate, admin seed, systemd
# unit, frontend static build, Nginx + Let's Encrypt, optional Telegram
# monitoring + standalone host monitor.
#
# This script self-bootstraps: when invoked standalone (no sibling lib/
# directory next to it), it installs git, clones the MegaZPanel repo to
# /opt/megazpanel, and re-executes itself from the clone.
#
# End-user one-liners:
#   sudo bash install-panel.sh
#   sudo bash <(curl -fsSL https://installer.aethercloud.web.id/install-panel.sh)
#
# Flags:
#   -y, --non-interactive    take all required values from env vars; fail if any are missing
#       --config FILE        source FILE for config (KEY=VALUE pairs) before prompting
#   -h, --help               show this help and exit
#
# Bootstrap-only env vars (used only when no checkout exists yet):
#   MEGAZPANEL_REPO_URL    git URL to clone (defaults to a placeholder; override or you'll be prompted)
#   MEGAZPANEL_REPO_BRANCH branch to check out (default: main)
#   INSTALL_DIR            where to clone (default: /opt/megazpanel)
#
# Installer env vars (skip the matching prompts when set + valid):
#   PANEL_NAME, PANEL_DOMAIN, STORAGE_DOMAIN, LE_EMAIL,
#   DB_NAME, DB_USER, DB_PASSWORD,
#   ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD,
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
#   PANEL_USER (system user, default: megazpanel),
#   BACKEND_PORT (default: 8080),
#   REPO_DIR     (default: parent of deploy/)
#
# Generated files on the host:
#   /etc/megazpanel/install.conf   (mode 0600, root only — non-secret summary)
#   /etc/megazpanel/backend.env    (mode 0640, root:megazpanel — backend secrets)
#   /etc/megazpanel/monitor.env    (mode 0600, root only — monitor secrets, optional)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd)" || DEPLOY_DIR=""
REPO_DIR_DEFAULT="$( [[ -n "${DEPLOY_DIR}" ]] && (cd "${DEPLOY_DIR}/.." 2>/dev/null && pwd) || true )"

# ─── Self-bootstrap ──────────────────────────────────────────────────────────
# When this script is invoked standalone (e.g., copied to /tmp or piped from
# curl) and the rest of the repo isn't on disk, clone it and re-exec from the
# clone. Otherwise fall through to the normal installer flow.
if [[ -z "${MZP_BOOTSTRAPPED:-}" && ! -f "${SCRIPT_DIR}/lib/common.sh" ]]; then
  echo "[mzp] bootstrap mode (no checkout found alongside this script)"
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "[mzp] must be run as root (sudo bash install-panel.sh)" >&2
    exit 1
  fi

  REPO_URL_DEFAULT="https://github.com/MegaZ-Panels/megazpanel.git"
  REPO_URL="${MEGAZPANEL_REPO_URL:-}"
  REPO_BRANCH="${MEGAZPANEL_REPO_BRANCH:-main}"
  INSTALL_DIR="${INSTALL_DIR:-/opt/megazpanel}"

  if [[ -z "${REPO_URL}" ]]; then
    if [[ -t 0 ]]; then
      read -r -p "[mzp] Git repository URL [${REPO_URL_DEFAULT}]: " REPO_URL || true
      REPO_URL="${REPO_URL:-${REPO_URL_DEFAULT}}"
    else
      echo "[mzp] MEGAZPANEL_REPO_URL must be set in non-interactive mode" >&2
      exit 1
    fi
  fi

  echo "[mzp] installing git + ca-certificates"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends git ca-certificates curl

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    echo "[mzp] updating existing checkout at ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" remote set-url origin "${REPO_URL}"
    git -C "${INSTALL_DIR}" fetch --quiet origin "${REPO_BRANCH}"
    git -C "${INSTALL_DIR}" checkout "${REPO_BRANCH}"
    git -C "${INSTALL_DIR}" reset --hard "origin/${REPO_BRANCH}"
  else
    echo "[mzp] cloning ${REPO_URL}#${REPO_BRANCH} -> ${INSTALL_DIR}"
    install -d -m 0755 "$(dirname "${INSTALL_DIR}")"
    git clone --branch "${REPO_BRANCH}" --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
  fi

  INSTALLER="${INSTALL_DIR}/deploy/install/install-panel.sh"
  if [[ ! -x "${INSTALLER}" ]]; then chmod +x "${INSTALLER}" 2>/dev/null || true; fi
  if [[ ! -f "${INSTALLER}" ]]; then
    echo "[mzp] installer not found at ${INSTALLER} — bad repo URL or branch?" >&2
    exit 1
  fi

  echo "[mzp] re-executing installer from ${INSTALLER}"
  export MZP_BOOTSTRAPPED=1
  exec bash "${INSTALLER}" "$@"
fi

if [[ -z "${DEPLOY_DIR}" || -z "${REPO_DIR_DEFAULT}" ]]; then
  echo "[mzp] could not resolve script paths" >&2
  exit 1
fi

# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/prompts.sh
. "${SCRIPT_DIR}/lib/prompts.sh"
# shellcheck source=lib/postgres.sh
. "${SCRIPT_DIR}/lib/postgres.sh"
# shellcheck source=lib/pgbouncer.sh
. "${SCRIPT_DIR}/lib/pgbouncer.sh"
# shellcheck source=lib/bun.sh
. "${SCRIPT_DIR}/lib/bun.sh"
# shellcheck source=lib/go.sh
. "${SCRIPT_DIR}/lib/go.sh"
# shellcheck source=lib/nginx.sh
. "${SCRIPT_DIR}/lib/nginx.sh"
# shellcheck source=lib/certbot.sh
. "${SCRIPT_DIR}/lib/certbot.sh"
# shellcheck source=lib/ufw.sh
. "${SCRIPT_DIR}/lib/ufw.sh"

# ── Args ─────────────────────────────────────────────────────────────────────
NON_INTERACTIVE=false
CONFIG_FILE=""
while (( $# > 0 )); do
  case "$1" in
    -y|--non-interactive) NON_INTERACTIVE=true ;;
    --config) shift; CONFIG_FILE="${1:?--config requires a path}" ;;
    -h|--help)
      sed -n '1,/^set -E/p' "$0" | grep -E '^# ?' | sed 's/^# \?//'
      exit 0
      ;;
    *) p_err "unknown argument: $1"; exit 1 ;;
  esac
  shift
done

if [[ -n "${CONFIG_FILE}" ]]; then
  [[ -r "${CONFIG_FILE}" ]] || fatal "cannot read config file ${CONFIG_FILE}"
  log "loading defaults from ${CONFIG_FILE}"
  # shellcheck disable=SC1090
  set -a; . "${CONFIG_FILE}"; set +a
fi

require_root
detect_os
show_banner

# ── Detect prior install ─────────────────────────────────────────────────────
INSTALL_CONF=/etc/megazpanel/install.conf
if [[ -f "${INSTALL_CONF}" ]]; then
  p_warn "previous installation detected at ${INSTALL_CONF}"
  # Pre-populate defaults from prior install (does not override existing env).
  # shellcheck disable=SC1090
  set -a; . "${INSTALL_CONF}"; set +a
  if ! confirm "re-run installer to reconfigure / repair?" Y; then
    p_info "cancelled"; exit 0
  fi
fi

# ── Defaults ─────────────────────────────────────────────────────────────────
PANEL_NAME="${PANEL_NAME:-MegaZPanel}"
DB_NAME="${DB_NAME:-megazpanel}"
DB_USER="${DB_USER:-megaz}"
ADMIN_NAME="${ADMIN_NAME:-Admin}"
PANEL_USER="${PANEL_USER:-megazpanel}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
REPO_DIR="${REPO_DIR:-${REPO_DIR_DEFAULT}}"

if [[ ! -d "${REPO_DIR}/backend" || ! -d "${REPO_DIR}/frontend" ]]; then
  fatal "REPO_DIR=${REPO_DIR} doesn't look like a MegaZPanel checkout"
fi

if "${NON_INTERACTIVE}" && ! is_interactive; then
  : # already non-interactive; ask() will fail loudly on missing vars
fi

# ── Collect ──────────────────────────────────────────────────────────────────
p_step "Panel"
ask PANEL_NAME      "Panel display name"                                  "${PANEL_NAME}"
ask PANEL_DOMAIN    "Panel FQDN (must already point to this host)"        ""                       validate_domain
require_dns_resolves "${PANEL_DOMAIN}"

if [[ -n "${STORAGE_DOMAIN:-}" ]]; then
  ask STORAGE_DOMAIN "Storage node FQDN (managed externally)"             "${STORAGE_DOMAIN}"      validate_domain
elif confirm "configure a storage node FQDN now?" N; then
  ask STORAGE_DOMAIN "Storage node FQDN"                                  ""                       validate_domain
else
  STORAGE_DOMAIN=""
fi

ask LE_EMAIL        "Email for Let's Encrypt notifications"               ""                       validate_email

p_step "Database"
ask DB_NAME         "PostgreSQL database name"                            "${DB_NAME}"             validate_db_identifier
ask DB_USER         "PostgreSQL database user"                            "${DB_USER}"             validate_db_identifier
ask_password DB_PASSWORD "PostgreSQL password"                                                       true

p_step "Initial admin"
ask ADMIN_EMAIL     "Admin email"                                         ""                       validate_email
ask ADMIN_NAME      "Admin display name"                                  "${ADMIN_NAME}"
ask_password ADMIN_PASSWORD "Admin password"                                                          true

p_step "Telegram alerting (optional)"
TELEGRAM_ENABLED=false
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" || -n "${TELEGRAM_CHAT_ID:-}" ]]; then
  TELEGRAM_ENABLED=true
elif confirm "configure Telegram alerts now?" N; then
  TELEGRAM_ENABLED=true
fi
if "${TELEGRAM_ENABLED}"; then
  ask TELEGRAM_BOT_TOKEN "Telegram bot token"                             ""                       validate_telegram_token
  ask TELEGRAM_CHAT_ID   "Admin Telegram chat ID (numeric)"               ""                       validate_telegram_chat_id
else
  TELEGRAM_BOT_TOKEN=""
  TELEGRAM_CHAT_ID=""
fi

# ── Summary ──────────────────────────────────────────────────────────────────
p_step "Summary"
cat <<EOF
  Panel name           : ${PANEL_NAME}
  Panel domain         : ${PANEL_DOMAIN}
  Storage domain       : ${STORAGE_DOMAIN:-<none>}
  Let's Encrypt email  : ${LE_EMAIL}

  Database name        : ${DB_NAME}
  Database user        : ${DB_USER}
  Database password    : $(mask "${DB_PASSWORD}")

  Admin email          : ${ADMIN_EMAIL}
  Admin name           : ${ADMIN_NAME}
  Admin password       : $(mask "${ADMIN_PASSWORD}")

  Telegram alerts      : $( "${TELEGRAM_ENABLED}" && echo "enabled (token $(mask "${TELEGRAM_BOT_TOKEN}"), chat ${TELEGRAM_CHAT_ID})" || echo "disabled")

  Source checkout      : ${REPO_DIR}
  System user          : ${PANEL_USER}
  Backend port         : ${BACKEND_PORT}
EOF

if ! confirm "proceed with installation?" Y; then
  p_info "cancelled by user"; exit 0
fi

# ── Execute ──────────────────────────────────────────────────────────────────
p_step "Installing"

apt_install ca-certificates curl gnupg openssl tzdata acl rsync git build-essential libpq-dev

ensure_system_user "${PANEL_USER}" "/var/lib/${PANEL_USER}"
install -d -m 0755 -o "${PANEL_USER}" -g "${PANEL_USER}" /var/log/megazpanel
install -d -m 0750 -o root -g "${PANEL_USER}" /etc/megazpanel
install -d -m 0750 -o root -g "${PANEL_USER}" /var/lib/megazpanel

BACKEND_DIR="${REPO_DIR}/backend"
FRONTEND_DIR="${REPO_DIR}/frontend"
FRONTEND_OUT="${FRONTEND_DIR}/out"

setfacl -R -m "u:${PANEL_USER}:rwX" "${BACKEND_DIR}" || true
chown -R "${PANEL_USER}:${PANEL_USER}" "${BACKEND_DIR}/node_modules" 2>/dev/null || true

ufw_setup

# Postgres
postgres_install
postgres_apply_tuning "${DEPLOY_DIR}/postgres/postgresql.conf"
PG_HBA="$(sudo -u postgres psql -tAc "SHOW hba_file" | tr -d '[:space:]')"
install -m 0640 -o postgres -g postgres "${DEPLOY_DIR}/postgres/pg_hba.conf" "${PG_HBA}"
systemctl reload postgresql
postgres_create_database "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}"

# PgBouncer
pgbouncer_install
pgbouncer_configure "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}" "${DEPLOY_DIR}/pgbouncer/pgbouncer.ini.tpl"

# Runtimes
bun_install
go_install
apt_install nodejs npm

# Backend env
APP_SECRET="$(random_hex 32)"
ENV_FILE="/etc/megazpanel/backend.env"
cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${BACKEND_PORT}
HOST=127.0.0.1
WEB_ORIGIN=https://${PANEL_DOMAIN}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:6432/${DB_NAME}?schema=public
SESSION_COOKIE_NAME=mzp_sid
CSRF_COOKIE_NAME=mzp_csrf
SESSION_LIFETIME_HOURS=24
SESSION_REMEMBER_ME_DAYS=30
COOKIE_DOMAIN=${PANEL_DOMAIN}
COOKIE_SECURE=true
APP_SECRET=${APP_SECRET}
EOF
chown root:"${PANEL_USER}" "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

log "installing backend dependencies"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && /usr/local/bin/bun install --production"

log "running prisma migrate deploy + generate"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}' /usr/local/bin/bun x prisma migrate deploy"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && /usr/local/bin/bun x prisma generate"

log "ensuring initial admin account"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}' /usr/local/bin/bun src/cli/seed-admin.ts --email '${ADMIN_EMAIL}' --name '${ADMIN_NAME}' --password '${ADMIN_PASSWORD}'"

# systemd unit for the backend
render_template "${DEPLOY_DIR}/systemd/megazpanel-backend.service.tpl" \
  /etc/systemd/system/megazpanel-backend.service \
  BACKEND_DIR="${BACKEND_DIR}" \
  ENV_FILE="${ENV_FILE}"
systemctl daemon-reload
systemctl enable --now megazpanel-backend.service
wait_for_port 127.0.0.1 "${BACKEND_PORT}" 30

# Frontend build
log "building frontend"
cat > "${FRONTEND_DIR}/.env.production" <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL=https://${PANEL_DOMAIN}
NEXT_PUBLIC_WS_URL=https://${PANEL_DOMAIN}
NEXT_PUBLIC_WS_PATH=/socket.io
EOF
chown "${PANEL_USER}:${PANEL_USER}" "${FRONTEND_DIR}/.env.production"

sudo -u "${PANEL_USER}" -H bash -lc "cd '${FRONTEND_DIR}' && npm install --no-audit --no-fund --loglevel=error && npm run build"
[[ -d "${FRONTEND_OUT}" ]] || fatal "frontend build did not produce ${FRONTEND_OUT}"

chmod o+rx "${REPO_DIR}" "${FRONTEND_DIR}" "${FRONTEND_OUT}"
find "${FRONTEND_OUT}" -type d -exec chmod 755 {} +
find "${FRONTEND_OUT}" -type f -exec chmod 644 {} +

# Nginx + Let's Encrypt
nginx_install
nginx_remove_default_site
nginx_install_pre_le "panel" "${PANEL_DOMAIN}"

certbot_install
certbot_issue "${PANEL_DOMAIN}" "${LE_EMAIL}"
certbot_install_renewal_hook

nginx_install_site "panel" "${DEPLOY_DIR}/nginx/panel.conf.tpl" \
  PANEL_DOMAIN="${PANEL_DOMAIN}" \
  FRONTEND_ROOT="${FRONTEND_OUT}" \
  BACKEND_PORT="${BACKEND_PORT}"

# Verify
log "verifying backend health"
if ! curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null; then
  fatal "backend /health did not respond"
fi

# Optional Telegram monitoring
if "${TELEGRAM_ENABLED}"; then
  log "configuring Telegram monitoring"
  cat > /etc/megazpanel/monitor.env <<EOF
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
PANEL_DOMAIN=${PANEL_DOMAIN}
BACKEND_URL=http://127.0.0.1:${BACKEND_PORT}
DB_HOST=127.0.0.1
DB_PORT=6432
SYSTEMD_UNITS=megazpanel-backend,postgresql,pgbouncer,nginx
DISK_PATH=/
DISK_WARN_PERCENT=85
MEM_WARN_PERCENT=85
STATE_FILE=/var/lib/megazpanel/monitor-state.json
EOF
  chown root:root /etc/megazpanel/monitor.env
  chmod 0600 /etc/megazpanel/monitor.env

  install -m 0755 "${DEPLOY_DIR}/scripts/monitor.sh" /usr/local/bin/megazpanel-monitor
  render_template "${DEPLOY_DIR}/systemd/megazpanel-monitor.service.tpl" \
    /etc/systemd/system/megazpanel-monitor.service \
    MONITOR_SCRIPT="/usr/local/bin/megazpanel-monitor"
  install -m 0644 "${DEPLOY_DIR}/systemd/megazpanel-monitor.timer.tpl" \
    /etc/systemd/system/megazpanel-monitor.timer
  systemctl daemon-reload
  systemctl enable --now megazpanel-monitor.timer

  log "seeding in-DB Telegram channel"
  sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}' TELEGRAM_BOT_TOKEN='${TELEGRAM_BOT_TOKEN}' TELEGRAM_CHAT_ID='${TELEGRAM_CHAT_ID}' /usr/local/bin/bun src/cli/seed-monitoring.ts"
fi

# ── Save non-secret summary ──────────────────────────────────────────────────
cat > "${INSTALL_CONF}" <<EOF
# MegaZPanel install summary — non-secret values only.
# Generated by install-panel.sh at $(date -u +%FT%TZ)
PANEL_NAME=${PANEL_NAME}
PANEL_DOMAIN=${PANEL_DOMAIN}
STORAGE_DOMAIN=${STORAGE_DOMAIN}
LE_EMAIL=${LE_EMAIL}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_NAME=${ADMIN_NAME}
PANEL_USER=${PANEL_USER}
BACKEND_PORT=${BACKEND_PORT}
TELEGRAM_ENABLED=${TELEGRAM_ENABLED}
REPO_DIR=${REPO_DIR}
EOF
chown root:root "${INSTALL_CONF}"
chmod 0600 "${INSTALL_CONF}"

# ── Final summary ────────────────────────────────────────────────────────────
p_step "Done"
cat <<EOF

  ${C_GREEN}${PANEL_NAME} is installed.${C_OFF}

  URL                : ${C_BOLD}https://${PANEL_DOMAIN}${C_OFF}
  Admin login        : ${ADMIN_EMAIL}
  Admin password     : ${C_YELLOW}${ADMIN_PASSWORD}${C_OFF}    ${C_RED}(save this now)${C_OFF}
  Database password  : ${C_YELLOW}${DB_PASSWORD}${C_OFF}        ${C_RED}(stored in /etc/megazpanel/backend.env)${C_OFF}

  Service            : systemctl status megazpanel-backend
  Logs               : journalctl -u megazpanel-backend -f
$( "${TELEGRAM_ENABLED}" && cat <<TG
  Monitor timer      : systemctl status megazpanel-monitor.timer
  Monitor logs       : journalctl -u megazpanel-monitor -f
TG
)

  Re-running this installer is safe; it detects the existing config at
  ${INSTALL_CONF} and reconfigures in place.

EOF

p_warn "the credentials above will not be shown again — copy them now"
