#!/usr/bin/env bash
# ufw.sh — enable UFW with a minimal allow-list.

ufw_setup() {
  apt_install ufw
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'ssh'
  ufw allow 80/tcp comment 'http'
  ufw allow 443/tcp comment 'https'
  ufw --force enable
  ufw status verbose | head -n 20
}
