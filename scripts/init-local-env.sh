#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

if [[ -e .env ]]; then
  echo ".env already exists; refusing to overwrite it" >&2
  exit 1
fi

db_password="$(openssl rand -hex 24)"
admin_key="$(openssl rand -hex 32)"
db_port="15432"
umask 077
sed \
  -e "s#^DATABASE_URL=\$#DATABASE_URL=postgresql://cci:${db_password}@127.0.0.1:${db_port}/cci?sslmode=disable#" \
  -e "s#^DATABASE_URL_DIRECT=\$#DATABASE_URL_DIRECT=postgresql://cci:${db_password}@127.0.0.1:${db_port}/cci?sslmode=disable#" \
  -e "s#^CCI_DB_PASSWORD=\$#CCI_DB_PASSWORD=${db_password}#" \
  -e "s#^CCI_LOCAL_DATABASE_URL=\$#CCI_LOCAL_DATABASE_URL=postgresql://cci:${db_password}@db:5432/cci?sslmode=disable#" \
  -e "s#^ADMIN_API_KEY=\$#ADMIN_API_KEY=${admin_key}#" \
  .env.example >.env

echo ".env created with random Local PostgreSQL and admin credentials"
