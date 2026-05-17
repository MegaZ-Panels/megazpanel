#!/usr/bin/env bash
# install-storage-node.sh — provisions a MinIO storage node behind Nginx + TLS.
#
# Required env:
#   STORAGE_DOMAIN  e.g. storage.example.com
#   LE_EMAIL        email for Let's Encrypt
#
# Optional env:
#   MINIO_PORT          default 9000
#   MINIO_CONSOLE_PORT  default 9001
#   MINIO_VOLUMES       default /var/lib/minio/data
#   MINIO_ROOT_USER     default megazpanel-admin
#   MINIO_ROOT_PASSWORD default: random 32 bytes b64

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
require_env STORAGE_DOMAIN LE_EMAIL

MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
MINIO_VOLUMES="${MINIO_VOLUMES:-/var/lib/minio/data}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-megazpanel-admin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -base64 32 | tr -d '\n' | tr '/+' '_-')}"

apt_install ca-certificates curl gnupg openssl tzdata
ufw_setup
require_dns_resolves "${STORAGE_DOMAIN}"

ensure_system_user minio /var/lib/minio
install -d -m 0750 -o minio -g minio "${MINIO_VOLUMES}"

# ── Install MinIO ────────────────────────────────────────────────────────────
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
fi

# ── Env + systemd ────────────────────────────────────────────────────────────
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

# ── Nginx + TLS ──────────────────────────────────────────────────────────────
nginx_install
nginx_remove_default_site
nginx_install_pre_le "storage" "${STORAGE_DOMAIN}"

certbot_install
certbot_issue "${STORAGE_DOMAIN}" "${LE_EMAIL}"
certbot_install_renewal_hook

nginx_install_site "storage" "${DEPLOY_DIR}/nginx/storage.conf.tpl" \
  STORAGE_DOMAIN="${STORAGE_DOMAIN}" \
  MINIO_PORT="${MINIO_PORT}"

log "storage node installed."
log "  Endpoint:         https://${STORAGE_DOMAIN}"
log "  S3 access key:    ${MINIO_ROOT_USER}"
log "  S3 secret key:    ${MINIO_ROOT_PASSWORD}"
log "  Service:          systemctl status minio"
log "Configure a backup target in the panel using the credentials above."
