#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now haas-arts-dashboard.service 2>/dev/null || true
rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/haas-arts-dashboard.service"
systemctl --user daemon-reload
