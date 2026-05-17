# MegaZPanel — Nginx vhost for the panel host.
# Placeholders: ${PANEL_DOMAIN}, ${FRONTEND_ROOT}, ${BACKEND_PORT}

# Force HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${PANEL_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS — frontend (static export) + backend reverse proxy
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${PANEL_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${PANEL_DOMAIN}/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # ── Security headers ────────────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # ── Compression ─────────────────────────────────────────────────────────
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript application/xml application/xml+rss image/svg+xml;
    gzip_vary on;

    client_max_body_size 16M;

    # ── Backend HTTP API ────────────────────────────────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # ── Realtime (Socket.IO) ────────────────────────────────────────────────
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    # ── Backend health (no caching) ─────────────────────────────────────────
    location = /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/health;
        access_log off;
    }

    # ── Frontend static (Next.js export) ────────────────────────────────────
    root ${FRONTEND_ROOT};
    index index.html;

    location /_next/static/ {
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri.html $uri/ /index.html =404;
    }

    error_page 404 /404.html;
}
