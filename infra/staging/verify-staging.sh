#!/usr/bin/env bash
# CCI staging の疎通確認（読み取りのみ・秘密値は表示しない）
#
#   bash infra/staging/verify-staging.sh
#
# 前提:
#   - staging API は cci-staging-api（127.0.0.1:18806）で稼働
#   - Tunnel/DNS は ccid-api-staging.mirai-dx-platform.com
#   - Web は新API向けビルドが反映済み
#
# すべての検査を実行し、失敗があれば exit 1 を返す（どの工程が未完了か1回で分かる）。
#
# 環境変数で上書き:
#   CCI_STAGING_API_URL / CCI_STAGING_WEB_URL / CCI_STAGING_ADMIN_KEY
#   CCI_STAGING_EXPECTED_API_HOST（既定: ccid-api-staging.mirai-dx-platform.com）
set -uo pipefail

API_URL="${CCI_STAGING_API_URL:-https://ccid-api-staging.mirai-dx-platform.com}"
WEB_URL="${CCI_STAGING_WEB_URL:-https://ccid-mvp-staging.mirai-dx-platform.com}"
EXPECTED_API_HOST="${CCI_STAGING_EXPECTED_API_HOST:-ccid-api-staging.mirai-dx-platform.com}"

failures=0
ok() { echo "OK: $*"; }
ng() { echo "NG: $*" >&2; failures=$((failures + 1)); }

http_code() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null || echo "000"
}

echo "== API =="
ready="$(curl -fsS --max-time 20 "$API_URL/api/health/ready" 2>/dev/null || true)"
if printf '%s' "$ready" | grep -q '"status":"ok"'; then
  ok "ready: ok"
else
  ng "ready が ok ではありません（$API_URL）"
fi
for path in /api/regions "/api/items?category=MATERIAL_PRICE"; do
  code="$(http_code "$API_URL$path")"
  if [ "$code" = "200" ]; then ok "$path: 200"; else ng "$path: $code"; fi
done

echo "== Web / CSP =="
web_code="$(http_code "$WEB_URL/")"
if [ "$web_code" = "200" ]; then ok "web: 200"; else ng "web: $web_code"; fi

tmp="$(mktemp)"
curl -fsS -D "$tmp.h" -o "$tmp" --max-time 20 "$WEB_URL/" 2>/dev/null || true
if grep -qi 'content-security-policy:.*static\.cloudflareinsights\.com' "$tmp.h" 2>/dev/null; then
  ok "CSP: Cloudflare Insights beacon を許可"
else
  ng "CSP: static.cloudflareinsights.com がありません（Web未反映の可能性）"
fi

echo "== Web のAPI接続先 =="
found=0
while IFS= read -r chunk; do
  [ -z "$chunk" ] && continue
  if curl -fsS --max-time 20 "$WEB_URL$chunk" 2>/dev/null | grep -q "$EXPECTED_API_HOST"; then
    found=1
    break
  fi
done < <(grep -o '/_next/static/chunks/[^"]*\.js' "$tmp" 2>/dev/null | sort -u | head -20)
if [ "$found" = "1" ]; then
  ok "web build: $EXPECTED_API_HOST を参照"
else
  ng "web build: $EXPECTED_API_HOST を参照していない（未反映）"
fi

echo "== 管理API（任意） =="
if [ -n "${CCI_STAGING_ADMIN_KEY:-}" ]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    -H "X-Admin-Key: ${CCI_STAGING_ADMIN_KEY}" \
    "$API_URL/api/audit/operations/export?limit=1" 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then ok "audit export: 200"; else ng "audit export: $code"; fi
else
  echo "SKIP: CCI_STAGING_ADMIN_KEY 未設定（管理APIは fail closed）"
fi

rm -f "$tmp" "$tmp.h"
echo "----"
if [ "$failures" -eq 0 ]; then
  echo "ALL OK"
  exit 0
fi
echo "NG: ${failures} 件（上記）" >&2
exit 1
