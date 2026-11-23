# 運用手順書（v0.1.0）

## 1. 稼働構成

- LAN正本: Docker ComposeのPostgreSQL 17 + API + Scheduler + Web
- Cloudflare互換経路: Workers静的アセット + API Worker（DB接続は現在停止中。Neonは2026-09に利用停止）
- Local PostgreSQLとNeonの自動同期は行わない。LAN業務データはLocal PostgreSQLを正本とする（Neonは今後使用しない）。
- Cloudflare API WorkerのDB接続経路（Cloudflare Tunnel経由でLAN APIへ到達する等）は設計判断のため要承認。
- 監視: Local `/api/health/ready`、Docker health、Cloudflare Workers Observability

### 1.1 2026-10-18 staging 障害の実測（未解消・要判断）

対象: `https://ccid-mvp-staging.mirai-dx-platform.com/` と `https://cci-api-mvp-staging.kensan1969.workers.dev`

| 項目 | 実測結果 |
| --- | --- |
| staging Web | HTTP 200（HTMLは配信）。画面はAPIエラー「内部エラーが発生しました。」を表示 |
| staging API `/api/health/live` | 200（`version=0.1.0-mvp-staging`） |
| staging API `/api/health/ready` | **503**（`データベース接続に失敗しました。`） |
| staging API `/api/regions`・`/api/items` | **500** `INTERNAL_ERROR` |
| staging API Worker | `cci-api-mvp-staging`。最終deploy 2026-08-13（main `9f6339a`）。`DATABASE_URL` secret は存在するが接続不能 |
| LAN 正本 API（`cci-api-mvp` :18805 / DB `cci_mvp`） | `/api/health/ready` 200、DB正常 |
| staging Web CSP | `script-src` が `static.cloudflareinsights.com` を許可せず、Cloudflareが自動注入するbeaconを遮断（コンソール違反） |

**原因**: staging API Worker には到達可能なDB経路が無い（Neonは2026-09に利用停止済み。§1の「DB接続は現在停止中」と同じ既知状態）。
アプリケーションコードの不具合ではない。staging Web のCSP違反はコード側で修正済み（`apps/web/public/_headers`）。

**Repository側で完了した対応**（PR #85 / main `20e2a9a`）:
- CSPに `https://static.cloudflareinsights.com` を追加（回帰テスト `apps/web/tests/headers.test.ts`）
- 監査ログCSVエクスポートを実装（本障害とは独立。`docs/api-contract.md` 参照）
- ローカル実効確認（2026-10-18）: `wrangler dev` でビルド済み `out/` を配信し、`/` と `/admin/audit/` の
  `Content-Security-Policy` に beacon 許可が入ることを確認（**stagingへは未deploy**）

**未解消（Human Gate／意思決定が必要）**: stagingを実際に復旧するには、いずれかを選択して承認が必要。

| 案 | 内容 | 影響・リスク | 必要な承認 |
| --- | --- | --- | --- |
| A | staging Web の `NEXT_PUBLIC_API_BASE_URL` を LAN API の Tunnel（`https://cci-api-mvp.mirai-dx-platform.com`）へ変更し再ビルド/デプロイ | staging が `cci_mvp` のデータを共有（環境分離なし）。**実測: 同APIのデータAPIは未認証401、staging originへのCORSヘッダも未設定**のため、Web差し替えだけでは動作せず認証方式・CORSの設計が必要 | Web deploy、ホスト設定（CORS/認証） |
| B | 公開DBを再用意し staging Worker の `DATABASE_URL` secret を更新 | 外部サービス費用・データ分離は確保。secret変更。staging用のwrangler設定が未整備 | secret変更、外部契約 |
| C | staging を LAN API + 専用Tunnel + systemd 構成へ移行（本番LAN運用と同型） | 環境分離・再現性が最良。Tunnel/DNS/unit追加 | DNS、deploy、インフラ変更 |
| D | staging を廃止し MVP（LAN）のみ維持 | 最小運用。staging受入の場が無くなる | 運用方針決定 |

**現状（2026-10-18）**: Option C を採用し、**staging 専用 LAN API・Tunnel・ローカルDBの構築と公開APIの動作確認まで完了**（§1.3）。
残るのは **staging Web の切替（deploy）** と **`ADMIN_API_KEY` の投入**。deploy はハーネスの self-evolution ポリシーゲート
（DEPLOY critical）で実行できないため、人間が行う。管理APIは `ADMIN_API_KEY` 未設定のため fail closed（401）。

### 1.2 復旧手順（承認後・2026-10-18時点では未実行）

> 以下は承認後に実行する手順案であり、**本セッションでは未実行**（deploy/secret/DNSは禁止操作）。
> 実施前に `git status` と `gh pr list` で未統合変更が無いことを確認し、作業前後の状態を記録する。

