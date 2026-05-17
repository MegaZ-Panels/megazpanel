[Unit]
Description=MegaZPanel host monitor (out-of-band Telegram alerts)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/megazpanel/monitor.env
ExecStart=${MONITOR_SCRIPT}
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/megazpanel
StandardOutput=journal
StandardError=journal
