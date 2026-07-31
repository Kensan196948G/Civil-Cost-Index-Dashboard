#!/usr/bin/env bash
set -euo pipefail

# Civil Cost Index Dashboard - systemd インストールスクリプト
# 使い方: sudo bash infra/systemd/install.sh
# 前提: apps/api と apps/web がビルド済みであること

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${CCI_USER:-kensan}"
APP_GROUP="${CCI_GROUP:-kensan}"
ETC_DIR="/etc/cci"
INSTALL_DIR="/opt/cci"
ENV_FILE="$ETC_DIR/cci.env"

echo "==> ディレクトリ作成 ($INSTALL_DIR, $ETC_DIR)"
install -d -o root -g root -m 0755 "$INSTALL_DIR" "$ETC_DIR"

echo "==> API を配置 ($INSTALL_DIR/api)"
rm -rf "$INSTALL_DIR/api"
mkdir -p "$INSTALL_DIR/api"
cp -a "$REPO_ROOT/apps/api/dist-node" "$INSTALL_DIR/api/"
cp -a "$REPO_ROOT/apps/api/package.json" "$INSTALL_DIR/api/"
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR/api"

echo "==> Web を配置 ($INSTALL_DIR/web)"
if [ -d "$REPO_ROOT/apps/web/.next/standalone" ]; then
  rm -rf "$INSTALL_DIR/web"
  mkdir -p "$INSTALL_DIR/web"
  cp -a "$REPO_ROOT/apps/web/.next/standalone/." "$INSTALL_DIR/web/"
  cp -a "$REPO_ROOT/apps/web/.next/static" "$INSTALL_DIR/web/.next/static"
  cp -a "$REPO_ROOT/apps/web/public" "$INSTALL_DIR/web/public" 2>/dev/null || true
  chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR/web"
else
  echo "警告: apps/web/.next/standalone が見つかりません。Next.js は output:'standalone' でビルドしてください。"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "==> 環境ファイル新規作成: $ENV_FILE（手動編集してください）"
  cat > "$ENV_FILE" <<'EOF'
# Civil Cost Index Dashboard - 本番環境変数
APP_ENV=production
APP_VERSION=0.1.0
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
ADMIN_API_KEY=CHANGE_ME
BASIC_AUTH_USERNAME=
BASIC_AUTH_PASSWORD=
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF
  chmod 600 "$ENV_FILE"
  echo "!! $ENV_FILE を編集して本番接続情報を設定してください"
else
  chmod 600 "$ENV_FILE"
fi

echo "==> systemd ユニット登録"
install -m 0644 "$REPO_ROOT/infra/systemd/cci-api.service" /etc/systemd/system/cci-api.service
install -m 0644 "$REPO_ROOT/infra/systemd/cci-web.service" /etc/systemd/system/cci-web.service
systemctl daemon-reload
systemctl enable cci-api.service cci-web.service

echo "==> 完了"
echo "環境ファイルを編集してから: sudo systemctl start cci-api cci-web"
echo "状態確認: systemctl status cci-api cci-web"