#### A. staging Web を LAN API（Tunnel）へ向ける（最短・データ共有を許容する場合）

前提（2026-10-18 実測）:
- `https://cci-api-mvp.mirai-dx-platform.com/api/health/ready` = 200（DB正常）
- 同APIのデータAPIは未認証で **401**（`認証が必要です（Admin KeyまたはCloudflare Access）`）
- staging origin からの `OPTIONS` は 204 だが **`Access-Control-Allow-Origin` が返らない**（`CORS_ORIGINS` 未設定）

手順:
1. LAN API の `CORS_ORIGINS` に `https://ccid-mvp-staging.mirai-dx-platform.com` を追加し、認証方式（Cloudflare Access JWT / Admin Key 等）を決定して反映（ホスト設定・要sudo）。
2. `cd apps/web && NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE_URL=https://cci-api-mvp.mirai-dx-platform.com npm run build`
3. `cd apps/web && npx wrangler deploy --name cci-web-mvp-staging`
4. 「共通検証」を実施。
- ロールバック: `npx wrangler rollback --name cci-web-mvp-staging` で直前versionへ戻す。

#### C. staging 専用の LAN API + Tunnel（推奨・恒久）

1. `cci_staging` DB と staging 専用 `.env`（本番/MVPと分離）を用意
2. `cci-api-staging.service`（例 :18806）+ `cci-api-staging-cloudflared.service` を追加
3. `ccid-api-staging.mirai-dx-platform.com` をTunnelへルーティング（DNSはcustom domainで自動作成）
4. Webを `NEXT_PUBLIC_API_BASE_URL=https://ccid-api-staging.mirai-dx-platform.com` でビルドし `cci-web-mvp-staging` へdeploy
5. 「共通検証」を実施
- unit名・ポート・ホスト名は承認時に確定する（既存 `cci-api-mvp.service` と同型）。

#### 共通検証（復旧判定）

| # | コマンド | 期待 |
| --- | --- | --- |
| 1 | `curl -sS -o /dev/null -w '%{http_code}\n' https://ccid-mvp-staging.mirai-dx-platform.com/` | 200 |
| 2 | `curl -sS -w '\n%{http_code}\n' <採用API>/api/health/ready` | 200・`database ok` |
| 3 | `curl -sS -o /dev/null -w '%{http_code}\n' <採用API>/api/regions` | 200（採用した認証方式で） |
| 4 | `curl -sS -D- https://ccid-mvp-staging.mirai-dx-platform.com/ \| grep -i content-security-policy \| grep -c static.cloudflareinsights.com` | 1 |
| 5 | ブラウザで `/`・`/admin/audit/` を開く | 画面エラーなし・CSP違反0・主要データ表示 |
| 6 | `curl -sS -D- -H "X-Admin-Key: <key>" <採用API>/api/audit/operations/export?limit=1` | 200・`text/csv`・BOM |
| 7 | `gh run list --branch main --workflow CI --limit 1` | success（コード変更を伴う場合） |

失敗時は deploy をロールバックし、DB・secret・DNSは変更前の値へ戻す（データ削除は行わない）。

### 1.3 staging 専用 LAN API + Tunnel の構築結果（2026-10-18・Option C）

Option C を採用し、staging 専用のローカルDB・API・Tunnel を構築した。**Webの切替（deploy）だけが未実施**。

| 要素 | 実装 | 実測 |
| --- | --- | --- |
| DB | ローカル PostgreSQL 16 の `cci_staging`（owner `kensan`・Unix socket peer 認証）。migration 21件を2回適用（冪等）し、seed と demo seed を投入 | `SELECT 1` 正常 |
| API | Docker `cci-staging-api`（`node:22`、repo `apps/api` を read-only マウントして `dist-node/server.mjs` を実行、`127.0.0.1:18806`→`8000`）。`APP_ENV=production` / `ALLOW_ANONYMOUS_VIEWER=true` | `/api/health/ready` 200・`/api/regions` 200・`/api/items` 200 |
| Tunnel | Cloudflare Tunnel `cci-staging`（ID `fabd214e-180b-4e54-8d67-9923e81df87a`）。設定 `~/.cloudflared/cci-staging-docker-config.yml` | 接続4本 registered |
| DNS | `ccid-api-staging.mirai-dx-platform.com` CNAME → 上記Tunnel（proxied） | 1.1.1.1 で解決。ホストのローカルリゾルバは負キャッシュ中（検証は `curl --resolve` を使用） |
| 公開API | `https://ccid-api-staging.mirai-dx-platform.com` | `/api/health/ready` 200・`/api/regions` 200 |
| 認証 | 匿名は viewer（旧staging Workerと同じ）。管理APIは `APP_ENV=production` かつ `ADMIN_API_KEY` 未設定のため **fail closed（401）** | `/api/users` 401・`/api/audit/operations/export` 401 |
| CORS | `https://ccid-mvp-staging.mirai-dx-platform.com` と `https://cci-web-mvp-staging.kensan1969.workers.dev` を許可 | OPTIONS 204 + `access-control-allow-origin` 一致 |
| Web | 新API向けに `apps/web/out` をビルド済み（CSP beacon許可11箇所・新API URL・監査CSV UIをchunkで確認） | **deploy は未実施**（DEPLOYポリシーゲート） |

