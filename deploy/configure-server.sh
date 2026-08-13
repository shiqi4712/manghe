#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-}"
APP_PORT="${2:-3103}"
APP_DIR="${APP_DIR:-/var/www/surprise-draw}"
SERVICE_NAME="${SERVICE_NAME:-surprise-draw}"

if (( EUID != 0 )); then
  echo "Run this script with sudo."
  exit 1
fi

if [[ -z "$DOMAIN" || ! "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "Usage: sudo bash deploy/configure-server.sh draw.example.com [port]"
  exit 1
fi

if [[ ! "$APP_PORT" =~ ^[0-9]+$ ]] || (( APP_PORT < 1024 || APP_PORT > 65535 )); then
  echo "APP_PORT must be an unused port between 1024 and 65535."
  exit 1
fi

if [[ ! -d "$APP_DIR/.git" || ! -f "$APP_DIR/server.js" ]]; then
  echo "Expected a Git checkout at $APP_DIR."
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" "$APP_DIR/.env"
  chmod 640 "$APP_DIR/.env"
  chown root:www-data "$APP_DIR/.env"
  echo "Created $APP_DIR/.env. Fill in the real MySQL values and TOKEN_SECRET, then run this command again."
  exit 2
fi

if ss -ltn "sport = :$APP_PORT" | tail -n +2 | grep -q . && ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "Port $APP_PORT is already in use by another instance. Choose another port."
  exit 1
fi

sed -i "s/^PORT=.*/PORT=$APP_PORT/" "$APP_DIR/.env"
chmod 640 "$APP_DIR/.env"
chown root:www-data "$APP_DIR/.env"
install -m 0644 "$APP_DIR/deploy/surprise-draw.service" "/etc/systemd/system/$SERVICE_NAME.service"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__APP_PORT__/$APP_PORT/g" \
  "$APP_DIR/deploy/nginx.conf" > "/etc/nginx/sites-available/$SERVICE_NAME"
ln -sfn "/etc/nginx/sites-available/$SERVICE_NAME" "/etc/nginx/sites-enabled/$SERVICE_NAME"

systemctl daemon-reload
nginx -t
systemctl enable --now "$SERVICE_NAME"
systemctl reload nginx

echo "Configured http://$DOMAIN -> 127.0.0.1:$APP_PORT"
echo "Next: sudo certbot --nginx -d $DOMAIN"
