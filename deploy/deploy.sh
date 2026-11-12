#!/bin/sh
# Run ON the mirror server (129.204.149.106) as a sudo-capable user.
#   sh deploy.sh
# Pulls the repo and publishes the landing page to kumoswitch.cypilu.cloud.
set -eu

REPO_URL="https://github.com/cypwlp/kumoSwitch.git"
SRC_DIR="${HOME}/kumoswitch-src"
WEB_ROOT="/var/www/kumoswitch"
NGINX_CONF="/etc/nginx/conf.d/kumoswitch.conf"

if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$SRC_DIR/site/." "$WEB_ROOT/"

# Always refresh the virtual host so domain changes reach the server.
sudo install -m 644 "$SRC_DIR/deploy/nginx-kumoswitch.conf" "$NGINX_CONF"
sudo nginx -t
sudo systemctl reload nginx

echo "published: https://kumoswitch.cypilu.cloud/"
echo "origin check: curl -H 'Host: kumoswitch.cypilu.cloud' http://127.0.0.1/"