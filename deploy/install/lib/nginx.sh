#!/usr/bin/env bash
# nginx.sh — install Nginx and provision a site from a template.

nginx_install() {
  if command -v nginx >/dev/null 2>&1; then
    log "nginx already installed: $(nginx -v 2>&1)"
    return 0
  fi
  apt_install nginx
  systemctl enable --now nginx
}

nginx_remove_default_site() {
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi
}

# nginx_install_site SITE_NAME TEMPLATE_PATH key=value ...
nginx_install_site() {
  local site="$1" template="$2"
  shift 2

  install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled
  local target="/etc/nginx/sites-available/${site}"
  render_template "$template" "$target" "$@"
  ln -sf "$target" "/etc/nginx/sites-enabled/${site}"

  nginx -t
  systemctl reload nginx
  log "nginx site '${site}' enabled"
}

nginx_install_pre_le() {
  # Minimal HTTP-only vhost so Certbot's --webroot challenge can succeed.
  local site="$1" domain="$2"
  install -d -m 0755 /var/www/letsencrypt
  cat > "/etc/nginx/sites-available/${site}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
    }
    location / { return 200 'awaiting TLS provisioning'; add_header Content-Type text/plain; }
}
EOF
  ln -sf "/etc/nginx/sites-available/${site}" "/etc/nginx/sites-enabled/${site}"
  nginx -t
  systemctl reload nginx
}
