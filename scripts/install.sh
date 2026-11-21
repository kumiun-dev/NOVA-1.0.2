#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker info >/dev/null
docker compose version >/dev/null
if [ ! -f .env ]; then
  read -r -p "Customer HTTPS domain (no https://): " domain
  domain="${domain,,}"
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || { echo "Invalid public domain"; exit 1; }
  umask 077
  cat > .env <<EOF
NOVA_DOMAIN=$domain
NOVA_PUBLIC_URL=https://$domain
NOVA_IMAGE=local/nova:1.0.2
NOVA_DEPLOYMENT_MODE=selfhost
NOVA_SECURE_COOKIES=true
NOVA_SHARED_CATALOG_URL=https://svr.admarket.cn/api/shared-catalog/search
DATA_DIR=/app/data
EOF
fi
chmod 600 .env
mkdir -p backups
if [[ "$EUID" -eq 0 ]]; then chown 1000:1000 backups; fi
chmod 700 backups
docker compose up -d --build nova
echo "Configure HTTPS reverse proxy to 127.0.0.1:3000, then open /register with your NOVA domain license."
