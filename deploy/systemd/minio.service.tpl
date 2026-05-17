[Unit]
Description=MinIO Object Storage
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=minio
Group=minio
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/minio server --address 127.0.0.1:${MINIO_PORT} --console-address 127.0.0.1:${MINIO_CONSOLE_PORT} ${MINIO_VOLUMES}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${MINIO_VOLUMES}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
