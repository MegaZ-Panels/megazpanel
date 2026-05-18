#!/usr/bin/env bash
# install-panel.sh — interactive (Pterodactyl-style) installer for the panel
# host. Does everything end-to-end: apt baseline, UFW, Postgres + 1GB tuning,
# PgBouncer, Bun, Go, Node, backend env, Prisma migrate, admin seed, systemd
# unit, frontend Next.js standalone, Nginx + Let's Encrypt, optional Telegram
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
#   MEGAZPANEL_REPO_URL    git URL to clone (default: official MegaZ-Panels/megazpanel)
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
if ! DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd)"; then
  DEPLOY_DIR=""
fi
if [[ -n "${DEPLOY_DIR}" ]]; then
  REPO_DIR_DEFAULT="$(cd "${DEPLOY_DIR}/.." 2>/dev/null && pwd)" || REPO_DIR_DEFAULT=""
else
  REPO_DIR_DEFAULT=""
fi

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

  # Repo source — fixed to the official MegaZPanel repo. Power users can
  # override via env (MEGAZPANEL_REPO_URL / MEGAZPANEL_REPO_BRANCH) before
  # invoking this script. We deliberately do NOT prompt for it: keep the
  # one-liner experience simple (Pterodactyl-style).
  REPO_URL="${MEGAZPANEL_REPO_URL:-https://github.com/MegaZ-Panels/megazpanel.git}"
  REPO_BRANCH="${MEGAZPANEL_REPO_BRANCH:-main}"
  INSTALL_DIR="${INSTALL_DIR:-/opt/megazpanel}"

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
  set -a
  # shellcheck source=/dev/null
  . "${CONFIG_FILE}"
  set +a
fi

require_root
detect_os
mzp_title "MegaZPanel · Panel host installer"

# Total steps for the [n/N] step counter (in chronological order):
#   1. Apt baseline
#   2. UFW firewall
#   3. PostgreSQL
#   4. PgBouncer
#   5. Bun + Go + Node runtimes
#   6. Backend env + dependencies
#   7. Prisma migrate + admin seed
#   8. Backend systemd unit
#   9. Frontend build
#  10. Nginx + Let's Encrypt
#  11. (optional) Telegram monitoring
#  12. Final verification + summary
export MZP_TOTAL_STEPS=12

# ── Detect prior install ─────────────────────────────────────────────────────
INSTALL_CONF=/etc/megazpanel/install.conf
if [[ -f "${INSTALL_CONF}" ]]; then
  p_warn "previous installation detected at ${INSTALL_CONF}"
  # Pre-populate defaults from prior install (does not override existing env).
  set -a
  # shellcheck source=/dev/null
  . "${INSTALL_CONF}"
  set +a
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
p_section "Panel"
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

p_section "Database"
ask DB_NAME         "PostgreSQL database name"                            "${DB_NAME}"             validate_db_identifier
ask DB_USER         "PostgreSQL database user"                            "${DB_USER}"             validate_db_identifier
ask_password DB_PASSWORD "PostgreSQL password"                                                       true

p_section "Initial admin"
ask ADMIN_EMAIL     "Admin email"                                         ""                       validate_email
ask ADMIN_NAME      "Admin display name"                                  "${ADMIN_NAME}"
ask_password ADMIN_PASSWORD "Admin password"                                                          true

p_section "Telegram alerting (optional)"
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
p_section "Summary"
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
  Frontend port        : ${FRONTEND_PORT:-3001}
EOF

if ! confirm "proceed with installation?" Y; then
  p_info "cancelled by user"; exit 0
fi

# ── Execute ──────────────────────────────────────────────────────────────────
MZP_STEP=0    # reset counter so install steps start at [1/12]

p_step "Apt baseline"
apt_install ca-certificates curl gnupg openssl tzdata acl rsync git build-essential libpq-dev

ensure_system_user "${PANEL_USER}" "/var/lib/${PANEL_USER}"
install -d -m 0755 -o "${PANEL_USER}" -g "${PANEL_USER}" /var/log/megazpanel
install -d -m 0750 -o root -g "${PANEL_USER}" /etc/megazpanel
install -d -m 0750 -o root -g "${PANEL_USER}" /var/lib/megazpanel

BACKEND_DIR="${REPO_DIR}/backend"
FRONTEND_DIR="${REPO_DIR}/frontend"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

setfacl -R -m "u:${PANEL_USER}:rwX" "${BACKEND_DIR}" || true
chown -R "${PANEL_USER}:${PANEL_USER}" "${BACKEND_DIR}/node_modules" 2>/dev/null || true

p_step "UFW firewall"
ufw_setup

p_step "PostgreSQL 16 (1GB-tuned)"
postgres_install
postgres_apply_tuning "${DEPLOY_DIR}/postgres/postgresql.conf"
PG_HBA="$(sudo -u postgres psql -tAc "SHOW hba_file" | tr -d '[:space:]')"
install -m 0640 -o postgres -g postgres "${DEPLOY_DIR}/postgres/pg_hba.conf" "${PG_HBA}"
systemctl reload postgresql
postgres_create_database "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}"

p_step "PgBouncer (transaction pooling)"
pgbouncer_install
pgbouncer_configure "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}" "${DEPLOY_DIR}/pgbouncer/pgbouncer.ini.tpl"

p_step "Bun + Go + Node runtimes"
bun_install
go_install
apt_install nodejs npm

p_step "Backend env + dependencies"
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

