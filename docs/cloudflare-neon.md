# Cloudflare / Neon 構成

## 1. 本番構成（v0.1.0 / 2026-07-31）

| 項目 | 値 |
| --- | --- |
| Cloudflare アカウント | Kensan1969@gmail.com's Account |
| ゾーン | `mirai-dx-platform.com`（Free plan, full setup） |
| API Worker | `cci-api-production` → <https://cci-api-production.kensan1969.workers.dev> |
| Web Worker（静的アセット） | `cci-web-assets` → <https://cci-web-assets.kensan1969.workers.dev> |
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

## 4. カスタムドメイン（未設定・要決定）

対象サブドメインは既存設定・設計書・環境変数から特定できなかったため、候補を文書化する。
**DNS変更は未実施。**

| 候補 | 用途 | 接続先（想定） |
| --- | --- | --- |
| `cci.mirai-dx-platform.com` | Web | CNAME → `cci-web-assets.kensan1969.workers.dev` |
| `civil-cost-index.mirai-dx-platform.com` | Web | 同上 |
| `costindex.mirai-dx-platform.com` | Web | 同上 |
| `api.cci.mirai-dx-platform.com` | API（任意） | Workers ルートパターン |

決定後: DNS レコード追加 → Workers カスタムドメイン（またはルート）→ Cloudflare Access 適用 → CORS_ORIGINS 更新。

## 5. 承認済み CI/CD 経路

## 5.1 本機（LAN）運用（現在の本番）

利用者指示により、当面は本機の自動割当IP＋ポートで稼働する（systemd 常駐）。

- 構成: Docker Compose（`cci-api` / `cci-web`）+ systemd `cci.service`（起動時自動起動）
- Web: `http://<自動割当IP>:3000` / API 直接: `http://<自動割当IP>:18000`
- DB: Neon（`civil-cost-index-dashboard`、ap-southeast-1）を正本として接続
- 環境ファイル: `/etc/cci/cci.env`（root のみ読取可）
- Cloudflare Workers（`cci-api-production` / `cci-web-assets`）は一時プレビューとして維持

- GitHub Actions `Deploy`（`.github/workflows/deploy.yml`）: main push 時に API・Web をデプロイ
- デプロイトークン: `CLOUDFLARE_API_TOKEN`（GitHub Secret）
