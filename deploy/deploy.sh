#!/bin/sh
# Run ON the server (129.204.149.106) as a sudo-capable user, e.g. ubuntu.
#   sh deploy.sh
# Pulls the repo and publishes the landing page to the bare-IP nginx site.
set -eu

REPO_URL="https://github.com/cypwlp/SwitchYard.git"
SRC_DIR="${HOME}/switchyard-src"
WEB_ROOT="/var/www/switchyard"

if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$SRC_DIR/site/." "$WEB_ROOT/"

if [ ! -f /etc/nginx/conf.d/switchyard.conf ]; then
  sudo cp "$SRC_DIR/deploy/nginx-switchyard.conf" /etc/nginx/conf.d/switchyard.conf
fi
sudo nginx -t
sudo systemctl reload nginx

echo "published: http://129.204.149.106/ (and :8080)"
