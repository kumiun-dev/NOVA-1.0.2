#!/usr/bin/env bash
set -Eeuo pipefail
release=""
if [[ $# -gt 1 ]]; then echo "Usage: bash scripts/upgrade.sh [release.zip]" >&2; exit 1; fi
if [[ $# -eq 1 ]]; then
  case "$1" in /*) release="$1";; *) release="$PWD/$1";; esac
  [[ -f "$release" ]] || { echo "Release ZIP not found." >&2; exit 1; }
  unzip -tq "$release" >/dev/null
  unzip -p "$release" Dockerfile >/dev/null
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose)
[[ -z "${NOVA_UPGRADE_PROJECT:-}" ]] || compose+=(-p "$NOVA_UPGRADE_PROJECT")
[[ -f .env ]] || { echo "Missing .env; run install first." >&2; exit 1; }
old_image="$(grep '^NOVA_IMAGE=' .env | head -n1 | cut -d= -f2-)"
[[ -n "$old_image" ]] || { echo "NOVA_IMAGE missing in .env" >&2; exit 1; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
rollback_image="local/nova:rollback-$stamp"
new_image="local/nova:release-$stamp"
old_container="$("${compose[@]}" ps -q nova)"
[[ -n "$old_container" ]] || { echo "NOVA must be running before upgrading." >&2; exit 1; }
old_id="$(docker inspect --format '{{.Image}}' "$old_container")"
docker image tag "$old_id" "$rollback_image"
bash scripts/backup.sh
if [[ -n "$release" ]]; then
  unzip -oq "$release" -x '.env' '.env.*' 'compose.yaml' 'Caddyfile' 'scripts/upgrade.sh' 'scripts/backup.sh'
fi
sed -i "s#^NOVA_IMAGE=.*#NOVA_IMAGE=$new_image#" .env
if "${compose[@]}" build nova && "${compose[@]}" up -d --no-deps nova; then
  for _ in $(seq 1 30); do
    if "${compose[@]}" exec -T nova node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      echo "Upgrade healthy. Previous image retained as $rollback_image."
      exit 0
    fi
    sleep 2
  done
fi
echo "Upgrade failed; restoring previous image tag and app container." >&2
sed -i "s#^NOVA_IMAGE=.*#NOVA_IMAGE=$rollback_image#" .env
"${compose[@]}" up -d --no-deps --no-build nova
echo "Review docker compose logs nova. Data backup was taken before deployment; restore only if needed." >&2
exit 1
