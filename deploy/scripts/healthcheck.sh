#!/usr/bin/env bash
# healthcheck.sh — exits 0 if everything is healthy, non-zero with a message otherwise.
# Suitable for use in cron, monitoring agents, or a systemd timer.

set -Eeuo pipefail

PANEL_DOMAIN="${PANEL_DOMAIN:-}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-6432}"

fail() { printf '%s\n' "$*" >&2; exit 1; }

# Backend health
if ! curl -fsS --max-time 5 "${BACKEND_URL}/health" >/dev/null; then
  fail "backend /health failed at ${BACKEND_URL}"
fi

# Postgres / PgBouncer reachability
if ! (echo > "/dev/tcp/${DB_HOST}/${DB_PORT}") 2>/dev/null; then
  fail "database port ${DB_HOST}:${DB_PORT} unreachable"
fi

# Public TLS (only if PANEL_DOMAIN is set)
if [[ -n "${PANEL_DOMAIN}" ]]; then
  if ! curl -fsS --max-time 8 "https://${PANEL_DOMAIN}/health" >/dev/null; then
    fail "public health endpoint failed at https://${PANEL_DOMAIN}/health"
  fi
fi

echo "ok"
