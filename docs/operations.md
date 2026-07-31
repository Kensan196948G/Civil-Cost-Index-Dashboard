# 運用手順書（v0.1.0）

## 1. 稼働構成

- Web: Cloudflare Workers 静的アセット（`cci-web-assets`）
- API: Cloudflare Workers（`cci-api-production`）
- DB: Neon PostgreSQL（`civil-cost-index-dashboard`）
- 監視: Workers Observability（ダッシュボードの Workers > cci-api-production > Logs）

## 2. ヘルスチェック

```bash
curl https://cci-api-production.kensan1969.workers.dev/api/health/live
curl https://cci-api-production.kensan1969.workers.dev/api/health/ready
curl -o /dev/null -s -w '%{http_code}\n' https://cci-web-assets.kensan1969.workers.dev/
```

- live: Worker 稼働
- ready: DB 接続（`SELECT 1`）まで確認

## 3. デプロイ

### 自動（推奨）

`main` ブランチへの push で GitHub Actions `Deploy` が実行される。
成功条件: API Worker / Web Worker の両デプロイが green。

### 手動

```bash
cd apps/api && wrangler deploy
cd apps/web
NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE_URL=https://cci-api-production.kensan1969.workers.dev npm run build
wrangler deploy
```

> 注: Cloudflare へのデプロイは現在 **手動実行**（GitHub Actions `Deploy Cloudflare (manual)`）とし、
> 本番は下記の本機（LAN）運用を主としています。

## 3.1 本機（LAN）運用（現在の本番）

利用者指示により、本機の自動割当IP＋ポートで稼働する（systemd 常駐）。

```bash
# 初回インストール
sudo CCI_API_HOST_PORT=18000 bash infra/systemd/install.sh
# 起動・状態
sudo systemctl start cci
sudo systemctl status cci
sudo docker compose -p cci -f /opt/cci/docker-compose.yml ps
```

- Web: `http://<自動割当IP>:3000`（例: http://192.168.0.185:3000）
- API 直接: `http://<自動割当IP>:18000`
- 再起動後の自動起動: `systemctl is-enabled cci` → `enabled`

## 4. ログ確認

```bash
# API Worker ログをリアルタイム表示
cd apps/api && npx wrangler tail cci-api-production

# 直近ログは Cloudflare ダッシュボード > Workers & Pages > cci-api-production > Logs
```

ログ項目: request_id / method / path / status / duration（アプリケーション側では内部エラーのみ出力）。

## 5. データ更新（管理者）

1. ブラウザで `/admin/data-sources/` を開く
2. 設定画面で Admin Key を入力
3. 対象データソースの CSV を `/admin/fetch-jobs/` からアップロード
4. 取込履歴で成功/エラー行を確認

CLI から:

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  -F "file=@data.csv" -F "data_source_id=<UUID>" \
  https://cci-api-production.kensan1969.workers.dev/api/uploads
```

## 6. バージョンアップ

1. `APP_VERSION` / パッケージ version を更新
2. 必要なら `apps/api/migrations/0NN_*.sql` を追加（既存の SQL は編集しない）
3. `npm run db:migrate` を実行（破壊的変更は承認後）
4. main に push → CI/CD でデプロイ
5. リリースノートへ追記

## 7. インシデント時の初動

重大度の定義と対応は [docs/incident-response.md](incident-response.md) を参照。
