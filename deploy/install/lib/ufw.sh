#!/usr/bin/env bash
# ufw.sh — enable UFW with a minimal allow-list.
#
# Idempotent: if UFW is already active and 22/80/443 are allowed, this is a
# no-op. We never call `ufw reset`, since that would silently drop any
# additional rules an operator has added (e.g. for a custom SSH port or for
# the installer service itself).

_ufw_rule_present() {
  # Match against the parsed `ufw status` so we work for v4 or v6 entries.
  local rule="$1"
  ufw status 2>/dev/null | grep -qE "^${rule}\s+ALLOW"
}

ufw_setup() {
  apt_install ufw

  # Defaults are safe to (re)set.
  ufw default deny incoming  >/dev/null
  ufw default allow outgoing >/dev/null

  local rule
  for rule in "22/tcp:ssh" "80/tcp:http" "443/tcp:https"; do
    local port="${rule%%:*}" comment="${rule##*:}"
    if _ufw_rule_present "${port}"; then
      log "ufw: ${port} already allowed"
    else
      log "ufw: allowing ${port} (${comment})"
      ufw allow "${port}" comment "${comment}" >/dev/null
    fi
  done

  if ufw status | grep -q '^Status: active'; then
    log "ufw already active"
  else
    log "enabling ufw"
    ufw --force enable >/dev/null
  fi

  ufw status verbose | head -n 20
}
