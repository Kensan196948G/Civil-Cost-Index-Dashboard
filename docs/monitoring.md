# 監視手順書（v0.1.0）

## 1. 監視対象

| 対象 | 監視方法 | 正常条件 |
| --- | --- | --- |
| API 死活 | `GET /api/health/live` | HTTP 200 |
| API+DB 死活 | `GET /api/health/ready` | HTTP 200 |
| Web 死活 | `GET /` | HTTP 200 |
| Local scheduler | `docker compose ps scheduler` | healthy |
| API request | Docker logs / Workers Observability | JSON `http_request`、5xx率1%未満 |
| DB 更新 | `GET /api/dashboard/summary` の `last_updated_at` | 想定頻度内で更新 |
| DB 容量 | Local PostgreSQL volume / filesystem | 計画の範囲内 |

## 2. 死活監視（現状）

- ヘルスエンドポイントは公開済み
- Local API/Web/SchedulerはDocker healthcheckで監視済み
- 外部からの定期監視（UptimeRobot / Cloudflare Health Check 等）は未導入（契約・通知先設定のHuman Gate）
- 手動確認:

```bash
curl -s https://cci-api-production.kensan1969.workers.dev/api/health/ready | jq .success
curl -s -o /dev/null -w '%{http_code}\n' https://cci-web-assets.kensan1969.workers.dev/
```

## 3. ログ監視

- Workers Observability（無料枠）: `wrangler tail` またはダッシュボード
- API requestは`REQUEST_LOGGING=true`で、query stringを除いたrequest ID・method・path・status・durationをJSON記録
- Local API/Scheduler/Web logは各10MB、5世代でrotation
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
- 同梱公式データ200行（労務188行・資材動向12行）では問題なし。履歴蓄積時は`time_series_values`のインデックスを確認

月次P50/P95/P99・5xx率:

```bash
docker compose -p cci -f /opt/cci/docker-compose.yml logs --since 720h --no-log-prefix api \
  | docker compose -p cci -f /opt/cci/docker-compose.yml exec -T api \
      node scripts/summarize-request-logs.mjs
```

`requests=0`の場合は`REQUEST_LOGGING=true`と対象期間を確認する。P95が継続して3秒を超える、
または5xx率が1%を超える場合は、request IDとpathを起点にAPI/DB logを調査する。

## 6. データ取込監視

- 鮮度はscheduleの計画周期（`expected_interval_days`、未設定時は日次/31日/365日）の2倍で警告
- 直近24時間の`failed`/`partial_success`取込はTeams/Slackへ一度通知
- Webhook未設定時も`notifications_log`へ`skipped`として記録し、同一通知の連続生成を抑止

## 7. 推奨次回導入

- Cloudflare Health Checks / 外部Uptimeサービス
- Workers Logpush → 永続ログ
- Local PostgreSQL volume容量アラート
- 合成トランザクション監視（ログイン→ダッシュボード表示）
