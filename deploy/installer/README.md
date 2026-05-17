# MegaZPanel — Installer hosting

This document describes how to host `installer.js` so the bash installers
(`installer.sh`, `install-panel.sh`, `install-storage-node.sh`) can be fetched
with a one-liner from `https://installer.aethercloud.web.id/`.

`installer.js` is a tiny pure-Node.js HTTP server (no dependencies). On every
request it serves the shell scripts **directly from this GitHub repository** —
there is no need to clone the repo on the installer host. Updates pushed to
`main` propagate to clients after the cache TTL (default 60 seconds), or
instantly via `systemctl restart`.

## Pterodactyl-style one-liner

The root URL does content-negotiation: a CLI client (`curl` / `wget`) gets the
interactive bash menu (`installer.sh`); a browser gets the HTML index page.

```bash
sudo bash <(curl -fsSL https://installer.aethercloud.web.id)
```

The menu offers:

```
   What would you like to install?

     [1]  Panel host       — frontend + backend + Postgres + nginx + TLS
     [2]  Storage node     — MinIO object storage + nginx + TLS
     [q]  Quit
```

Direct paths still work for users who already know what they want:

```bash
sudo bash <(curl -fsSL https://installer.aethercloud.web.id/install)   # panel
sudo bash <(curl -fsSL https://installer.aethercloud.web.id/storage)   # storage
```

## How it works

```
  client  ──HTTPS──▶  nginx  ──HTTP──▶  installer.js (:9898)  ──HTTPS──▶  raw.githubusercontent.com
                                              │
                                              └── in-memory cache + ETag revalidation
```

- First request triggers an upstream fetch and populates the cache.
- Subsequent requests within `CACHE_TTL_SECONDS` are served from RAM.
- After TTL expires, the next request revalidates with `If-None-Match`
  (304 keeps GitHub bandwidth at zero).
- If GitHub is unreachable but a cached copy exists, the cached copy is
  served with an `X-Stale-Cache: 1` response header.

## Routes

| Path                             | Upstream file                            |
|----------------------------------|------------------------------------------|
| `GET /` (curl/wget)              | `deploy/install/installer.sh`            |
| `GET /` (browser)                | HTML index page                          |
| `GET /installer.sh`              | `deploy/install/installer.sh`            |
| `GET /menu`                      | same as `/installer.sh`                  |
| `GET /menu.sh`                   | same as `/installer.sh`                  |
| `GET /install`                   | `deploy/install/install-panel.sh`        |
| `GET /install-panel.sh`          | same as `/install`                       |
| `GET /install.sh`                | same as `/install`                       |
| `GET /storage`                   | `deploy/install/install-storage-node.sh` |
| `GET /install-storage`           | same as `/storage`                       |
| `GET /install-storage-node.sh`   | same as `/storage`                       |
| `GET /storage.sh`                | same as `/storage`                       |
| `GET /healthz`                   | `200 ok` — for monitoring                |
| `GET /robots.txt`                | `Disallow: /`                            |

## Configuration (environment variables)

| Variable               | Default                                                 |
|------------------------|---------------------------------------------------------|
| `PORT`                 | `9898`                                                  |
| `HOST`                 | `0.0.0.0` (use `127.0.0.1` behind nginx)                |
| `GITHUB_OWNER`         | `MegaZ-Panels`                                          |
| `GITHUB_REPO`          | `megazpanel`                                            |
| `GITHUB_BRANCH`        | `main`                                                  |
| `GITHUB_PATH_PREFIX`   | `deploy/install`                                        |
| `GITHUB_RAW_BASE`      | full override of upstream base URL (computed if unset)  |
| `CACHE_TTL_SECONDS`    | `60`                                                    |
| `UPSTREAM_TIMEOUT_MS`  | `10000`                                                 |

## 1. Place `installer.js` on the host

Only one file is needed — no `git clone`, no `node_modules`.

```bash
sudo install -d -o root -g root -m 0755 /opt/megazpanel-installer

sudo curl -fsSL \
  https://raw.githubusercontent.com/MegaZ-Panels/megazpanel/main/installer.js \
  -o /opt/megazpanel-installer/installer.js

sudo useradd --system --home-dir /opt/megazpanel-installer \
             --shell /usr/sbin/nologin megazinstaller || true
sudo chown -R megazinstaller:megazinstaller /opt/megazpanel-installer
```

Node.js ≥ 18 must be installed (`node --version`). On a fresh Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y nodejs
```

## 2. Install the systemd unit

The repository ships a template at
`deploy/systemd/megazpanel-installer.service.tpl`. Render it and drop it into
`/etc/systemd/system/`:

```bash
sudo curl -fsSL \
  https://raw.githubusercontent.com/MegaZ-Panels/megazpanel/main/deploy/systemd/megazpanel-installer.service.tpl \
  -o /tmp/megazpanel-installer.service.tpl

sudo INSTALLER_DIR=/opt/megazpanel-installer \
     INSTALLER_USER=megazinstaller \
     envsubst '${INSTALLER_DIR} ${INSTALLER_USER}' \
     < /tmp/megazpanel-installer.service.tpl \
     | sudo tee /etc/systemd/system/megazpanel-installer.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now megazpanel-installer
sudo systemctl status megazpanel-installer --no-pager
```

Smoke test (loopback):

```bash
curl -fsS http://127.0.0.1:9898/healthz       # → ok
curl -fsS http://127.0.0.1:9898/install | head -3
curl -fsS http://127.0.0.1:9898/storage | head -3
```

Logs:

```bash
journalctl -u megazpanel-installer -f
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

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;

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

# CLI clients get the menu wrapper:
curl -fsSL https://installer.aethercloud.web.id/ | head -3
# → #!/usr/bin/env bash ...

# Browser clients (Accept: text/html) get the HTML index page.

# Live one-liner installs:
sudo bash <(curl -fsSL https://installer.aethercloud.web.id)           # interactive menu
sudo bash <(curl -fsSL https://installer.aethercloud.web.id/install)   # panel directly
sudo bash <(curl -fsSL https://installer.aethercloud.web.id/storage)   # storage directly
```

## 5. Updating

**Updating the served bash scripts** — just push to GitHub. The next request
after `CACHE_TTL_SECONDS` (default 60s) revalidates and picks up the new
content. No restart needed.

To force-refresh immediately:

```bash
sudo systemctl restart megazpanel-installer
```

**Updating `installer.js` itself**:

```bash
sudo -u megazinstaller curl -fsSL \
  https://raw.githubusercontent.com/MegaZ-Panels/megazpanel/main/installer.js \
  -o /opt/megazpanel-installer/installer.js
sudo systemctl restart megazpanel-installer
```

## Operational notes

- Listens on `127.0.0.1:9898` per the systemd template — never directly
  internet-exposed; nginx is the public face.
- `MemoryMax=64M`, `TasksMax=64` — fits comfortably on a 1 GB VPS alongside
  the panel itself.
- `ReadOnlyPaths=${INSTALLER_DIR}` — the service cannot mutate its install dir.
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX` — only what's needed to
  reach GitHub and accept loopback connections.
- Logs go to journald: `journalctl -u megazpanel-installer -f`.
- `robots.txt` returns `Disallow: /` so search engines won't index the
  installer endpoints.
- If the upstream is unreachable but a previously-fetched copy exists, the
  server returns it with `X-Stale-Cache: 1` instead of failing.
