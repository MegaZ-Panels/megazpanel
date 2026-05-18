# MegaZPanel — Deployment

This directory contains everything needed to run MegaZPanel in production on a 1 GB
VPS or larger.

## Topology

| Host | Domain | Role |
|------|--------|------|
| Panel | `panel.example.com` | Frontend (static) + Backend (Bun + Postgres) |
| Storage | `storage.example.com` | MinIO S3-compatible object store for backups |
| Daemon node(s) | (per-node) | (deferred — installer added when daemon module lands) |

## Supported OSes

- Ubuntu 22.04 LTS (Jammy)
- Ubuntu 24.04 LTS (Noble)
- Debian 12 (Bookworm)

## Quick start (production, panel host)

The installer self-bootstraps: ship one file or one URL and the rest is automatic.

**One-liner (recommended)** — Pterodactyl-style interactive menu:

```bash
sudo bash <(curl -fsSL https://installer.aethercloud.web.id)
```

Or fetch the panel installer directly:

```bash
sudo bash <(curl -fsSL https://installer.aethercloud.web.id/install)
```

**Local file** — same script copied to the VPS first:

```bash
sudo bash install-panel.sh
```

Either way the installer:

1. Detects it's running standalone (no sibling `lib/` directory).
2. Installs `git`, clones the MegaZPanel repo to `/opt/megazpanel`, and
   re-executes itself from the clone.
3. Prompts interactively for: panel name, panel FQDN, optional storage FQDN,
   Let's Encrypt email, DB name/user/password, admin email/name/password, and
   optional Telegram bot token + chat ID. Passwords accept blank to auto-generate.
4. Shows a confirmation summary, then runs end-to-end (apt baseline → UFW →
   Postgres + 1 GB tuning → PgBouncer → Bun/Go/Node → backend env →
   Prisma migrate → seed admin → systemd → frontend build →
   Nginx + Let's Encrypt → optional Telegram monitoring).
5. Saves a non-secret summary to `/etc/megazpanel/install.conf` so re-runs are
   idempotent and pre-fill prior answers.

**Configure the bootstrap repo** — before publishing, point the installer at
your fork. Either set the env var on each invocation:

```bash
sudo MEGAZPANEL_REPO_URL=https://github.com/MegaZ-Panels/megazpanel.git \
     bash install-panel.sh
```

…or edit `REPO_URL_DEFAULT` near the top of `deploy/install/install-panel.sh`
once and host that file.

**Non-interactive (CI / scripted)** — supply every value via environment:

```bash
sudo PANEL_NAME=MegaZPanel \
     PANEL_DOMAIN=panel.example.com \
     LE_EMAIL=ops@example.com \
     DB_NAME=megazpanel DB_USER=megaz DB_PASSWORD='RandomDb!Pass1234' \
     ADMIN_EMAIL=admin@example.com \
     ADMIN_NAME='Admin' \
     ADMIN_PASSWORD='ChangeMe!2024Strong' \
     TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...   \
     bash deploy/install/install-panel.sh --non-interactive
```

## Quick start (storage node)

```bash
sudo STORAGE_DOMAIN=storage.example.com \
     LE_EMAIL=ops@example.com \
     bash install/install-storage-node.sh
```

The installer prints the generated MinIO root credentials. Configure a backup
target in the panel using these credentials and the `https://storage…/` endpoint.

## Quick start (development, Docker Compose)

```bash
cd deploy/docker
cp ../env/backend.env.example backend.env
cp ../env/frontend.env.example frontend.env
docker compose up -d
```

## Files

```
deploy/
├── install/
│   ├── install-panel.sh
│   ├── install-storage-node.sh
│   └── lib/                 # modular installer pieces (sourced by the above)
├── nginx/                   # vhost templates (PANEL_DOMAIN, STORAGE_DOMAIN substituted at install)
├── postgres/                # 1GB-tuned postgresql.conf, pg_hba.conf
├── pgbouncer/               # pgbouncer.ini template
├── systemd/                 # service unit templates
├── docker/                  # compose + Dockerfiles for dev and prod
├── env/                     # backend.env.example, frontend.env.example
└── scripts/                 # healthcheck, backup-db, auto-update, seed-admin
```

## Security baseline applied by the panel installer

- UFW firewall: allows 22, 80, 443; everything else denied.
- Postgres bound to 127.0.0.1 only.
- PgBouncer in transaction mode in front of Postgres.
- Backend runs as a non-root system user `megazpanel` with `MemoryMax=160M`.
- Nginx terminates TLS (Let's Encrypt) with HSTS, modern cipher suite, HTTP→HTTPS
  redirect, security headers, gzip + brotli.
- Backend secret (`APP_SECRET`) generated as 32 random bytes during install.
- Postgres role password generated per install; stored only in
  `/etc/megazpanel/backend.env` (mode 0600, owner `megazpanel`).
- Admin password is consumed via env var and never logged.
