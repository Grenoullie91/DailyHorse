#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_EXEC="$(command -v npm)"
NODE_BIN="$(dirname "$(command -v node)")"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/haas-arts-dashboard.service"
mkdir -p "$UNIT_DIR"

sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__NPM_EXEC__|$NPM_EXEC|g" -e "s|__NODE_BIN__|$NODE_BIN|g" "$APP_DIR/systemd/haas-arts-dashboard.service" > "$UNIT"
systemctl --user daemon-reload
systemctl --user enable --now haas-arts-dashboard.service
printf 'Haas Arts Dashboard runs at http://127.0.0.1:4174\n'