p_step "Prisma migrate + admin seed"
log "running prisma migrate deploy + generate"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}' /usr/local/bin/bun x prisma migrate deploy"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && /usr/local/bin/bun x prisma generate"

log "ensuring initial admin account"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${BACKEND_DIR}' && DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}' /usr/local/bin/bun src/cli/seed-admin.ts --email '${ADMIN_EMAIL}' --name '${ADMIN_NAME}' --password '${ADMIN_PASSWORD}'"

p_step "Backend systemd unit"
render_template "${DEPLOY_DIR}/systemd/megazpanel-backend.service.tpl" \
  /etc/systemd/system/megazpanel-backend.service \
  BACKEND_DIR="${BACKEND_DIR}" \
  ENV_FILE="${ENV_FILE}"
systemctl daemon-reload
systemctl enable --now megazpanel-backend.service
wait_for_port 127.0.0.1 "${BACKEND_PORT}" 30

p_step "Frontend build (Next.js standalone)"
cat > "${FRONTEND_DIR}/.env.production" <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL=https://${PANEL_DOMAIN}
NEXT_PUBLIC_WS_URL=https://${PANEL_DOMAIN}
NEXT_PUBLIC_WS_PATH=/socket.io
EOF
chown "${PANEL_USER}:${PANEL_USER}" "${FRONTEND_DIR}/.env.production"

sudo -u "${PANEL_USER}" -H bash -lc "cd '${FRONTEND_DIR}' && npm install --no-audit --no-fund --loglevel=error && npm run build"

# next build with output:standalone produces .next/standalone/server.js, but we
# must copy static assets and the public/ folder into the standalone tree.
[[ -d "${FRONTEND_DIR}/.next/standalone" ]] || fatal "frontend build did not produce .next/standalone"
sudo -u "${PANEL_USER}" -H bash -lc "
  cp -r '${FRONTEND_DIR}/.next/static' '${FRONTEND_DIR}/.next/standalone/.next/static'
  if [ -d '${FRONTEND_DIR}/public' ]; then
    cp -r '${FRONTEND_DIR}/public' '${FRONTEND_DIR}/.next/standalone/public'
  fi
"

# Render & install the frontend systemd unit.
render_template "${DEPLOY_DIR}/systemd/megazpanel-frontend.service.tpl" \
  /etc/systemd/system/megazpanel-frontend.service \
  FRONTEND_DIR="${FRONTEND_DIR}" \
  FRONTEND_PORT="${FRONTEND_PORT}"
systemctl daemon-reload
systemctl enable --now megazpanel-frontend.service
wait_for_port 127.0.0.1 "${FRONTEND_PORT}" 60

p_step "Nginx + Let's Encrypt"
nginx_install
nginx_remove_default_site
nginx_install_pre_le "panel" "${PANEL_DOMAIN}"

certbot_install
certbot_issue "${PANEL_DOMAIN}" "${LE_EMAIL}"
certbot_install_renewal_hook

nginx_install_site "panel" "${DEPLOY_DIR}/nginx/panel.conf.tpl" \
  PANEL_DOMAIN="${PANEL_DOMAIN}" \
  FRONTEND_PORT="${FRONTEND_PORT}" \
  BACKEND_PORT="${BACKEND_PORT}"

p_step "Telegram monitoring"
if "${TELEGRAM_ENABLED}"; then
  log "configuring Telegram monitoring"
  cat > /etc/megazpanel/monitor.env <<EOF
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
PANEL_DOMAIN=${PANEL_DOMAIN}
BACKEND_URL=http://127.0.0.1:${BACKEND_PORT}
DB_HOST=127.0.0.1
DB_PORT=6432
SYSTEMD_UNITS=megazpanel-backend,megazpanel-frontend,postgresql,pgbouncer,nginx
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
else
  p_info "Telegram alerts disabled (skipped)"
fi

p_step "Verify + persist install summary"
log "verifying backend health"
if ! curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null; then
  fatal "backend /health did not respond"
fi
p_ok "backend /health responding"

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
FRONTEND_PORT=${FRONTEND_PORT}
TELEGRAM_ENABLED=${TELEGRAM_ENABLED}
REPO_DIR=${REPO_DIR}
EOF
chown root:root "${INSTALL_CONF}"
chmod 0600 "${INSTALL_CONF}"

# ── Final summary box ────────────────────────────────────────────────────────
mzp_box_begin "✓ ${PANEL_NAME} installed"
mzp_box_line "URL              : ${C_BOLD}https://${PANEL_DOMAIN}${C_OFF}"
mzp_box_line "Admin login      : ${ADMIN_EMAIL}"
mzp_box_line "Admin password   : ${C_YELLOW}${ADMIN_PASSWORD}${C_OFF}"
mzp_box_line "DB password      : ${C_YELLOW}${DB_PASSWORD}${C_OFF}"
mzp_box_sep
mzp_box_line "Service          : systemctl status megazpanel-backend"
mzp_box_line "Logs             : journalctl -u megazpanel-backend -f"
mzp_box_line "Backend env      : /etc/megazpanel/backend.env (mode 0640)"
mzp_box_line "Install summary  : ${INSTALL_CONF}"
if "${TELEGRAM_ENABLED}"; then
  mzp_box_sep
  mzp_box_line "Monitor timer    : systemctl status megazpanel-monitor.timer"
  mzp_box_line "Monitor logs     : journalctl -u megazpanel-monitor -f"
fi
mzp_box_end

p_warn "the credentials above will not be shown again — copy them now"
p_info "re-running this installer is safe; it detects ${INSTALL_CONF} and reconfigures in place"
