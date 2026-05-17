[Unit]
Description=MegaZPanel installer static server (proxies install scripts from GitHub)
Documentation=https://github.com/MegaZ-Panels/megazpanel/blob/main/deploy/installer/README.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${INSTALLER_USER}
Group=${INSTALLER_USER}
WorkingDirectory=${INSTALLER_DIR}
Environment=HOST=127.0.0.1
Environment=PORT=9898
Environment=NODE_ENV=production
# Override these to pin a fork / branch / different upstream path.
Environment=GITHUB_OWNER=MegaZ-Panels
Environment=GITHUB_REPO=megazpanel
Environment=GITHUB_BRANCH=main
Environment=GITHUB_PATH_PREFIX=deploy/install
Environment=CACHE_TTL_SECONDS=60
Environment=UPSTREAM_TIMEOUT_MS=10000
ExecStart=/usr/bin/node ${INSTALLER_DIR}/installer.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=10
KillSignal=SIGTERM

# Resource limits — installer is tiny (pure stdlib, no deps).
MemoryMax=64M
TasksMax=64

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
ReadOnlyPaths=${INSTALLER_DIR}
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
