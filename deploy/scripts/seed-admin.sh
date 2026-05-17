#!/usr/bin/env bash
# seed-admin.sh — wraps the backend's seed CLI to create or reset the owner.
# Idempotent: safe to re-run (also acts as a forgot-password recovery path).
#
# Required env:
#   ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
#
# Optional:
#   REPO_DIR    default: /opt/megazpanel
#   PANEL_USER  default: megazpanel
#   ENV_FILE    default: /etc/megazpanel/backend.env

set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/opt/megazpanel}"
PANEL_USER="${PANEL_USER:-megazpanel}"
ENV_FILE="${ENV_FILE:-/etc/megazpanel/backend.env}"

: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"
: "${ADMIN_NAME:?ADMIN_NAME is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"

DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n 1 | cut -d= -f2-)"
DIRECT_URL="${DATABASE_URL/:6432/:5432}"

sudo -u "${PANEL_USER}" -H bash -lc \
  "cd '${REPO_DIR}/backend' && DATABASE_URL='${DIRECT_URL}' /usr/local/bin/bun src/cli/seed-admin.ts \
    --email '${ADMIN_EMAIL}' --name '${ADMIN_NAME}' --password '${ADMIN_PASSWORD}'"
