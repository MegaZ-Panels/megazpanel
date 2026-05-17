#!/usr/bin/env bash
# certbot.sh — issue + renew Let's Encrypt certificates via webroot.

certbot_install() {
  if command -v certbot >/dev/null 2>&1; then
    log "certbot already installed"
    return 0
  fi
  apt_install certbot
}

# certbot_issue DOMAIN EMAIL
certbot_issue() {
  local domain="$1" email="$2"
  install -d -m 0755 /var/www/letsencrypt

  if [[ -d "/etc/letsencrypt/live/${domain}" ]]; then
    log "certificate for ${domain} already issued"
    return 0
  fi

  log "issuing Let's Encrypt cert for ${domain}"
  certbot certonly \
    --webroot -w /var/www/letsencrypt \
    -d "${domain}" \
    --email "${email}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    --keep-until-expiring
}

certbot_install_renewal_hook() {
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -e
systemctl reload nginx
EOF
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
}
