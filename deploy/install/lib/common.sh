#!/usr/bin/env bash
# common.sh — shared helpers for MegaZPanel installers.
# Source this file. Do not execute it directly.

set -Eeuo pipefail

# ── Logging ──────────────────────────────────────────────────────────────────
log()    { printf "\033[1;36m[mzp]\033[0m %s\n" "$*"; }
warn()   { printf "\033[1;33m[mzp]\033[0m %s\n" "$*" >&2; }
err()    { printf "\033[1;31m[mzp]\033[0m %s\n" "$*" >&2; }
fatal()  { err "$*"; exit 1; }

trap 's=$?; err "installer failed at line $LINENO (exit $s)"; exit $s' ERR

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
    (( ++i >= timeout )) && fatal "timeout waiting for $host:$port"
  done
  log "$host:$port is reachable"
}

# ── DNS sanity check ─────────────────────────────────────────────────────────
require_dns_resolves() {
  local domain="$1"
  if ! getent hosts "$domain" >/dev/null 2>&1; then
    warn "DNS lookup failed for $domain — Let's Encrypt will fail unless this resolves to this host"
  fi
}
