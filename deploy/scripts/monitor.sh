#!/usr/bin/env bash
# monitor.sh — out-of-band host monitor for MegaZPanel.
# Runs as a systemd oneshot via megazpanel-monitor.timer (every minute).
# Sends Telegram alerts directly so it works even when the backend is down.
#
# Configuration is read from /etc/megazpanel/monitor.env (loaded by the systemd
# unit). When run interactively, source the env file manually.
#
# Required env:
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
#
# Optional env (all have defaults):
#   PANEL_DOMAIN, BACKEND_URL, DB_HOST, DB_PORT,
#   SYSTEMD_UNITS, DISK_PATH, DISK_WARN_PERCENT, MEM_WARN_PERCENT, STATE_FILE

set -Eeuo pipefail

PANEL_DOMAIN="${PANEL_DOMAIN:-}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-6432}"
SYSTEMD_UNITS="${SYSTEMD_UNITS:-megazpanel-backend,postgresql,pgbouncer,nginx}"
DISK_PATH="${DISK_PATH:-/}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
MEM_WARN_PERCENT="${MEM_WARN_PERCENT:-85}"
STATE_FILE="${STATE_FILE:-/var/lib/megazpanel/monitor-state.json}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required" >&2
  exit 1
fi

install -d -m 0750 "$(dirname "${STATE_FILE}")"
[[ -f "${STATE_FILE}" ]] || echo '{}' > "${STATE_FILE}"

# Read previous state into associative array.
declare -A PREV
while IFS=$'\t' read -r key value; do
  [[ -z "$key" ]] && continue
  PREV["$key"]="$value"
done < <(python3 -c '
import json, sys
try:
    with open("'"${STATE_FILE}"'") as f:
        data = json.load(f)
except Exception:
    data = {}
if not isinstance(data, dict):
    data = {}
for k, v in data.items():
    print(f"{k}\t{v}")
')

declare -A NEXT
declare -a ALERTS
declare -a RECOVERIES

set_state() {
  local key="$1" status="$2" msg="$3"
  NEXT["$key"]="$status"
  local prev="${PREV[$key]:-ok}"
  if [[ "$status" == "fail" && "$prev" != "fail" ]]; then
    ALERTS+=("$key|$msg")
  elif [[ "$status" == "ok" && "$prev" == "fail" ]]; then
    RECOVERIES+=("$key|$msg")
  fi
}

# ── Checks ───────────────────────────────────────────────────────────────────
check_backend() {
  if curl -fsS --max-time 5 "${BACKEND_URL}/health" >/dev/null; then
    set_state "backend.health" ok "backend /health OK at ${BACKEND_URL}"
  else
    set_state "backend.health" fail "backend /health failed at ${BACKEND_URL}"
  fi
}

check_public_tls() {
  [[ -z "${PANEL_DOMAIN}" ]] && return 0
  if curl -fsS --max-time 8 "https://${PANEL_DOMAIN}/health" >/dev/null; then
    set_state "panel.public_health" ok "https://${PANEL_DOMAIN}/health OK"
  else
    set_state "panel.public_health" fail "public health endpoint failed at https://${PANEL_DOMAIN}/health"
  fi
}

check_db_port() {
  if (echo > "/dev/tcp/${DB_HOST}/${DB_PORT}") 2>/dev/null; then
    set_state "db.port" ok "${DB_HOST}:${DB_PORT} reachable"
  else
    set_state "db.port" fail "database port ${DB_HOST}:${DB_PORT} unreachable"
  fi
}

check_systemd() {
  IFS=',' read -r -a units <<< "${SYSTEMD_UNITS}"
  for raw in "${units[@]}"; do
    local unit
    unit="$(echo "$raw" | xargs)"
    [[ -z "$unit" ]] && continue
    if systemctl is-active --quiet "$unit"; then
      set_state "systemd.${unit}" ok "${unit} is active"
    else
      set_state "systemd.${unit}" fail "${unit} is NOT active"
    fi
  done
}

check_disk() {
  local pct
  pct="$(df -P "${DISK_PATH}" | awk 'NR==2 { sub(/%/,"",$5); print $5 }')"
  if [[ -z "$pct" ]]; then
    set_state "disk.usage" fail "could not read disk usage for ${DISK_PATH}"
    return
  fi
  if (( pct >= DISK_WARN_PERCENT )); then
    set_state "disk.usage" fail "${DISK_PATH}: ${pct}% used (>= ${DISK_WARN_PERCENT}%)"
  else
    set_state "disk.usage" ok "${DISK_PATH}: ${pct}% used"
  fi
}

check_memory() {
  local total available used_pct
  total="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if [[ -z "$total" || -z "$available" || "$total" -le 0 ]]; then
    set_state "memory.usage" fail "could not parse /proc/meminfo"
    return
  fi
  used_pct=$(( ((total - available) * 100) / total ))
  if (( used_pct >= MEM_WARN_PERCENT )); then
    set_state "memory.usage" fail "memory ${used_pct}% used (>= ${MEM_WARN_PERCENT}%)"
  else
    set_state "memory.usage" ok "memory ${used_pct}% used"
  fi
}

check_backend
check_public_tls
check_db_port
check_systemd
check_disk
check_memory

# ── Persist state ────────────────────────────────────────────────────────────
{
  echo '{'
  first=1
  for key in "${!NEXT[@]}"; do
    [[ $first -eq 0 ]] && echo ','
    first=0
    printf '  "%s": "%s"' "$key" "${NEXT[$key]}"
  done
  echo
  echo '}'
} > "${STATE_FILE}.new"
mv "${STATE_FILE}.new" "${STATE_FILE}"

# ── Send notifications ───────────────────────────────────────────────────────
send_telegram() {
  local text="$1"
  curl -fsS --max-time 8 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c '
import json, os, sys
text = sys.argv[1]
print(json.dumps({
    "chat_id": os.environ["TELEGRAM_CHAT_ID"],
    "text": text,
    "parse_mode": "HTML",
    "disable_web_page_preview": True,
}))
' "$text")" >/dev/null || true
}

HOSTNAME_S="$(hostname -f 2>/dev/null || hostname)"

if (( ${#ALERTS[@]} > 0 )); then
  body="🚨 <b>MegaZPanel host alert</b> on <b>${HOSTNAME_S}</b>"$'\n'
  for entry in "${ALERTS[@]}"; do
    key="${entry%%|*}"
    msg="${entry#*|}"
    body+="• [${key}] ${msg}"$'\n'
  done
  send_telegram "$body"
fi

if (( ${#RECOVERIES[@]} > 0 )); then
  body="✅ <b>MegaZPanel host recovered</b> on <b>${HOSTNAME_S}</b>"$'\n'
  for entry in "${RECOVERIES[@]}"; do
    key="${entry%%|*}"
    msg="${entry#*|}"
    body+="• [${key}] ${msg}"$'\n'
  done
  send_telegram "$body"
fi

# Exit non-zero only when something is currently failing.
for status in "${NEXT[@]}"; do
  if [[ "$status" == "fail" ]]; then exit 2; fi
done
exit 0
