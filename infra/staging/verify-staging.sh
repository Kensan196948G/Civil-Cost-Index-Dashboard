#!/usr/bin/env bash
# CCI staging の疎通確認（読み取りのみ・秘密値は表示しない）
#
#   bash infra/staging/verify-staging.sh
#
# 前提:
#   - staging API は cci-staging-api（127.0.0.1:18806）で稼働
#   - Tunnel/DNS は ccid-api-staging.mirai-dx-platform.com
#   - Web は新API向けビルドが反映済み（未反映の場合 CSP 検査は失敗する）
#
# 環境変数で上書き:
#   CCI_STAGING_API_URL / CCI_STAGING_WEB_URL / CCI_STAGING_ADMIN_KEY
set -euo pipefail

API_URL="${CCI_STAGING_API_URL:-https://ccid-api-staging.mirai-dx-platform.com}"
WEB_URL="${CCI_STAGING_WEB_URL:-https://ccid-mvp-staging.mirai-dx-platform.com}"

fail() { echo "NG: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

echo "== API =="
ready="$(curl -fsS --max-time 20 "$API_URL/api/health/ready")" || fail "API /api/health/ready に到達できません"
case "$ready" in
  *'"status":"ok"'*) ok "ready: ok" ;;
  *) fail "ready が ok ではありません: $ready" ;;
esac
curl -fsS -o /dev/null --max-time 20 "$API_URL/api/regions" || fail "API /api/regions が失敗"
ok "regions: 200"
curl -fsS -o /dev/null --max-time 20 "$API_URL/api/items?category=MATERIAL_PRICE" || fail "API /api/items が失敗"
ok "items: 200"

echo "== Web / CSP =="
curl -fsS -o /dev/null --max-time 20 "$WEB_URL/" || fail "Web に到達できません"
ok "web: 200"
csp="$(curl -fsS -D- -o /dev/null --max-time 20 "$WEB_URL/")" || fail "Web ヘッダを取得できません"
if printf '%s' "$csp" | grep -qi 'content-security-policy:.*static\.cloudflareinsights\.com'; then
  ok "CSP: Cloudflare Insights beacon を許可"
else
  fail "CSP に static.cloudflareinsights.com がありません（Web未反映の可能性）"
fi

echo "== 管理API（任意） =="
if [[ -n "${CCI_STAGING_ADMIN_KEY:-}" ]]; then
  curl -fsS -o /dev/null --max-time 20 \
    -H "X-Admin-Key: ${CCI_STAGING_ADMIN_KEY}" \
    "$API_URL/api/audit/operations/export?limit=1" || fail "監査CSVエクスポートが失敗"
  ok "audit export: 200 (X-Admin-Key)"
else
  echo "SKIP: CCI_STAGING_ADMIN_KEY 未設定（管理APIは fail closed）"
fi

echo "ALL OK"
