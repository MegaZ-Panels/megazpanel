#!/usr/bin/env bash
# MegaZPanel — interactive installer menu (Pterodactyl-style).
#
# Designed to be invoked as:
#
#     sudo bash <(curl -fsSL https://installer.aethercloud.web.id)
#
# It presents a small numbered menu and dispatches to the appropriate
# sub-installer (panel host or storage node) by streaming it through bash.
#
# Override the upstream base if you self-host the installer:
#     INSTALLER_BASE=https://my.installer.example bash <(curl -fsSL ...)

set -Eeuo pipefail

INSTALLER_BASE="${INSTALLER_BASE:-https://installer.aethercloud.web.id}"
INSTALLER_BASE="${INSTALLER_BASE%/}"   # strip trailing slash if any

# ── colours (only if stdout is a TTY) ────────────────────────────────────
if [[ -t 1 ]]; then
  C_OFF=$'\033[0m';     C_BOLD=$'\033[1m';     C_DIM=$'\033[2m'
  C_RED=$'\033[1;31m';  C_GREEN=$'\033[1;32m'; C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[1;34m'; C_CYAN=$'\033[1;36m'
else
  C_OFF=''; C_BOLD=''; C_DIM=''
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_CYAN=''
fi

err()  { printf '%s✗ %s%s\n' "$C_RED"    "$*" "$C_OFF" >&2; }
info() { printf '%s› %s%s\n' "$C_CYAN"   "$*" "$C_OFF"; }
warn() { printf '%s! %s%s\n' "$C_YELLOW" "$*" "$C_OFF"; }
ok()   { printf '%s✓ %s%s\n' "$C_GREEN"  "$*" "$C_OFF"; }

banner() {
  printf '%s%s' "$C_CYAN" "$C_BOLD"
  cat <<'EOF'

   __  __                  ______   ____                  _
  |  \/  |  ___   __ _   __|__  /  |  _ \  __ _  _ __    ___ | |
  | |\/| | / _ \ / _` | / _` |/ /   | |_) |/ _` || '_ \  / _ \| |
  | |  | ||  __/| (_| || (_| / /_   |  __/| (_| || | | ||  __/| |
  |_|  |_| \___| \__, | \__,_|____| |_|    \__,_||_| |_| \___||_|
                 |___/
EOF
  printf '%s' "$C_OFF"
  printf "   %sMegaZPanel installer%s\n" "$C_BOLD" "$C_OFF"
  printf "   %srepo: https://github.com/MegaZ-Panels/megazpanel%s\n" "$C_DIM" "$C_OFF"
  printf "   %sbase: %s%s\n\n" "$C_DIM" "$INSTALLER_BASE" "$C_OFF"
}

require_root() {
  if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    err "this installer must be run as root (use 'sudo bash <(curl ...)')."
    exit 1
  fi
}

require_cmd() {
  local missing=()
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || missing+=("$c")
  done
  if (( ${#missing[@]} > 0 )); then
    err "missing required commands: ${missing[*]}"
    err "install them first (e.g. apt-get update && apt-get install -y ${missing[*]})"
    exit 1
  fi
}

require_supported_os() {
  if [[ ! -r /etc/os-release ]]; then
    err "cannot detect OS (no /etc/os-release)"; exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04|debian:12) ;;
    *)
      warn "unsupported OS: ${ID:-?} ${VERSION_ID:-?}"
      warn "supported: Ubuntu 22.04 / 24.04, Debian 12"
      read -r -p "   continue anyway? [y/N] " ans </dev/tty
      [[ ${ans,,} == y* ]] || { info "aborted"; exit 1; }
      ;;
  esac
}

# Stream a remote bash script through bash. We use a process substitution so
# the sub-installer's own `read` calls can still talk to /dev/tty.
run_remote() {
  local label="$1" url="$2"
  info "fetching ${label}: ${url}"
  if ! curl --output /dev/null --silent --head --fail "${url}"; then
    err "cannot reach ${url} — check network / DNS"
    exit 1
  fi
  echo
  bash <(curl -fsSL "${url}")
}

menu() {
  banner
  cat <<EOF
   ${C_BOLD}What would you like to install?${C_OFF}

     ${C_BOLD}${C_GREEN}[1]${C_OFF}  Panel host       — frontend + backend + Postgres + nginx + TLS
     ${C_BOLD}${C_GREEN}[2]${C_OFF}  Storage node     — MinIO object storage + nginx + TLS
     ${C_BOLD}${C_DIM}[q]${C_OFF}  Quit

EOF
  local choice
  read -r -p "   Choice [1/2/q]: " choice </dev/tty
  echo
  case "${choice,,}" in
    1)  run_remote "panel installer"   "${INSTALLER_BASE}/install-panel.sh" ;;
    2)  run_remote "storage installer" "${INSTALLER_BASE}/install-storage-node.sh" ;;
    q|"") info "cancelled."; exit 0 ;;
    *)  err "invalid choice: ${choice}"; exit 2 ;;
  esac
}

main() {
  require_root
  require_cmd curl bash
  require_supported_os
  menu
}

main "$@"
