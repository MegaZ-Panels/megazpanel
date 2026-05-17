# MegaZPanel — Nginx vhost for the storage node (MinIO).
# Placeholders: ${STORAGE_DOMAIN}, ${MINIO_PORT}

server {
    listen 80;
    listen [::]:80;
    server_name ${STORAGE_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
    }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${STORAGE_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${STORAGE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${STORAGE_DOMAIN}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${STORAGE_DOMAIN}/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;

    # MinIO needs large bodies and disabled buffering for streaming uploads.
    client_max_body_size 0;
    proxy_buffering off;
    proxy_request_buffering off;

    # Allow large headers and avoid premature disconnects on long PUTs.
    proxy_connect_timeout  300s;
    proxy_send_timeout     1h;
    proxy_read_timeout     1h;
    chunked_transfer_encoding on;

    location / {
        proxy_pass http://127.0.0.1:${MINIO_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
    }
}
