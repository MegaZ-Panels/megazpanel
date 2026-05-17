#!/usr/bin/env bash
# auto-update.sh — pulls the latest code, rebuilds, runs migrations, restarts.
# Designed to be safe to re-run. Refuses to run if the working tree has local
# changes (other than installer-generated artifacts).
#
# Required env (or autodetected from /etc/megazpanel/backend.env):
#   REPO_DIR        default: /opt/megazpanel
#   PANEL_USER      default: megazpanel
#   ENV_FILE        default: /etc/megazpanel/backend.env

set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/opt/megazpanel}"
PANEL_USER="${PANEL_USER:-megazpanel}"
ENV_FILE="${ENV_FILE:-/etc/megazpanel/backend.env}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

[[ -d "${REPO_DIR}/.git" ]] || { echo "${REPO_DIR} is not a git checkout" >&2; exit 1; }
[[ -r "${ENV_FILE}" ]] || { echo "missing env file ${ENV_FILE}" >&2; exit 1; }

DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n 1 | cut -d= -f2-)"
DIRECT_URL="${DATABASE_URL/:6432/:5432}"

cd "${REPO_DIR}"

if ! sudo -u "${PANEL_USER}" git diff --quiet || ! sudo -u "${PANEL_USER}" git diff --cached --quiet; then
  echo "refusing to update: working tree has local changes in ${REPO_DIR}" >&2
  exit 1
fi

echo "[mzp] pulling"
sudo -u "${PANEL_USER}" git fetch --quiet origin
BRANCH="$(sudo -u "${PANEL_USER}" git rev-parse --abbrev-ref HEAD)"
sudo -u "${PANEL_USER}" git pull --ff-only origin "${BRANCH}"

echo "[mzp] installing backend deps"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${REPO_DIR}/backend' && /usr/local/bin/bun install --production"

echo "[mzp] running prisma migrate deploy"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${REPO_DIR}/backend' && DATABASE_URL='${DIRECT_URL}' /usr/local/bin/bun x prisma migrate deploy"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${REPO_DIR}/backend' && /usr/local/bin/bun x prisma generate"

echo "[mzp] rebuilding frontend"
sudo -u "${PANEL_USER}" -H bash -lc "cd '${REPO_DIR}/frontend' && npm install --no-audit --no-fund --loglevel=error && npm run build"

echo "[mzp] restarting services"
systemctl restart megazpanel-backend
systemctl reload nginx

echo "[mzp] verifying"
sleep 2
"${REPO_DIR}/deploy/scripts/healthcheck.sh"

echo "[mzp] update complete"
