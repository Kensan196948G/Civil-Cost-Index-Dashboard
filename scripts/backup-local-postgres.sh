#!/usr/bin/env bash
set -euo pipefail

project_name="${COMPOSE_PROJECT_NAME:-cci}"
backup_dir="${CCI_BACKUP_DIR:-artifacts/backups}"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="${backup_dir}/cci-${timestamp}.dump"

umask 077
mkdir -p "$backup_dir"
docker compose -p "$project_name" exec -T db \
  pg_dump --username=cci --dbname=cci --format=custom >"$backup_file"
test -s "$backup_file"
docker compose -p "$project_name" exec -T db \
  pg_restore --list <"$backup_file" >/dev/null
printf '%s\n' "$backup_file"
