#!/usr/bin/env bash
# MegaZPanel — interactive installer menu (Pterodactyl-style).
#
# Designed to be invoked as:
#
#     bash <(curl -fsSL https://installer.aethercloud.web.id)
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
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_CYAN=$'\033[36m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_CYAN=''; C_YELLOW=''; C_RED=''
fi

err()  { printf '%s\n' "${C_RED}error:${C_RESET} $*" >&2; }
info() { printf '%s\n' "${C_GREEN}→${C_RESET} $*"; }

banner() {
  cat <<EOF
${C_CYAN}${C_BOLD}
   __  __                _____   ____                  _
  |  \\/  | ___  __ _  __|__  / |  _ \\ __ _ _ __   ___| |
  | |\\/| |/ _ \\/ _\` |/ _\` |/ /  | |_) / _\` | '_ \\ / _ \\ |
  | |  | |  __/ (_| | (_| / /_  |  __/ (_| | | | |  __/ |
  |_|  |_|\\___|\\__, |\\__,_/____| |_|   \\__,_|_| |_|\\___|_|
               |___/
${C_RESET}
   ${C_BOLD}MegaZPanel installer${C_RESET}
   ${C_DIM}repo: https://github.com/MegaZ-Panels/megazpanel${C_RESET}
   ${C_DIM}base: ${INSTALLER_BASE}${C_RESET}

EOF
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
      printf '%s\n' "${C_YELLOW}warning:${C_RESET} unsupported OS: ${ID:-?} ${VERSION_ID:-?}"
      printf '%s\n' "         supported: Ubuntu 22.04 / 24.04, Debian 12"
      read -r -p "         continue anyway? [y/N] " ans </dev/tty
      [[ ${ans,,} == y* ]] || { echo "aborted"; exit 1; }
      ;;
  esac
}

# Stream a remote bash script through bash. We use a process substitution so
# the sub-installer's own `read` calls can still talk to /dev/tty.
run_remote() {
  local label="$1" url="$2"
  info "fetching ${label} (${url})"
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
   What would you like to install?

     ${C_BOLD}[1]${C_RESET}  Panel host       — frontend + backend + Postgres + nginx + TLS
     ${C_BOLD}[2]${C_RESET}  Storage node     — MinIO object storage + nginx + TLS
     ${C_BOLD}[q]${C_RESET}  Quit

EOF
  local choice
  # Read from the controlling terminal so this works whether the script
  # was invoked via `bash <(curl …)` or `curl … | bash`.
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
