#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose)
[[ -z "${NOVA_UPGRADE_PROJECT:-}" ]] || compose+=(-p "$NOVA_UPGRADE_PROJECT")
container="$("${compose[@]}" ps -q nova)"
[[ -n "$container" ]] || { echo "NOVA must be running to create a backup." >&2; exit 1; }
backup_dir="$(docker inspect --format '{{range .Mounts}}{{if and (eq .Destination "/app/backups") (eq .Type "bind")}}{{.Source}}{{end}}{{end}}' "$container")"
[[ -n "$backup_dir" && -d "$backup_dir" ]] || { echo "Cannot locate NOVA's backup directory on this host." >&2; exit 1; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot="/app/backups/nova-$stamp"
"${compose[@]}" exec -T nova node scripts/backup-data.mjs "$snapshot"
archive="$backup_dir/nova-$stamp.tar.gz"
umask 077
tar -czf "$archive" -C "$backup_dir" "nova-$stamp"
rm -rf -- "$backup_dir/nova-$stamp"
find "$backup_dir" -maxdepth 1 -type f -name 'nova-*.tar.gz' -mtime +14 -delete
echo "Created $archive"
echo "Local backup retention: 14 days. Store a separate encrypted copy of .env; it contains the server secrets."
