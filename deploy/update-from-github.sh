#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/surprise-draw}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-surprise-draw}"
ARCHIVE_URL="https://codeload.github.com/shiqi4712/manghe/tar.gz/refs/heads/$BRANCH"

if (( EUID != 0 )); then
  echo "Run this script with sudo."
  exit 1
fi

APP_DIR="$(realpath -m "$APP_DIR")"
if [[ "$APP_DIR" != /var/www/* || "$APP_DIR" == /var/www ]]; then
  echo "APP_DIR must be a dedicated directory directly below /var/www."
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env; refusing to restart an unconfigured service."
  exit 1
fi

APP_OWNER="$(stat -c '%U' "$APP_DIR")"

if [[ -d .git ]]; then
  sudo -u "$APP_OWNER" -H git fetch origin "$BRANCH"
  sudo -u "$APP_OWNER" -H git merge --ff-only "origin/$BRANCH"
else
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT
  curl -fL --retry 3 --connect-timeout 15 "$ARCHIVE_URL" \
    | tar -xz --strip-components=1 -C "$TEMP_DIR"
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name .env ! -name node_modules -exec rm -rf -- {} +
  cp -a "$TEMP_DIR"/. "$APP_DIR"/
  chown -R "$APP_OWNER" "$APP_DIR"
  chmod 755 "$APP_DIR"
fi

sudo -u "$APP_OWNER" -H npm ci --omit=dev
sudo -u "$APP_OWNER" -H npm run check
systemctl restart "$SERVICE_NAME"

APP_PORT="$(sed -n 's/^PORT=//p' .env | tail -n 1)"
for attempt in {1..10}; do
  if curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/api/health"; then
    echo
    echo "Update completed successfully."
    exit 0
  fi
  sleep 2
done

echo "Service restarted but health check failed."
systemctl status "$SERVICE_NAME" --no-pager
exit 1
