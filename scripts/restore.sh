#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
archive="${1:-}"
if [[ ! "$archive" =~ ^[A-Za-z0-9._-]+\.tar\.gz$ || ! -f "backups/$archive" ]]; then
  echo "Usage: $0 <backup-filename.tar.gz> (file must be in ./backups)" >&2
  exit 2
fi
echo "Creating a safety backup before restore..."
./scripts/backup.sh
docker compose stop nova
docker run --rm -v nova_data:/data -v "$PWD/backups:/backups:ro" alpine:3.21 sh -eu -c \
  "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf '/backups/$archive' -C /data --strip-components=1"
docker compose up -d nova
echo "Restore complete. Check: docker compose ps"
