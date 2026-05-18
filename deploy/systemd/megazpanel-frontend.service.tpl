[Unit]
Description=MegaZPanel frontend (Next.js standalone)
After=network-online.target megazpanel-backend.service
Wants=network-online.target

[Service]
Type=simple
User=megazpanel
Group=megazpanel
WorkingDirectory=${FRONTEND_DIR}/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=${FRONTEND_PORT}
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node ${FRONTEND_DIR}/.next/standalone/server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM

# Resource limits — fits a 1GB VPS.
MemoryMax=192M
TasksMax=256

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
ReadWritePaths=${FRONTEND_DIR}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
