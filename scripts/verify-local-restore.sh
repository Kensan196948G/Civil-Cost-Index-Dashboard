#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup.dump>" >&2
  exit 2
fi

backup_file="$1"
project_name="${COMPOSE_PROJECT_NAME:-cci}"
restore_database="${CCI_RESTORE_DATABASE:-cci_restore_verify_$(date +%Y%m%d%H%M%S)}"

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
  --command="SELECT count(*) AS application_table_count FROM information_schema.tables WHERE table_schema = 'public';"

echo "restore verification complete: $restore_database"
echo "the verification database is retained; deletion requires an explicit operator action"
