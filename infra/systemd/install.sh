#!/usr/bin/env bash
set -euo pipefail

# Civil Cost Index Dashboard - systemd installer (Local PostgreSQL + API + Web)
# Usage: sudo CCI_API_HOST_PORT=18000 bash infra/systemd/install.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ETC_DIR="/etc/cci"
INSTALL_DIR="/opt/cci"
ENV_FILE="$ETC_DIR/cci.env"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run this installer with sudo" >&2
  exit 1
fi

install -d -o root -g root -m 0755 \
  "$INSTALL_DIR" "$INSTALL_DIR/data/samples" "$INSTALL_DIR/scripts" "$ETC_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  db_password="$(openssl rand -hex 24)"
  admin_key="$(openssl rand -hex 32)"
  umask 077
  {
    echo "APP_ENV=production"
    echo "APP_VERSION=0.1.0"
    echo "CCI_DB_PASSWORD=$db_password"
    echo "CCI_LOCAL_DATABASE_URL=postgresql://cci:${db_password}@db:5432/cci?sslmode=disable"
    echo "CCI_DB_HOST_PORT=15432"
    echo "CCI_API_HOST_PORT=${CCI_API_HOST_PORT:-18000}"
    echo "CCI_WEB_HOST_PORT=${CCI_WEB_HOST_PORT:-3000}"
    echo "ADMIN_API_KEY=$admin_key"
    echo "ALLOW_ANONYMOUS_VIEWER=false"
    echo "CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000"
  } >"$ENV_FILE"
  echo "created $ENV_FILE with random database and admin credentials"
elif ! grep -q '^CCI_LOCAL_DATABASE_URL=' "$ENV_FILE"; then
  db_password="$(openssl rand -hex 24)"
  {
    echo "CCI_DB_PASSWORD=$db_password"
    echo "CCI_LOCAL_DATABASE_URL=postgresql://cci:${db_password}@db:5432/cci?sslmode=disable"
    echo "CCI_DB_HOST_PORT=15432"
    echo "CCI_API_HOST_PORT=${CCI_API_HOST_PORT:-18000}"
    echo "CCI_WEB_HOST_PORT=${CCI_WEB_HOST_PORT:-3000}"
  } >>"$ENV_FILE"
  echo "added Local PostgreSQL settings to existing $ENV_FILE"
fi
chmod 600 "$ENV_FILE"

echo "==> build API and Web images"
docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.yml" build api web

echo "==> install compose, seed data, and database operation scripts"
install -m 0644 "$REPO_ROOT/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp -a "$REPO_ROOT/data/samples/." "$INSTALL_DIR/data/samples/"
install -m 0755 "$REPO_ROOT/scripts/backup-local-postgres.sh" "$INSTALL_DIR/scripts/backup-local-postgres.sh"
install -m 0755 "$REPO_ROOT/scripts/verify-local-restore.sh" "$INSTALL_DIR/scripts/verify-local-restore.sh"

echo "==> register systemd unit"
install -m 0644 "$REPO_ROOT/infra/systemd/cci.service" /etc/systemd/system/cci.service
systemctl daemon-reload
systemctl enable cci.service

echo "installation complete"
echo "start: sudo systemctl start cci"
echo "status: systemctl status cci && docker compose -p cci -f /opt/cci/docker-compose.yml ps"
