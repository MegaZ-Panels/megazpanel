#!/usr/bin/env bash
# backup-db.sh — creates a compressed pg_dump of the panel database, named with
# a UTC timestamp, retains the last N copies, and exits non-zero on failure.
#
# Required env:
#   ENV_FILE       path to backend env (default: /etc/megazpanel/backend.env)
#
# Optional env:
#   BACKUP_DIR     directory for backups (default: /var/lib/megazpanel/backups)
#   RETENTION      keep this many recent backups (default: 14)

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-/etc/megazpanel/backend.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/megazpanel/backups}"
RETENTION="${RETENTION:-14}"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "cannot read ${ENV_FILE}" >&2
  exit 1
fi

# Extract DATABASE_URL from the env file without sourcing the whole file.
DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n 1 | cut -d= -f2-)"
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL not found in ${ENV_FILE}" >&2
  exit 1
fi

# pg_dump must talk to Postgres directly, not PgBouncer.
DIRECT_URL="${DATABASE_URL/:6432/:5432}"

install -d -m 0750 "${BACKUP_DIR}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/megazpanel-${TS}.dump"
TMP="${OUT}.partial"

trap 'rm -f "${TMP}"' EXIT

pg_dump --format=custom --no-owner --no-privileges \
  --file="${TMP}" \
  "${DIRECT_URL}"

mv "${TMP}" "${OUT}"
chmod 0640 "${OUT}"

# Retention: keep the most recent ${RETENTION} dumps.
ls -1t "${BACKUP_DIR}"/megazpanel-*.dump 2>/dev/null \
  | awk -v keep="${RETENTION}" 'NR > keep' \
  | xargs -r rm -f

echo "${OUT}"
