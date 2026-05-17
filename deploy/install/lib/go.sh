#!/usr/bin/env bash
# go.sh — install Go toolchain system-wide. Useful on panel host for building
# the daemon when its source lands. Skipped if already present.

GO_VERSION="${GO_VERSION:-1.23.3}"

go_install() {
  if command -v go >/dev/null 2>&1; then
    log "go already installed: $(go version)"
    return 0
  fi

  apt_install curl ca-certificates tar

  local arch
  case "$(uname -m)" in
    x86_64)  arch=amd64 ;;
    aarch64) arch=arm64 ;;
    *) fatal "unsupported architecture for Go: $(uname -m)" ;;
  esac

  local tarball="go${GO_VERSION}.linux-${arch}.tar.gz"
  local url="https://go.dev/dl/${tarball}"

  log "downloading ${url}"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  curl -fsSL -o "${tmp}/${tarball}" "${url}"

  rm -rf /usr/local/go
  tar -C /usr/local -xzf "${tmp}/${tarball}"

  install -d -m 0755 /etc/profile.d
  cat > /etc/profile.d/go.sh <<'EOF'
export PATH="/usr/local/go/bin:$PATH"
EOF
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt

  log "go installed: $(/usr/local/bin/go version)"
}
