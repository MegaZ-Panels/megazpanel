[Unit]
Description=MegaZPanel installer static server (serves install-panel.sh and install-storage-node.sh)
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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
