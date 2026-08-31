# 監視手順書（v0.1.0）

## 1. 監視対象

| 対象 | 監視方法 | 正常条件 |
| --- | --- | --- |
| API 死活 | `GET /api/health/live` | HTTP 200 |
| API+DB 死活 | `GET /api/health/ready` | HTTP 200 |
| Web 死活 | `GET /` | HTTP 200 |
| Local scheduler | `docker compose ps scheduler` | healthy |
| API 例外 | Workers Observability Logs | エラーログなし |
| DB 更新 | `GET /api/dashboard/summary` の `last_updated_at` | 想定頻度内で更新 |
| DB 容量 | Local PostgreSQL volume / filesystem | 計画の範囲内 |

## 2. 死活監視（現状）

- ヘルスエンドポイントは公開済み
- 外部からの定期監視（UptimeRobot / Cloudflare Health Check 等）は未導入（要導入）
- 手動確認:

```bash
curl -s https://cci-api-production.kensan1969.workers.dev/api/health/ready | jq .success
curl -s -o /dev/null -w '%{http_code}\n' https://cci-web-assets.kensan1969.workers.dev/
```

## 3. ログ監視

- Workers Observability（無料枠）: `wrangler tail` またはダッシュボード
- Local scheduler: `docker compose -p cci -f /opt/cci/docker-compose.yml logs --tail=100 scheduler`
- `scheduler_cycle`が確認間隔内に継続し、`scheduler_cycle_failed`が連続していないことを確認
- 内部エラーは `console.error` で出力され、ログに `internal_error` として記録される
- Logpush（有料）は未設定。頻度が増えたら検討

## 4. アラート基準（案）

| 重大度 | 条件 | 対応 |
| --- | --- | --- |
| P1 | ready が 5 分以上 503 | 直ちに調査・復旧 |
| P2 | エラー率 1% 超 / 5xx が連続 | ログ調査・原因対応 |
| P3 | データ更新が想定頻度を超過 | データソース確認・再取込 |

## 5. 性能確認

- 初期表示: 3 秒以内（目標）
- グラフ再描画: 1 秒以内（目標）
- 現状サンプルデータ（44行）では問題なし。データ量増加時は time_series_values のインデックスを確認

## 6. 推奨次回導入

- Cloudflare Health Checks / 外部Uptimeサービス
- Workers Logpush → 永続ログ
- Neon アラート（容量・コスト）
- 合成トランザクション監視（ログイン→ダッシュボード表示）
