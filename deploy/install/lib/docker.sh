#!/usr/bin/env bash
# docker.sh — install Docker Engine + Compose plugin from the official repo.

docker_install() {
  if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
    log "docker already installed: $(docker --version)"
    return 0
  fi

  apt_install ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable
EOF

  unset MZP_APT_UPDATED
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  log "docker installed: $(docker --version)"
}
