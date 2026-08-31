# 運用手順書（v0.1.0）

## 1. 稼働構成

- LAN正本: Docker ComposeのPostgreSQL 17 + API + Scheduler + Web
- Cloudflare互換経路: Workers静的アセット + API Worker + Neon PostgreSQL
- Local PostgreSQLとNeonの自動同期は行わない。LAN業務データはLocal PostgreSQLを正本とする。
- 監視: Local `/api/health/ready`、Docker health、Cloudflare Workers Observability

## 2. ヘルスチェック

```bash
curl https://cci-api-production.kensan1969.workers.dev/api/health/live
curl https://cci-api-production.kensan1969.workers.dev/api/health/ready
curl -o /dev/null -s -w '%{http_code}\n' https://cci-web-assets.kensan1969.workers.dev/
curl -o /dev/null -s -w '%{http_code}\n' https://ccid.mirai-dx-platform.com/
```

- live: Worker 稼働
- ready: DB 接続（`SELECT 1`）まで確認
- ccid: Web 本番ドメイン（Cloudflare Access 適用前は誰でも閲覧可能）

## 3. デプロイ

Production deployはHuman Gateであり、`main`へのpushでは自動実行しない。

### 手動

```bash
(cd apps/api && wrangler deploy)
(cd apps/web && NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE_URL=https://cci-api-production.kensan1969.workers.dev npm run build && wrangler deploy)
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
curl http://127.0.0.1:18000/api/health/ready
```

- Web: `http://<自動割当IP>:3000`（例: http://192.168.0.185:3000）
- API 直接: `http://<自動割当IP>:18000`
- PostgreSQL: host `127.0.0.1:15432`のみ（LANへ公開しない）
- 再起動後の自動起動: `systemctl is-enabled cci` → `enabled`

## 4. ログ確認

```bash
# API Worker ログをリアルタイム表示
cd apps/api && npx wrangler tail cci-api-production

# 直近ログは Cloudflare ダッシュボード > Workers & Pages > cci-api-production > Logs

# Local APIの構造化request log
sudo docker compose -p cci -f /opt/cci/docker-compose.yml logs --tail=100 api
```

`REQUEST_LOGGING=true`の場合、`http_request`としてrequest_id / method / path / status /
duration_msをJSON出力します。query stringやcredentialは記録しません。

## 5. データ更新（管理者）

1. ブラウザで `/admin/data-sources/` を開く
2. 設定画面で Admin Key を入力
3. 公式データソース（e-Stat 等）は「URLから取得」で直接ダウンロードして取込（xlsx/CSV対応）
4. それ以外は対象データソースの CSV/Excel を「データ取込」からアップロード
5. 取込履歴 `/admin/fetch-jobs/` で成功/エラー行を確認

詳細は [データ取得手順書](./data-acquisition.md) を参照してください。

### 5.1 定期取得（自動・承認ワークフロー）

1. `/admin/schedules/` でデータソースの取得スケジュール（日次/月次/年次）を登録
2. Local schedulerが5分ごとに期限到来を確認し、`approval_required=true` の場合は承認待ちへ格納
3. `/admin/staged/` でデータ承認者・積算責任者が内容を確認し「承認して反映」または「却下」
4. 未更新・取得失敗・重複は `/admin/schedules/` の通知先（Teams/Slack）へ通知

必要な環境変数（LAN `/etc/cci/cci.env`）:

- `NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL`（通知先。未設定時はログのみ記録）
- `SCHEDULER_INTERVAL_SECONDS`（確認間隔、既定300秒）
- `SCHEDULER_RETRY_SECONDS`（取得失敗時の再試行間隔、既定3600秒）
- `SCHEDULER_LEASE_SECONDS`（多重実行防止lease、既定900秒）
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`（RBAC用のCloudflare Access設定）
- `PDF_CJK_FONT_URL`（PDF出力の日本語フォントURL。未設定時はデフォルトCDNを使用）

URL取込 CLI:

```bash
curl -X POST -H "Content-Type: application/json" -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"data_source_id":"<UUID>","url":"https://..."}' \
  http://<IP>:3000/api/fetch-jobs
```

CLI から:

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  -F "file=@data.csv" -F "data_source_id=<UUID>" \
  https://cci-api-production.kensan1969.workers.dev/api/uploads
```

## 6. バージョンアップ

1. `APP_VERSION` / パッケージ version を更新
2. 必要なら `apps/api/migrations/0NN_*.sql` を追加（既存の SQL は編集しない）
3. Backupを取得し、`docker compose run --rm migrate`でMigration/Seedを実行する
4. `schema_migrations`の件数とchecksumエラーがないことを確認する
5. PR/CI通過後にmainへSquash Mergeする
6. Human Gate後に本機またはCloudflareへDeployし、主要Read/Writeを確認する
7. リリースノートへ追記する

## 7. インシデント時の初動

重大度の定義と対応は [docs/incident-response.md](incident-response.md) を参照。
