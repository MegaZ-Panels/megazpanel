[Unit]
Description=MegaZPanel backend (Bun + Fastify)
After=network-online.target postgresql.service pgbouncer.service
Wants=network-online.target

[Service]
Type=simple
User=megazpanel
Group=megazpanel
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/bun src/main.ts
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM

# Resource limits — fits a 1GB VPS.
MemoryMax=160M
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
ReadWritePaths=${BACKEND_DIR} /var/log/megazpanel
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
