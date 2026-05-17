#!/usr/bin/env bash
# bun.sh — install Bun runtime system-wide.

bun_install() {
  if command -v bun >/dev/null 2>&1; then
    log "bun already installed: $(bun --version)"
    return 0
  fi

  apt_install curl unzip ca-certificates

  log "installing Bun to /usr/local"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # Install for root using BUN_INSTALL=/usr/local; this puts the binary at /usr/local/bin/bun.
  BUN_INSTALL=/usr/local SHELL=/bin/bash curl -fsSL https://bun.sh/install | bash >/dev/null

  if ! command -v bun >/dev/null 2>&1; then
    fatal "bun installation failed"
  fi
  log "bun installed: $(bun --version)"
}