再現用ファイル（`infra/staging/`）:
- `docker-compose.yml`: 稼働中コンテナと同じ構成（`cci-staging-api` / `cci-staging-cloudflared`）。環境変数でパスを上書き可能。
- `staging.env.example`: 秘密値を含まない環境変数雛形（`ADMIN_API_KEY` は人間が追記）。
- `verify-staging.sh`: 読み取りのみの疎通確認（API ready/regions/items・Web/CSP・任意で監査CSV）。
- 詳細手順: `infra/staging/README.md`。

運用コマンド:

```bash
docker restart cci-staging-api cci-staging-cloudflared
curl -sS https://ccid-api-staging.mirai-dx-platform.com/api/health/ready
```

- 永続化: 両コンテナは `--restart unless-stopped`。ただし **`docker.service` は disabled** のため、ホスト再起動後の自動復帰には
  `sudo systemctl enable --now docker`（Human Gate）または手動起動が必要。
- 旧 `cci-api-mvp-staging` Worker と secret は、Web切替後は未使用になる（削除は不可逆のため未実施）。

**残っている作業（人間が実行）**:

1. **Webの切替**（AIはDEPLOYゲートで実行不可）:
   ```bash
   cd apps/web
   NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE_URL=https://ccid-api-staging.mirai-dx-platform.com npm run build
   npx wrangler deploy --name cci-web-mvp-staging
   ```
2. **`ADMIN_API_KEY` の投入**（管理API・監査CSVを有効化。値はリポジトリ・ログ・PRに残さない）:
   `cci-staging-api` を再作成する際に `--env-file` または `-e ADMIN_API_KEY=...` を追加し、`APP_ENV=production` のまま再起動する。
3. **`docker.service` の自動起動**（sudo）。
4. 旧staging Worker/secret の後片付け、`cci_staging` のバックアップ・保持期間の決定。


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

**復旧時の注意（2026-09 Deep Debug時点の実機観察）**

- ポート3000が他プロセス（別プロジェクトの常駐プロセス等）に占有されている場合、Webコンテナのポートバインドが
  失敗します。`CCI_WEB_HOST_PORT` で別ポートを指定して起動してください。
- `/opt/cci/docker-compose.yml` が旧構成（api+webのみ・DATABASE_URL直参照＝Neon参照）のまま残っている場合、
  systemd起動では最新の db+migrate+scheduler 構成になりません。`infra/systemd/install.sh` を再実行して
  `/opt/cci` と systemd ユニットを最新化してください（sudo権限が必要なためHuman Gate）。
- Local PostgreSQLの業務データは既存のPostgreSQLデータvolumeに保存されます。再installやvolume再作成でも
  既存volumeが削除されることはありません（`docker volume ls | grep cci` で要確認）。

**2026-09-10 復旧実績（本機の実測）**

- 本機ではポート3000（不明プロセス）と3001（`cci-api-mvp.service` が占有）のため、Webは **`CCI_WEB_HOST_PORT=3005`**
  で稼働中: Web `http://192.168.0.185:3005` / API `http://192.168.0.185:18000`
- `/etc/cci/cci.env` には旧期から `BASIC_AUTH_USERNAME/PASSWORD` が設定されており、**API全体のBasic認証ゲートが有効**。
  ブラウザ初回アクセス時はBasic認証、管理操作は設定画面でAdmin Key（X-Admin-Key）を入力する。
  なお resolveIdentity は X-Admin-Key を Basic より優先判定する（PR #71）ため、管理画面の管理者キーはBasic併用下でも機能する。
- 再install後の新volume（`cci_cci_postgres_data`）は Seed＋公式データ（時系列200行・地域56・データソース7・
  Migration 21件）で、旧volumeの内容と同水準だったためリストア不要だった。旧volume
  （`cci-series-test_cci_postgres_data`）は削除せず保全し、dump も `/tmp/cci-dump/cci-business.sql` に取得済み。
- 既存の `cci-api-cloudflared.service`（`cci-api.mirai-dx-platform.com` → localhost:18804）は**別API（MVP系）への
  Tunnel**であり、本API(18000)とは未接続。Cloudflare API WorkerのDB経路として使う場合は別途設計が必要。

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
