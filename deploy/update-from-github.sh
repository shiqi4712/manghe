#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/surprise-draw}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-surprise-draw}"

if (( EUID != 0 )); then
  echo "Run this script with sudo."
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env; refusing to restart an unconfigured service."
  exit 1
fi

APP_OWNER="$(stat -c '%U' "$APP_DIR")"
sudo -u "$APP_OWNER" -H git fetch origin "$BRANCH"
sudo -u "$APP_OWNER" -H git merge --ff-only "origin/$BRANCH"
sudo -u "$APP_OWNER" -H npm ci --omit=dev
sudo -u "$APP_OWNER" -H npm run check
systemctl restart "$SERVICE_NAME"

for attempt in {1..10}; do
  if curl --fail --silent --show-error "http://127.0.0.1:$(sed -n 's/^PORT=//p' .env)/api/health"; then
    echo
    echo "Update completed successfully."
    exit 0
  fi
  sleep 2
done

echo "Service restarted but health check failed."
systemctl status "$SERVICE_NAME" --no-pager
exit 1
