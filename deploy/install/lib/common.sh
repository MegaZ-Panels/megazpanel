#!/usr/bin/env bash
# common.sh — shared helpers for MegaZPanel installers.
# Source this file. Do not execute it directly.

set -Eeuo pipefail

# ── Colors (only when stdout is a terminal) ──────────────────────────────────
if [[ -t 1 ]]; then
  C_OFF=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[1;31m'
  C_GREEN=$'\033[1;32m'
  C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[1;34m'
  C_MAGENTA=$'\033[1;35m'
  C_CYAN=$'\033[1;36m'
else
  C_OFF=""; C_BOLD=""; C_DIM=""
  C_RED=""; C_GREEN=""; C_YELLOW=""
  C_BLUE=""; C_MAGENTA=""; C_CYAN=""
fi
export C_OFF C_BOLD C_DIM C_RED C_GREEN C_YELLOW C_BLUE C_MAGENTA C_CYAN

# ── Logging ──────────────────────────────────────────────────────────────────
log()    { printf "%s[mzp]%s %s\n" "$C_CYAN" "$C_OFF" "$*"; }
warn()   { printf "%s[mzp]%s %s\n" "$C_YELLOW" "$C_OFF" "$*" >&2; }
err()    { printf "%s[mzp]%s %s\n" "$C_RED" "$C_OFF" "$*" >&2; }
fatal()  { err "$*"; exit 1; }

p_err()  { printf "%s✗ %s%s\n" "$C_RED"    "$*" "$C_OFF" >&2; }
p_ok()   { printf "%s✓ %s%s\n" "$C_GREEN"  "$*" "$C_OFF"; }
p_info() { printf "%s› %s%s\n" "$C_CYAN"   "$*" "$C_OFF"; }
p_warn() { printf "%s! %s%s\n" "$C_YELLOW" "$*" "$C_OFF"; }

# Step counter (Pterodactyl-style "[1/12] doing thing").
MZP_STEP=0
MZP_TOTAL_STEPS="${MZP_TOTAL_STEPS:-?}"
p_step() {
  MZP_STEP=$((MZP_STEP + 1))
  printf "\n%s[%s/%s]%s %s%s%s\n" \
    "$C_BLUE" "$MZP_STEP" "$MZP_TOTAL_STEPS" "$C_OFF" \
    "$C_BOLD" "$*" "$C_OFF"
}

# Plain section header (no step counter). Used during interactive prompting.
p_section() {
  printf "\n%s━━ %s%s%s\n" "$C_MAGENTA" "$C_BOLD" "$*" "$C_OFF"
}

# shellcheck disable=SC2154  # 's' is set inside the trap action
trap 's=$?; err "installer failed at line $LINENO (exit $s)"; exit $s' ERR

# ── Banner (shared, used by every entrypoint) ────────────────────────────────
mzp_banner() {
  local subtitle="${1:-installer}"
  printf '%s%s' "$C_CYAN" "$C_BOLD"
  cat <<'BANNER'

   __  __                  ______   ____                  _
  |  \/  |  ___   __ _   __|__  /  |  _ \  __ _  _ __    ___ | |
  | |\/| | / _ \ / _` | / _` |/ /   | |_) |/ _` || '_ \  / _ \| |
  | |  | ||  __/| (_| || (_| / /_   |  __/| (_| || | | ||  __/| |
  |_|  |_| \___| \__, | \__,_|____| |_|    \__,_||_| |_| \___||_|
                 |___/
BANNER
  printf '%s' "$C_OFF"
  printf "   %sMegaZPanel%s — %s\n" "$C_BOLD" "$C_OFF" "$subtitle"
  printf "   %srepo: https://github.com/MegaZ-Panels/megazpanel%s\n\n" "$C_DIM" "$C_OFF"
}

# Compact title bar for sub-installers (one line, no banner).
mzp_title() {
  local label="$1"
  local n=${#label}
  local bar
  bar="$(printf '─%.0s' $(seq 1 $((n + 4))))"
  printf "\n%s%s╭%s╮%s\n"   "$C_CYAN" "$C_BOLD" "$bar" "$C_OFF"
  printf "%s%s│  %s  │%s\n" "$C_CYAN" "$C_BOLD" "$label" "$C_OFF"
  printf "%s%s╰%s╯%s\n\n"   "$C_CYAN" "$C_BOLD" "$bar" "$C_OFF"
}

# Pretty key-value pair for summaries.
mzp_kv() {
  local key="$1" val="$2"
  printf "  %s%-22s%s %s\n" "$C_DIM" "$key" "$C_OFF" "$val"
}

# Boxed final summary printer.
# Usage: mzp_box_begin "Title"  ;  mzp_kv ...  ;  mzp_box_end
MZP_BOX_W=72
mzp_box_begin() {
  local title="$1"
  printf "\n%s┌%s┐%s\n"     "$C_GREEN" "$(printf '─%.0s' $(seq 1 $((MZP_BOX_W - 2))))" "$C_OFF"
  printf "%s│%s %s%-*s%s %s│%s\n" \
    "$C_GREEN" "$C_OFF" "$C_BOLD" $((MZP_BOX_W - 4)) "$title" "$C_OFF" "$C_GREEN" "$C_OFF"
  printf "%s├%s┤%s\n"       "$C_GREEN" "$(printf '─%.0s' $(seq 1 $((MZP_BOX_W - 2))))" "$C_OFF"
}
mzp_box_line() {
  local txt="$*"
  # Strip ANSI when measuring length so colored text still aligns.
  local plain
  plain="$(printf '%s' "$txt" | sed -E 's/\x1b\[[0-9;]*m//g')"
  local pad=$((MZP_BOX_W - 4 - ${#plain}))
  (( pad < 0 )) && pad=0
  printf "%s│%s %s%*s %s│%s\n" \
    "$C_GREEN" "$C_OFF" "$txt" "$pad" "" "$C_GREEN" "$C_OFF"
}
mzp_box_sep() {
  printf "%s├%s┤%s\n" "$C_GREEN" "$(printf '─%.0s' $(seq 1 $((MZP_BOX_W - 2))))" "$C_OFF"
}
mzp_box_end() {
  printf "%s└%s┘%s\n\n" "$C_GREEN" "$(printf '─%.0s' $(seq 1 $((MZP_BOX_W - 2))))" "$C_OFF"
}

# ── Privilege check ──────────────────────────────────────────────────────────
require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fatal "this script must be run as root (use sudo)"
  fi
}

# ── Distro detection ─────────────────────────────────────────────────────────
detect_os() {
  if [[ ! -r /etc/os-release ]]; then
    fatal "/etc/os-release not found; unsupported system"
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION_ID="${VERSION_ID:-}"
  OS_CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"

  case "${OS_ID}-${OS_VERSION_ID}" in
    ubuntu-22.04|ubuntu-24.04|debian-12)
      log "detected supported OS: ${OS_ID} ${OS_VERSION_ID} (${OS_CODENAME})"
      ;;
    *)
      fatal "unsupported OS: ${OS_ID} ${OS_VERSION_ID}; supported: Ubuntu 22.04, 24.04, Debian 12"
      ;;
  esac

  export OS_ID OS_VERSION_ID OS_CODENAME
}

# ── Required env vars ────────────────────────────────────────────────────────
require_env() {
  local missing=()
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then missing+=("$var"); fi
  done
  if (( ${#missing[@]} > 0 )); then
    fatal "missing required environment variables: ${missing[*]}"
  fi
}

# ── apt helpers ──────────────────────────────────────────────────────────────
apt_update_once() {
  if [[ -z "${MZP_APT_UPDATED:-}" ]]; then
    log "running apt-get update"
    DEBIAN_FRONTEND=noninteractive apt-get update -y
    export MZP_APT_UPDATED=1
  fi
}

apt_install() {
  apt_update_once
  log "installing packages: $*"
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
}

# ── Generators ───────────────────────────────────────────────────────────────
random_hex() {
  local bytes="${1:-32}"
  openssl rand -hex "${bytes}"
}

random_b64() {
  local bytes="${1:-32}"
  openssl rand -base64 "${bytes}" | tr -d '\n'
}

# ── Templating ───────────────────────────────────────────────────────────────
# render_template SRC DEST VAR1=VAL1 [VAR2=VAL2 ...]
render_template() {
  local src="$1"; shift
  local dest="$1"; shift
  [[ -r "$src" ]] || fatal "template not found: $src"

  local content
  content="$(cat "$src")"
  for kv in "$@"; do
    local key="${kv%%=*}"
    local val="${kv#*=}"
    # Replace literal placeholder ${KEY} (no shell expansion).
    content="${content//\$\{${key}\}/${val}}"
  done
  printf "%s" "$content" > "$dest"
}

# ── User / paths ─────────────────────────────────────────────────────────────
ensure_system_user() {
  local user="$1"
  local home="${2:-/var/lib/$user}"
  if id -u "$user" >/dev/null 2>&1; then
    log "system user '$user' already exists"
  else
    log "creating system user '$user'"
    useradd --system --home-dir "$home" --shell /usr/sbin/nologin --create-home "$user"
  fi
}

# ── Service wait ─────────────────────────────────────────────────────────────
wait_for_port() {
  local host="$1" port="$2" timeout="${3:-30}"
  local i=0
  while ! (echo > "/dev/tcp/$host/$port") 2>/dev/null; do
    sleep 1
    if (( ++i >= timeout )); then
      fatal "timeout waiting for $host:$port (after ${timeout}s)"
    fi
  done
  log "$host:$port is reachable (after ${i}s)"
}

# ── DNS sanity check ─────────────────────────────────────────────────────────
# Hard-fails by default. Set MZP_SKIP_DNS_CHECK=1 to bypass (e.g. for offline /
# split-horizon installs where the install host can't resolve its own A record).
require_dns_resolves() {
  local domain="$1"
  if [[ "${MZP_SKIP_DNS_CHECK:-0}" == "1" ]]; then
    warn "DNS check skipped for ${domain} (MZP_SKIP_DNS_CHECK=1)"
    return 0
  fi
  if ! getent hosts "$domain" >/dev/null 2>&1; then
    err "DNS lookup failed for ${domain}."
    err "Point an A record at this host's public IP and re-run, or set"
    err "MZP_SKIP_DNS_CHECK=1 to bypass (Let's Encrypt will fail in that case)."
    exit 1
  fi
  p_ok "DNS for ${domain} resolves"
}
