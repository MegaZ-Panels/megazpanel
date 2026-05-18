#!/usr/bin/env bash
# bun.sh — install Bun runtime system-wide.

bun_install() {
  if command -v bun >/dev/null 2>&1; then
    log "bun already installed: $(bun --version)"
    return 0
  fi

  apt_install curl unzip ca-certificates

  log "installing Bun to /usr/local"
  # Bun's installer drops the binary at $BUN_INSTALL/bin/bun. With BUN_INSTALL=/usr/local
  # that's /usr/local/bin/bun, system-wide. We don't need a temp dir of our own.
  BUN_INSTALL=/usr/local SHELL=/bin/bash curl -fsSL https://bun.sh/install | bash >/dev/null

  if ! command -v bun >/dev/null 2>&1; then
    fatal "bun installation failed"
  fi
  log "bun installed: $(bun --version)"
}
