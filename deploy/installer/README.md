# MegaZPanel — Installer hosting

This document describes how to host `installer.js` so the bash installers
(`install-panel.sh`, `install-storage-node.sh`) can be fetched with a one-liner
from `https://installer.aethercloud.web.id/`.

`installer.js` is a tiny pure-Node.js HTTP server (no dependencies). It serves
the two shell scripts under `deploy/install/` from a configurable port (default
`9898`) behind an nginx reverse proxy that terminates TLS.

## Routes

| Path                             | File served                              |
|----------------------------------|------------------------------------------|
| `GET /`                          | HTML index with usage instructions       |
| `GET /install`                   | `deploy/install/install-panel.sh`        |
| `GET /install-panel.sh`          | same as `/install`                       |
| `GET /install.sh`                | same as `/install`                       |
| `GET /storage`                   | `deploy/install/install-storage-node.sh` |
| `GET /install-storage`           | same as `/storage`                       |
| `GET /install-storage-node.sh`   | same as `/storage`                       |
| `GET /storage.sh`                | same as `/storage`                       |
| `GET /healthz`                   | `200 ok` — for monitoring                |

## 1. Clone the repo on the host that will serve the installer

```bash
sudo git clone https://github.com/MegaZ-Panels/megazpanel.git /opt/megazpanel
sudo useradd --system --home-dir /opt/megazpanel --shell /usr/sbin/nologin megazpanel || true
sudo chown -R megazpanel:megazpanel /opt/megazpanel
```

Node.js ≥ 18 must be installed (`node --version`). On a fresh Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y nodejs
```

## 2. Install the systemd unit

Render the template (`deploy/systemd/megazpanel-installer.service.tpl`) and
drop it into `/etc/systemd/system/`:

```bash
sudo INSTALLER_DIR=/opt/megazpanel \
     INSTALLER_USER=megazpanel \
     envsubst '${INSTALLER_DIR} ${INSTALLER_USER}' \
     < /opt/megazpanel/deploy/systemd/megazpanel-installer.service.tpl \
     | sudo tee /etc/systemd/system/megazpanel-installer.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now megazpanel-installer
sudo systemctl status megazpanel-installer --no-pager
```

Smoke test:

```bash
curl -fsS http://127.0.0.1:9898/healthz   # → ok
curl -fsS http://127.0.0.1:9898/install | head -3
```

## 3. nginx vhost for `installer.aethercloud.web.id`

```nginx
# /etc/nginx/sites-available/installer.aethercloud.web.id
server {
    listen 80;
    listen [::]:80;
    server_name installer.aethercloud.web.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name installer.aethercloud.web.id;

    ssl_certificate     /etc/letsencrypt/live/installer.aethercloud.web.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/installer.aethercloud.web.id/privkey.pem;

    # Modern TLS (mirrors the panel.conf.tpl baseline).
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;

    # Installer files are small; let nginx buffer in memory.
    proxy_buffering on;
    client_max_body_size 1m;

    location / {
        proxy_pass         http://127.0.0.1:9898;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_read_timeout 30s;
    }
}
```

Activate + obtain certificate:

```bash
sudo ln -s /etc/nginx/sites-available/installer.aethercloud.web.id \
           /etc/nginx/sites-enabled/installer.aethercloud.web.id
sudo certbot --nginx -d installer.aethercloud.web.id --redirect --agree-tos -m ops@aethercloud.web.id
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Verify end-to-end

```bash
curl -fsSL https://installer.aethercloud.web.id/healthz
# → ok

curl -fsSL https://installer.aethercloud.web.id/install | head -3
# → #!/usr/bin/env bash ...

# Live one-liner:
curl -fsSL https://installer.aethercloud.web.id/install  | sudo bash
curl -fsSL https://installer.aethercloud.web.id/storage  | sudo bash
```

## 5. Updating the served scripts

The server reads files directly from disk on every request, so updates are
picked up automatically:

```bash
sudo -u megazpanel git -C /opt/megazpanel pull --ff-only
# no service restart needed
```

Restart only required if `installer.js` itself changes:

```bash
sudo systemctl restart megazpanel-installer
```

## Operational notes

- Listens on `127.0.0.1:9898` per the systemd template — never directly
  internet-exposed; nginx is the public face.
- `MemoryMax=64M`, `TasksMax=64` — fits comfortably on a 1 GB VPS alongside
  the panel itself.
- `ReadOnlyPaths=${INSTALLER_DIR}` — the service cannot mutate the repo.
- Logs go to journald: `journalctl -u megazpanel-installer -f`.
- `robots.txt` returns `Disallow: /` so search engines won't index the
  installer endpoints.
