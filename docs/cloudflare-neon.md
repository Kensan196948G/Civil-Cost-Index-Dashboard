# Cloudflare / Neon 構成

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
| DNS | AAAA `100::`（proxied）※ Workers カスタムドメイン用のプレースホルダ |
| Worker カスタムドメイン | `cci-web-assets`（zone_id: `e375e651e49a40801a305b89e297bff0`） |
| 設定経路 | GitHub Actions `Deploy Cloudflare (manual)` の `configure-domain` ジョブ（冪等） |
| CORS | API Worker の `CORS_ORIGINS` に `https://ccid.mirai-dx-platform.com` を追加済み |
| Access | **適用済み（2026-08-01、利用者側で設定）**。アプリ名 `ccid`（self_hosted）、ポリシーID `5a9f0252-85a4-490e-8814-5752bb4559f8`、Allow: メールドメイン `mirai-const.co.jp` / メール `kensan1969@gmail.com` |

API 用サブドメイン（例: `api.ccid.mirai-dx-platform.com`）は未設定（現状は
`cci-api-production.kensan1969.workers.dev` を使用）。

> **注意（2026-08-01 時点）**: Access アプリは作成済みだが、**DNS レコード（AAAA 100::）と
> Workers カスタムドメイン（cci-web-assets）は未作成**のため、`ccid.mirai-dx-platform.com` は
> まだインターネット上に公開されていない。DNS 追加後に Access が有効化される。

## 5. 承認済み CI/CD 経路

## 5.1 本機（LAN）運用（現在の本番）

利用者指示により、当面は本機の自動割当IP＋ポートで稼働する（systemd 常駐）。

- 構成: Docker Compose（`cci-api` / `cci-web`）+ systemd `cci.service`（起動時自動起動）
- Web: `http://<自動割当IP>:3000` / API 直接: `http://<自動割当IP>:18000`
- DB: Neon（`civil-cost-index-dashboard`、ap-southeast-1）を正本として接続
- 環境ファイル: `/etc/cci/cci.env`（root のみ読取可）
- Cloudflare Workers（`cci-api-production` / `cci-web-assets`）は一時プレビューとして維持

## 5.2 Migration / Rollback（要約）

詳細は `docs/release-checklist.md` 参照。

- Forward: `npm run db:migrate`（冪等・後方互換 SQL のみ）
- Rollback: アプリ側を旧バージョンへ切替（Docker image / `wrangler rollback`）。DB は Neon PITR / ブランチで復旧
- 破壊的マイグレーション（DROP / TRUNCATE / RESET）は承認なしに実行しない

- GitHub Actions `Deploy`（`.github/workflows/deploy.yml`）: main push 時に API・Web をデプロイ
- デプロイトークン: `CLOUDFLARE_API_TOKEN`（GitHub Secret）
