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
curl -o /dev/null -s -w '%{http_code}\n' https://ccid.mirai-dx-platform.com/
```

- live: Worker 稼働
- ready: DB 接続（`SELECT 1`）まで確認
- ccid: Web 本番ドメイン（Cloudflare Access 適用前は誰でも閲覧可能）

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
3. 公式データソース（e-Stat 等）は「URLから取得」で直接ダウンロードして取込（xlsx/CSV対応）
4. それ以外は対象データソースの CSV/Excel を「データ取込」からアップロード
5. 取込履歴 `/admin/fetch-jobs/` で成功/エラー行を確認

詳細は [データ取得手順書](./data-acquisition.md) を参照してください。

### 5.1 定期取得（自動・承認ワークフロー）

1. `/admin/schedules/` でデータソースの取得スケジュール（日次/月次/年次）を登録
2. Cloudflare Cron（毎日 01:00 JST）が自動実行し、`approval_required=true` の場合は承認待ちへ格納
3. `/admin/staged/` でデータ承認者・積算責任者が内容を確認し「承認して反映」または「却下」
4. 未更新・取得失敗・重複は `/admin/schedules/` の通知先（Teams/Slack）へ通知

必要な環境変数（Cloudflare Worker Secret）:

- `NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL`（通知先。未設定時はログのみ記録）
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
3. `npm run db:migrate` を実行（破壊的変更は承認後）
4. main に push → CI/CD でデプロイ
5. リリースノートへ追記

## 7. インシデント時の初動

重大度の定義と対応は [docs/incident-response.md](incident-response.md) を参照。
