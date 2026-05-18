#!/usr/bin/env bash
# install-storage-node.sh — provisions a MinIO storage node behind Nginx + TLS.
#
# Required env (the Pterodactyl-style menu wrapper prompts for these; if you
# invoke this script directly you must export them first):
#   STORAGE_DOMAIN  e.g. storage.example.com
#   LE_EMAIL        email for Let's Encrypt
#
# Optional env:
#   MINIO_PORT          default 9000
#   MINIO_CONSOLE_PORT  default 9001
#   MINIO_VOLUMES       default /var/lib/minio/data
#   MINIO_ROOT_USER     default megazpanel-admin
#   MINIO_ROOT_PASSWORD default: random 32 bytes b64
#   MZP_SKIP_DNS_CHECK  set to 1 to skip the upfront DNS resolution check

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/nginx.sh
. "${SCRIPT_DIR}/lib/nginx.sh"
# shellcheck source=lib/certbot.sh
. "${SCRIPT_DIR}/lib/certbot.sh"
# shellcheck source=lib/ufw.sh
. "${SCRIPT_DIR}/lib/ufw.sh"

require_root
detect_os
mzp_title "MegaZPanel · Storage node installer"

require_env STORAGE_DOMAIN LE_EMAIL

# Resolve config / secrets BEFORE we touch anything destructive.
require_dns_resolves "${STORAGE_DOMAIN}"

MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
MINIO_VOLUMES="${MINIO_VOLUMES:-/var/lib/minio/data}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-megazpanel-admin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -base64 32 | tr -d '\n' | tr '/+' '_-')}"

export MZP_TOTAL_STEPS=6
MZP_STEP=0

p_step "Apt baseline"
apt_install ca-certificates curl gnupg openssl tzdata

p_step "UFW firewall"
ufw_setup

p_step "MinIO server install"
ensure_system_user minio /var/lib/minio
install -d -m 0750 -o minio -g minio "${MINIO_VOLUMES}"

if ! command -v minio >/dev/null 2>&1; then
  arch="$(dpkg --print-architecture)"
  case "${arch}" in
    amd64) minio_arch=amd64 ;;
    arm64) minio_arch=arm64 ;;
    *) fatal "unsupported architecture for MinIO: ${arch}" ;;
  esac
  log "installing MinIO server (${minio_arch})"
  curl -fsSL "https://dl.min.io/server/minio/release/linux-${minio_arch}/minio" \
    -o /usr/local/bin/minio
  chmod 0755 /usr/local/bin/minio
else
  log "minio already installed: $(minio --version 2>&1 | head -1)"
fi

p_step "MinIO env + systemd unit"
ENV_FILE=/etc/default/minio
install -d -m 0750 /etc/default

cat > "${ENV_FILE}" <<EOF
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_BROWSER_REDIRECT_URL=https://${STORAGE_DOMAIN}/console/
MINIO_SERVER_URL=https://${STORAGE_DOMAIN}
EOF
chown root:minio "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

render_template "${DEPLOY_DIR}/systemd/minio.service.tpl" /etc/systemd/system/minio.service \
  ENV_FILE="${ENV_FILE}" \
  MINIO_PORT="${MINIO_PORT}" \
  MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT}" \
  MINIO_VOLUMES="${MINIO_VOLUMES}"

systemctl daemon-reload
systemctl enable --now minio.service
wait_for_port 127.0.0.1 "${MINIO_PORT}" 30
p_ok "minio listening on 127.0.0.1:${MINIO_PORT}"

p_step "Nginx + Let's Encrypt"
nginx_install
nginx_remove_default_site
nginx_install_pre_le "storage" "${STORAGE_DOMAIN}"

certbot_install
certbot_issue "${STORAGE_DOMAIN}" "${LE_EMAIL}"
certbot_install_renewal_hook

nginx_install_site "storage" "${DEPLOY_DIR}/nginx/storage.conf.tpl" \
  STORAGE_DOMAIN="${STORAGE_DOMAIN}" \
  MINIO_PORT="${MINIO_PORT}"

p_step "Verify + summary"
if ! curl -fsS -o /dev/null "https://${STORAGE_DOMAIN}/minio/health/live"; then
  warn "health probe https://${STORAGE_DOMAIN}/minio/health/live did not respond yet (DNS or TLS may still be propagating)"
else
  p_ok "minio responding on https://${STORAGE_DOMAIN}/minio/health/live"
fi

mzp_box_begin "✓ Storage node installed"
mzp_box_line "Endpoint         : ${C_BOLD}https://${STORAGE_DOMAIN}${C_OFF}"
mzp_box_line "S3 access key    : ${MINIO_ROOT_USER}"
mzp_box_line "S3 secret key    : ${C_YELLOW}${MINIO_ROOT_PASSWORD}${C_OFF}"
mzp_box_sep
mzp_box_line "Service          : systemctl status minio"
mzp_box_line "Logs             : journalctl -u minio -f"
mzp_box_line "Env file         : /etc/default/minio (mode 0640)"
mzp_box_line "Data volume      : ${MINIO_VOLUMES}"
mzp_box_end

p_warn "the S3 secret key above will not be shown again — copy it now"
p_info "configure a backup target in the panel using the credentials above"
