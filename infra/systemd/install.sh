#!/usr/bin/env bash
set -euo pipefail

# Civil Cost Index Dashboard - systemd インストールスクリプト（Docker Compose 運用）
# 使い方: sudo CCI_API_HOST_PORT=18000 bash infra/systemd/install.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ETC_DIR="/etc/cci"
INSTALL_DIR="/opt/cci"
ENV_FILE="$ETC_DIR/cci.env"
API_HOST_PORT="${CCI_API_HOST_PORT:-8000}"

echo "==> ディレクトリ作成 ($INSTALL_DIR, $ETC_DIR)"
install -d -o root -g root -m 0755 "$INSTALL_DIR" "$ETC_DIR"

echo "==> Docker イメージビルド（web / api）"
if ! docker compose -f "$REPO_ROOT/docker-compose.yml" build; then
  echo "エラー: Docker Compose ビルドに失敗しました。"
  exit 1
fi

echo "==> 構成ファイルを配置（イメージ参照型）"
cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:
  api:
    image: civil-cost-index-dashboard-api:latest
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_VERSION: \${APP_VERSION:-0.1.0}
      PORT: 8000
      API_HOST: 0.0.0.0
      DATABASE_URL: \${DATABASE_URL:-}
      ADMIN_API_KEY: \${ADMIN_API_KEY:-}
      BASIC_AUTH_USERNAME: \${BASIC_AUTH_USERNAME:-}
      BASIC_AUTH_PASSWORD: \${BASIC_AUTH_PASSWORD:-}
      CORS_ORIGINS: \${CORS_ORIGINS:-http://localhost:3000}
    ports:
      - "${API_HOST_PORT}:8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 10

  web:
    image: civil-cost-index-dashboard-web:latest
    environment:
      PORT: 3000
      HOSTNAME: 0.0.0.0
    ports:
      - "3000:3000"
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
EOF

if [ ! -f "$ENV_FILE" ]; then
  echo "==> 環境ファイル新規作成: $ENV_FILE（手動編集してください）"
  cat > "$ENV_FILE" <<'EOF'
# Civil Cost Index Dashboard - 本番環境変数
APP_ENV=production
APP_VERSION=0.1.0
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
DATABASE_URL_DIRECT=
ADMIN_API_KEY=CHANGE_ME
BASIC_AUTH_USERNAME=
BASIC_AUTH_PASSWORD=
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
NEXT_PUBLIC_API_BASE_URL=
API_PROXY_TARGET=http://api:8000
CCI_API_HOST_PORT=${API_HOST_PORT}
EOF
  chmod 600 "$ENV_FILE"
  echo "!! $ENV_FILE を編集して本番接続情報を設定してください"
else
  chmod 600 "$ENV_FILE"
fi

echo "==> systemd ユニット登録"
install -m 0644 "$REPO_ROOT/infra/systemd/cci.service" /etc/systemd/system/cci.service
systemctl daemon-reload
systemctl enable cci.service

echo "==> 完了"
echo "環境ファイルを編集してから: sudo systemctl start cci"
echo "状態確認: systemctl status cci / docker compose -p cci ps"
