#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup.dump>" >&2
  exit 2
fi

backup_file="$1"
project_name="${COMPOSE_PROJECT_NAME:-cci}"
restore_database="${CCI_RESTORE_DATABASE:-cci_restore_verify_$(date +%Y%m%d%H%M%S)}"
api_container="${project_name}-${restore_database}-api"
drill_admin_key="restore-drill-local-only"

cleanup() {
  if docker container inspect "$api_container" >/dev/null 2>&1; then
    docker container stop --time 10 "$api_container" >/dev/null
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -s "$backup_file" ]]; then
  echo "backup file is missing or empty: $backup_file" >&2
  exit 1
fi
if [[ ! "$restore_database" =~ ^cci_restore_verify_[0-9A-Za-z_]+$ ]]; then
  echo "CCI_RESTORE_DATABASE must start with cci_restore_verify_: $restore_database" >&2
  exit 1
fi

exists="$(docker compose -p "$project_name" exec -T db \
  psql --username=cci --dbname=postgres --tuples-only --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$restore_database'")"
if [[ "$exists" == "1" ]]; then
  echo "restore database already exists: $restore_database" >&2
  exit 1
fi

docker compose -p "$project_name" exec -T db createdb --username=cci "$restore_database"
docker compose -p "$project_name" exec -T db \
  pg_restore --username=cci --dbname="$restore_database" --no-owner --no-privileges \
  <"$backup_file"
docker compose -p "$project_name" exec -T db \
  psql --username=cci --dbname="$restore_database" --set=ON_ERROR_STOP=1 \
  --command="SELECT count(*) AS migration_count FROM schema_migrations;" \
  --command="SELECT count(*) AS public_schema_table_count FROM information_schema.tables WHERE table_schema = 'public';"

restore_database_url="$(
  docker compose -p "$project_name" run --rm --no-deps -T \
    -e CCI_RESTORE_DATABASE="$restore_database" api \
    node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = `/${process.env.CCI_RESTORE_DATABASE}`; process.stdout.write(u.toString())'
)"

DATABASE_URL="$restore_database_url" DATABASE_URL_DIRECT="$restore_database_url" \
  docker compose -p "$project_name" run --rm --no-deps -T \
  -e DATABASE_URL -e DATABASE_URL_DIRECT api node scripts/migrate.mjs

DATABASE_URL="$restore_database_url" ADMIN_API_KEY="$drill_admin_key" \
  docker compose -p "$project_name" run --rm --no-deps -d --name "$api_container" \
  -e DATABASE_URL -e ADMIN_API_KEY -e ALLOW_ANONYMOUS_VIEWER=false api >/dev/null

ready=false
for _ in $(seq 1 30); do
  if docker container exec "$api_container" node -e \
    "fetch('http://127.0.0.1:8000/api/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != "true" ]]; then
  docker container logs --tail 50 "$api_container" >&2
  echo "restored database API did not become ready" >&2
  exit 1
fi

docker container exec \
  -e ADMIN_API_KEY="$drill_admin_key" \
  "$api_container" node scripts/verify-restored-api.mjs

echo "restore verification complete: $restore_database"
echo "the verification database is retained; deletion requires an explicit operator action"
