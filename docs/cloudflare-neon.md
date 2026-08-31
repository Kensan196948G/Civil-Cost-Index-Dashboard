# Cloudflare / Neon 互換経路

LAN業務データの正本はADR-003によりLocal PostgreSQLである。本書はLocal PostgreSQLへ直接到達できないCloudflare Workerの互換経路を扱う。

## 1. 本番構成（v0.1.0 / 2026-07-31）

| 項目 | 値 |
| --- | --- |
| Cloudflare アカウント | Kensan1969@gmail.com's Account |
| ゾーン | `mirai-dx-platform.com`（Free plan, full setup） |
| API Worker | `cci-api-production` → <https://cci-api-production.kensan1969.workers.dev> |
| Web Worker（静的アセット） | `cci-web-assets` → <https://cci-web-assets.kensan1969.workers.dev> / <https://ccid.mirai-dx-platform.com> |
| Neon プロジェクト | `civil-cost-index-dashboard`（id: hidden-pond-85970897, region: aws-ap-southeast-1, PG17） |
| Neon DB | `neondb`（role: neondb_owner） |
| Workers サブドメイン | `kensan1969.workers.dev` |

## 2. Worker 設定

### cci-api-production（`apps/api/wrangler.jsonc`）

- 互換性日付: 2026-07-31 / `nodejs_compat`
- Observability: logs enabled（head_sampling_rate=1, persist=true）
- vars: `APP_VERSION`, `CORS_ORIGINS`
- secrets: `DATABASE_URL`（Neon pooled）, `ADMIN_API_KEY`
- routes: workers.dev（カスタムドメイン未設定）

### cci-web-assets（`apps/web/wrangler.jsonc`）

- 静的アセット: `apps/web/out`（Next.js `output: export`, trailingSlash: true）
- `html_handling: force-trailing-slash` / `not_found_handling: 404-page`
- セキュリティヘッダー: `public/_headers`（CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy）
  - standalone HTML（`/`・`/standalone.html`・`/index.html`）はバンドル仕様のため
    `script-src 'unsafe-inline' 'unsafe-eval' blob: data:` 等に緩和（2026-08-01、Unpacking停止の修正）
  - React 管理画面（/timeseries 等）と `/_next/*` は従来どおり厳格な CSP を維持

## 3. Neon 運用

- 接続情報は Cloudflare Worker Secret `DATABASE_URL` のみで管理（リポジトリに保存しない）
- マイグレーション: `apps/api/migrations/*.sql` を `npm run db:migrate` で適用（`DATABASE_URL_DIRECT`）
- シード: `npm run db:seed`（SHA-256 ハッシュで冪等）
- テーブル: regions / items / data_sources / time_series_values / source_files / transform_logs

## 4. カスタムドメイン（2026-08-01 決定・設定済み）

| 項目 | 値 |
| --- | --- |
| ドメイン | `ccid.mirai-dx-platform.com`（ゾーン: `mirai-dx-platform.com`） |
| 用途 | Web UI（cci-web-assets 静的アセット） |
| DNS | AAAA `100::`（proxied）※ 作成済み（2026-08-01、カスタムドメインアタッチ時に自動生成） |
| Worker カスタムドメイン | `cci-web-assets`（zone_id: `e375e651e49a40801a305b89e297bff0`、domain_id: `a99f2d3f14a8d2085cb2de974415317538380080`） |
| 設定経路 | GitHub Actions `Deploy Cloudflare (manual)` の `configure-domain` ジョブ（冪等） |
| CORS | API Worker の `CORS_ORIGINS` に `https://ccid.mirai-dx-platform.com` を追加済み |
| Access | **適用済み・動作確認済み（2026-08-01）**。アプリ名 `ccid`（self_hosted）、ポリシーID `5a9f0252-85a4-490e-8814-5752bb4559f8`、Allow: メールドメイン `mirai-const.co.jp` / メール `kensan1969@gmail.com`。未認証アクセスは <https://winter-lake-f4c9.cloudflareaccess.com> のログインへ302 |

API 用サブドメイン（例: `api.ccid.mirai-dx-platform.com`）は未設定（現状は
`cci-api-production.kensan1969.workers.dev` を使用）。

> **検証（2026-08-01）**: `curl https://ccid.mirai-dx-platform.com/` は HTTP 302 で
> Cloudflare Access ログインへリダイレクト（`aud=372d61...` が ccid アプリと一致）。
> 認証後は cci-web-assets（standalone HTML）が表示される。

## 5. 承認済み CI/CD 経路

## 5.1 本機（LAN）運用（現在の本番）

利用者指示により、当面は本機の自動割当IP＋ポートで稼働する（systemd 常駐）。

- 構成: Docker Compose（`db` / `migrate` / `api` / `web`）+ systemd `cci.service`（起動時自動起動）
- Web: `http://<自動割当IP>:3000` / API 直接: `http://<自動割当IP>:18000`
- DB: Local PostgreSQL 17（pgvector）をLAN業務データ正本として接続
- 環境ファイル: `/etc/cci/cci.env`（root のみ読取可）
- Cloudflare Workers + Neonは互換経路として維持し、Local PostgreSQLとの自動同期は行わない

## 5.2 Migration / Rollback（要約）

詳細は `docs/release-checklist.md` 参照。

- Forward: Local Backup取得後、`docker compose run --rm migrate`（checksum付き適用台帳）
- Rollback: アプリ側を旧versionへ切替。DBは別名DBへのRestore検証後、Human Gateを経て切替
- 破壊的マイグレーション（DROP / TRUNCATE / RESET）は承認なしに実行しない

- GitHub Actions `Deploy Cloudflare (manual)`（`.github/workflows/deploy.yml`）: `workflow_dispatch`でAPI・Webをデプロイ
- デプロイトークン: `CLOUDFLARE_API_TOKEN`（GitHub Secret）
