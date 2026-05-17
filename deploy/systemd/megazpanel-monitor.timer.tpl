[Unit]
Description=Run MegaZPanel host monitor every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=15s
Unit=megazpanel-monitor.service
Persistent=true

[Install]
WantedBy=timers.target
